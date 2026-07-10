# Deepgram TTS Player

A minimal web UI that streams text-to-speech directly in the browser using Deepgram''s TTS API. A small Node.js proxy fetches the audio from Deepgram and returns a WAV blob — no heavy dependencies, no server-side audio processing.

## Features

- Real-time synthesis of up to 400 words per request
- Dark-mode UI with glassmorphism styling and animated equaliser
- Model selector supporting all Deepgram Aura-2 voices
- In-browser PCM ? WAV conversion (no ffmpeg needed)
- Docker-ready for one-command deployment

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Deepgram API key](https://console.deepgram.com/)

## Quick Start (local)

1. **Clone the repo**

   ```bash
   git clone https://github.com/Abdul07in/tts-project.git
   cd tts-project
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set your API key**

   Create a `.env` file at the project root:

   ```dotenv
   DEEPGRAM_API_KEY=your_deepgram_api_key_here
   ```

4. **Run**

   | Mode | Command | Notes |
   |------|---------|-------|
   | Development (auto-reload) | `npm run dev` | Uses `node --watch` |
   | Production | `npm start` | Plain `node` |

   Open `http://localhost:8080` in your browser.

## Run with Docker

```bash
# Build
docker build -t tts-player .

# Run
docker run -p 8080:8080 -e DEEPGRAM_API_KEY=your_key_here tts-player
```

Open `http://localhost:8080`.

## Project Structure

```
tts-project/
+-- src/
¦   +-- server.js        # Node.js proxy server
¦   +-- playTtsAudio.js  # Browser TTS fetch + playback
¦   +-- pcmToWav.js      # PCM ? WAV header writer
+-- index.html           # Single-page UI
+-- Dockerfile
+-- render.yaml          # Render.com deploy config
```

## License

MIT
