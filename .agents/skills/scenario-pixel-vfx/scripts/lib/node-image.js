// PNG encode/decode and a GIF encoder for Node, with no dependencies beyond zlib.
import zlib from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 8-bit PNG decoder: greyscale, RGB, palette, grey+alpha and RGBA, non-interlaced.
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (t === 'PLTE') palette = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('only 8-bit, non-interlaced PNGs are supported');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error('unsupported PNG colour type ' + type);
  const data = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = new Uint8ClampedArray(w * h * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0, q = 0; y < h; y++) {
    const f = data[q++];
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = data[q++];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 6) { out[o] = cur[x * 4]; out[o + 1] = cur[x * 4 + 1]; out[o + 2] = cur[x * 4 + 2]; out[o + 3] = cur[x * 4 + 3]; }
      else if (type === 2) { out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255; }
      else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = cur[x]; out[o + 3] = 255; }
      else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = cur[x * 2]; out[o + 3] = cur[x * 2 + 1]; }
      else { const i = cur[x]; out[o] = palette[i * 3]; out[o + 1] = palette[i * 3 + 1]; out[o + 2] = palette[i * 3 + 2]; out[o + 3] = trns && i < trns.length ? trns[i] : 255; }
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, rgba: out };
}

function lzw(indices, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, dict = new Map();
  const out = [];
  let cur = 0, bits = 0;
  const emit = (code) => {
    cur |= code << bits; bits += size;
    while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); size = minCode + 1; next = eoi + 1; dict = new Map(); }
    else { if (next >= 1 << size) size++; dict.set(key, next++); }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}

// Animated GIF. Transparent pixels use index 0. Colours beyond 255 map to the nearest kept colour.
export function encodeGIF(frames, w, h, fps, scale = 1) {
  const count = new Map();
  for (const f of frames) for (let i = 0; i < f.length; i += 4) {
    if (f[i + 3] < 128) continue;
    const c = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
    count.set(c, (count.get(c) || 0) + 1);
  }
  const keep = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 255).map((e) => e[0]);
  const pal = [0, ...keep], map = new Map(keep.map((c, i) => [c, i + 1]));
  const nearest = (c) => {
    let best = 1, bd = Infinity;
    for (let i = 1; i < pal.length; i++) {
      const p = pal[i], d = ((c >> 16) - (p >> 16)) ** 2 + (((c >> 8) & 255) - ((p >> 8) & 255)) ** 2 + ((c & 255) - (p & 255)) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    map.set(c, best);
    return best;
  };
  let bitsPer = 1;
  while (1 << bitsPer < pal.length) bitsPer++;
  const W = w * scale, H = h * scale, bytes = [];
  const p16 = (v) => bytes.push(v & 255, (v >> 8) & 255);
  bytes.push(71, 73, 70, 56, 57, 97); p16(W); p16(H); bytes.push(0xf0 | (bitsPer - 1), 0, 0);
  for (let i = 0; i < 1 << bitsPer; i++) { const c = pal[i] ?? 0; bytes.push(c >> 16, (c >> 8) & 255, c & 255); }
  bytes.push(0x21, 0xff, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0);
  let acc = 0;
  const minCode = Math.max(2, bitsPer);
  frames.forEach((f, n) => {
    const t = Math.round(((n + 1) * 100) / fps), delay = Math.max(2, t - acc);
    acc = t;
    bytes.push(0x21, 0xf9, 4, 0x09); p16(delay); bytes.push(0, 0);
    bytes.push(0x2c); p16(0); p16(0); p16(W); p16(H); bytes.push(0);
    const idx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
      if (f[s + 3] < 128) continue;
      const c = (f[s] << 16) | (f[s + 1] << 8) | f[s + 2];
      idx[y * W + x] = map.get(c) ?? nearest(c);
    }
    bytes.push(minCode);
    const data = lzw(idx, minCode);
    for (let i = 0; i < data.length; i += 255) {
      const k = Math.min(255, data.length - i);
      bytes.push(k);
      for (let j = 0; j < k; j++) bytes.push(data[i + j]);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return Buffer.from(bytes);
}
