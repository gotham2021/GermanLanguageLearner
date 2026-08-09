# Anrede

German speaking practice with personas and goal-directed scenarios, across CEFR levels A1–C2. Runs entirely in the browser — the language model is executed locally on-device (WebGPU via WebLLM). There is no backend and no API calls: Vercel only serves static files and never sees a prompt or a reply. Your own progress (level, corrections) also stays exclusively local, in IndexedDB on your device.

The UI chrome (buttons, labels, menus) is bilingual — English by default, with a one-tap toggle to German. The actual German-learning content (persona names, scenario descriptions, the model's dialogue and corrections) always stays in German, since that's the language being taught. This split matters: a beginner shouldn't need to already read German just to operate a German-learning app.

## Features

- **Free conversation**: six personas (neighbor, citizens' registration office clerk, family doctor, football buddy, fellow student, office colleague) for open-ended conversation in "Sie" or "du" register.
- **Scenarios**: twelve pre-built, goal-directed roleplays (supermarket checkout, bakery, buying a ticket, citizens' registration office, a tradesperson's home visit, doctor's appointment, apartment viewing, filing a complaint, cancelling a contract, parent-teacher conversation, salary negotiation, neighbor dispute, and more), each with an opening line and automatic detection of when the conversation's goal has been reached.
- **Custom scenarios**: a form lets you define your own person/situation (name, role, description, setting, goal, register, level) — saved locally in IndexedDB.
- **CEFR level A1–C2**: affects sentence length, grammar, and vocabulary of the persona, plus how strictly corrections are applied. On first use you self-assess your level; it can be changed anytime via the level icon in the header.
- **Correction as its own model call**: grammar/register checking runs as a second, separate model call after the main reply — not as an extra instruction bundled into the same prompt. In real-device testing with a small (~1–1.5B parameter) on-device model, correction was consistently the instruction most likely to get dropped when bundled alongside persona/role, register, level, and goal-tracking in a single generation. Splitting it out costs one extra short generation per message (a bit more latency) but makes correction materially more reliable.
- **Automatic progress assessment**: the app tracks corrections by category (register/grammar/vocabulary) across sessions and — with a deliberate delay and cooldown, never automatically — suggests moving to a higher or lower level. This is a deterministic heuristic (correction rate over multiple days), not a language-model judgment call — intentionally, since a small on-device model has no verified reliability for self-assessment of this kind.
- **Progress view**: a bar chart of corrections by category over the last 30 days, reachable via the chart icon in the header.

## Model choice: Llama-3.2-1B-Instruct

The app runs Meta's `Llama-3.2-1B-Instruct` (q4f16_1 quantization via WebLLM), not the larger Qwen2.5-1.5B model used in earlier versions. Two reasons, both evidence-based rather than a "bigger is better" assumption:

1. **Memory.** At 1.2B parameters (vs. 1.5B), it puts less pressure on iOS Safari's comparatively tight per-tab memory ceiling — the binding constraint for an in-browser on-device model on iPhone.
2. **Documented German support.** Meta's official Llama 3.2 model card lists German as one of eight officially supported languages. Qwen2.5's model card makes no equivalent documented claim for German specifically. Given the app teaches German, a smaller model with a documented claim beats a larger model without one.

The real model's context window is 128K tokens per its `mlc-chat-config.json`, but this app caps it far below that (`MODEL_CONTEXT_TOKENS` in `index.html`) — KV-cache memory scales with context length, and iOS Safari's memory budget is the tightest constraint this app runs under.

## What runs where

- **Vercel**: hosts the static files (`index.html`, `manifest.json`, `sw.js`, icons, `vercel.json`). That's all.
- **Your browser**: on first launch, downloads the model (`Llama-3.2-1B-Instruct`, roughly 1 GB) from Hugging Face / the WebLLM CDN, caches it locally (Cache Storage / IndexedDB), and from then on runs every conversation entirely on-device. No prompt and no reply is ever sent to Vercel or any other server.
- Only external network requests at runtime: the WebLLM script and the model weights (on first launch, or on a cache miss), plus Google Fonts.

## Deploy: GitHub → Vercel

1. Create the repo and push the files:
   ```bash
   git init
   git add .
   git commit -m "Anrede: local German speaking practice"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```

2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.

3. During project setup:
   - **Framework Preset**: `Other` (no build step, no `package.json` needed)
   - **Build Command**: leave empty
   - **Output Directory**: `.` (project root, since all files are already static)

4. Click Deploy. Done — the URL is live immediately.

5. On iPhone: open the Vercel URL in **Safari** (iOS 26+, required for WebGPU), then **Share → Add to Home Screen**.

## Why `vercel.json` exists

WebLLM's WASM runtime benefits from *cross-origin isolation* (`SharedArrayBuffer`). A plain static server doesn't send the required headers automatically, so `vercel.json` sets them for all routes:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`credentialless` is used instead of `require-corp` so that Google Fonts and the WebLLM CDN script keep loading without requiring those third-party servers to set their own CORP headers.

## Important for future updates

`sw.js` serves `index.html` and `manifest.json` **network-first** (always try to fetch the latest version, only fall back to cache when offline). Icons are cache-first, since they practically never change.

The browser only checks for a new service worker version when the **bytes of `sw.js` itself** change. So if you only change `index.html`, also bump `CACHE_NAME` in `sw.js` (e.g. `anrede-shell-v6`) — otherwise already-installed users won't notice there's an update at all, and the app keeps running the old service worker (which would load new content network-first, but only once it's actually activated).

## Switching models

In `index.html`, near the top of the `<script type="module">` block, adjust the `MODEL_ID` constant (currently `Llama-3.2-1B-Instruct-q4f16_1-MLC`) and `MODEL_CONTEXT_TOKENS`. Larger models produce better German but need more memory and a larger initial download — see "Model choice" above before swapping to a smaller model, since instruction-following (especially for the correction feature) degrades faster than raw fluency as models shrink.

## Testing locally

WebGPU and service workers require a secure context. `file://` is not enough. Test locally with, e.g.:

```bash
npx serve .
```

then open `http://localhost:3000` (localhost counts as a secure context).
