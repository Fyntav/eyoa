// Adaptador para IAs que seguem o formato "Chat Completions" da OpenAI
// (ChatGPT, DeepSeek, Grok, Groq, Mistral, OpenRouter e serviços compatíveis).
import { requestJson, toJsonSchema } from './api.js';

const NOT_CHAT = /(audio|realtime|image|tts|transcri|search|embed|instruct|moderation|codex|dall-e|whisper|guard|ocr|rerank|babbage|davinci)/i;

const auth = (cfg) => ({ Authorization: `Bearer ${cfg.key}` });
const base = (provider, cfg) => (cfg.base || provider.base || '').replace(/\/+$/, '');

export async function listModels(provider, cfg, signal) {
  const data = await requestJson(`${base(provider, cfg)}/models`, { headers: auth(cfg), signal, who: provider.label });
  return (data.data || data.models || []).map((m) => ({ id: m.id, created: m.created || 0 }));
}

export function buildModelChain(provider, models) {
  let list = models.filter((m) => !NOT_CHAT.test(m.id));
  if (provider.id === 'openai') list = list.filter((m) => /^(gpt-|o\d|chatgpt)/.test(m.id));
  list.sort((a, b) => b.created - a.created);
  const ids = list.map((m) => m.id);
  if (provider.id === 'deepseek' && ids.includes('deepseek-chat')) {
    return ['deepseek-chat', ...ids.filter((id) => id !== 'deepseek-chat')];
  }
  return ids.slice(0, 5);
}

function toMessages(contents, systemInstruction, imageMode) {
  const messages = [{ role: 'system', content: systemInstruction }];
  for (const c of contents) {
    if (c.role === 'model') {
      const text = c.parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('');
      const calls = c.parts.filter((p) => p.functionCall);
      const msg = { role: 'assistant', content: text || null };
      if (calls.length) {
        msg.tool_calls = calls.map((p) => ({
          id: p.functionCall.id,
          type: 'function',
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
        }));
      }
      if (msg.content || msg.tool_calls) messages.push(msg);
      continue;
    }
    const content = [];
    for (const p of c.parts) {
      if (p.toolResult) {
        // Cada resultado é uma mensagem própria, logo após a resposta que pediu a ferramenta.
        messages.push({ role: 'tool', tool_call_id: p.toolResult.id, content: JSON.stringify(p.toolResult.response) });
        if (p.image && imageMode !== 'none') {
          content.push({ type: 'text', text: 'Captura de tela solicitada:' });
          content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${p.image}` } });
        }
      } else if (p.inlineData) {
        const { mimeType, data } = p.inlineData;
        if (mimeType.startsWith('image/')) content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } });
        else if (mimeType === 'application/pdf') content.push({ type: 'file', file: { filename: p.name || 'anexo.pdf', file_data: `data:${mimeType};base64,${data}` } });
        else content.push({ type: 'text', text: `(O anexo "${p.name || mimeType}" não pode ser lido por esta IA.)` });
      } else if (typeof p.text === 'string' && p.text.trim()) {
        content.push({ type: 'text', text: p.text });
      }
    }
    if (content.length) {
      const onlyText = content.every((x) => x.type === 'text');
      messages.push({ role: 'user', content: onlyText ? content.map((x) => x.text).join('\n\n') : content });
    }
  }
  return messages;
}

export async function generate({ provider, cfg, model, contents, systemInstruction, tools, effort, imageMode, signal }) {
  const body = {
    model,
    messages: toMessages(contents, systemInstruction, imageMode),
    tools: tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) },
    })),
  };
  // O ajuste de esforço só é enviado a quem reconhece o parâmetro.
  if (effort && provider.id === 'openai') body.reasoning_effort = effort;
  const data = await requestJson(`${base(provider, cfg)}/chat/completions`, {
    method: 'POST',
    headers: auth(cfg),
    body,
    signal,
    who: provider.label,
    model,
  });
  const choice = (data.choices || [])[0] || {};
  const msg = choice.message || {};
  const parts = [];
  if (typeof msg.content === 'string' && msg.content) parts.push({ text: msg.content });
  (msg.tool_calls || []).forEach((call, i) => {
    let args = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* argumentos inválidos: segue vazio */ }
    parts.push({ functionCall: { name: call.function.name, args, id: call.id || `call_${Date.now()}_${i}` } });
  });
  return {
    parts,
    blockReason: !parts.length ? (choice.finish_reason === 'content_filter' ? 'conteúdo bloqueado pelo filtro da IA' : choice.finish_reason || null) : null,
  };
}
