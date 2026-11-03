# 🎙️ Prompt-Cue: Audio Ear-Prompter & Visual Teleprompter

A modern, responsive browser-based ear-prompter and teleprompter application built with vanilla web technologies. It feeds real-time voice cues directly into your earphones/headphones while visually tracking your script with synchronized, karaoke-style active text highlighting.

---

## ✨ Key Features

- **🎧 Private Ear-Cues over Headphones**: Uses the Web SpeechSynthesis API with zero latency and full offline support. Includes an **Audio Output Device Selector** (`setSinkId`) to route speech cues straight to your Bluetooth earpiece, in-ear monitor (IEM), or headphones without playing aloud to your audience.
- **⏱️ 3 Punctuation-Aware Cue Prompting Styles**:
  1. **Continuous**: Reads the full script start-to-finish without stopping.
  2. **Sentence-by-Sentence**: Prompts one complete sentence at a time into your ear (`.`, `!`, `?`).
  3. **Clause / Phrase**: Naturally stops at punctuation breath marks (dots `.`, commas `,`, semicolons `;`, colons `:`, and dashes `—`). Preserves mid-word apostrophes (e.g. *don't*, *bank's*).
- **🎙️ Presenter Microphone & Real-Time Speech Verification**:
  - Listens to your voice via Web Speech Recognition with native language matching.
  - **Auto-Advance**: When you deliver the prompted phrase correctly into your mic, the app automatically advances to the next cue.
  - **Mismatch / Mispronounce Detection**: If you miss or mispronounce a word, it pauses, highlights the exact mismatched word(s) in **glowing orange**, and re-prompts the line into your ear!
  - **Persistent Permission**: Retains microphone permission across sessions to prevent recurring browser popups.
- **🎯 Precise Synchronized Highlighting**:
  - Accurate character-level token mapping with intelligent dual-tier boundary tracking and a fallback pacing advancer for smooth, drift-free word tracking across long multi-paragraph scripts.
  - **Double-Click / Double-Tap Word Jump**: Tap or click twice on any word/sentence in the prompter screen to instantly jump the voice cue there (with accidental scroll-touch protection).
- **📱 Fully Mobile & Tablet Responsive**:
  - Sticky mobile navigation tab bar for effortless switching between **Controls & Script** and full-height **Prompter Screen**.
  - Auto-switches to the teleprompter screen the moment you press "Start Prompting" on mobile devices.
  - `100dvh` viewport support and 16px minimum font size for form controls to eliminate iOS Safari zoom jumps.
- **🎭 6 Voice Delivery Tones & Personas**:
  - *Dynamic Auto-Sense* (shapes pitch and inflection dynamically based on context and punctuation)
  - *Classy & Professional*
  - *Friendly & Conversational*
  - *High-Energy & Punchy*
  - *Suspenseful & Dramatic*
  - *Neutral & Steady*
- **🎨 Live Color & Typography Customizer**:
  - Pickers for App Background, Prompter Screen Background, Text Color, Active Highlight Color, and Read Text Fade.
  - 5 one-click studio presets: *Studio Dark, Broadcast High-Contrast, Daylight, Matrix Cyber Green, Warm Sepia*.
  - Font size (20px–84px), line height, viewport margins, and Mirror / Glass mode for physical beam-splitter teleprompters.
- **🌐 AI Cloud Voice Engine Support (Optional)**: Optional ElevenLabs API integration for neural studio voices.

---

## 🚀 Getting Started

No build tools, package managers, or Node.js runtime required!

1. Clone or download this repository.
2. Open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Safari, Firefox).
3. Paste or type your script, plug in your headphones, and click **Start Prompting** (or press `Spacebar`).

### ⌨️ Keyboard Shortcuts
- **`Spacebar`**: Start / Pause / Resume
- **`Escape`**: Reset / Stop
- **`Double-Click Word`**: Jump voice cue to that word
- **`⛶`**: Fullscreen Mode

---

## 📄 License
MIT License. Free for personal, professional, and commercial use.
