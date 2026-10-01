# EYOA

**Um agente de navegador para o Chrome que usa a IA da sua escolha.** A EYOA abre um painel ao lado da página e, a partir de um pedido em linguagem natural, lê a página, clica, preenche campos, abre endereços e entrega um relatório do que fez. Funciona com Gemini, Claude, ChatGPT, DeepSeek, Grok, Groq, Mistral, OpenRouter e qualquer serviço compatível com a API da OpenAI. Basta a chave de API.

> EYOA is a Chrome side-panel browser agent that works with the AI of your choice (Gemini, Claude, ChatGPT and others) using only an API key. The interface is in Brazilian Portuguese.

## O que ela faz

- Trabalha **somente na aba em que foi aberta**: lê o texto e os elementos da página, clica, digita, seleciona opções, rola, navega e captura a tela.
- Aceita **anexos** (imagem, PDF, áudio, vídeo e texto) pelo clipe, arrastando ou colando.
- **Troca de modelo sozinha** quando a IA atinge o limite de uso; o modelo também pode ser fixado.
- **Esforço de raciocínio** ajustável conforme a IA (Gemini, Claude e ChatGPT).
- Pede **autorização** antes de clicar, digitar ou abrir páginas (configurável).
- Segue um **roteiro de boas maneiras** editável em [`diretrizes.js`](diretrizes.js): entende o pedido antes de agir, pergunta só quando necessário, escreve mensagens organizadas e entrega um relatório ao final.
- Nunca digita senhas, códigos de verificação ou dados de cartão.

## Instalação

1. Baixe este repositório (**Code → Download ZIP**) e extraia a pasta em um lugar fixo, por exemplo `C:\EYOA`.
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta extraída (a que contém `manifest.json`).
4. Fixe o ícone da EYOA na barra pelo botão de quebra-cabeça.

## Configuração

1. Abra a página em que quer trabalhar e clique no ícone da EYOA.
2. Nas **Configurações** (engrenagem), clique na IA desejada, cole a chave de API e salve. Onde conseguir a chave:
   - Gemini: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Claude: [platform.claude.com](https://platform.claude.com)
   - ChatGPT: [platform.openai.com](https://platform.openai.com)
   - As demais, no site de cada serviço. OpenRouter e serviços compatíveis exigem informar também o modelo (e, no caso de "Outra", o endereço da API).
3. Abaixo do campo de mensagem, o ícone da IA mostra qual está em uso; clique nele para trocar e no **+** para escolher o modelo.

As chaves ficam guardadas apenas no seu navegador (`chrome.storage.local`) e são enviadas somente ao serviço da IA correspondente. A conversa não é gravada.

## Uso

Escreva o pedido como falaria com uma pessoa: "Resuma esta página", "Encontre o telefone de contato", "Preencha o formulário com os dados do anexo". Para interromper, clique no quadrado no lugar do botão de enviar. As bolinhas ajustam o esforço da IA: menor é mais rápido, maior é mais cuidadoso.

## Limites

- Não opera em páginas internas do Chrome, na Chrome Web Store nem em PDFs abertos direto no navegador.
- Conteúdo dentro de quadros embutidos (iframes) pode não ser lido.
- Chaves no plano gratuito têm cotas pequenas; para uso contínuo, ative o faturamento na chave.
- A qualidade depende do modelo escolhido.

## Como funciona

| Arquivo | Papel |
| --- | --- |
| `panel.html` / `panel.js` / `panel.css` | Painel lateral, laço do agente e interface |
| `browser-tools.js` | Ferramentas que a IA usa na página (ler, clicar, digitar, navegar, capturar) |
| `providers.js` + `gemini.js` / `anthropic.js` / `openai.js` | Um adaptador por família de API |
| `api.js` | Chamadas HTTP, erros em português e novas tentativas |
| `diretrizes.js` | Roteiro de comportamento enviado à IA (edite à vontade) |
| `background.js` | Abre o painel preso à aba clicada |

Sem dependências, sem build: é só carregar a pasta no Chrome.

## Apoie o criador

Se a EYOA for útil para você, considere apoiar o projeto. Veja as formas de apoio em [`.github/FUNDING.yml`](.github/FUNDING.yml) ou no botão **Sponsor** desta página.

## Créditos

- Logotipos das IAs: [Simple Icons](https://simpleicons.org) (CC0) e [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT). As marcas pertencem aos respectivos donos; veja [`icons/ai/LICENSES.md`](icons/ai/LICENSES.md).
- Este projeto não tem vínculo com Google, Anthropic, OpenAI ou qualquer fornecedor de IA.

## Licença

[MIT](LICENSE).
