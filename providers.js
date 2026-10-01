// Catalog of supported AIs. To use one, just enter its API key in the settings.
import * as gemini from './gemini.js';
import * as anthropic from './anthropic.js';
import * as openai from './openai.js';

export const PROVIDERS = [
  { id: 'gemini', label: 'Gemini', kind: 'gemini' },
  { id: 'anthropic', label: 'Claude', kind: 'anthropic' },
  { id: 'openai', label: 'ChatGPT', kind: 'openai', base: 'https://api.openai.com/v1' },
  { id: 'deepseek', label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com' },
  { id: 'xai', label: 'Grok', kind: 'openai', base: 'https://api.x.ai/v1' },
  { id: 'groq', label: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1' },
  { id: 'mistral', label: 'Mistral', kind: 'openai', base: 'https://api.mistral.ai/v1' },
  // For these two the catalog is too open to choose on its own: the model must be specified.
  { id: 'openrouter', label: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', needsModel: true },
  { id: 'custom', label: 'Other (OpenAI-compatible)', kind: 'openai', needsModel: true, needsBase: true },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || null;

// AI models: the full list (for the user to choose) and the automatic queue.
// If the user pinned a model (cfg.model), the queue is just that one.
export async function loadModels(provider, cfg, signal) {
  let models;
  let chain;
  try {
    if (provider.kind === 'gemini') {
      models = await gemini.listModels(cfg, signal);
      chain = gemini.buildModelChain(models);
    } else if (provider.kind === 'anthropic') {
      models = await anthropic.listModels(cfg, signal);
      chain = anthropic.buildModelChain(models);
    } else {
      models = await openai.listModels(provider, cfg, signal);
      chain = openai.buildModelChain(provider, models);
    }
  } catch (e) {
    // Some compatible services have no listing: with the model specified, continues with it alone.
    if (!cfg.model) throw e;
    models = [];
    chain = [];
  }
  const all = models.map((m) => m.id).sort();
  if (cfg.model) {
    chain = [cfg.model];
    if (!all.includes(cfg.model)) all.unshift(cfg.model);
  }
  return { all, chain };
}

// Sends the conversation and returns { parts, native?, blockReason?, malformed? } in the internal format.
export function generate(provider, request) {
  if (provider.kind === 'gemini') return gemini.generate(request);
  if (provider.kind === 'anthropic') return anthropic.generate(request);
  return openai.generate({ provider, ...request });
}
