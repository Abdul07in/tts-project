export const DEFAULT_FORMAT = {
  sampleRate: 24_000,
  channels: 1,
  bitDepth: 16,
};

function writeUint32LE(view, offset, value) {
  view.setUint32(offset, value, true);
}

function writeUint16LE(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeAscii(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function pcmToWav(pcmBuffer, fmt = {}) {
  if (!(pcmBuffer instanceof ArrayBuffer)) {
    throw new TypeError(`pcmToWav: expected ArrayBuffer, got ${Object.prototype.toString.call(pcmBuffer)}`);
  }
  if (pcmBuffer.byteLength === 0) {
    throw new RangeError('pcmToWav: PCM buffer is empty.');
  }

  const { sampleRate, channels, bitDepth } = { ...DEFAULT_FORMAT, ...fmt };

  if (![8, 16, 32].includes(bitDepth)) {
    throw new RangeError(`pcmToWav: unsupported bitDepth ${bitDepth}. Must be 8, 16, or 32.`);
  }

  const HEADER_SIZE = 44;
  const dataLen = pcmBuffer.byteLength;
  const buffer = new ArrayBuffer(HEADER_SIZE + dataLen);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  writeUint32LE(view, 4, 36 + dataLen);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  writeUint32LE(view, 16, 16);
  writeUint16LE(view, 20, 1);
  writeUint16LE(view, 22, channels);
  writeUint32LE(view, 24, sampleRate);
  writeUint32LE(view, 28, sampleRate * channels * (bitDepth / 8));
  writeUint16LE(view, 32, channels * (bitDepth / 8));
  writeUint16LE(view, 34, bitDepth);
  writeAscii(view, 36, 'data');
  writeUint32LE(view, 40, dataLen);

  new Uint8Array(buffer, HEADER_SIZE).set(new Uint8Array(pcmBuffer));

  return buffer;
}

export function extractPcmFormat(headers) {
  const get = (k) => (typeof headers.get === 'function' ? headers.get(k) : headers[k]) ?? '';

  const sampleRate = parseInt(get('dg-sample-rate'), 10);
  const channels   = parseInt(get('dg-channels'),   10);
  const bitDepth   = parseInt(get('dg-bit-depth'),  10);

  return {
    sampleRate: Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : DEFAULT_FORMAT.sampleRate,
    channels:   Number.isFinite(channels)   && channels   > 0 ? channels   : DEFAULT_FORMAT.channels,
    bitDepth:   Number.isFinite(bitDepth)   && bitDepth   > 0 ? bitDepth   : DEFAULT_FORMAT.bitDepth,
  };
}
