# EYOA

**A Chrome side-panel agent that works with the AI of your choice.** EYOA opens a panel next to the page and, from a plain-language request, reads the page, clicks, fills in fields, opens URLs and reports back what it did. It works with Gemini, Claude, ChatGPT, DeepSeek, Grok, Groq, Mistral, OpenRouter and any OpenAI-compatible service. All you need is an API key.

![EYOA icon](icons/icon128.png)

## What it does

- Works **only in the tab it was opened in**: reads the page text and elements, clicks, types, selects options, scrolls, navigates and takes screenshots.
- Accepts **attachments** (images, PDF, audio, video and text files) via the clip button, drag and drop, or paste.
- **Switches models automatically** when the AI hits its usage limit; a model can also be pinned.
- **Reasoning effort** adjustable per AI (Gemini, Claude and ChatGPT).
- Asks for **permission** before clicking, typing or opening pages (configurable).
- Follows an editable **code of conduct** in [`diretrizes.js`](diretrizes.js): understands the request before acting, asks only when needed, writes well-organized messages and ends with a short report.
- Never types passwords, verification codes or card details.
- Replies in the language you write in.

## Install

1. Download this repository (**Code → Download ZIP**) and extract the folder somewhere permanent, e.g. `C:\EYOA`.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the extracted folder (the one containing `manifest.json`).
4. Pin the EYOA icon to the toolbar via the puzzle-piece button.

## Set up

1. Open the page you want to work on and click the EYOA icon.
2. In **Settings** (gear icon), click the AI you want, paste its API key and save. Where to get a key:
   - Gemini: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Claude: [platform.claude.com](https://platform.claude.com)
   - ChatGPT: [platform.openai.com](https://platform.openai.com)
   - Others: on each service's website. OpenRouter and OpenAI-compatible services also require a model name (and, for "Other", the API endpoint).
3. Below the message box, the AI icon shows which AI is in use; click it to switch and the **+** to pick a model.

Keys are stored only in your browser (`chrome.storage.local`) and sent only to the corresponding AI service. Conversations are not saved.

## Use

Write the request as you would to a person: "Summarize this page", "Find the contact phone number", "Fill in the form with the data from the attachment". To stop, click the square that replaces the send button. The dots adjust the AI's effort: smaller is faster, larger is more careful.

## Limits

- Does not work on internal Chrome pages, the Chrome Web Store or PDFs opened directly in the browser.
- Content inside embedded frames (iframes) may not be read.
- Free-tier keys have small quotas; for continuous use, enable billing on the key.
- Quality depends on the model you choose.

## How it works

| File | Role |
| --- | --- |
| `panel.html` / `panel.js` / `panel.css` | Side panel, agent loop and interface |
| `browser-tools.js` | Tools the AI uses on the page (read, click, type, navigate, capture) |
| `providers.js` + `gemini.js` / `anthropic.js` / `openai.js` | One adapter per API family |
| `api.js` | HTTP calls, friendly errors and retries |
| `diretrizes.js` | Code of conduct sent to the AI (edit freely) |
| `background.js` | Opens the panel bound to the clicked tab |

No dependencies, no build step: just load the folder in Chrome.

## Support the creator

If EYOA is useful to you, consider buying me a coffee: **[buymeacoffee.com/fyntav](https://buymeacoffee.com/fyntav)**. You can also use the **Sponsor** button at the top of this page.

## Credits

- AI logos: [Simple Icons](https://simpleicons.org) (CC0) and [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT). Trademarks belong to their owners; see [`icons/ai/LICENSES.md`](icons/ai/LICENSES.md).
- This project is not affiliated with Google, Anthropic, OpenAI or any AI vendor.

## License

[MIT](LICENSE).
