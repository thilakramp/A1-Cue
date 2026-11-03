# 🎙️ Prompt-Cue: Audio Ear-Prompter & Visual Teleprompter

A modern, responsive browser-based teleprompter and headphone ear-cue system built with vanilla web technologies. It feeds voice cues directly into your earphones while visually following your script with customizable synchronized highlighting.

---

## ✨ Features

- **🎧 Audio Ear-Cues over Headphones**: Uses Web SpeechSynthesis with 0 latency and full offline support. Includes an audio output device selector (`setSinkId`) so speech prompts stay private to your in-ear monitor/Bluetooth headphone.
- **⏱️ 3 Prompting Cue Styles**:
  1. **Continuous**: Reads the full script uninterrupted.
  2. **Sentence-by-Sentence**: Prompts one complete sentence at a time into your ear.
  3. **Clause / Phrase**: Stops at natural punctuation breath marks (dots `.`, commas `,`, semicolons `;`, colons `:`, and dashes `—`).
- **🎙️ Presenter Mic & Speech Verification**:
  - Listens to your voice via Speech Recognition.
  - Automatically advances to the next cue when you deliver the prompted phrase correctly.
  - If you miss or mispronounce a word, it highlights the mismatch on screen in **glowing orange** and re-prompts the line into your ear!
  - Persistent microphone permission retention prevents recurring browser prompts.
- **🎯 Double-Click / Double-Tap Word Jump**: Prevents accidental scroll touches. Double-click or double-tap any word on the teleprompter screen to instantly jump the voice cue to that exact location.
- **🎭 6 Delivery Styles / Tones**:
  - *Dynamic Auto-Sense* (inflects based on punctuation like `?` and `!`)
  - *Classy & Professional*
  - *Friendly & Conversational*
  - *High-Energy & Punchy*
  - *Suspenseful & Dramatic*
  - *Neutral & Steady*
- **🎨 Comprehensive Color & Typography Customizer**:
  - Real-time pickers for App Background, Prompter Screen Background, Text Color, Active Highlight Color, and Read/Past Text Fade.
  - 5 one-click studio presets: *Studio Dark, Broadcast High-Contrast, Daylight, Matrix Cyber Green, Warm Sepia*.
  - Font size (20px–84px), line spacing, and teleprompter mirror mode (for physical beam-splitter glass).
- **🌐 AI Cloud Voice Engine Support (Optional)**: Built-in optional support for ElevenLabs API neural voices.

---

## 🚀 Getting Started

No build step, Node.js, or package manager required!

1. Clone or download this repository.
2. Double-click `index.html` or open it in any modern browser (Chrome, Edge, Safari, Firefox).
3. Paste your script, connect your headphones, and press **Start Prompting** (or hit `Spacebar`).

### ⌨️ Keyboard Shortcuts
- **`Space`**: Start / Pause / Resume
- **`Esc`**: Reset / Stop
- **`Double-Click Word`**: Jump voice cue to that word
- **`⛶`**: Fullscreen Mode

---

## 📄 License
MIT License. Free for personal, professional, and commercial use.
