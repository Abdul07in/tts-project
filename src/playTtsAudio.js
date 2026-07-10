import { pcmToWav, extractPcmFormat } from './pcmToWav.js';

const RAW_PCM_PREFIX = 'audio/raw';

export class TtsHttpError extends Error {
  constructor(status, statusText) {
    super(`TTS request failed: ${status} ${statusText}`);
    this.name = 'TtsHttpError';
    this.status = status;
    this.statusText = statusText;
  }
}

export class TtsContentTypeError extends Error {
  constructor(received) {
    super(`Unexpected Content-Type "${received ?? '(none)'}". Expected "${RAW_PCM_PREFIX}".`);
    this.name = 'TtsContentTypeError';
    this.received = received;
  }
}

export class TtsEmptyPayloadError extends Error {
  constructor() {
    super('TTS response body is empty — no audio data returned.');
    this.name = 'TtsEmptyPayloadError';
  }
}

export class UnsupportedEnvironmentError extends Error {
  constructor(detail) {
    super(`Browser does not support TTS playback: ${detail}`);
    this.name = 'UnsupportedEnvironmentError';
  }
}

export function assertBrowserSupport() {
  if (typeof fetch !== 'function') throw new UnsupportedEnvironmentError('fetch() unavailable.');
  if (typeof Blob === 'undefined') throw new UnsupportedEnvironmentError('Blob unavailable.');
  if (typeof URL?.createObjectURL !== 'function') throw new UnsupportedEnvironmentError('URL.createObjectURL() unavailable.');
  if (typeof HTMLAudioElement === 'undefined') throw new UnsupportedEnvironmentError('HTMLAudioElement unavailable.');
}

function validateResponse(response) {
  if (!response.ok) throw new TtsHttpError(response.status, response.statusText);
  const contentType = response.headers.get('content-type') ?? null;
  if (!contentType || !contentType.startsWith(RAW_PCM_PREFIX)) throw new TtsContentTypeError(contentType);
}

export function playWavBlob(wavBlob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(wavBlob);
    const audio = new Audio(url);
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener('ended', () => { cleanup(); resolve(); }, { once: true });
    audio.addEventListener('error', (e) => { cleanup(); reject(new Error(`Audio playback error: ${audio.error?.message ?? e.type}`)); }, { once: true });
    audio.play().catch((err) => { cleanup(); reject(err); });
  });
}

export async function playTtsAudio({
  text,
  model        = 'aura-2-arcas-en',
  demoType     = 'voice-generator',
  endpoint     = 'https://deepgram.com/api/tts',
  extraHeaders = {},
  signal,
  autoPlay     = true,
} = {}) {
  assertBrowserSupport();

  if (!text || typeof text !== 'string') {
    throw new TypeError('playTtsAudio: "text" must be a non-empty string.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: '*/*', ...extraHeaders },
    body: JSON.stringify({ text, model, demoType }),
  });

  validateResponse(response);

  const pcmBuffer = await response.arrayBuffer();
  if (pcmBuffer.byteLength === 0) throw new TtsEmptyPayloadError();

  const format = extractPcmFormat(response.headers);
  const wavBuffer = pcmToWav(pcmBuffer, format);
  const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

  if (autoPlay) await playWavBlob(wavBlob);

  return { wavBlob, format };
}
