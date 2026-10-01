// Base comum das chamadas às IAs: erro padronizado, novas tentativas e mensagens em português.

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

function friendlyMessage(who, status, apiMessage, model) {
  const msg = apiMessage || '';
  if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(msg))) {
    return `A chave de API de ${who} não é válida ou não tem permissão. Confira a chave nas configurações. Detalhe: ${msg || 'erro ' + status}`;
  }
  if (status === 404) return `O modelo "${model}" não está disponível em ${who}.`;
  if (status === 429) return `Limite de uso da chave de ${who} atingido. Detalhe: ${msg}`;
  if (status === 402) return `A conta de ${who} está sem saldo ou sem faturamento ativo. Detalhe: ${msg}`;
  if (status === 503 || status === 529) return `O modelo "${model}" de ${who} está sobrecarregado no momento. Detalhe: ${msg || 'erro ' + status}`;
  if (status >= 500) return `O serviço de ${who} respondeu com erro interno (código ${status}). Detalhe: ${msg || 'sem detalhe'}`;
  return `${who} recusou a solicitação: ${msg || 'erro ' + status}`;
}

// Faz a chamada e devolve o JSON. Erros de rede e erros internos são repetidos; limite de
// uso (429), sobrecarga (503/529) e modelo inexistente (404) voltam para quem chamou,
// que decide trocar de modelo.
export async function requestJson(url, { method = 'GET', headers = {}, body, signal, who, model } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        signal,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastError = new ApiError(`Sem conexão com ${who}. Verifique a internet.`, 0, String(e));
      await sleep(1000 * (attempt + 1), signal);
      continue;
    }
    if (res.ok) return res.json();
    let apiMessage = '';
    let raw = '';
    try {
      raw = await res.text();
      const data = JSON.parse(raw);
      const err = data.error || data;
      apiMessage = (typeof err === 'string' ? err : err.message) || '';
    } catch { apiMessage = raw.slice(0, 300); }
    lastError = new ApiError(friendlyMessage(who, res.status, apiMessage, model), res.status, apiMessage);
    if (res.status === 429) {
      const m = apiMessage.match(/retry in ([\d.]+)\s*s/i);
      const header = parseFloat(res.headers.get('retry-after'));
      lastError.retrySeconds = m ? Math.ceil(parseFloat(m[1])) + 1 : header > 0 ? Math.ceil(header) + 1 : 30;
      lastError.daily = /PerDay|per day|daily/i.test(raw);
    }
    if (res.status < 500 || res.status === 503 || res.status === 529) throw lastError;
    if (attempt < 2) await sleep(2000 * 2 ** attempt, signal);
  }
  throw lastError;
}

// Converte o esquema de parâmetros (tipos em maiúsculas, padrão do Gemini) para JSON Schema comum.
export function toJsonSchema(schema) {
  if (!schema) return { type: 'object', properties: {} };
  const out = { ...schema };
  if (typeof out.type === 'string') out.type = out.type.toLowerCase();
  if (out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  }
  if (out.items) out.items = toJsonSchema(out.items);
  return out;
}
