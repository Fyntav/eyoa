// Tools the model uses to operate the browser.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const obj = (properties, required = []) => ({ type: 'OBJECT', properties, required });
const INDEX = { type: 'INTEGER', description: 'Element number from the latest page reading.' };

export const TOOL_DECLARATIONS = [
  {
    name: 'read_page',
    description:
      'Reads the current tab: URL, title, visible text and the numbered list of interactive elements. Numbers change on every reading.',
  },
  {
    name: 'get_page_text',
    description: 'Returns the full page text (up to 30,000 characters). Use it to read long articles and documents.',
  },
  { name: 'click', description: 'Clicks the given element.', parameters: obj({ index: INDEX }, ['index']) },
  {
    name: 'type_text',
    description:
      'Types text into a field. Replaces the current content by default. Line breaks are preserved: in lists, separate items with line breaks.',
    parameters: obj(
      {
        index: INDEX,
        text: { type: 'STRING', description: 'Text to type.' },
        clear: { type: 'BOOLEAN', description: 'If false, appends to the existing text. Default: true.' },
        press_enter: { type: 'BOOLEAN', description: 'If true, presses Enter at the end (e.g. to submit a search).' },
      },
      ['index', 'text']
    ),
  },
  {
    name: 'select_option',
    description: 'Chooses an option in a dropdown (select).',
    parameters: obj({ index: INDEX, option: { type: 'STRING', description: 'Option text or value.' } }, ['index', 'option']),
  },
  {
    name: 'press_key',
    description: 'Presses a key on the focused element. Keys: Enter, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, PageDown, PageUp, Home, End, Backspace.',
    parameters: obj({ key: { type: 'STRING', description: 'Key name.' } }, ['key']),
  },
  {
    name: 'scroll',
    description: 'Scrolls the page.',
    parameters: obj(
      {
        direction: { type: 'STRING', enum: ['down', 'up', 'top', 'bottom'], description: 'Direction.' },
        pages: { type: 'NUMBER', description: 'Number of screens to scroll (default 1).' },
      },
      ['direction']
    ),
  },
  {
    name: 'navigate',
    description: 'Opens a URL (http or https) in the current tab.',
    parameters: obj({ url: { type: 'STRING', description: 'Full URL.' } }, ['url']),
  },
  { name: 'go_back', description: 'Goes back to the previous page in the current tab.' },
  {
    name: 'screenshot',
    description: 'Captures the visible part of the page as an image. Use it when the text reading is not enough (charts, images, layout).',
  },
  {
    name: 'wait',
    description: 'Waits a few seconds (10 at most) for the page to finish loading.',
    parameters: obj({ seconds: { type: 'NUMBER', description: 'Seconds to wait.' } }, ['seconds']),
  },
];

// Actions that change something and therefore ask the user's permission.
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

// Text shown to the user for each action.
export function describeAction(name, args = {}, labels = {}) {
  const el = () => {
    const label = labels[args.index];
    return label ? `"${short(label, 50)}"` : `element ${args.index}`;
  };
  switch (name) {
    case 'read_page': return 'Read the page';
    case 'get_page_text': return 'Read the full page text';
    case 'click': return `Click ${el()}`;
    case 'type_text': return `Type "${short(args.text, 70)}" into ${el()}${args.press_enter ? ' and press Enter' : ''}`;
    case 'select_option': return `Select "${short(args.option, 40)}" in ${el()}`;
    case 'press_key': return `Press the ${short(args.key, 20)} key`;
    case 'scroll': return { down: 'Scroll down', up: 'Scroll up', top: 'Go to the top of the page', bottom: 'Go to the bottom of the page' }[args.direction] || 'Scroll the page';
    case 'navigate': return `Open ${short(args.url, 80)}`;
    case 'go_back': return 'Go back to the previous page';
    case 'screenshot': return 'Take a screenshot of the page';
    case 'wait': return 'Wait for the page to load';
    default: return name;
  }
}

/* ------------------------------------------------------------------ */
/* Functions injected into the page. They must be self-contained.     */
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
      if (type === 'checkbox' || type === 'radio') line += el.checked ? ' (checked)' : ' (unchecked)';
      else if (type === 'password') line += ' (password field)';
      else if (el.value) line += ` value="${clean(el.value, 60)}"`;
      const ph = el.getAttribute('placeholder');
      if (ph && ph !== label) line += ` placeholder="${clean(ph, 40)}"`;
    } else if (tag === 'select') {
      const opts = [...el.options].slice(0, 15).map((o) => (o.selected ? '*' : '') + clean(o.text, 30));
      line += ` options: ${opts.join(' | ')}${el.options.length > 15 ? ' | …' : ''}`;
    } else if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (href && !href.startsWith('javascript:') && href !== '#') line += ` -> ${clean(el.href, 90)}`;
    }
    if (el.getAttribute('aria-expanded')) line += ` expanded=${el.getAttribute('aria-expanded')}`;
    if (rect.bottom < 0 || rect.top > vh) line += ' (off screen)';
    lines.push(line);
  }
  if (omitted) lines.push(`… ${omitted} more elements not listed. Scroll the page or use get_page_text.`);

  let text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim();
  const total = text.length;
  if (total > maxText) text = text.slice(0, maxText) + `\n… (text truncated: ${total} characters in total; use get_page_text or scroll the page)`;

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  return {
    url: location.href,
    title: document.title,
    scroll: maxScroll ? `${Math.round((window.scrollY / maxScroll) * 100)}% of the page` : 'page does not scroll',
    elements: lines.join('\n') || '(no interactive element found)',
    text,
    labels,
  };
}

function pageText(maxChars) {
  const text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    url: location.href,
    title: document.title,
    text: text.length > maxChars ? text.slice(0, maxChars) + `\n… (truncated: ${text.length} characters in total)` : text,
  };
}

function pageClick(index) {
  const el = document.querySelector(`[data-agx-id="${index}"]`);
  if (!el) return { ok: false, error: 'Element not found. The page changed; check the new reading.' };
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
  if (!el) return { ok: false, error: 'Element not found. The page changed; check the new reading.' };
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && type === 'password') {
    return { ok: false, error: 'Password field. For safety the assistant does not type passwords: ask the user to type it.' };
  }
  if (tag === 'input' && type === 'file') {
    return { ok: false, error: 'File upload field. Ask the user to choose the file.' };
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
      // Multi-line text: chat editors (WhatsApp, Gmail) only preserve the line
      // breaks when the text arrives as a "paste". If the editor does not handle it, inserts line by line.
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
    return { ok: false, error: 'This element does not accept typing.' };
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
  if (!el) return { ok: false, error: 'Element not found. The page changed; check the new reading.' };
  if (el.tagName.toLowerCase() !== 'select') {
    return { ok: false, error: 'This element is not a regular dropdown. Click it, then click the desired option.' };
  }
  const wanted = String(option).trim().toLowerCase();
  const opts = [...el.options];
  const found =
    opts.find((o) => o.value.toLowerCase() === wanted || o.text.trim().toLowerCase() === wanted) ||
    opts.find((o) => o.text.toLowerCase().includes(wanted));
  if (!found) return { ok: false, error: 'Option not found. Options: ' + opts.map((o) => o.text.trim()).slice(0, 30).join(' | ') };
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, found.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, selected: found.text.trim() };
}

function pageScroll(direction, pages) {
  const amount = Math.round(window.innerHeight * 0.85 * (pages || 1));
  const before = window.scrollY;
  if (direction === 'top') window.scrollTo(0, 0);
  else if (direction === 'bottom') window.scrollTo(0, document.documentElement.scrollHeight);
  else window.scrollBy(0, direction === 'up' ? -amount : amount);
  if (window.scrollY !== before) return { ok: true };

  // The window did not scroll: tries the largest inner scrollable area (common in web apps).
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
  if (!best) return { ok: true, note: 'The page is already at the scroll limit.' };
  const b = best.scrollTop;
  if (direction === 'top') best.scrollTop = 0;
  else if (direction === 'bottom') best.scrollTop = best.scrollHeight;
  else best.scrollTop += direction === 'up' ? -amount : amount;
  return best.scrollTop === b ? { ok: true, note: 'The page is already at the scroll limit.' } : { ok: true };
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

// Darkens the page corners while the assistant works on it.
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
    // Darkening at the page corners (vignette), with no glow on the edges.
    background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 48%, rgba(0, 0, 0, .45) 76%, rgba(0, 0, 0, .85) 100%)',
    willChange: 'opacity', // own layer: does not repaint the page
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

// The assistant works in a single tab only: the one where the panel was opened.
export class BrowserTools {
  constructor(tabId = null) {
    this.tabId = tabId;
    this.labels = {};
    this.glowing = false;
  }

  // Used only when the panel did not receive the tab on opening.
  async bindToActiveTab() {
    if (this.tabId != null) return;
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) this.tabId = tab.id;
  }

  async tab() {
    const t = this.tabId != null ? await chrome.tabs.get(this.tabId).catch(() => null) : null;
    if (!t) throw new Error('The tab the assistant was opened in is no longer available.');
    return t;
  }

  async inPage(func, args = []) {
    const tab = await this.tab();
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
      return res ? res.result : { ok: false, error: 'The page did not respond.' };
    } catch (e) {
      return {
        ok: false,
        error:
          'This page cannot be operated (internal Chrome pages, the Chrome Web Store and PDFs opened in the browser are protected). Use navigate to open a website. Detail: ' +
          (e.message || e),
      };
    }
  }

  async setGlow(on) {
    this.glowing = on;
    if (this.tabId == null) return;
    await this.inPage(pageGlow, [on ? 'on' : 'off']).catch(() => {});
  }

  // Waits for the page to settle after an action (at most 5 seconds of loading).
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

  // Runs an action and returns the result together with the new page reading.
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
      // The link would open another tab: the assistant is restricted to its own, so it opens the URL there.
      await sleep(300);
      const nt = await chrome.tabs.get(opened.id).catch(() => null);
      const url = nt && (nt.pendingUrl || nt.url);
      if (nt) await chrome.tabs.remove(nt.id).catch(() => {});
      if (url && /^https?:\/\//i.test(url)) {
        await chrome.tabs.update(tab.id, { url });
        await this.settle(600);
        result = { ...result, note: 'The link would open a new tab; the page was opened in this same tab instead.' };
      }
    }
    return { ...result, page: await this.snapshot() };
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
        return { ...res, page: await this.snapshot() };
      }
      case 'navigate': {
        let url = String(args.url || '').trim();
        if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http or https URLs are allowed.' };
        const tab = await this.tab();
        await chrome.tabs.update(tab.id, { url });
        await this.settle(600);
        return { ok: true, page: await this.snapshot() };
      }
      case 'go_back': {
        const tab = await this.tab();
        try {
          await chrome.tabs.goBack(tab.id);
        } catch {
          return { ok: false, error: 'There is no previous page in this tab.' };
        }
        await this.settle(600);
        return { ok: true, page: await this.snapshot() };
      }
      case 'screenshot': {
        const tab = await this.tab();
        // The capture only reaches the visible tab; it never captures another of the user's tabs.
        if (!tab.active) {
          return { ok: false, error: 'The assistant tab is not visible right now, so the screenshot cannot be taken. Use read_page.' };
        }
        try {
          await this.inPage(pageGlow, ['hide']);
          await sleep(80);
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
          const still = await chrome.tabs.get(tab.id).catch(() => null);
          if (!still || !still.active) {
            return { ok: false, error: 'The user switched tabs during the capture; the image was discarded. Use read_page.' };
          }
          return { __image: await downscaleJpeg(dataUrl, 1280) };
        } catch (e) {
          return { ok: false, error: 'Could not capture this page. Detail: ' + (e.message || e) };
        } finally {
          await this.inPage(pageGlow, ['show']).catch(() => {});
        }
      }
      case 'wait':
        await sleep(Math.min(10, Math.max(0.2, Number(args.seconds) || 1)) * 1000);
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown tool: ' + name };
    }
  }
}
