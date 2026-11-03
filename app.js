/**
 * Audio Cue Prompter - Core Application Logic
 * Supports:
 *  - Native Web SpeechSynthesis API with boundary tracking & utterance sequencing
 *  - 4 Prompting Chunk Styles:
 *      1) Continuous (Start to end of script)
 *      2) Sentence-by-Sentence
 *      3) Chunked (3-4 Words per prompt)
 *      4) Word-by-Word
 *  - Microphone Presenter Listening & Real-Time Speech Verification:
 *      * Web SpeechRecognition API listens to presenter speaking into mic
 *      * Validates if spoken word/sentence matches expected script chunk
 *      * If correct: advances to next line/word smoothly
 *      * If missed or mispronounced: pauses, highlights mismatched word in ORANGE with attention glow,
 *        and re-prompts the line/word into presenter's ear!
 *  - Double-click / double-tap word cue jumping (accidental touch protection)
 *  - Voice Delivery Style / Tone (Auto, Classy, Friendly, Energetic, Suspenseful, Neutral)
 *  - Fallback precise timer-based word-advancer
 *  - Multi-language & regional accent filtering
 *  - Color customizer with real-time UI/prompter theme persistence
 *  - Audio output device selection (headphone routing)
 *  - Optional Cloud TTS (ElevenLabs API) integration
 */

(function () {
  'use strict';

  // --- State ---
  const state = {
    isPlaying: false,
    isPaused: false,
    voices: [],
    selectedVoice: null,
    selectedLang: 'all',
    speed: 1.0,
    pitch: 1.0,
    volume: 1.0,
    leadDelaySec: 0.0,
    tone: 'auto', // 'auto' | 'classy' | 'friendly' | 'energetic' | 'suspenseful' | 'neutral'
    promptChunkStyle: 'sentence', // 'full' | 'sentence' | 'clause'
    micVerificationEnabled: false,
    highlightMode: 'word', // 'word' | 'sentence'
    autoScroll: true,
    mirrorMode: false,
    tokens: [], // Parsed tokens: { id, text, isWord, cleanWord, charStart, charEnd, sentenceIndex, clauseIndex }
    sentences: [], // Sentence groups
    clauses: [], // Punctuation-aware clause groups
    activeTokenIndex: -1,
    activeSentenceIndex: -1,
    activeChunkIndex: -1,
    currentPromptUnitIndex: 0, // Points to current sentence / chunk / word being prompted
    mismatchedTokenIds: new Set(),
    startTokenOffset: 0, // When user jumps to a specific word
    synth: window.speechSynthesis,
    currentUtterance: null,
    timerTrackerId: null,
    currentText: '',
    cloudEngine: 'browser',
    audioElement: null,

    // Speech Recognition state
    recognition: null,
    isRecognizing: false,
    recognitionLang: 'en-US',
    hasMicPermission: false,
    isWaitingForPresenter: false,
    repromptTimeoutId: null
  };

  // --- DOM Elements ---
  const el = {
    scriptInput: document.getElementById('scriptInput'),
    wordCount: document.getElementById('wordCount'),
    estReadingTime: document.getElementById('estReadingTime'),
    playBtn: document.getElementById('playBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    speedRate: document.getElementById('speedRate'),
    speedValue: document.getElementById('speedValue'),
    pitchRate: document.getElementById('pitchRate'),
    pitchValue: document.getElementById('pitchValue'),
    volumeRate: document.getElementById('volumeRate'),
    volumeValue: document.getElementById('volumeValue'),
    leadTime: document.getElementById('leadTime'),
    leadTimeValue: document.getElementById('leadTimeValue'),

    // Chunking & Mic
    promptChunkStyle: document.getElementById('promptChunkStyle'),
    chunkStyleDesc: document.getElementById('chunkStyleDesc'),
    micVerifyChk: document.getElementById('micVerifyChk'),
    micStatusDot: document.getElementById('micStatusDot'),
    micFeedbackRow: document.getElementById('micFeedbackRow'),
    liveTranscriptText: document.getElementById('liveTranscriptText'),

    // Voice & Tone
    toneSelect: document.getElementById('toneSelect'),
    toneDesc: document.getElementById('toneDesc'),
    languageSelect: document.getElementById('languageSelect'),
    voiceSelect: document.getElementById('voiceSelect'),
    testVoiceBtn: document.getElementById('testVoiceBtn'),
    voiceStatusMsg: document.getElementById('voiceStatusMsg'),
    audioOutputSelect: document.getElementById('audioOutputSelect'),

    // Prompter Screen
    prompterViewport: document.getElementById('prompterViewport'),
    prompterContent: document.getElementById('prompterContent'),
    prompterProgressBar: document.getElementById('prompterProgressBar'),
    autoScrollChk: document.getElementById('autoScrollChk'),
    mirrorFlipChk: document.getElementById('mirrorFlipChk'),
    toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
    toggleFullscreenBtn: document.getElementById('toggleFullscreenBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),
    
    // Theme Pickers
    colorAppBg: document.getElementById('colorAppBg'),
    colorAppBgHex: document.getElementById('colorAppBgHex'),
    colorPrompterBg: document.getElementById('colorPrompterBg'),
    colorPrompterBgHex: document.getElementById('colorPrompterBgHex'),
    colorText: document.getElementById('colorText'),
    colorTextHex: document.getElementById('colorTextHex'),
    colorHighlightBg: document.getElementById('colorHighlightBg'),
    colorHighlightBgHex: document.getElementById('colorHighlightBgHex'),
    colorHighlightText: document.getElementById('colorHighlightText'),
    colorHighlightTextHex: document.getElementById('colorHighlightTextHex'),
    colorPastText: document.getElementById('colorPastText'),
    colorPastTextHex: document.getElementById('colorPastTextHex'),

    // Typography
    fontSize: document.getElementById('fontSize'),
    fontSizeVal: document.getElementById('fontSizeVal'),
    lineHeight: document.getElementById('lineHeight'),
    lineHeightVal: document.getElementById('lineHeightVal'),
    prompterPadding: document.getElementById('prompterPadding'),
    prompterPaddingVal: document.getElementById('prompterPaddingVal'),
    fontFamilySelect: document.getElementById('fontFamilySelect'),

    // Cloud TTS
    cloudEngineSelect: document.getElementById('cloudEngineSelect'),
    elevenlabsConfig: document.getElementById('elevenlabsConfig'),
    elevenlabsApiKey: document.getElementById('elevenlabsApiKey'),
    elevenlabsVoiceId: document.getElementById('elevenlabsVoiceId')
  };

  // Tone descriptions
  const TONE_EXPLANATIONS = {
    'auto': '✨ Automatically shapes voice pitch, cadence, and pauses based on sentence context and punctuation (?, !, ...).',
    'classy': '🎩 Classy & articulate: slightly deeper tone, steady pacing, measured poise for keynotes and executive speeches.',
    'friendly': '😊 Warm & cheerful: uplifting tone (+15% pitch), slightly brisk, expressive conversational style.',
    'energetic': '🔥 High-energy & punchy: fast-paced (+20% speed), dynamic vocal modulation for high-impact promos.',
    'suspenseful': '🕵️ Suspenseful & dramatic: low pitch, slower dramatic tempo with lingering pauses between sentences.',
    'neutral': '⚖️ Neutral & uniform: traditional flat teleprompter audio cue without emotional inflections.'
  };

  // Chunk style descriptions
  const CHUNK_EXPLANATIONS = {
    'full': 'Continuous: reads the full script start-to-finish without waiting.',
    'sentence': 'Sentence-by-Sentence: prompts one complete sentence at a time into your ear.',
    'clause': 'Clause / Phrase: pauses at every comma, period, semicolon, colon, dash — natural breath-mark phrasing.'
  };

  // --- Color Presets ---
  const PRESETS = {
    'studio-dark': {
      appBg: '#0f172a',
      prompterBg: '#020617',
      text: '#e2e8f0',
      highlightBg: '#2563eb',
      highlightText: '#ffffff',
      pastText: '#64748b'
    },
    'broadcast-black': {
      appBg: '#121212',
      prompterBg: '#000000',
      text: '#f1f5f9',
      highlightBg: '#e11d48',
      highlightText: '#ffffff',
      pastText: '#475569'
    },
    'clean-light': {
      appBg: '#f1f5f9',
      prompterBg: '#ffffff',
      text: '#0f172a',
      highlightBg: '#0284c7',
      highlightText: '#ffffff',
      pastText: '#94a3b8'
    },
    'cyber-green': {
      appBg: '#0a100d',
      prompterBg: '#050a07',
      text: '#4ade80',
      highlightBg: '#16a34a',
      highlightText: '#000000',
      pastText: '#166534'
    },
    'warm-sepia': {
      appBg: '#2b231d',
      prompterBg: '#1c1612',
      text: '#fef3c7',
      highlightBg: '#d97706',
      highlightText: '#000000',
      pastText: '#785b46'
    }
  };

  // --- Initialization ---
  function init() {
    loadSettings();
    initSpeechSynthesis();
    initSpeechRecognition();
    initAudioDevices();
    bindEvents();
    updateScriptStats();
    buildPrompterDOM(el.scriptInput.value);
  }

  // --- Speech Recognition Setup (Presenter Mic) ---
  // We call getUserMedia ONCE on toggle-on to get a persistent mic permission grant.
  // The MediaStream is kept alive (stored in state.micStream) so the browser considers
  // the permission already granted for the lifetime of the page and never asks again.
  function initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('SpeechRecognition API not supported in this browser.');
      if (el.micVerifyChk) {
        el.micVerifyChk.disabled = true;
        el.micVerifyChk.title = 'Speech Recognition requires Chrome, Edge, Safari, or a Chromium browser.';
      }
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;      // Never auto-stop
      recognition.interimResults = true;  // Show words as spoken
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        state.isRecognizing = true;
        updateMicStatusUI('listening');
        if (el.liveTranscriptText) el.liveTranscriptText.textContent = 'Mic active — say your cue...';
      };

      recognition.onaudiostart = () => {
        updateMicStatusUI('active');
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            finalTranscript += res[0].transcript + ' ';
          } else {
            interimTranscript += res[0].transcript;
          }
        }

        const currentSpeech = (finalTranscript || interimTranscript).trim();
        if (currentSpeech && el.liveTranscriptText) {
          el.liveTranscriptText.textContent = `"${currentSpeech}"`;
        }

        if (state.isPlaying && state.micVerificationEnabled && currentSpeech) {
          handlePresenterSpeech(currentSpeech, Boolean(finalTranscript));
        }
      };

      recognition.onerror = (event) => {
        console.warn('Recognition event:', event.error);
        if (event.error === 'not-allowed') {
          showMicPermissionBanner();
        } else if (event.error === 'aborted') {
          // We called stop() ourselves — ignore
        }
        // For no-speech / network errors, onend will restart us automatically
      };

      recognition.onend = () => {
        state.isRecognizing = false;
        // Auto-restart if mic is still enabled and we're playing — keeps the session alive
        if (state.micVerificationEnabled && (state.isPlaying || state.isPaused)) {
          try { recognition.start(); } catch (_) {}
        } else {
          updateMicStatusUI(state.micVerificationEnabled ? 'standby' : 'off');
        }
      };

      state.recognition = recognition;
    } catch (e) {
      console.warn('Failed to set up SpeechRecognition:', e);
    }
  }

  // Request mic via getUserMedia once — this is what grants the persistent browser permission.
  // After calling this once the recognition.start() calls on the same page no longer prompt.
  async function requestMicPermissionOnce() {
    if (state.micStream) return true; // Already granted on this page

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      state.micStream = stream; // Keep stream alive — this holds the permission grant open
      hideMicPermissionBanner();
      return true;
    } catch (err) {
      console.warn('Mic permission denied:', err);
      showMicPermissionBanner();
      state.micVerificationEnabled = false;
      el.micVerifyChk.checked = false;
      updateMicStatusUI('off');
      return false;
    }
  }

  function showMicPermissionBanner() {
    const banner = document.getElementById('micPermissionBanner');
    if (banner) banner.style.display = 'flex';
  }

  function hideMicPermissionBanner() {
    const banner = document.getElementById('micPermissionBanner');
    if (banner) banner.style.display = 'none';
  }
  function startRecognition() {
    if (!state.recognition || state.isRecognizing) return;
    try {
      state.recognition.lang = state.selectedVoice ? state.selectedVoice.lang : (state.selectedLang !== 'all' ? state.selectedLang : 'en-US');
      state.recognition.start();
    } catch (e) {
      console.warn('Could not start recognition:', e);
    }
  }

  function stopRecognition() {
    if (!state.recognition || !state.isRecognizing) return;
    try {
      state.recognition.stop();
    } catch (e) {
      console.warn('Could not stop recognition:', e);
    }
  }
  function updateMicStatusUI(status) {
    if (!el.micStatusDot) return;
    el.micStatusDot.classList.remove('active', 'listening');

    if (status === 'listening' || status === 'active') {
      el.micStatusDot.classList.add(status === 'active' ? 'active' : 'listening');
      el.micFeedbackRow.style.display = 'flex';
    } else if (status === 'standby') {
      el.micFeedbackRow.style.display = 'flex';
    } else {
      el.micFeedbackRow.style.display = 'none';
    }
  }

  // --- Voice & SpeechSynthesis Management ---
  function initSpeechSynthesis() {
    if (!state.synth) {
      if (el.voiceStatusMsg) el.voiceStatusMsg.textContent = 'Speech synthesis not supported in this browser.';
      return;
    }

    const loadVoices = () => {
      const voices = state.synth.getVoices();
      if (!voices || !voices.length) return;
      state.voices = voices;
      populateLanguages(voices);
      populateVoices();
    };

    loadVoices();
    if (state.synth.onvoiceschanged !== undefined) {
      state.synth.onvoiceschanged = loadVoices;
    }
  }

  function populateLanguages(voices) {
    const langMap = new Map();
    voices.forEach(v => {
      const langCode = v.lang;
      const cleanName = getLanguageDisplayName(langCode);
      if (!langMap.has(langCode)) {
        langMap.set(langCode, cleanName);
      }
    });

    const currentLang = el.languageSelect.value || 'all';
    el.languageSelect.innerHTML = '<option value="all">🌐 All Languages (' + langMap.size + ')</option>';

    const sorted = Array.from(langMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    sorted.forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${name} (${code})`;
      el.languageSelect.appendChild(opt);
    });

    if (langMap.has(currentLang)) {
      el.languageSelect.value = currentLang;
    } else {
      const navLang = navigator.language;
      const match = sorted.find(([code]) => code.toLowerCase() === navLang.toLowerCase() || code.startsWith(navLang.split('-')[0]));
      if (match) {
        el.languageSelect.value = match[0];
      }
    }
  }

  function getLanguageDisplayName(langCode) {
    try {
      const intl = new Intl.DisplayNames(['en'], { type: 'language' });
      return intl.of(langCode.split('-')[0]) + (langCode.includes('-') ? ` [${langCode.split('-')[1]}]` : '');
    } catch (e) {
      return langCode;
    }
  }

  function populateVoices() {
    const selectedLang = el.languageSelect.value;
    el.voiceSelect.innerHTML = '';

    const filtered = state.voices.filter(v => {
      if (selectedLang === 'all') return true;
      return v.lang === selectedLang || v.lang.startsWith(selectedLang.split('-')[0]);
    });

    if (filtered.length === 0) {
      el.voiceSelect.innerHTML = '<option value="">No voices for this language</option>';
      return;
    }

    filtered.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang}) ${voice.default ? '★' : ''}`;
      if (voice.localService) {
        opt.textContent += ' [Offline]';
      }
      el.voiceSelect.appendChild(opt);
    });

    const savedVoice = localStorage.getItem('prompt_cue_voice');
    if (savedVoice && filtered.some(v => v.name === savedVoice)) {
      el.voiceSelect.value = savedVoice;
    } else {
      el.voiceSelect.selectedIndex = 0;
    }

    updateSelectedVoice();
  }

  function updateSelectedVoice() {
    const voiceName = el.voiceSelect.value;
    state.selectedVoice = state.voices.find(v => v.name === voiceName) || null;
    if (state.selectedVoice) {
      localStorage.setItem('prompt_cue_voice', state.selectedVoice.name);
      if (state.recognition) {
        state.recognition.lang = state.selectedVoice.lang;
      }
    }
  }

  // --- Audio Output Device Selection ---
  async function initAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      if (audioOutputs.length > 0) {
        el.audioOutputSelect.innerHTML = '';
        audioOutputs.forEach(device => {
          const opt = document.createElement('option');
          opt.value = device.deviceId;
          opt.textContent = device.label || `Output (${device.deviceId.substring(0, 5)}...)`;
          el.audioOutputSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.log('Audio device enumeration note:', e);
    }
  }

  // --- Text Tokenization, Chunking & Sentence Construction ---
  function cleanTokenWord(word) {
    return (word || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF]/gi, '').trim();
  }

  function parseScriptToTokens(text) {
    if (!text.trim()) {
      return { tokens: [], sentences: [], clauses: [] };
    }

    // Clause-break punctuation: period, comma, semicolon, colon, dash, ellipsis, newline
    // Apostrophe inside words (e.g. "it's") is part of the word and NOT a break point
    const CLAUSE_BREAK = /^[.,;:!?—–\n]$|^\.{2,}$/;
    const SENTENCE_END  = /^[.!?]$|^\.{2,}$/;

    const regex = /(\s+|[^\s\w]+|[\w']+)/gu;
    const tokens = [];
    const sentences = [];
    const clauses = [];
    let match;
    let sentenceId = 0;
    let clauseId = 0;
    let currentSentenceTokens = [];
    let currentClauseTokens = [];

    while ((match = regex.exec(text)) !== null) {
      const chunk = match[0];
      const start = match.index;
      const end = start + chunk.length;

      // A token is a "word" if it contains real letters/digits (apostrophes mid-word OK)
      const isWord = /[\w\u00C0-\u024F\u1E00-\u1EFF]/.test(chunk) && !/^\s+$/.test(chunk);

      const tokenObj = {
        id: tokens.length,
        text: chunk,
        isWord: isWord,
        cleanWord: isWord ? cleanTokenWord(chunk) : '',
        charStart: start,
        charEnd: end,
        sentenceIndex: sentenceId,
        clauseIndex: clauseId
      };

      tokens.push(tokenObj);
      currentSentenceTokens.push(tokenObj);
      currentClauseTokens.push(tokenObj);

      // Clause break on punctuation (skip whitespace-only tokens and mid-word apostrophes)
      const isSinglePunct = !isWord && chunk.trim().length > 0;
      if (isSinglePunct && CLAUSE_BREAK.test(chunk.trim())) {
        // Include the punctuation in the clause, then close it
        const clauseText = currentClauseTokens.map(t => t.text).join('').trim();
        if (clauseText) {
          clauses.push({
            id: clauseId,
            text: clauseText,
            tokens: [...currentClauseTokens]
          });
          clauseId++;
        }
        currentClauseTokens = [];

        // Also close sentence on sentence-ending punctuation
        if (SENTENCE_END.test(chunk.trim())) {
          const sentenceText = currentSentenceTokens.map(t => t.text).join('').trim();
          if (sentenceText) {
            sentences.push({
              id: sentenceId,
              text: sentenceText,
              tokens: [...currentSentenceTokens]
            });
            sentenceId++;
          }
          currentSentenceTokens = [];
        }
      }

      // Explicit newline always closes both a clause and (if content) a sentence
      if (chunk === '\n') {
        if (currentClauseTokens.length > 0) {
          const clauseText = currentClauseTokens.map(t => t.text).join('').trim();
          if (clauseText) {
            clauses.push({ id: clauseId, text: clauseText, tokens: [...currentClauseTokens] });
            clauseId++;
          }
          currentClauseTokens = [];
        }
        if (currentSentenceTokens.length > 0) {
          const sentenceText = currentSentenceTokens.map(t => t.text).join('').trim();
          if (sentenceText) {
            sentences.push({ id: sentenceId, text: sentenceText, tokens: [...currentSentenceTokens] });
            sentenceId++;
          }
          currentSentenceTokens = [];
        }
      }
    }

    // Flush remaining tokens
    if (currentClauseTokens.length > 0) {
      const clauseText = currentClauseTokens.map(t => t.text).join('').trim();
      if (clauseText) {
        clauses.push({ id: clauseId, text: clauseText, tokens: [...currentClauseTokens] });
      }
    }

    if (currentSentenceTokens.length > 0) {
      const sentenceText = currentSentenceTokens.map(t => t.text).join('').trim();
      if (sentenceText) {
        sentences.push({ id: sentenceId, text: sentenceText, tokens: [...currentSentenceTokens] });
      }
    }

    return { tokens, sentences, clauses };
  }

  function buildPrompterDOM(text) {
    const { tokens, sentences, clauses } = parseScriptToTokens(text);
    state.tokens = tokens;
    state.sentences = sentences;
    state.clauses = clauses;

    if (!tokens.length) {
      el.prompterContent.innerHTML = '<p class="placeholder-text">Your script will appear here once you type or paste it into the left box. Click "Start Prompting" to start the audio cue and follow the visual cursor.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    if (state.highlightMode === 'sentence') {
      sentences.forEach(sentence => {
        const spanSentence = document.createElement('span');
        spanSentence.className = 'prompter-sentence';
        spanSentence.dataset.sentenceId = sentence.id;
        spanSentence.title = 'Double-click to start voice cue here';

        sentence.tokens.forEach(tok => {
          if (tok.text === '\n') {
            spanSentence.appendChild(document.createElement('br'));
          } else {
            const spanWord = document.createElement('span');
            spanWord.className = tok.isWord ? 'prompter-word' : 'prompter-punct';
            spanWord.dataset.id = tok.id;
            spanWord.textContent = tok.text;
            spanSentence.appendChild(spanWord);
          }
        });

        fragment.appendChild(spanSentence);
      });
    } else {
      // Word-by-word mode
      tokens.forEach(tok => {
        if (tok.text === '\n') {
          fragment.appendChild(document.createElement('br'));
        } else if (tok.isWord) {
          const span = document.createElement('span');
          span.className = 'prompter-word';
          span.dataset.id = tok.id;
          span.textContent = tok.text;
          span.title = 'Double-click to start voice cue from this word';
          fragment.appendChild(span);
        } else {
          const textNode = document.createTextNode(tok.text);
          fragment.appendChild(textNode);
        }
      });
    }

    el.prompterContent.innerHTML = '';
    el.prompterContent.appendChild(fragment);

    if (state.startTokenOffset > 0) {
      highlightActiveToken(state.startTokenOffset);
    }
  }

  // --- Voice Tone & Persona Acoustic Modulation ---
  function computeToneAcoustics(sentenceText, baseSpeed, basePitch) {
    let rate = baseSpeed;
    let pitch = basePitch;
    const clean = (sentenceText || '').trim();

    switch (state.tone) {
      case 'classy':
        pitch = Math.max(0.7, basePitch * 0.92);
        rate = Math.max(0.6, baseSpeed * 0.95);
        break;

      case 'friendly':
        pitch = Math.min(1.4, basePitch * 1.15);
        rate = baseSpeed * 1.05;
        break;

      case 'energetic':
        pitch = Math.min(1.35, basePitch * 1.1);
        rate = Math.min(2.5, baseSpeed * 1.18);
        break;

      case 'suspenseful':
        pitch = Math.max(0.6, basePitch * 0.82);
        rate = Math.max(0.5, baseSpeed * 0.85);
        break;

      case 'auto':
        if (clean.endsWith('?')) {
          pitch = Math.min(1.4, basePitch * 1.18);
          rate = baseSpeed * 0.98;
        } else if (clean.endsWith('!')) {
          pitch = Math.min(1.4, basePitch * 1.12);
          rate = Math.min(2.5, baseSpeed * 1.12);
        } else if (clean.includes('...') || clean.includes('—') || clean.length < 15) {
          pitch = Math.max(0.7, basePitch * 0.9);
          rate = Math.max(0.6, baseSpeed * 0.88);
        } else {
          pitch = basePitch;
          rate = baseSpeed;
        }
        break;

      case 'neutral':
      default:
        pitch = basePitch;
        rate = baseSpeed;
        break;
    }

    return { rate, pitch };
  }

  // --- Unit Construction (Sentence, Clause, or Full) ---
  function getPromptUnits() {
    switch (state.promptChunkStyle) {
      case 'sentence':
        return state.sentences.map(s => ({
          id: s.id,
          text: s.text,
          tokens: s.tokens,
          type: 'sentence'
        }));

      case 'clause':
        // Punctuation-aware clauses — split on . , ; : — etc.
        return (state.clauses || []).map(c => ({
          id: c.id,
          text: c.text,
          tokens: c.tokens,
          type: 'clause'
        }));

      case 'full':
      default:
        return [{
          id: 0,
          text: el.scriptInput.value.trim(),
          tokens: state.tokens,
          type: 'full'
        }];
    }
  }

  // Find which unit corresponds to a given token index
  function findUnitIndexForToken(tokenIdx, units) {
    if (!units || !units.length) return 0;
    const found = units.findIndex(u => u.tokens.some(t => t.id === tokenIdx));
    return found !== -1 ? found : 0;
  }

  // --- Double-Click Cue Jump ---
  function handleJumpToToken(tokenIndex) {
    if (tokenIndex < 0 || tokenIndex >= state.tokens.length) return;

    clearMismatchedHighlights();

    const targetElement = el.prompterContent.querySelector(`[data-id="${tokenIndex}"]`);
    if (targetElement) {
      targetElement.classList.add('cue-target-jump');
      setTimeout(() => targetElement.classList.remove('cue-target-jump'), 600);
    }

    state.startTokenOffset = tokenIndex;
    state.activeTokenIndex = tokenIndex;

    const units = getPromptUnits();
    state.currentPromptUnitIndex = findUnitIndexForToken(tokenIndex, units);

    highlightActiveToken(tokenIndex);

    if (state.isPlaying) {
      if (state.synth) state.synth.cancel();
      if (state.audioElement) {
        state.audioElement.pause();
        state.audioElement = null;
      }
      clearInterval(state.timerTrackerId);
      clearTimeout(state.repromptTimeoutId);

      if (state.isPaused) {
        el.voiceStatusMsg.textContent = `Queued from "${state.tokens[tokenIndex].text.trim()}" (Press Play)`;
      } else {
        playCurrentPromptUnit();
      }
    } else {
      startPlayback();
    }
  }

  // --- Mismatch & Pronunciation Highlighting in ORANGE ---
  function markTokensMismatch(tokenIds) {
    clearMismatchedHighlights();
    tokenIds.forEach(id => {
      state.mismatchedTokenIds.add(id);
      const span = el.prompterContent.querySelector(`.prompter-word[data-id="${id}"]`);
      if (span) {
        span.classList.add('mismatch');
      }
    });

    if (state.highlightMode === 'sentence') {
      const sentenceSpan = el.prompterContent.querySelector(`.prompter-sentence[data-sentence-id="${state.activeSentenceIndex}"]`);
      if (sentenceSpan) {
        sentenceSpan.classList.add('mismatch');
      }
    }
  }

  function clearMismatchedHighlights() {
    state.mismatchedTokenIds.clear();
    const existing = el.prompterContent.querySelectorAll('.mismatch');
    existing.forEach(e => e.classList.remove('mismatch'));
  }

  // --- Speech Verification & Presenter Matching Engine ---
  function normalizeSpeechWords(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s\u00C0-\u024F\u1E00-\u1EFF]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  // String similarity for minor acoustic variations
  function isWordFuzzyMatch(w1, w2) {
    if (!w1 || !w2) return false;
    if (w1 === w2) return true;
    if (w1.length <= 3 || w2.length <= 3) return w1 === w2;

    // Plural / tense endings
    if (w1.startsWith(w2) || w2.startsWith(w1)) {
      if (Math.abs(w1.length - w2.length) <= 2) return true;
    }

    // Levenshtein distance 1
    let mismatches = 0;
    if (Math.abs(w1.length - w2.length) <= 1) {
      const minLen = Math.min(w1.length, w2.length);
      for (let i = 0; i < minLen; i++) {
        if (w1[i] !== w2[i]) mismatches++;
      }
      if (mismatches <= 1) return true;
    }

    return false;
  }

  function handlePresenterSpeech(spokenTranscript, isFinal) {
    if (!state.isWaitingForPresenter) return;

    const units = getPromptUnits();
    const currentUnit = units[state.currentPromptUnitIndex];
    if (!currentUnit) return;

    const unitWordTokens = currentUnit.tokens.filter(t => t.isWord);
    if (!unitWordTokens.length) {
      advanceToNextUnit();
      return;
    }

    const spokenWords = normalizeSpeechWords(spokenTranscript);
    if (!spokenWords.length) return;

    // Check token matching sequentially
    const expectedWords = unitWordTokens.map(t => t.cleanWord);
    let matchedCount = 0;
    let failedTokenIds = [];
    let spokenIdx = 0;

    for (let i = 0; i < unitWordTokens.length; i++) {
      const targetToken = unitWordTokens[i];
      const targetWord = targetToken.cleanWord;

      // Scan through spoken words to locate match
      let found = false;
      for (let j = spokenIdx; j < spokenWords.length; j++) {
        if (isWordFuzzyMatch(targetWord, spokenWords[j])) {
          found = true;
          spokenIdx = j + 1;
          matchedCount++;
          break;
        }
      }

      if (!found) {
        failedTokenIds.push(targetToken.id);
      }
    }

    const matchThreshold = expectedWords.length <= 2 ? expectedWords.length : Math.ceil(expectedWords.length * 0.75);

    if (matchedCount >= matchThreshold) {
      // SUCCESS: Presenter spoke correctly!
      clearMismatchedHighlights();
      state.isWaitingForPresenter = false;
      clearTimeout(state.repromptTimeoutId);

      el.voiceStatusMsg.textContent = '✓ Spoken correctly! Moving to next cue...';
      setTimeout(() => advanceToNextUnit(), 200);

    } else if (isFinal) {
      // MISMATCH or PRONUNCIATION ERROR on finalized phrase
      if (failedTokenIds.length > 0) {
        handleSpeechMismatch(failedTokenIds, currentUnit);
      }
    }
  }

  function handleSpeechMismatch(failedTokenIds, currentUnit) {
    // 1. Highlight mismatched words in ORANGE on screen
    markTokensMismatch(failedTokenIds);

    // 2. Audible re-prompt of the line
    el.voiceStatusMsg.textContent = '⚠️ Mispronounced or missed word. Re-prompting line into ear...';
    
    // Smoothly re-prompt the line into ear after brief pause
    clearTimeout(state.repromptTimeoutId);
    state.repromptTimeoutId = setTimeout(() => {
      if (state.isPlaying && !state.isPaused) {
        promptUnitAudioOnly(currentUnit, true);
      }
    }, 700);
  }

  // --- Prompting Playback Engine ---
  function startPlayback() {
    const text = el.scriptInput.value.trim();
    if (!text) {
      alert('Please enter some script text first.');
      return;
    }

    if (state.isPaused) {
      resumePlayback();
      return;
    }

    stopPlayback(false);

    state.isPlaying = true;
    state.isPaused = false;
    clearMismatchedHighlights();

    const units = getPromptUnits();
    if (state.startTokenOffset > 0) {
      state.currentPromptUnitIndex = findUnitIndexForToken(state.startTokenOffset, units);
    } else {
      state.currentPromptUnitIndex = 0;
    }

    updateControlsState();

    if (state.micVerificationEnabled) {
      startRecognition();
    }

    playCurrentPromptUnit();
  }

  function playCurrentPromptUnit() {
    const units = getPromptUnits();
    if (state.currentPromptUnitIndex >= units.length) {
      finishPlayback();
      return;
    }

    const currentUnit = units[state.currentPromptUnitIndex];
    if (!currentUnit || !currentUnit.text.trim()) {
      advanceToNextUnit();
      return;
    }

    // Highlight unit immediately on screen
    if (currentUnit.tokens.length > 0) {
      const firstTok = currentUnit.tokens[0];
      highlightActiveToken(firstTok.id);
    }

    promptUnitAudioOnly(currentUnit, false);
  }

  function promptUnitAudioOnly(unit, isReprompt = false) {
    if (!state.isPlaying || state.isPaused) return;

    if (state.synth) state.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(unit.text);
    state.currentUtterance = utterance;

    if (state.selectedVoice) {
      utterance.voice = state.selectedVoice;
      utterance.lang = state.selectedVoice.lang;
    }

    const acoustics = computeToneAcoustics(unit.text, state.speed, state.pitch);
    utterance.rate = acoustics.rate;
    utterance.pitch = acoustics.pitch;
    utterance.volume = state.volume;

    let boundarySupported = false;

    utterance.onboundary = (event) => {
      boundarySupported = true;
      const charIndex = event.charIndex;
      const matched = unit.tokens.find(t => {
        const relStart = t.charStart - unit.tokens[0].charStart;
        const relEnd = t.charEnd - unit.tokens[0].charStart;
        return charIndex >= relStart && charIndex < relEnd;
      });

      if (matched) {
        if (state.leadDelaySec > 0) {
          setTimeout(() => highlightActiveToken(matched.id), state.leadDelaySec * 1000);
        } else {
          highlightActiveToken(matched.id);
        }
      }
    };

    utterance.onstart = () => {
      enableSpeechKeepAlive();
      state.isWaitingForPresenter = false;
      el.voiceStatusMsg.textContent = isReprompt ? '🎧 Re-prompting into ear...' : '🎧 Cueing in headphone...';
    };

    utterance.onend = () => {
      if (!state.isPlaying || state.isPaused) return;

      if (state.micVerificationEnabled) {
        // Voice cue is finished in the ear; now listen to the presenter speak it!
        state.isWaitingForPresenter = true;
        el.voiceStatusMsg.textContent = '🎙️ Listening to you... (Speak the prompt now)';
        updateMicStatusUI('listening');
      } else {
        // Automatic pacing without mic verification
        if (state.promptChunkStyle === 'full') {
          finishPlayback();
        } else {
          const pauseDelay = (state.tone === 'suspenseful') ? 600 : (state.promptChunkStyle === 'clause' ? 260 : 350);
          setTimeout(() => {
            if (state.isPlaying && !state.isPaused) {
              advanceToNextUnit();
            }
          }, pauseDelay);
        }
      }
    };

    utterance.onerror = (e) => {
      console.warn('Utterance error:', e);
      if (state.isPlaying && !state.isPaused) {
        advanceToNextUnit();
      }
    };

    state.synth.speak(utterance);
  }

  function advanceToNextUnit() {
    state.currentPromptUnitIndex++;
    const units = getPromptUnits();

    if (state.currentPromptUnitIndex >= units.length) {
      finishPlayback();
    } else {
      playCurrentPromptUnit();
    }
  }

  function highlightActiveToken(tokenIndex) {
    if (tokenIndex < 0 || tokenIndex >= state.tokens.length) return;
    const token = state.tokens[tokenIndex];
    state.activeTokenIndex = tokenIndex;

    const progress = Math.round(((tokenIndex + 1) / state.tokens.length) * 100);
    el.prompterProgressBar.style.width = `${progress}%`;

    if (state.highlightMode === 'sentence') {
      const sentenceId = token.sentenceIndex;
      if (sentenceId !== state.activeSentenceIndex) {
        state.activeSentenceIndex = sentenceId;

        const allSentenceEls = el.prompterContent.querySelectorAll('.prompter-sentence');
        allSentenceEls.forEach(item => {
          const id = parseInt(item.dataset.sentenceId, 10);
          if (id === sentenceId) {
            item.classList.add('active');
            item.classList.remove('past');
            scrollToElement(item);
          } else if (id < sentenceId) {
            item.classList.remove('active');
            item.classList.add('past');
          } else {
            item.classList.remove('active', 'past');
          }
        });
      }
    } else {
      // Word-by-word mode
      const allWordEls = el.prompterContent.querySelectorAll('.prompter-word');
      let targetEl = null;

      allWordEls.forEach(wordEl => {
        const id = parseInt(wordEl.dataset.id, 10);
        if (id === tokenIndex) {
          wordEl.classList.add('active');
          wordEl.classList.remove('past');
          targetEl = wordEl;
        } else if (id < tokenIndex) {
          wordEl.classList.remove('active');
          wordEl.classList.add('past');
        } else {
          wordEl.classList.remove('active', 'past');
        }
      });

      if (targetEl) {
        scrollToElement(targetEl);
      }
    }
  }

  function scrollToElement(target) {
    if (!state.autoScroll || !target) return;

    const container = el.prompterViewport;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
    const desiredScrollTop = relativeTop - (container.clientHeight / 2) + (target.clientHeight / 2);

    container.scrollTo({
      top: desiredScrollTop,
      behavior: 'smooth'
    });
  }

  function pausePlayback() {
    if (!state.isPlaying) return;

    if (state.synth) state.synth.pause();
    if (state.audioElement) state.audioElement.pause();

    state.isPaused = true;
    state.isWaitingForPresenter = false;
    clearTimeout(state.repromptTimeoutId);

    updateControlsState();
    el.voiceStatusMsg.textContent = 'Paused. (Tip: double-click any word to resume from there)';
  }

  function resumePlayback() {
    if (!state.isPlaying) return;

    state.isPaused = false;
    updateControlsState();
    el.voiceStatusMsg.textContent = '';

    if (state.micVerificationEnabled) {
      startRecognition();
    }

    playCurrentPromptUnit();
  }

  function stopPlayback(resetOffset = true) {
    if (state.synth) state.synth.cancel();
    if (state.audioElement) {
      state.audioElement.pause();
      state.audioElement = null;
    }

    clearInterval(state.timerTrackerId);
    clearTimeout(state.repromptTimeoutId);
    disableSpeechKeepAlive();
    stopRecognition();

    state.isPlaying = false;
    state.isPaused = false;
    state.isWaitingForPresenter = false;
    state.activeTokenIndex = -1;
    state.activeSentenceIndex = -1;
    clearMismatchedHighlights();

    if (resetOffset) {
      state.startTokenOffset = 0;
      state.currentPromptUnitIndex = 0;
      el.prompterProgressBar.style.width = '0%';
      const activeEls = el.prompterContent.querySelectorAll('.active, .past');
      activeEls.forEach(e => e.classList.remove('active', 'past'));
    }

    updateControlsState();
  }

  function finishPlayback() {
    stopPlayback(true);
    el.prompterProgressBar.style.width = '100%';
    el.voiceStatusMsg.textContent = 'Completed script ✓';
  }

  function updateControlsState() {
    el.playBtn.disabled = state.isPlaying && !state.isPaused;
    el.pauseBtn.disabled = !state.isPlaying;
    el.pauseBtn.innerHTML = state.isPaused ? '<span class="btn-icon">▶</span> Resume' : '<span class="btn-icon">⏸</span> Pause';
    el.stopBtn.disabled = !state.isPlaying && !state.isPaused;
  }

  // Workaround for Chrome ~15s timeout
  let keepAliveInterval = null;
  function enableSpeechKeepAlive() {
    clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
      if (state.synth && state.isPlaying && !state.isPaused) {
        state.synth.pause();
        state.synth.resume();
      }
    }, 10000);
  }

  function disableSpeechKeepAlive() {
    clearInterval(keepAliveInterval);
  }

  // --- Voice Testing ---
  function testVoice() {
    if (!state.synth) return;
    state.synth.cancel();

    const langName = state.selectedVoice ? state.selectedVoice.lang : 'your selected language';
    const testUtterance = new SpeechSynthesisUtterance(`Testing ear cue audio with ${state.tone} tone and ${state.promptChunkStyle} style for ${langName}. Voice, pacing, and mic verification are ready.`);
    
    if (state.selectedVoice) {
      testUtterance.voice = state.selectedVoice;
      testUtterance.lang = state.selectedVoice.lang;
    }
    const acoustics = computeToneAcoustics(testUtterance.text, state.speed, state.pitch);
    testUtterance.rate = acoustics.rate;
    testUtterance.pitch = acoustics.pitch;
    testUtterance.volume = state.volume;

    el.voiceStatusMsg.textContent = 'Playing test voice...';
    testUtterance.onend = () => {
      el.voiceStatusMsg.textContent = 'Voice ready ✓';
    };

    state.synth.speak(testUtterance);
  }

  // --- Settings & Color Customization ---
  function applyColorTheme(theme) {
    document.documentElement.style.setProperty('--app-bg', theme.appBg);
    document.documentElement.style.setProperty('--prompter-bg', theme.prompterBg);
    document.documentElement.style.setProperty('--prompter-text', theme.text);
    document.documentElement.style.setProperty('--highlight-bg', theme.highlightBg);
    document.documentElement.style.setProperty('--highlight-text', theme.highlightText);
    document.documentElement.style.setProperty('--past-text', theme.pastText);

    el.colorAppBg.value = theme.appBg;
    el.colorAppBgHex.textContent = theme.appBg;
    el.colorPrompterBg.value = theme.prompterBg;
    el.colorPrompterBgHex.textContent = theme.prompterBg;
    el.colorText.value = theme.text;
    el.colorTextHex.textContent = theme.text;
    el.colorHighlightBg.value = theme.highlightBg;
    el.colorHighlightBgHex.textContent = theme.highlightBg;
    el.colorHighlightText.value = theme.highlightText;
    el.colorHighlightTextHex.textContent = theme.highlightText;
    el.colorPastText.value = theme.pastText;
    el.colorPastTextHex.textContent = theme.pastText;

    saveSettings();
  }

  function applyCustomColor(prop, hex, hexSpan) {
    document.documentElement.style.setProperty(prop, hex);
    if (hexSpan) hexSpan.textContent = hex;
    saveSettings();
  }

  function saveSettings() {
    const settings = {
      appBg: el.colorAppBg.value,
      prompterBg: el.colorPrompterBg.value,
      text: el.colorText.value,
      highlightBg: el.colorHighlightBg.value,
      highlightText: el.colorHighlightText.value,
      pastText: el.colorPastText.value,
      fontSize: el.fontSize.value,
      lineHeight: el.lineHeight.value,
      prompterPadding: el.prompterPadding.value,
      fontFamily: el.fontFamilySelect.value,
      tone: el.toneSelect.value,
      promptChunkStyle: el.promptChunkStyle.value,
      micVerificationEnabled: el.micVerifyChk.checked,
      cloudEngine: el.cloudEngineSelect.value,
      elevenlabsVoiceId: el.elevenlabsVoiceId.value
    };

    localStorage.setItem('prompt_cue_settings', JSON.stringify(settings));
    if (el.elevenlabsApiKey.value) {
      localStorage.setItem('prompt_cue_elevenlabs_key', el.elevenlabsApiKey.value);
    }
  }

  function loadSettings() {
    const saved = localStorage.getItem('prompt_cue_settings');
    const savedApiKey = localStorage.getItem('prompt_cue_elevenlabs_key');

    if (savedApiKey) {
      el.elevenlabsApiKey.value = savedApiKey;
    }

    if (!saved) return;

    try {
      const s = JSON.parse(saved);
      if (s.appBg) {
        applyColorTheme({
          appBg: s.appBg,
          prompterBg: s.prompterBg,
          text: s.text,
          highlightBg: s.highlightBg,
          highlightText: s.highlightText,
          pastText: s.pastText
        });
      }

      if (s.promptChunkStyle) {
        // Fallback older saved values ('chunk', 'word') to 'clause'
        const validStyle = (s.promptChunkStyle === 'chunk' || s.promptChunkStyle === 'word') ? 'clause' : s.promptChunkStyle;
        el.promptChunkStyle.value = validStyle;
        state.promptChunkStyle = validStyle;
        if (CHUNK_EXPLANATIONS[validStyle]) {
          el.chunkStyleDesc.textContent = CHUNK_EXPLANATIONS[validStyle];
        }
      }

      if (s.micVerificationEnabled !== undefined) {
        el.micVerifyChk.checked = s.micVerificationEnabled;
        state.micVerificationEnabled = s.micVerificationEnabled;
      }

      if (s.tone) {
        el.toneSelect.value = s.tone;
        state.tone = s.tone;
        if (TONE_EXPLANATIONS[s.tone]) {
          el.toneDesc.textContent = TONE_EXPLANATIONS[s.tone];
        }
      }

      if (s.fontSize) {
        el.fontSize.value = s.fontSize;
        el.fontSizeVal.textContent = `${s.fontSize}px`;
        document.documentElement.style.setProperty('--prompter-font-size', `${s.fontSize}px`);
      }

      if (s.lineHeight) {
        el.lineHeight.value = s.lineHeight;
        el.lineHeightVal.textContent = s.lineHeight;
        document.documentElement.style.setProperty('--prompter-line-height', s.lineHeight);
      }

      if (s.prompterPadding) {
        el.prompterPadding.value = s.prompterPadding;
        el.prompterPaddingVal.textContent = `${s.prompterPadding}px`;
        document.documentElement.style.setProperty('--prompter-padding', `${s.prompterPadding}px`);
      }

      if (s.fontFamily) {
        el.fontFamilySelect.value = s.fontFamily;
        document.documentElement.style.setProperty('--prompter-font-family', s.fontFamily);
      }

      if (s.cloudEngine) {
        el.cloudEngineSelect.value = s.cloudEngine;
        state.cloudEngine = s.cloudEngine;
        el.elevenlabsConfig.style.display = s.cloudEngine === 'elevenlabs' ? 'flex' : 'none';
      }

      if (s.elevenlabsVoiceId) {
        el.elevenlabsVoiceId.value = s.elevenlabsVoiceId;
      }
    } catch (e) {
      console.warn('Failed to parse saved settings', e);
    }
  }

  function updateScriptStats() {
    const text = el.scriptInput.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    el.wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;

    const rate = parseFloat(el.speedRate.value) || 1.0;
    const minutes = words / (150 * rate);
    const totalSecs = Math.round(minutes * 60);

    if (totalSecs < 60) {
      el.estReadingTime.textContent = `~${totalSecs}s reading time`;
    } else {
      const mins = Math.floor(totalSecs / 60);
      const remSecs = totalSecs % 60;
      el.estReadingTime.textContent = `~${mins}m ${remSecs}s reading time`;
    }
  }

  // --- Event Bindings ---
  function bindEvents() {
    // Playback Controls
    el.playBtn.addEventListener('click', startPlayback);
    el.pauseBtn.addEventListener('click', () => {
      if (state.isPaused) resumePlayback();
      else pausePlayback();
    });
    el.stopBtn.addEventListener('click', () => stopPlayback(true));

    // Script Input
    el.scriptInput.addEventListener('input', () => {
      updateScriptStats();
      if (!state.isPlaying) {
        state.startTokenOffset = 0;
        buildPrompterDOM(el.scriptInput.value);
      }
    });

    // Prompting Chunk Style Selector
    el.promptChunkStyle.addEventListener('change', (e) => {
      state.promptChunkStyle = e.target.value;
      if (CHUNK_EXPLANATIONS[state.promptChunkStyle]) {
        el.chunkStyleDesc.textContent = CHUNK_EXPLANATIONS[state.promptChunkStyle];
      }
      saveSettings();

      if (state.isPlaying && !state.isPaused) {
        // Recompute unit and continue smoothly
        const units = getPromptUnits();
        state.currentPromptUnitIndex = findUnitIndexForToken(state.activeTokenIndex, units);
        playCurrentPromptUnit();
      }
    });

    // Microphone Verification Toggle — request permission ONCE via getUserMedia first,
    // then start recognition. This prevents the browser from prompting on every recognition.start().
    el.micVerifyChk.addEventListener('change', async (e) => {
      state.micVerificationEnabled = e.target.checked;
      saveSettings();

      if (state.micVerificationEnabled) {
        const granted = await requestMicPermissionOnce();
        if (granted) {
          el.micFeedbackRow.style.display = 'flex';
          startRecognition();
        } else {
          el.micVerifyChk.checked = false;
          state.micVerificationEnabled = false;
        }
      } else {
        stopRecognition();
        updateMicStatusUI('off');
        state.isWaitingForPresenter = false;
        clearMismatchedHighlights();
        clearTimeout(state.repromptTimeoutId);
      }
    });

    // "Grant Mic Access" button in the banner
    const requestMicBtn = document.getElementById('requestMicBtn');
    if (requestMicBtn) {
      requestMicBtn.addEventListener('click', async () => {
        const granted = await requestMicPermissionOnce();
        if (granted && !el.micVerifyChk.checked) {
          el.micVerifyChk.checked = true;
          state.micVerificationEnabled = true;
          el.micFeedbackRow.style.display = 'flex';
          startRecognition();
        }
      });
    }

    // Voice Tone / Style Selector
    el.toneSelect.addEventListener('change', (e) => {
      state.tone = e.target.value;
      if (TONE_EXPLANATIONS[state.tone]) {
        el.toneDesc.textContent = TONE_EXPLANATIONS[state.tone];
      }
      saveSettings();

      if (state.isPlaying && !state.isPaused) {
        playCurrentPromptUnit();
      }
    });

    // Sliders
    el.speedRate.addEventListener('input', (e) => {
      state.speed = parseFloat(e.target.value);
      el.speedValue.textContent = `${state.speed.toFixed(1)}x`;
      updateScriptStats();
      if (state.isPlaying && !state.isPaused) {
        playCurrentPromptUnit();
      }
    });

    el.pitchRate.addEventListener('input', (e) => {
      state.pitch = parseFloat(e.target.value);
      el.pitchValue.textContent = state.pitch.toFixed(1);
    });

    el.volumeRate.addEventListener('input', (e) => {
      state.volume = parseFloat(e.target.value);
      el.volumeValue.textContent = `${Math.round(state.volume * 100)}%`;
      if (state.audioElement) {
        state.audioElement.volume = state.volume;
      }
    });

    el.leadTime.addEventListener('input', (e) => {
      state.leadDelaySec = parseFloat(e.target.value);
      el.leadTimeValue.textContent = `${state.leadDelaySec.toFixed(1)}s`;
    });

    // Language & Voice
    el.languageSelect.addEventListener('change', () => {
      populateVoices();
    });

    el.voiceSelect.addEventListener('change', () => {
      updateSelectedVoice();
    });

    el.testVoiceBtn.addEventListener('click', testVoice);

    // Audio Output Device
    el.audioOutputSelect.addEventListener('change', async (e) => {
      const deviceId = e.target.value;
      if (state.audioElement && typeof state.audioElement.setSinkId === 'function') {
        try {
          await state.audioElement.setSinkId(deviceId);
        } catch (err) {
          console.warn('Failed to set sink ID', err);
        }
      }
    });

    // Double-Click / Double-Tap confirmation on Prompter Viewport to jump audio cue
    let lastTapTime = 0;
    let lastTapTarget = null;

    function processDoubleSelection(target) {
      const wordSpan = target.closest('.prompter-word');
      const sentenceSpan = target.closest('.prompter-sentence');

      if (state.highlightMode === 'sentence' && sentenceSpan) {
        const sentenceId = parseInt(sentenceSpan.dataset.sentenceId, 10);
        const sentenceObj = state.sentences.find(s => s.id === sentenceId);
        if (sentenceObj && sentenceObj.tokens.length > 0) {
          handleJumpToToken(sentenceObj.tokens[0].id);
        }
      } else if (wordSpan) {
        const tokenId = parseInt(wordSpan.dataset.id, 10);
        if (!isNaN(tokenId)) {
          handleJumpToToken(tokenId);
        }
      }
    }

    el.prompterContent.addEventListener('dblclick', (e) => {
      processDoubleSelection(e.target);
    });

    // Touch double-tap detection
    el.prompterContent.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;
      const target = e.target;

      if (tapLength < 350 && tapLength > 0 && lastTapTarget === target) {
        e.preventDefault();
        processDoubleSelection(target);
      }
      lastTapTime = currentTime;
      lastTapTarget = target;
    });

    // Highlight Mode Toggle
    document.querySelectorAll('input[name="highlightMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.highlightMode = e.target.value;
        buildPrompterDOM(el.scriptInput.value);
      });
    });

    // Auto-scroll & Mirror Toggles
    el.autoScrollChk.addEventListener('change', (e) => {
      state.autoScroll = e.target.checked;
    });

    el.mirrorFlipChk.addEventListener('change', (e) => {
      state.mirrorMode = e.target.checked;
      el.prompterViewport.classList.toggle('mirror-mode', state.mirrorMode);
    });

    // Fullscreen
    el.toggleFullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => alert(err.message));
      } else {
        document.exitFullscreen();
      }
    });

    // Settings Modal
    el.toggleSettingsBtn.addEventListener('click', () => {
      el.settingsModal.classList.add('open');
    });

    el.closeSettingsBtn.addEventListener('click', () => {
      el.settingsModal.classList.remove('open');
    });

    el.saveSettingsBtn.addEventListener('click', () => {
      saveSettings();
      el.settingsModal.classList.remove('open');
    });

    el.resetDefaultsBtn.addEventListener('click', () => {
      applyColorTheme(PRESETS['studio-dark']);
    });

    // Color Pickers
    el.colorAppBg.addEventListener('input', (e) => applyCustomColor('--app-bg', e.target.value, el.colorAppBgHex));
    el.colorPrompterBg.addEventListener('input', (e) => applyCustomColor('--prompter-bg', e.target.value, el.colorPrompterBgHex));
    el.colorText.addEventListener('input', (e) => applyCustomColor('--prompter-text', e.target.value, el.colorTextHex));
    el.colorHighlightBg.addEventListener('input', (e) => applyCustomColor('--highlight-bg', e.target.value, el.colorHighlightBgHex));
    el.colorHighlightText.addEventListener('input', (e) => applyCustomColor('--highlight-text', e.target.value, el.colorHighlightTextHex));
    el.colorPastText.addEventListener('input', (e) => applyCustomColor('--past-text', e.target.value, el.colorPastTextHex));

    // Preset Badges
    document.querySelectorAll('.preset-badge').forEach(badge => {
      badge.addEventListener('click', () => {
        const presetKey = badge.dataset.themePreset;
        if (PRESETS[presetKey]) {
          applyColorTheme(PRESETS[presetKey]);
        }
      });
    });

    // Typography Controls
    el.fontSize.addEventListener('input', (e) => {
      const val = `${e.target.value}px`;
      el.fontSizeVal.textContent = val;
      document.documentElement.style.setProperty('--prompter-font-size', val);
      saveSettings();
    });

    el.lineHeight.addEventListener('input', (e) => {
      const val = e.target.value;
      el.lineHeightVal.textContent = val;
      document.documentElement.style.setProperty('--prompter-line-height', val);
      saveSettings();
    });

    el.prompterPadding.addEventListener('input', (e) => {
      const val = `${e.target.value}px`;
      el.prompterPaddingVal.textContent = val;
      document.documentElement.style.setProperty('--prompter-padding', val);
      saveSettings();
    });

    el.fontFamilySelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--prompter-font-family', e.target.value);
      saveSettings();
    });

    // Cloud Engine Switch
    el.cloudEngineSelect.addEventListener('change', (e) => {
      state.cloudEngine = e.target.value;
      el.elevenlabsConfig.style.display = state.cloudEngine === 'elevenlabs' ? 'flex' : 'none';
      saveSettings();
    });

    // Keyboard Shortcuts (Space to play/pause, Escape to stop)
    window.addEventListener('keydown', (e) => {
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.isPlaying) {
          if (state.isPaused) resumePlayback();
          else pausePlayback();
        } else {
          startPlayback();
        }
      } else if (e.code === 'Escape') {
        stopPlayback(true);
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
