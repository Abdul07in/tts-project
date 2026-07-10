import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pcmToWav, extractPcmFormat } from './pcmToWav.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

function serveFile(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  let data;
  try { data = fs.readFileSync(filePath); }
  catch { return json(res, 404, { error: 'Not found' }); }
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.byteLength });
  res.end(data);
}

const PORT         = Number(process.env.PORT) || 3000;
const TTS_ENDPOINT = process.env.TTS_ENDPOINT || 'https://deepgram.com/api/tts';
const API_KEY      = process.env.DEEPGRAM_API_KEY || '';
const WORD_LIMIT   = 400;
const CACHE_MAX    = 5;

const ttsCache = new Map();

function cacheGet(key) {
  if (!ttsCache.has(key)) return null;
  const value = ttsCache.get(key);
  ttsCache.delete(key);
  ttsCache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (ttsCache.has(key)) ttsCache.delete(key);
  ttsCache.set(key, value);
  if (ttsCache.size > CACHE_MAX) {
    ttsCache.delete(ttsCache.keys().next().value);
  }
}

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

  if (req.method === 'GET') {
    if (pathname === '/' || pathname === '/index.html') {
      return serveFile(res, path.join(ROOT, 'index.html'));
    }
    if (pathname.startsWith('/src/')) {
      const safe = path.normalize(pathname).replace(/^\//, '');
      return serveFile(res, path.join(ROOT, safe));
    }
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

    const cacheKey = `${text}||${model}`;
    const hit      = cacheGet(cacheKey);

    if (hit) {
      console.log(`[cache] HIT  (${ttsCache.size}/${CACHE_MAX}) model=${model} chars=${text.length}`);
      res.writeHead(200, {
        'Content-Type':        'audio/wav',
        'Content-Disposition': 'attachment; filename="tts-output.wav"',
        'Content-Length':      hit.wavData.byteLength,
        'X-Sample-Rate':       String(hit.format.sampleRate),
        'X-Channels':          String(hit.format.channels),
        'X-Bit-Depth':         String(hit.format.bitDepth),
        'X-Cache':             'HIT',
      });
      return res.end(hit.wavData);
    }

    console.log(`[cache] MISS (${ttsCache.size}/${CACHE_MAX}) model=${model} chars=${text.length}`);

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

    cacheSet(cacheKey, { wavData, format });
    console.log(`[cache] SET  (${ttsCache.size}/${CACHE_MAX}) model=${model} chars=${text.length}`);

    res.writeHead(200, {
      'Content-Type':        'audio/wav',
      'Content-Disposition': 'attachment; filename="tts-output.wav"',
      'Content-Length':      wavData.byteLength,
      'X-Sample-Rate':       String(format.sampleRate),
      'X-Channels':          String(format.channels),
      'X-Bit-Depth':         String(format.bitDepth),
      'X-Cache':             'MISS',
    });
    return res.end(wavData);
  }

  json(res, 404, { error: `Cannot ${req.method} ${pathname}` });
});

server.listen(PORT, () => {
  console.log(`TTS API  →  http://localhost:${PORT}`);
  console.log(`Health   →  http://localhost:${PORT}/health`);
});
