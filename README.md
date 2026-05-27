# Captionizer — Adobe After Effects CEP Plugin

Auto-generate captions for your After Effects clips using AI-powered speech-to-text and script conversion. Supports Telugu, Hindi, Tamil, Kannada, Malayalam, and English — with phonetic transliteration (Tenglish, Hinglish) and translation.

---

## Features

- **Speech-to-Text** via ElevenLabs Scribe or Deepgram Nova-2
- **Multi-language captions** — Telugu Script, Tenglish, Hinglish, Tamil Script, English
- **AI-powered conversion** — Google Gemini, Groq, or OpenRouter (free tiers available)
- **Translation** — Translate captions to English, Telugu, Hindi, or Tamil
- **AE Text Layers** — Automatically create styled text layers in your composition
- **SRT Export** — Export captions as standard `.srt` subtitle files

---

## File Structure

```
com.captionizer.panel/
├── CSXS/
│   └── manifest.xml        # CEP extension manifest
├── index.html              # Panel UI
├── style.css               # Dark theme styles
├── main.js                 # Panel logic (UI, API calls, pipeline)
├── host.jsx                # ExtendScript (runs inside After Effects)
└── lib/
    └── CSInterface.js      # Adobe CEP interface library (v11)
```

---

## Installation

### 1. Copy the plugin folder

**Windows:**
```
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.captionizer.panel
```

**Mac:**
```
/Library/Application Support/Adobe/CEP/extensions/com.captionizer.panel
```

Copy the entire `com.captionizer.panel` folder to the appropriate path above.

### 2. Enable unsigned CEP extensions

CEP extensions must be signed for production use. For development, enable debug mode:

**Windows** — Open Registry Editor and create:
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
```
Add a new **String Value**:
- Name: `PlayerDebugMode`
- Value: `1`

**Mac** — Run in Terminal:
```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

> **Note:** Replace `CSXS.11` with your CEP version if different (e.g., `CSXS.10` for older AE versions).

### 3. Install FFmpeg

FFmpeg is required for audio extraction from video files.

1. Download from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Extract and add the `bin` folder to your system **PATH**
3. Verify by running `ffmpeg -version` in a terminal

### 4. Launch the plugin

1. Open **Adobe After Effects**
2. Go to **Window → Extensions → Captionizer**
3. The Captionizer panel will open

### 5. Configure API keys

Go to the **Settings** tab in the panel and enter at least one API key:

| Provider | Free Tier | Sign Up |
|----------|-----------|---------|
| **ElevenLabs** (recommended) | 10,000 free chars/month | [elevenlabs.io](https://elevenlabs.io) |
| **Deepgram** | $200 free credits | [console.deepgram.com](https://console.deepgram.com) |
| **Google Gemini** (recommended) | Free tier | [aistudio.google.com](https://aistudio.google.com) |
| **Groq** | Free | [console.groq.com](https://console.groq.com) |
| **OpenRouter** | Free models | [openrouter.ai](https://openrouter.ai) |

You need:
- **At least one STT key** (ElevenLabs or Deepgram) — for speech-to-text
- **At least one AI key** (Gemini, Groq, or OpenRouter) — for script conversion

---

## Usage

1. **Select a clip** — Select a footage item in the Project panel or a layer in the Timeline
2. **Click "Read Selected Clip"** — Loads clip info (name, duration, file path)
3. **Choose STT provider** — ElevenLabs Scribe or Deepgram Nova-2
4. **Set source language** — Auto Detect or choose manually
5. **Pick caption languages** — Select one or more: Telugu Script, Tenglish, Hinglish, Tamil Script, English
6. **Optional: Enable translation** — Toggle on and choose target language
7. **Choose AI provider** — Auto (tries all), or pick specific provider
8. **Select output** — Text Layers in AE, SRT File Export, or both
9. **Click "Generate Captions"** — Watch the progress bar and live preview

---

## How It Works

```
Video clip → FFmpeg (extract audio) → STT API (transcribe)
    → AI (convert script/transliterate) → Text Layers / SRT
```

1. **Audio Extraction** — FFmpeg extracts audio from the video at 16kHz mono MP3
2. **Speech-to-Text** — ElevenLabs or Deepgram transcribes the audio with word-level timestamps
3. **Segmentation** — Words are grouped into 6–8 word segments (or split at 1.5s gaps)
4. **Script Conversion** — AI converts each segment to requested languages/scripts
5. **Output** — Caption text layers are added to the composition and/or exported as SRT

---

## Caption Language Guide

| Language | Description | Example |
|----------|-------------|---------|
| **Telugu Script** | Original Telugu text | నేను యువరాజ్ |
| **Tenglish** | Telugu words in English letters (phonetic) | nenu Yuvaraj |
| **Hinglish** | Hindi words in English letters (phonetic) | main Yuvaraj hoon |
| **Tamil Script** | Original Tamil text | நான் யுவராஜ் |
| **English** | Translated to English | I am Yuvaraj |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Panel doesn't appear in Extensions menu | Check the extension is in the correct folder and `PlayerDebugMode` is set to `1` |
| "FFmpeg not installed" error | Install FFmpeg and ensure `ffmpeg` command works in terminal |
| "No footage selected" | Select a clip in the Project panel or a layer in the composition Timeline |
| STT returns no results | Check API key is correct, audio has speech, and language setting matches |
| AI conversion fails | Try a different AI provider or check API key validity |

---

## Requirements

- Adobe After Effects CC 2019 (v16.0) or later
- FFmpeg installed and on system PATH
- Internet connection (for API calls)
- At least one STT API key and one AI API key

---

## License

This plugin is provided as-is for personal and commercial use.
CSInterface.js is © Adobe Systems Incorporated.
