// Adaptador para o Claude (Anthropic), pela Messages API.
import { requestJson, toJsonSchema } from './api.js';

const BASE = 'https://api.anthropic.com/v1';
const WHO = 'Claude';
const PREFERRED = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'];
// Modelos que aceitam a troca automática de modelo em caso de recusa pelos filtros de segurança.
const FALLBACK_MODELS = /^claude-(opus-5|fable-5-1|sonnet-5-5)/;
const noFallback = new Set();

function headers(apiKey, beta) {
  const h = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // A chamada parte da própria extensão, com a chave informada pelo usuário.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (beta) h['anthropic-beta'] = beta;
  return h;
}

export async function listModels(cfg, signal) {
  const data = await requestJson(`${BASE}/models?limit=1000`, { headers: headers(cfg.key), signal, who: WHO });
  return (data.data || []).map((m) => ({ id: m.id, created: Date.parse(m.created_at) || 0 }));
}

export function buildModelChain(models) {
  const ids = models.map((m) => m.id);
  const first = PREFERRED.filter((id) => ids.includes(id));
  const rest = models
    .filter((m) => !first.includes(m.id))
    .sort((a, b) => b.created - a.created)
    .map((m) => m.id);
  return [...first, ...rest].slice(0, 6);
}

function userBlocks(parts) {
  const results = [];
  const others = [];
  for (const p of parts) {
    if (p.toolResult) {
      const { id, response } = p.toolResult;
      const text = JSON.stringify(response);
      results.push({
        type: 'tool_result',
        tool_use_id: id,
        content: p.image
          ? [{ type: 'text', text }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.image } }]
          : text,
        ...(response && response.error ? { is_error: true } : {}),
      });
    } else if (p.inlineData) {
      const { mimeType, data } = p.inlineData;
      if (mimeType.startsWith('image/')) others.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data } });
      else if (mimeType === 'application/pdf') others.push({ type: 'document', source: { type: 'base64', media_type: mimeType, data } });
      else others.push({ type: 'text', text: `(O anexo "${p.name || mimeType}" não pode ser lido por esta IA.)` });
    } else if (typeof p.text === 'string' && p.text.trim()) {
      others.push({ type: 'text', text: p.text });
    }
  }
  // Os resultados de ferramenta precisam vir antes de qualquer outro conteúdo da mensagem.
  return [...results, ...others];
}

function toMessages(contents) {
  const messages = [];
  for (const c of contents) {
    if (c.role === 'model') {
      // A resposta original do Claude volta intacta (inclui os blocos de raciocínio).
      let content = c.nativeProvider === 'anthropic' && c.native ? c.native : null;
      if (!content) {
        content = [];
        for (const p of c.parts) {
          if (p.functionCall) content.push({ type: 'tool_use', id: p.functionCall.id, name: p.functionCall.name, input: p.functionCall.args || {} });
          else if (typeof p.text === 'string' && p.text.trim()) content.push({ type: 'text', text: p.text });
        }
      }
      if (content.length) messages.push({ role: 'assistant', content });
    } else {
      const content = userBlocks(c.parts);
      if (content.length) messages.push({ role: 'user', content });
    }
  }
  return messages;
}

export async function generate({ cfg, model, contents, systemInstruction, tools, effort, signal }) {
  const body = {
    model,
    max_tokens: 16000,
    system: systemInstruction,
    messages: toMessages(contents),
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: toJsonSchema(t.parameters) })),
    cache_control: { type: 'ephemeral' },
  };
  if (effort) body.output_config = { effort };
  let beta;
  if (FALLBACK_MODELS.test(model) && !noFallback.has(model)) {
    body.fallbacks = 'default';
    beta = 'server-side-fallback-2026-07-01';
  }
  let data;
  try {
    data = await requestJson(`${BASE}/messages`, { method: 'POST', headers: headers(cfg.key, beta), body, signal, who: WHO, model });
  } catch (e) {
    // Se a conta não aceitar o recurso de troca automática, repete sem ele.
    if (beta && e.status === 400 && /fallback|beta/i.test(e.detail || '')) {
      noFallback.add(model);
      return generate({ cfg, model, contents, systemInstruction, tools, effort, signal });
    }
    throw e;
  }
  const blocks = data.content || [];
  if (data.stop_reason === 'refusal') {
    return { parts: [], blockReason: 'o modelo recusou o pedido por segurança' };
  }
  const parts = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.text) parts.push({ text: b.text });
    else if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input || {}, id: b.id } });
  }
  return { parts, native: blocks, blockReason: data.stop_reason === 'max_tokens' && !parts.length ? 'resposta cortada pelo limite de tamanho' : null };
}
