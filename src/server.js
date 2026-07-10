import http from 'node:http';
import { pcmToWav, extractPcmFormat } from './pcmToWav.js';

const PORT         = Number(process.env.PORT) || 3000;
const TTS_ENDPOINT = process.env.TTS_ENDPOINT || 'https://deepgram.com/api/tts';
const API_KEY      = process.env.DEEPGRAM_API_KEY || '';
const WORD_LIMIT   = 400;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new SyntaxError('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');

  if (req.method === 'GET' && pathname === '/health') {
    return json(res, 200, { status: 'ok' });
  }

  if (req.method === 'POST' && pathname === '/tts') {
    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    const { text, model = 'aura-2-arcas-en', demoType = 'voice-generator' } = body;

    if (!text || typeof text !== 'string') {
      return json(res, 400, { error: '"text" is required and must be a non-empty string.' });
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > WORD_LIMIT) {
      return json(res, 422, { error: `Text exceeds ${WORD_LIMIT}-word limit (got ${wordCount}).` });
    }

    const headers = { 'Content-Type': 'application/json', Accept: '*/*' };
    if (API_KEY) headers['Authorization'] = `Token ${API_KEY}`;

    let ttsRes;
    try {
      ttsRes = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, model, demoType }),
      });
    } catch (err) {
      return json(res, 502, { error: `TTS upstream unreachable: ${err.message}` });
    }

    if (!ttsRes.ok) {
      return json(res, 502, { error: `TTS upstream error: ${ttsRes.status} ${ttsRes.statusText}` });
    }

    const contentType = ttsRes.headers.get('content-type') ?? '';
    if (!contentType.startsWith('audio/raw')) {
      return json(res, 502, { error: `Unexpected Content-Type from TTS: "${contentType}"` });
    }

    const pcmBuffer = await ttsRes.arrayBuffer();
    if (pcmBuffer.byteLength === 0) {
      return json(res, 502, { error: 'TTS returned an empty audio payload.' });
    }

    const format    = extractPcmFormat(ttsRes.headers);
    const wavBuffer = pcmToWav(pcmBuffer, format);
    const wavData   = Buffer.from(wavBuffer);

    res.writeHead(200, {
      'Content-Type':        'audio/wav',
      'Content-Disposition': 'attachment; filename="tts-output.wav"',
      'Content-Length':      wavData.byteLength,
      'X-Sample-Rate':       String(format.sampleRate),
      'X-Channels':          String(format.channels),
      'X-Bit-Depth':         String(format.bitDepth),
    });
    return res.end(wavData);
  }

  json(res, 404, { error: `Cannot ${req.method} ${pathname}` });
});

server.listen(PORT, () => {
  console.log(`TTS API  →  http://localhost:${PORT}`);
  console.log(`Health   →  http://localhost:${PORT}/health`);
});
