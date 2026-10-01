// Adaptador para o Gemini (Google), pela API generateContent.
import { requestJson } from './api.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const WHO = 'Gemini';
const NOT_CHAT = /(image|tts|live|embedding|transcribe|computer-use|robotics|aqa|deep-research|antigravity|learnlm|native-audio|translate)/;

const auth = (cfg) => ({ 'x-goog-api-key': cfg.key });

function versionOf(name) {
  const m = name.match(/^gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export async function listModels(cfg, signal) {
  const data = await requestJson(`${BASE}/models?pageSize=1000`, { headers: auth(cfg), signal, who: WHO });
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, '') }))
    .filter((m) => m.id.startsWith('gemini') && !NOT_CHAT.test(m.id));
}

// Usa somente os modelos "lite", que têm o maior limite de uso no plano gratuito;
// os estáveis vêm antes dos de prévia, do mais novo para o mais antigo.
// Se a chave não oferecer nenhum "lite", usa os demais "flash" e, por último, o restante.
export function buildModelChain(models) {
  const ids = models.map((m) => m.id);
  const order = (list) =>
    list.sort((a, b) => /preview|exp/.test(a) - /preview|exp/.test(b) || versionOf(b) - versionOf(a));
  const lite = ids.filter((id) => /lite/.test(id));
  if (lite.length) return order(lite);
  const flash = ids.filter((id) => /flash/.test(id));
  return order(flash.length ? flash : ids);
}

function functionResponse(name, id, response, extra) {
  const fr = { name, response };
  if (id) fr.id = id;
  return { functionResponse: { ...fr, ...extra } };
}

// imageMode define como a captura de tela volta ao modelo: dentro do resultado da
// ferramenta ('nested'), ao final da mensagem ('sibling') ou sem imagem ('none').
function toContents(contents, imageMode) {
  return contents.map((c) => {
    const parts = [];
    const images = [];
    for (const p of c.parts) {
      if (p.toolResult) {
        const { name, id, response } = p.toolResult;
        if (!p.image) parts.push(functionResponse(name, id, response));
        else {
          const inlineData = { mimeType: 'image/jpeg', data: p.image };
          if (imageMode === 'nested') parts.push(functionResponse(name, id, response, { parts: [{ inlineData }] }));
          else if (imageMode === 'sibling') {
            parts.push(functionResponse(name, id, { resultado: 'A captura de tela está na imagem ao final desta mensagem.' }));
            images.push({ inlineData });
          } else parts.push(functionResponse(name, id, { error: 'Este modelo não aceitou a imagem. Use read_page ou get_page_text.' }));
        }
      } else if (p.inlineData) parts.push({ inlineData: p.inlineData });
      else parts.push(p); // texto e chamadas de função voltam intactos (preserva as assinaturas de raciocínio)
    }
    return { role: c.role, parts: [...parts, ...images] };
  });
}

export async function generate({ cfg, model, contents, systemInstruction, tools, effort, imageMode, signal }) {
  const body = {
    contents: toContents(contents, imageMode),
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: tools }],
  };
  if (effort) body.generationConfig = { thinkingConfig: { thinkingLevel: effort } };
  const data = await requestJson(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: auth(cfg),
    body,
    signal,
    who: WHO,
    model,
  });
  const cand = (data.candidates || [])[0];
  const parts = ((cand && cand.content && cand.content.parts) || []).filter((p) => !p.thought);
  return {
    parts,
    malformed: !parts.length && cand && cand.finishReason === 'MALFORMED_FUNCTION_CALL',
    blockReason: !parts.length ? (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'sem resposta' : null,
  };
}
