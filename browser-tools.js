// Ferramentas que o modelo usa para operar o navegador.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const obj = (properties, required = []) => ({ type: 'OBJECT', properties, required });
const INDEX = { type: 'INTEGER', description: 'Número do elemento na leitura mais recente da página.' };

export const TOOL_DECLARATIONS = [
  {
    name: 'read_page',
    description:
      'Lê a página da aba em uso: endereço, título, texto visível e a lista numerada de elementos com os quais é possível interagir. Os números mudam a cada leitura.',
  },
  {
    name: 'get_page_text',
    description: 'Retorna o texto completo da página (até 30 mil caracteres). Use para ler artigos e documentos longos.',
  },
  { name: 'click', description: 'Clica no elemento indicado.', parameters: obj({ index: INDEX }, ['index']) },
  {
    name: 'type_text',
    description:
      'Digita um texto em um campo. Por padrão substitui o conteúdo atual do campo. Quebras de linha no texto são preservadas: em listas, separe os itens com quebra de linha.',
    parameters: obj(
      {
        index: INDEX,
        text: { type: 'STRING', description: 'Texto a digitar.' },
        clear: { type: 'BOOLEAN', description: 'Se falso, acrescenta ao texto já existente. Padrão: verdadeiro.' },
        press_enter: { type: 'BOOLEAN', description: 'Se verdadeiro, pressiona Enter ao final (ex.: enviar uma busca).' },
      },
      ['index', 'text']
    ),
  },
  {
    name: 'select_option',
    description: 'Escolhe uma opção em uma lista suspensa (select).',
    parameters: obj({ index: INDEX, option: { type: 'STRING', description: 'Texto ou valor da opção.' } }, ['index', 'option']),
  },
  {
    name: 'press_key',
    description: 'Pressiona uma tecla no elemento em foco. Teclas: Enter, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, PageDown, PageUp, Home, End, Backspace.',
    parameters: obj({ key: { type: 'STRING', description: 'Nome da tecla.' } }, ['key']),
  },
  {
    name: 'scroll',
    description: 'Rola a página.',
    parameters: obj(
      {
        direction: { type: 'STRING', enum: ['down', 'up', 'top', 'bottom'], description: 'Direção.' },
        pages: { type: 'NUMBER', description: 'Quantidade de telas a rolar (padrão 1).' },
      },
      ['direction']
    ),
  },
  {
    name: 'navigate',
    description: 'Abre um endereço (http ou https) na aba em uso.',
    parameters: obj({ url: { type: 'STRING', description: 'Endereço completo.' } }, ['url']),
  },
  { name: 'go_back', description: 'Volta para a página anterior da aba em uso.' },
  {
    name: 'screenshot',
    description: 'Captura a imagem da parte visível da página. Use quando a leitura em texto não for suficiente (gráficos, imagens, layout).',
  },
  {
    name: 'wait',
    description: 'Aguarda alguns segundos (no máximo 10) para a página terminar de carregar.',
    parameters: obj({ seconds: { type: 'NUMBER', description: 'Segundos a aguardar.' } }, ['seconds']),
  },
];

// Ações que alteram algo e, por isso, pedem autorização do usuário.
export const NEEDS_CONFIRMATION = new Set([
  'click',
  'type_text',
  'select_option',
  'press_key',
  'navigate',
  'go_back',
]);

const short = (s, n = 60) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

// Texto exibido ao usuário para cada ação.
export function describeAction(name, args = {}, labels = {}) {
  const el = () => {
    const label = labels[args.index];
    return label ? `"${short(label, 50)}"` : `o elemento ${args.index}`;
  };
  switch (name) {
    case 'read_page': return 'Ler a página';
    case 'get_page_text': return 'Ler o texto completo da página';
    case 'click': return `Clicar em ${el()}`;
    case 'type_text': return `Digitar "${short(args.text, 70)}" em ${el()}${args.press_enter ? ' e pressionar Enter' : ''}`;
    case 'select_option': return `Selecionar "${short(args.option, 40)}" em ${el()}`;
    case 'press_key': return `Pressionar a tecla ${short(args.key, 20)}`;
    case 'scroll': return { down: 'Rolar a página para baixo', up: 'Rolar a página para cima', top: 'Ir ao topo da página', bottom: 'Ir ao fim da página' }[args.direction] || 'Rolar a página';
    case 'navigate': return `Abrir ${short(args.url, 80)}`;
    case 'go_back': return 'Voltar à página anterior';
    case 'screenshot': return 'Capturar a imagem da página';
    case 'wait': return 'Aguardar o carregamento';
    default: return name;
  }
}

/* ------------------------------------------------------------------ */
/* Funções injetadas na página. Precisam ser autossuficientes.         */
/* ------------------------------------------------------------------ */

function pageSnapshot(maxElements, maxText) {
  const SELECTOR =
    'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],' +
    '[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[role="combobox"],[role="textbox"],' +
    '[role="searchbox"],[contenteditable=""],[contenteditable="true"],[onclick],[tabindex]:not([tabindex="-1"])';
  const clean = (s, n) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  document.querySelectorAll('[data-agx-id]').forEach((e) => e.removeAttribute('data-agx-id'));

  const vh = window.innerHeight;
  const lines = [];
  const labels = {};
  let n = 0;
  let omitted = 0;
  for (const el of document.querySelectorAll(SELECTOR)) {
    if (el.disabled || el.type === 'hidden') continue;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const tag = el.tagName.toLowerCase();
    const isField = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (!isField) {
      const parent = el.parentElement && el.parentElement.closest('a[href],button,[role="button"]');
      if (parent && parent.hasAttribute('data-agx-id')) continue;
    }
    if (n >= maxElements) { omitted++; continue; }

    n += 1;
    el.setAttribute('data-agx-id', String(n));
    const type = el.getAttribute('type');
    const role = el.getAttribute('role');
    let label =
      el.getAttribute('aria-label') ||
      (isField && el.labels && el.labels[0] && el.labels[0].innerText) ||
      (!isField && el.innerText) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      (el.querySelector && el.querySelector('img[alt]') && el.querySelector('img[alt]').alt) ||
      (tag === 'input' && (type === 'submit' || type === 'button') && el.value) ||
      el.getAttribute('name') ||
      '';
    label = clean(label, 90);
    labels[n] = label || tag;

    let line = `[${n}] <${tag}${type ? ' type=' + type : ''}${role ? ' role=' + role : ''}>`;
    if (label) line += ` "${label}"`;
    if (tag === 'input' || tag === 'textarea') {
      if (type === 'checkbox' || type === 'radio') line += el.checked ? ' (marcado)' : ' (desmarcado)';
      else if (type === 'password') line += ' (campo de senha)';
      else if (el.value) line += ` valor="${clean(el.value, 60)}"`;
      const ph = el.getAttribute('placeholder');
      if (ph && ph !== label) line += ` dica="${clean(ph, 40)}"`;
    } else if (tag === 'select') {
      const opts = [...el.options].slice(0, 15).map((o) => (o.selected ? '*' : '') + clean(o.text, 30));
      line += ` opções: ${opts.join(' | ')}${el.options.length > 15 ? ' | …' : ''}`;
    } else if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (href && !href.startsWith('javascript:') && href !== '#') line += ` -> ${clean(el.href, 90)}`;
    }
    if (el.getAttribute('aria-expanded')) line += ` expandido=${el.getAttribute('aria-expanded')}`;
    if (rect.bottom < 0 || rect.top > vh) line += ' (fora da tela)';
    lines.push(line);
  }
  if (omitted) lines.push(`… mais ${omitted} elementos não listados. Role a página ou use get_page_text.`);

  let text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim();
  const total = text.length;
  if (total > maxText) text = text.slice(0, maxText) + `\n… (texto cortado: ${total} caracteres no total; use get_page_text ou role a página)`;

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  return {
    url: location.href,
    title: document.title,
    rolagem: maxScroll ? `${Math.round((window.scrollY / maxScroll) * 100)}% da página` : 'página sem rolagem',
    elementos: lines.join('\n') || '(nenhum elemento interativo encontrado)',
    texto: text,
    labels,
  };
}

function pageText(maxChars) {
  const text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    url: location.href,
    title: document.title,
    texto: text.length > maxChars ? text.slice(0, maxChars) + `\n… (cortado: ${text.length} caracteres no total)` : text,
  };
}

function pageClick(index) {
  const el = document.querySelector(`[data-agx-id="${index}"]`);
  if (!el) return { ok: false, error: 'Elemento não encontrado. A página mudou; consulte a nova leitura.' };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
  return { ok: true };
}

function pageType(index, text, clear, pressEnter) {
  const el = document.querySelector(`[data-agx-id="${index}"]`);
  if (!el) return { ok: false, error: 'Elemento não encontrado. A página mudou; consulte a nova leitura.' };
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && type === 'password') {
    return { ok: false, error: 'Campo de senha. Por segurança, o assistente não digita senhas: peça ao usuário que digite.' };
  }
  if (tag === 'input' && type === 'file') {
    return { ok: false, error: 'Campo de envio de arquivo. Peça ao usuário que selecione o arquivo.' };
  }
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
  if (tag === 'input' || tag === 'textarea') {
    const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, clear ? text : el.value + text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.isContentEditable) {
    if (clear) document.execCommand('selectAll', false);
    if (text.includes('\n')) {
      // Texto com várias linhas: editores de conversa (WhatsApp, Gmail) só preservam as
      // quebras quando o texto chega como "colar". Se o editor não tratar, insere linha a linha.
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const handled = !el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      if (!handled) {
        text.split('\n').forEach((line, i) => {
          if (i) document.execCommand('insertLineBreak', false);
          if (line) document.execCommand('insertText', false, line);
        });
      }
    } else {
      document.execCommand('insertText', false, text);
    }
  } else {
    return { ok: false, error: 'Este elemento não aceita digitação.' };
  }
  if (pressEnter) {
    const k = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
    const notHandled = el.dispatchEvent(new KeyboardEvent('keydown', k));
    el.dispatchEvent(new KeyboardEvent('keypress', k));
    el.dispatchEvent(new KeyboardEvent('keyup', k));
    if (notHandled && el.form && tag === 'input') {
      if (el.form.requestSubmit) el.form.requestSubmit();
      else el.form.submit();
    }
  }
  return { ok: true };
}

function pageSelect(index, option) {
  const el = document.querySelector(`[data-agx-id="${index}"]`);
  if (!el) return { ok: false, error: 'Elemento não encontrado. A página mudou; consulte a nova leitura.' };
  if (el.tagName.toLowerCase() !== 'select') {
    return { ok: false, error: 'Este elemento não é uma lista suspensa comum. Clique nele e depois clique na opção desejada.' };
  }
  const wanted = String(option).trim().toLowerCase();
  const opts = [...el.options];
  const found =
    opts.find((o) => o.value.toLowerCase() === wanted || o.text.trim().toLowerCase() === wanted) ||
    opts.find((o) => o.text.toLowerCase().includes(wanted));
  if (!found) return { ok: false, error: 'Opção não encontrada. Opções: ' + opts.map((o) => o.text.trim()).slice(0, 30).join(' | ') };
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, found.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, selecionado: found.text.trim() };
}

function pageScroll(direction, pages) {
  const amount = Math.round(window.innerHeight * 0.85 * (pages || 1));
  const before = window.scrollY;
  if (direction === 'top') window.scrollTo(0, 0);
  else if (direction === 'bottom') window.scrollTo(0, document.documentElement.scrollHeight);
  else window.scrollBy(0, direction === 'up' ? -amount : amount);
  if (window.scrollY !== before) return { ok: true };

  // A janela não rolou: tenta a maior área rolável interna (comum em sistemas web).
  let best = null;
  let bestArea = 0;
  const minArea = (window.innerWidth * window.innerHeight) / 8;
  for (const el of document.querySelectorAll('div,main,section,article,ul,ol,form')) {
    const area = el.clientWidth * el.clientHeight;
    if (area < minArea || area <= bestArea || el.scrollHeight <= el.clientHeight + 40) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    best = el; bestArea = area;
  }
  if (!best) return { ok: true, aviso: 'A página já está no limite da rolagem.' };
  const b = best.scrollTop;
  if (direction === 'top') best.scrollTop = 0;
  else if (direction === 'bottom') best.scrollTop = best.scrollHeight;
  else best.scrollTop += direction === 'up' ? -amount : amount;
  return best.scrollTop === b ? { ok: true, aviso: 'A página já está no limite da rolagem.' } : { ok: true };
}

function pageKey(key) {
  const el = document.activeElement || document.body;
  const scrollKeys = { PageDown: 0.85, PageUp: -0.85 };
  if (key in scrollKeys) { window.scrollBy(0, window.innerHeight * scrollKeys[key]); return { ok: true }; }
  if (key === 'Home') { window.scrollTo(0, 0); return { ok: true }; }
  if (key === 'End') { window.scrollTo(0, document.documentElement.scrollHeight); return { ok: true }; }
  const codes = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Tab: 9 };
  const k = { key, code: key, keyCode: codes[key] || 0, which: codes[key] || 0, bubbles: true, cancelable: true, composed: true };
  const notHandled = el.dispatchEvent(new KeyboardEvent('keydown', k));
  el.dispatchEvent(new KeyboardEvent('keyup', k));
  if (key === 'Enter' && notHandled && el.form && el.tagName === 'INPUT') {
    if (el.form.requestSubmit) el.form.requestSubmit();
    else el.form.submit();
  }
  return { ok: true };
}

// Escurece os cantos da página enquanto o assistente trabalha nela.
function pageGlow(mode) {
  const ID = 'agx-glow';
  let el = document.getElementById(ID);
  if (mode === 'hide' || mode === 'show') {
    if (el) el.style.visibility = mode === 'hide' ? 'hidden' : 'visible';
    return { ok: true };
  }
  if (mode === 'off') {
    if (el) {
      const current = getComputedStyle(el).opacity;
      el.getAnimations().forEach((a) => a.cancel());
      el.id = '';
      el.animate([{ opacity: current }, { opacity: 0 }], { duration: 350, fill: 'forwards' }).onfinish = () => el.remove();
    }
    return { ok: true };
  }
  if (el) return { ok: true };
  el = document.createElement('div');
  el.id = ID;
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
    margin: '0',
    opacity: '0',
    // Escurecimento nos cantos da página (vinheta), sem brilho nas bordas.
    background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 48%, rgba(0, 0, 0, .45) 76%, rgba(0, 0, 0, .85) 100%)',
    willChange: 'opacity', // camada própria: não repinta a página
  });
  document.documentElement.appendChild(el);
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' });
  return { ok: true };
}

/* ------------------------------------------------------------------ */

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function downscaleJpeg(dataUrl, maxWidth) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bmp.width);
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return blobToBase64(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 }));
}

// O assistente trabalha somente em uma aba: aquela em que o painel foi aberto.
export class BrowserTools {
  constructor(tabId = null) {
    this.tabId = tabId;
    this.labels = {};
    this.glowing = false;
  }

  // Usado apenas quando o painel não recebeu a aba na abertura.
  async bindToActiveTab() {
    if (this.tabId != null) return;
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) this.tabId = tab.id;
  }

  async tab() {
    const t = this.tabId != null ? await chrome.tabs.get(this.tabId).catch(() => null) : null;
    if (!t) throw new Error('A aba em que o assistente foi aberto não está mais disponível.');
    return t;
  }

  async inPage(func, args = []) {
    const tab = await this.tab();
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
      return res ? res.result : { ok: false, error: 'A página não respondeu.' };
    } catch (e) {
      return {
        ok: false,
        error:
          'Não é possível operar nesta página (páginas internas do Chrome, a Chrome Web Store e arquivos PDF abertos no navegador são protegidos). Use navigate para abrir um site. Detalhe: ' +
          (e.message || e),
      };
    }
  }

  async setGlow(on) {
    this.glowing = on;
    if (this.tabId == null) return;
    await this.inPage(pageGlow, [on ? 'on' : 'off']).catch(() => {});
  }

  // Aguarda a página assentar depois de uma ação (no máximo 5 segundos de carregamento).
  async settle(ms = 300) {
    await sleep(ms);
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const t = await chrome.tabs.get(this.tabId).catch(() => null);
      if (!t || t.status === 'complete') break;
      await sleep(150);
    }
    await sleep(200);
  }

  async snapshot() {
    if (this.glowing) await this.inPage(pageGlow, ['on']);
    const res = await this.inPage(pageSnapshot, [200, 3500]);
    if (res && res.labels) {
      this.labels = res.labels;
      delete res.labels;
    }
    return res;
  }

  // Executa uma ação e devolve o resultado junto com a nova leitura da página.
  async act(func, args) {
    const tab = await this.tab();
    let opened = null;
    const onCreated = (t) => { if (t.openerTabId === tab.id) opened = t; };
    chrome.tabs.onCreated.addListener(onCreated);
    let result;
    try {
      result = await this.inPage(func, args);
      if (result && result.ok === false) return result;
      await this.settle();
    } finally {
      chrome.tabs.onCreated.removeListener(onCreated);
    }
    if (opened) {
      // O link abriria outra aba: o assistente fica restrito à sua, então abre o endereço nela.
      await sleep(300);
      const nt = await chrome.tabs.get(opened.id).catch(() => null);
      const url = nt && (nt.pendingUrl || nt.url);
      if (nt) await chrome.tabs.remove(nt.id).catch(() => {});
      if (url && /^https?:\/\//i.test(url)) {
        await chrome.tabs.update(tab.id, { url });
        await this.settle(600);
        result = { ...result, aviso: 'O link abriria uma nova aba; a página foi aberta nesta mesma aba.' };
      }
    }
    return { ...result, pagina: await this.snapshot() };
  }

  async run(name, args = {}) {
    switch (name) {
      case 'read_page':
        return this.snapshot();
      case 'get_page_text':
        return this.inPage(pageText, [30000]);
      case 'click':
        return this.act(pageClick, [Number(args.index)]);
      case 'type_text':
        return this.act(pageType, [Number(args.index), String(args.text ?? ''), args.clear !== false, !!args.press_enter]);
      case 'select_option':
        return this.act(pageSelect, [Number(args.index), String(args.option ?? '')]);
      case 'press_key':
        return this.act(pageKey, [String(args.key || '')]);
      case 'scroll': {
        const res = await this.inPage(pageScroll, [String(args.direction || 'down'), Number(args.pages) || 1]);
        if (res && res.ok === false) return res;
        await sleep(300);
        return { ...res, pagina: await this.snapshot() };
      }
      case 'navigate': {
        let url = String(args.url || '').trim();
        if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Somente endereços http ou https são permitidos.' };
        const tab = await this.tab();
        await chrome.tabs.update(tab.id, { url });
        await this.settle(600);
        return { ok: true, pagina: await this.snapshot() };
      }
      case 'go_back': {
        const tab = await this.tab();
        try {
          await chrome.tabs.goBack(tab.id);
        } catch {
          return { ok: false, error: 'Não há página anterior nesta aba.' };
        }
        await this.settle(600);
        return { ok: true, pagina: await this.snapshot() };
      }
      case 'screenshot': {
        const tab = await this.tab();
        // A captura só alcança a aba visível; nunca captura outra aba do usuário.
        if (!tab.active) {
          return { ok: false, error: 'A aba do assistente não está visível no momento, por isso a imagem não pode ser capturada. Use read_page.' };
        }
        try {
          await this.inPage(pageGlow, ['hide']);
          await sleep(80);
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
          const still = await chrome.tabs.get(tab.id).catch(() => null);
          if (!still || !still.active) {
            return { ok: false, error: 'O usuário trocou de aba durante a captura; a imagem foi descartada. Use read_page.' };
          }
          return { __image: await downscaleJpeg(dataUrl, 1280) };
        } catch (e) {
          return { ok: false, error: 'Não foi possível capturar a imagem desta página. Detalhe: ' + (e.message || e) };
        } finally {
          await this.inPage(pageGlow, ['show']).catch(() => {});
        }
      }
      case 'wait':
        await sleep(Math.min(10, Math.max(0.2, Number(args.seconds) || 1)) * 1000);
        return { ok: true };
      default:
        return { ok: false, error: 'Ferramenta desconhecida: ' + name };
    }
  }
}
