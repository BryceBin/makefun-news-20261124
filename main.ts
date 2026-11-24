import * as fs from 'node:fs';
import * as zlib from 'node:zlib';

// ---------- canvas: 1024x1024 logical, 2x supersampled ----------
const W = 1024, H = 1024, SS = 2;
const BW = W * SS, BH = H * SS;
const buf = Buffer.alloc(BW * BH * 3);

function C(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const PAPER = C('#F6EED7'), PANEL = C('#FDF9EC'), PANEL2 = C('#F2E6C8');
const INK = C('#1C1A16'), NAVY = C('#23406B'), RED = C('#B23A1D'), GOLD = C('#C99A2E');
const TEAL = C('#2E7D6B'), SKY = C('#A9C6DA'), SEA = C('#2E5A7B'), GREEN = C('#5B7F4A');
const GRAY = C('#8A8375'), LGRAY = C('#CFC6B0'), WHITE = C('#FFFFFF'), SAND = C('#E9D9AE');
const DARK = C('#22201B'), ORANGE = C('#E07B39'), YELLOW = C('#F2C230'), SMOKE = C('#B7AEA0');
const MARKG = C('#2E6B3E'), MARKA = C('#8A6D1B'), MARKR = C('#B23A1D'), STEEL = C('#5A6B7A');
const TAN = C('#C9A86A'), BRICK = C('#A85B3F'), CREAM = C('#EFE3C2'), CHARTBG = C('#FBF6E9');

let clipX = 0, clipY = 0, clipW = W, clipH = H;
function setClip(x, y, w, h) { clipX = x; clipY = y; clipW = w; clipH = h; }
function clearClip() { clipX = 0; clipY = 0; clipW = W; clipH = H; }

function fillAll(c) {
  for (let i = 0; i < buf.length; i += 3) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
}
function setPx(sx, sy, c) {
  if (sx < 0 || sy < 0 || sx >= BW || sy >= BH) return;
  const lx = sx / SS, ly = sy / SS;
  if (lx < clipX || lx >= clipX + clipW || ly < clipY || ly >= clipY + clipH) return;
  const i = (sy * BW + sx) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.round(x * SS)), y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(BW, Math.round((x + w) * SS)), y1 = Math.min(BH, Math.round((y + h) * SS));
  const cx0 = Math.round(clipX * SS), cy0 = Math.round(clipY * SS);
  const cx1 = Math.round((clipX + clipW) * SS), cy1 = Math.round((clipY + clipH) * SS);
  for (let sy = Math.max(y0, cy0); sy < Math.min(y1, cy1); sy++) {
    for (let sx = Math.max(x0, cx0); sx < Math.min(x1, cx1); sx++) {
      const i = (sy * BW + sx) * 3;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
}
function fillCircle(cx, cy, r, c) {
  const x0 = Math.round((cx - r) * SS), x1 = Math.round((cx + r) * SS);
  const y0 = Math.round((cy - r) * SS), y1 = Math.round((cy + r) * SS);
  const ccx = cx * SS, ccy = cy * SS, rr = r * SS;
  for (let sy = Math.max(0, y0); sy < Math.min(BH, y1); sy++) {
    for (let sx = Math.max(0, x0); sx < Math.min(BW, x1); sx++) {
      const dx = sx + 0.5 - ccx, dy = sy + 0.5 - ccy;
      if (dx * dx + dy * dy <= rr * rr) setPx(sx, sy, c);
    }
  }
}
function disc(cx, cy, r, c) { fillCircle(cx, cy, r, c); }
function line(x1, y1, x2, y2, w, c) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist * SS * 1.5));
  const r = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x1 + dx * t, y1 + dy * t, r, c);
  }
}
function polyline(pts, w, c, closed) {
  for (let i = 0; i < pts.length - 1; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  if (closed && pts.length > 2) line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], w, c);
}
function fillPoly(pts, c) {
  const ys = pts.map(function (p) { return p[1]; });
  const yMin = Math.max(0, Math.floor(Math.min.apply(null, ys)));
  const yMax = Math.min(H - 1, Math.ceil(Math.max.apply(null, ys)));
  for (let y = yMin; y <= yMax; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort(function (p, q) { return p - q; });
    for (let k = 0; k + 1 < xs.length; k += 2) {
      fillRect(xs[k], y, xs[k + 1] - xs[k], 1, c);
    }
  }
}
function dashedLine(x1, y1, x2, y2, w, c, dash, gap) {
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const ux = dx / dist, uy = dy / dist;
  let t = 0;
  while (t < dist) {
    const t2 = Math.min(dist, t + dash);
    line(x1 + ux * t, y1 + uy * t, x1 + ux * t2, y1 + uy * t2, w, c);
    t += dash + gap;
  }
}
function dashedPolyline(pts, w, c, dash, gap) {
  const period = dash + gap;
  let offset = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], ay = pts[i][1];
    const bx = pts[i + 1][0], by = pts[i + 1][1];
    const remaining = Math.hypot(bx - ax, by - ay);
    if (remaining === 0) continue;
    const ux = (bx - ax) / remaining, uy = (by - ay) / remaining;
    let pos = 0;
    while (pos < remaining) {
      const phase = (offset + pos) % period;
      const segEnd = Math.min(remaining, pos + (phase < dash ? dash - phase : period - phase));
      if (phase < dash) {
        line(ax + ux * pos, ay + uy * pos, ax + ux * segEnd, ay + uy * segEnd, w, c);
      }
      pos = segEnd;
    }
    offset = (offset + remaining) % period;
  }
}
function arcPts(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
function fillRoundRect(x, y, w, h, r, c) {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  fillCircle(x + r, y + r, r, c);
  fillCircle(x + w - r, y + r, r, c);
  fillCircle(x + r, y + h - r, r, c);
  fillCircle(x + w - r, y + h - r, r, c);
}
function hline(x1, x2, y, w, c) { line(x1, y, x2, y, w, c); }
function vline(x, y1, y2, w, c) { line(x, y1, x, y2, w, c); }
function doubleRule(x1, x2, y, c) {
  hline(x1, x2, y, 1.8, c);
  hline(x1, x2, y + 4, 0.9, c);
}
function star(cx, cy, ro, ri, n, c) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = (i % 2 === 0) ? ro : ri;
    const a = -Math.PI / 2 + i * Math.PI / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  fillPoly(pts, c);
}
function shield(cx, cy, w, h, color) {
  const hw = w / 2;
  fillPoly([[cx - hw, cy - h / 2], [cx + hw, cy - h / 2], [cx + hw, cy], [cx, cy + h / 2], [cx - hw, cy]], color);
}
function checkMark(cx, cy, s, w, color) {
  polyline([[cx - s, cy], [cx - s * 0.25, cy + s * 0.8], [cx + s, cy - s * 0.8]], w, color, false);
}

// ---------- PNG encoder (hand-rolled, zlib deflate) ----------
const CRC_TABLE = (function () {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = (((y * SS + sy) * BW) + (x * SS + sx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const o = y * (1 + W * 3) + 1 + x * 3;
      raw[o] = Math.round(r / (SS * SS));
      raw[o + 1] = Math.round(g / (SS * SS));
      raw[o + 2] = Math.round(b / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- body font: single-stroke letterforms on an 8x12 grid ----------
// Grid: x 0..8, y 0..11, y grows down, baseline y=11, cap top y=0.
// A stroke is a polyline [[x,y],...] or ['c', cx, cy, r] for a filled disc.
const GLY = {
  'A': { a: 7.6, s: [[[1, 11], [3.5, 0], [4.5, 0], [7, 11]], [[2.4, 7], [5.6, 7]]] },
  'B': { a: 7.6, s: [[[1, 11], [1, 0], [5.5, 0], [7, 1.5], [7, 3.8], [5.5, 5.2], [1, 5.2]], [[1, 5.2], [5.5, 5.2], [7, 6.8], [7, 9.5], [5.5, 11], [1, 11]]] },
  'C': { a: 7.6, s: [[[7, 2.2], [5.2, 0], [2.8, 0], [1, 2], [1, 9], [2.8, 11], [5.2, 11], [7, 8.8]]] },
  'D': { a: 7.6, s: [[[1, 11], [1, 0], [5, 0], [7, 2.2], [7, 8.8], [5, 11], [1, 11]]] },
  'E': { a: 7.6, s: [[[1, 0], [1, 11]], [[1, 0], [6.8, 0]], [[1, 5.5], [5.6, 5.5]], [[1, 11], [6.8, 11]]] },
  'F': { a: 7.6, s: [[[1, 0], [1, 11]], [[1, 0], [6.8, 0]], [[1, 5.5], [5.6, 5.5]]] },
  'G': { a: 7.6, s: [[[7, 2.2], [5.2, 0], [2.8, 0], [1, 2], [1, 9], [2.8, 11], [5.2, 11], [7, 8.8], [7, 5.8], [4.6, 5.8]]] },
  'H': { a: 7.6, s: [[[1, 0], [1, 11]], [[7, 0], [7, 11]], [[1, 5.5], [7, 5.5]]] },
  'I': { a: 4.2, s: [[[0.8, 0], [3.4, 0]], [[2.1, 0], [2.1, 11]], [[0.8, 11], [3.4, 11]]] },
  'J': { a: 5.6, s: [[[4.6, 0], [4.6, 8.8], [3.4, 11], [1, 11], [0.2, 9.6]]] },
  'K': { a: 7.6, s: [[[1, 0], [1, 11]], [[1, 5.6], [7, 0]], [[2.6, 4], [7, 11]]] },
  'L': { a: 7.6, s: [[[1, 0], [1, 11]], [[1, 11], [6.8, 11]]] },
  'M': { a: 8.8, s: [[[1, 11], [1, 0], [4, 5.8], [7, 0], [7, 11]]] },
  'N': { a: 7.6, s: [[[1, 11], [1, 0], [7, 11], [7, 0]]] },
  'O': { a: 7.6, s: [[[2.6, 0], [5.4, 0], [7, 2], [7, 9], [5.4, 11], [2.6, 11], [1, 9], [1, 2], [2.6, 0]]] },
  'P': { a: 7.6, s: [[[1, 11], [1, 0], [5.5, 0], [7, 1.5], [7, 3.8], [5.5, 5.2], [1, 5.2]]] },
  'Q': { a: 7.6, s: [[[2.6, 0], [5.4, 0], [7, 2], [7, 9], [5.4, 11], [2.6, 11], [1, 9], [1, 2], [2.6, 0]], [[5, 9.2], [7.6, 12.6]]] },
  'R': { a: 7.6, s: [[[1, 11], [1, 0], [5.5, 0], [7, 1.5], [7, 3.8], [5.5, 5.2], [1, 5.2]], [[3.8, 5.2], [7, 11]]] },
  'S': { a: 7.6, s: [[[6.8, 2.4], [5, 0.4], [3, 0.4], [1.2, 2.2], [1.2, 4.2], [2.6, 5.5], [5.4, 5.5], [6.8, 6.8], [6.8, 8.8], [5, 10.6], [3, 10.6], [1.2, 8.8]]] },
  'T': { a: 7.6, s: [[[1, 0], [7, 0]], [[4, 0], [4, 11]]] },
  'U': { a: 7.6, s: [[[1, 0], [1, 9], [2.6, 11], [5.4, 11], [7, 9], [7, 0]]] },
  'V': { a: 7.6, s: [[[1, 0], [4, 11], [7, 0]]] },
  'W': { a: 9.6, s: [[[0.6, 0], [2, 11], [4, 5.8], [6, 11], [7.4, 0]]] },
  'X': { a: 7.6, s: [[[1, 0], [7, 11]], [[7, 0], [1, 11]]] },
  'Y': { a: 7.6, s: [[[1, 0], [4, 5.5], [7, 0]], [[4, 5.5], [4, 11]]] },
  'Z': { a: 7.6, s: [[[1, 0], [7, 0], [1, 11], [7, 11]]] },
  '0': { a: 7.6, s: [[[2.6, 0], [5.4, 0], [6.6, 2], [6.6, 9], [5.4, 11], [2.6, 11], [1.4, 9], [1.4, 2], [2.6, 0]]] },
  '1': { a: 4.6, s: [[[4.4, 0], [4.4, 11]], [[2.2, 2.2], [4.4, 0]], [[2.6, 11], [6.4, 11]]] },
  '2': { a: 7.6, s: [[[1.6, 2.6], [3, 0.4], [5.4, 0.4], [6.8, 2.4], [6.8, 4.8], [1.2, 11], [6.8, 11]]] },
  '3': { a: 7.6, s: [[[1.6, 2.2], [3, 0.4], [5.4, 0.4], [6.8, 2.2], [6.8, 4.4], [5.4, 5.5], [6.8, 6.6], [6.8, 8.8], [5.4, 10.6], [3, 10.6], [1.6, 8.8]]] },
  '4': { a: 7.6, s: [[[5.6, 0], [5.6, 11]], [[1, 7.6], [7, 7.6]], [[5.6, 0], [1, 7.6]]] },
  '5': { a: 7.6, s: [[[6.8, 0], [1.2, 0], [1.2, 5], [5.6, 5], [6.8, 6.2], [6.8, 8.8], [5.4, 10.6], [3, 10.6], [1.2, 8.8]]] },
  '6': { a: 7.6, s: [[[6.8, 2.4], [5, 0.4], [3, 0.4], [1.2, 2.4], [1.2, 8], [2.6, 10.6], [5.4, 10.6], [6.8, 9], [6.8, 6.8], [5.4, 5.2], [2.6, 5.2], [1.2, 6.8]]] },
  '7': { a: 7.6, s: [[[1, 0], [7, 0], [3.6, 11]]] },
  '8': { a: 7.6, s: [[[2.6, 0], [5.4, 0], [6.8, 1.6], [6.8, 4], [5.4, 5.5], [2.6, 5.5], [1.2, 4], [1.2, 1.6], [2.6, 0]], [[2.6, 5.5], [5.4, 5.5], [6.8, 7], [6.8, 9.4], [5.4, 11], [2.6, 11], [1.2, 9.4], [1.2, 7], [2.6, 5.5]]] },
  '9': { a: 7.6, s: [[[1.2, 2], [2.6, 0.4], [5.4, 0.4], [6.8, 2], [6.8, 4.4], [5.4, 5.8], [2.6, 5.8], [1.2, 4.4]], [[6.8, 2], [6.8, 8.6], [5, 10.6], [3, 10.6], [1.2, 8.6]]] },
  '%': { a: 11, s: [[[2.6, 0], [4.6, 0], [5.6, 1.2], [5.6, 3], [4.6, 4.2], [2.6, 4.2], [1.6, 3], [1.6, 1.2], [2.6, 0]], [[6.4, 6.8], [8.4, 6.8], [9.4, 8], [9.4, 9.8], [8.4, 11], [6.4, 11], [5.4, 9.8], [5.4, 8], [6.4, 6.8]], [[8.6, 0], [2.4, 11]]] },
  '•': { a: 5.4, s: [['c', 2.7, 5.5, 1.5]] },
  '–': { a: 7.6, s: [[[1.2, 5.5], [6.4, 5.5]]] },
  '-': { a: 5.4, s: [[[1, 5.5], [4.4, 5.5]]] },
  '/': { a: 6, s: [[[4.8, 0], [1.2, 11]]] },
  ':': { a: 4.2, s: [['c', 2.1, 3.2, 1.1], ['c', 2.1, 8.4, 1.1]] },
  ';': { a: 4.2, s: [['c', 2.1, 3.2, 1.1], ['c', 2.6, 9.6, 1], [[3.2, 10.2], [2.6, 11.8], [1.4, 12.6]]] },
  '.': { a: 4.2, s: [['c', 2.1, 9.8, 1.1]] },
  ',': { a: 4.2, s: [['c', 2.6, 9.6, 1], [[3.2, 10.2], [2.6, 11.8], [1.4, 12.6]]] },
  "'": { a: 3.6, s: [[[2.2, 0], [1.4, 3.2]]] },
  '+': { a: 7.6, s: [[[4, 2.2], [4, 8.8]], [[1.2, 5.5], [6.8, 5.5]]] }
};
function glyphAdv(ch, capH, tr) {
  if (ch === ' ') return 4.6 * (capH / 11) + tr;
  const g = GLY[ch];
  const a = g ? g.a : 7.6;
  return a * (capH / 11) + tr;
}
function textWidth(text, capH, tr) {
  if (!text) return 0;
  let w = 0;
  for (let i = 0; i < text.length; i++) w += glyphAdv(text[i], capH, tr);
  return w - tr;
}
function drawGlyph(ch, x, baseline, capH, w, color) {
  const g = GLY[ch];
  if (!g) return;
  const u = capH / 11;
  const top = baseline - capH;
  for (let s = 0; s < g.s.length; s++) {
    const st = g.s[s];
    if (st[0] === 'c') {
      fillCircle(x + st[1] * u, top + st[2] * u, st[3] * u, color);
    } else {
      const pts = st.map(function (p) { return [x + p[0] * u, top + p[1] * u]; });
      polyline(pts, w, color, false);
    }
  }
}
function drawText(text, x, baseline, capH, w, color, align, tr) {
  if (align === undefined) align = 'l';
  if (tr === undefined) tr = 0;
  const tw = textWidth(text, capH, tr);
  let px = x;
  if (align === 'c') px = x - tw / 2;
  if (align === 'r') px = x - tw;
  for (let i = 0; i < text.length; i++) {
    drawGlyph(text[i], px, baseline, capH, w, color);
    px += glyphAdv(text[i], capH, tr);
  }
  return tw;
}
function wrapText(text, maxW, capH, tr) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const t = cur ? cur + ' ' + words[i] : words[i];
    if (textWidth(t, capH, tr) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = words[i]; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- display font: SOLID filled letterforms on a 12x16 grid ----------
// Shapes: [x,y,w,h] rect, or [[x,y],...] polygon. Grid x 0..12, y 0..16.
const DISP = {
  '0': [[2, 0, 8, 3], [2, 13, 8, 3], [2, 3, 3, 10], [7, 3, 3, 10]],
  '2': [[2, 0, 8, 3], [7, 3, 3, 4], [1, 13, 10, 3], [[7, 7], [10, 7], [4, 16], [1, 16]]],
  '4': [[7, 0, 3, 16], [1, 9, 10, 3], [[8, 0], [11, 0], [4, 12], [1, 12]]],
  '6': [[1, 2, 3, 14], [1, 13, 10, 3], [8, 9, 3, 4], [4, 9, 6, 3], [1, 2, 6, 3]],
  'B': [[1, 0, 3, 16], [1, 0, 10, 3], [1, 6.5, 10, 3], [1, 13, 10, 3], [8, 3, 3, 3.5], [8, 9.5, 3, 3.5]],
  'E': [[1, 0, 3, 16], [1, 0, 10, 3], [1, 6.5, 8, 3], [1, 13, 10, 3]],
  'M': [[[1, 0], [4.5, 0], [6, 8], [7.5, 0], [11, 0], [11, 16], [8, 16], [8, 5], [6, 11], [4, 5], [4, 16], [1, 16]]],
  'N': [[1, 0, 3, 16], [8, 0, 3, 16], [[4, 0], [7, 0], [11, 16], [8, 16]]],
  'O': [[1, 0, 10, 3], [1, 13, 10, 3], [1, 3, 3, 10], [8, 3, 3, 10]],
  'R': [[1, 0, 3, 16], [1, 0, 10, 3], [1, 6.5, 10, 3], [8, 3, 3, 3.5], [[5, 9.5], [8, 9.5], [11, 16], [8, 16]]],
  'V': [[[1, 0], [4, 0], [7, 16], [4, 16]], [[8, 0], [11, 0], [8, 16], [5, 16]]]
};
function dispAdv(ch, capH, tr) {
  if (ch === ' ') return 6 * (capH / 16) + tr;
  return 12 * (capH / 16) + tr;
}
function dispWidth(text, capH, tr) {
  if (!text) return 0;
  let w = 0;
  for (let i = 0; i < text.length; i++) w += dispAdv(text[i], capH, tr);
  return w - tr;
}
function drawDispChar(ch, x, baseline, capH, color) {
  const shapes = DISP[ch];
  if (!shapes) return;
  const u = capH / 16;
  const top = baseline - capH;
  for (let s = 0; s < shapes.length; s++) {
    const sh = shapes[s];
    if (typeof sh[0] === 'number') {
      fillRect(x + sh[0] * u, top + sh[1] * u, sh[2] * u, sh[3] * u, color);
    } else {
      const pts = sh.map(function (p) { return [x + p[0] * u, top + p[1] * u]; });
      fillPoly(pts, color);
    }
  }
}
function drawDisplay(text, x, baseline, capH, color, align, tr) {
  if (align === undefined) align = 'l';
  if (tr === undefined) tr = 0;
  const tw = dispWidth(text, capH, tr);
  let px = x;
  if (align === 'c') px = x - tw / 2;
  if (align === 'r') px = x - tw;
  for (let i = 0; i < text.length; i++) {
    drawDispChar(text[i], px, baseline, capH, color);
    px += dispAdv(text[i], capH, tr);
  }
  return tw;
}

// ---------- picture scenes (fresh drawings, same compositions as v6) ----------
function sceneKorea(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h * 0.62, SKY);
  fillRect(x, y + h * 0.62, w, h * 0.38, SEA);
  line(x + w * 0.08, y + h * 0.7, x + w * 0.3, y + h * 0.7, 2, WHITE);
  line(x + w * 0.42, y + h * 0.78, x + w * 0.62, y + h * 0.78, 2, WHITE);
  line(x + w * 0.7, y + h * 0.68, x + w * 0.9, y + h * 0.68, 2, WHITE);
  const jx = x + w * 0.3, jy = y + h * 0.3;
  fillPoly([[jx, jy - 10], [jx + 26, jy + 3], [jx, jy + 6], [jx + 5, jy + 2]], NAVY);
  const jx2 = x + w * 0.62, jy2 = y + h * 0.22;
  fillPoly([[jx2, jy2 - 8], [jx2 + 22, jy2 + 2], [jx2, jy2 + 5], [jx2 + 4, jy2 + 1]], DARK);
  const arc = arcPts(x + w * 0.5, y + h * 1.05, h * 0.85, 200, 340, 26);
  dashedPolyline(arc, 2, RED, 7, 6);
  const tx = x + w * 0.1, ty = y + h * 0.16;
  fillPoly([[tx, ty], [tx + 14, ty], [tx + 7, ty + 12]], YELLOW);
  line(tx + 7, ty + 3, tx + 7, ty + 7, 2, INK);
  disc(tx + 7, ty + 9.5, 1.2, INK);
  clearClip();
}
function sceneStocks(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h, CHARTBG);
  dashedLine(x + 6, y + h * 0.55, x + w - 6, y + h * 0.55, 1.2, LGRAY, 6, 5);
  const base = y + h - 16;
  const bw = Math.min(40, w * 0.16);
  const vals = [['NIKKEI', 4.5, NAVY, '+4.5'], ['KOSPI', 7.5, RED, '+7.5'], ['TAIWAN', 9.1, TEAL, '+9.1']];
  const gap = (w - 3 * bw) / 4;
  for (let i = 0; i < 3; i++) {
    const bx = x + gap + i * (bw + gap);
    const bh = (h - 34) * vals[i][1] / 9.1;
    fillRect(bx, base - bh, bw, bh, vals[i][2]);
    drawText(vals[i][3], bx + bw / 2, base - bh - 6, 11, 2.2, vals[i][2], 'c', 0);
    drawText(vals[i][0], bx + bw / 2, base + 11, 8.5, 1.5, GRAY, 'c', 0);
  }
  hline(x + 6, x + w - 6, base, 2, INK);
  clearClip();
}
function sceneRocket(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h, NAVY);
  const stars = [[0.12, 0.16], [0.26, 0.08], [0.4, 0.2], [0.58, 0.1], [0.72, 0.18], [0.88, 0.09], [0.94, 0.32], [0.08, 0.44], [0.9, 0.52], [0.18, 0.56], [0.8, 0.62]];
  for (let i = 0; i < stars.length; i++) {
    const sx = x + w * stars[i][0], sy = y + h * stars[i][1];
    line(sx - 3, sy, sx + 3, sy, 1.4, WHITE);
    line(sx, sy - 3, sx, sy + 3, 1.4, WHITE);
  }
  const cx = x + w * 0.5, top = y + h * 0.12, bw2 = Math.min(28, w * 0.1);
  fillRect(x + w * 0.2, y + h * 0.86, w * 0.6, 5, STEEL);
  fillPoly([[cx - bw2 / 2, top + 24], [cx, top], [cx + bw2 / 2, top + 24]], RED);
  fillRoundRect(cx - bw2 / 2, top + 22, bw2, 58, 7, WHITE);
  fillPoly([[cx - bw2 / 2, top + 48], [cx - bw2 / 2 - 13, top + 76], [cx - bw2 / 2, top + 76]], RED);
  fillPoly([[cx + bw2 / 2, top + 48], [cx + bw2 / 2 + 13, top + 76], [cx + bw2 / 2, top + 76]], RED);
  fillCircle(cx, top + 40, 6, SKY);
  fillPoly([[cx - 7, top + 80], [cx + 7, top + 80], [cx, top + 100]], ORANGE);
  fillPoly([[cx - 3.5, top + 80], [cx + 3.5, top + 80], [cx, top + 94]], YELLOW);
  line(x + w * 0.14, y + h * 0.88, x + w * 0.14, y + h * 0.88 - 32, 2, WHITE);
  fillRect(x + w * 0.14, y + h * 0.88 - 32, 20, 13, RED);
  line(x + w * 0.86, y + h * 0.88, x + w * 0.86, y + h * 0.88 - 32, 2, WHITE);
  fillRect(x + w * 0.86 - 20, y + h * 0.88 - 32, 20, 13, TEAL);
  clearClip();
}
function sceneDrone(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h * 0.68, TAN);
  fillRect(x, y + h * 0.68, w, h * 0.32, GREEN);
  const bx = x + 8, by = y + 5, bw = w * 0.6, bh = h - 10;
  dashedLine(bx, by, bx + bw, by, 2, RED, 7, 5);
  dashedLine(bx + bw, by, bx + bw, by + bh, 2, RED, 7, 5);
  dashedLine(bx + bw, by + bh, bx, by + bh, 2, RED, 7, 5);
  dashedLine(bx, by + bh, bx, by, 2, RED, 7, 5);
  const dx = x + w * 0.32, dy = y + h * 0.4;
  line(dx - 6, dy - 4, dx - 26, dy - 18, 2.4, DARK);
  line(dx + 6, dy - 4, dx + 26, dy - 18, 2.4, DARK);
  line(dx - 40, dy - 18, dx - 12, dy - 18, 3, DARK);
  line(dx + 12, dy - 18, dx + 40, dy - 18, 3, DARK);
  fillCircle(dx - 26, dy - 18, 3.4, DARK);
  fillCircle(dx + 26, dy - 18, 3.4, DARK);
  fillRoundRect(dx - 11, dy - 7, 22, 13, 5, DARK);
  line(dx, dy + 6, dx, dy + 11, 2.4, DARK);
  fillCircle(dx, dy + 13, 3.4, DARK);
  fillCircle(dx + 6, dy - 1, 2.4, RED);
  shield(x + w * 0.78, y + h * 0.42, 38, 50, NAVY);
  checkMark(x + w * 0.78, y + h * 0.42 - 2, 9, 3.2, WHITE);
  fillCircle(x + w * 0.05, y + h * 0.3, 5, WHITE);
  fillCircle(x + w * 0.09, y + h * 0.34, 3.5, WHITE);
  clearClip();
}
function sceneStrike(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h, CREAM);
  fillRect(x + w * 0.08, y + h * 0.3, w * 0.3, h * 0.62, DARK);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      fillRect(x + w * 0.13 + c * w * 0.11, y + h * 0.38 + r * h * 0.18, w * 0.05, h * 0.08, YELLOW);
    }
  }
  fillRect(x + w * 0.5, y + h * 0.45, w * 0.24, h * 0.47, STEEL);
  star(x + w * 0.42, y + h * 0.34, 16, 7, 8, YELLOW);
  star(x + w * 0.42, y + h * 0.34, 9, 4, 8, ORANGE);
  fillCircle(x + w * 0.68, y + h * 0.2, 9, SMOKE);
  fillCircle(x + w * 0.76, y + h * 0.26, 6, SMOKE);
  hline(x, x + w, y + h - 4, 2, INK);
  clearClip();
}
function sceneGaza(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h * 0.66, SKY);
  fillRect(x, y + h * 0.66, w, h * 0.34, SAND);
  fillRect(x + w * 0.06, y + h * 0.34, w * 0.22, h * 0.58, TAN);
  fillRect(x + w * 0.34, y + h * 0.22, w * 0.26, h * 0.7, BRICK);
  fillRect(x + w * 0.66, y + h * 0.42, w * 0.24, h * 0.5, STEEL);
  for (let i = 0; i < 3; i++) {
    fillRect(x + w * 0.1 + i * w * 0.07, y + h * 0.42, w * 0.04, h * 0.06, DARK);
    fillRect(x + w * 0.38 + i * w * 0.08, y + h * 0.3, w * 0.04, h * 0.06, DARK);
  }
  fillCircle(x + w * 0.5, y + h * 0.14, 8, SMOKE);
  fillCircle(x + w * 0.57, y + h * 0.1, 6, SMOKE);
  fillCircle(x + w * 0.86, y + h * 0.22, 11, WHITE);
  line(x + w * 0.86 - 6, y + h * 0.22, x + w * 0.86 + 6, y + h * 0.22, 3, RED);
  line(x + w * 0.86, y + h * 0.22 - 6, x + w * 0.86, y + h * 0.22 + 6, 3, RED);
  clearClip();
}
function sceneTanker(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h * 0.55, SKY);
  fillRect(x, y + h * 0.55, w, h * 0.45, SEA);
  line(x + w * 0.05, y + h * 0.66, x + w * 0.3, y + h * 0.66, 2, WHITE);
  line(x + w * 0.55, y + h * 0.74, x + w * 0.8, y + h * 0.74, 2, WHITE);
  line(x + w * 0.2, y + h * 0.86, x + w * 0.5, y + h * 0.86, 2, WHITE);
  fillPoly([[x + w * 0.06, y + h * 0.42], [x + w * 0.9, y + h * 0.42], [x + w * 0.8, y + h * 0.62], [x + w * 0.16, y + h * 0.62]], DARK);
  fillRect(x + w * 0.3, y + h * 0.3, w * 0.12, h * 0.12, GOLD);
  fillRect(x + w * 0.44, y + h * 0.3, w * 0.12, h * 0.12, TEAL);
  fillRect(x + w * 0.62, y + h * 0.26, w * 0.1, h * 0.16, WHITE);
  fillPoly([[x + w * 0.56, y + h * 0.28], [x + w * 0.6, y + h * 0.14], [x + w * 0.64, y + h * 0.28]], ORANGE);
  star(x + w * 0.88, y + h * 0.72, 9, 4, 8, DARK);
  fillCircle(x + w * 0.88, y + h * 0.72, 3, DARK);
  clearClip();
}
function sceneQuake(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h, C('#DCE4E6'));
  fillPoly([[x, y + h], [x + w * 0.3, y + h * 0.3], [x + w * 0.55, y + h * 0.62], [x + w * 0.7, y + h]], STEEL);
  fillPoly([[x + w * 0.45, y + h], [x + w * 0.68, y + h * 0.22], [x + w * 0.95, y + h * 0.6], [x + w, y + h]], NAVY);
  fillPoly([[x + w * 0.26, y + h * 0.36], [x + w * 0.3, y + h * 0.3], [x + w * 0.34, y + h * 0.36]], WHITE);
  const ax = x + w * 0.52, ay = y + h * 0.6;
  for (let r = 0; r < 3; r++) {
    polyline(arcPts(ax, ay, 10 + r * 9, 200, 340, 14), 2.2, RED, false);
  }
  fillRect(x + 8, y + 6, 46, 18, RED);
  drawText('M5.5', x + 31, y + 19, 10, 2, WHITE, 'c', 0);
  clearClip();
}
function sceneTreaty(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h, CREAM);
  const px = x + w * 0.08, py = y + h * 0.14, pw = w * 0.42, ph = h * 0.72;
  fillRect(px, py, pw, ph, WHITE);
  hline(px, px + pw, py, 1.2, LGRAY);
  hline(px, px + pw, py + ph, 1.2, LGRAY);
  vline(px, py, py + ph, 1.2, LGRAY);
  vline(px + pw, py, py + ph, 1.2, LGRAY);
  for (let i = 0; i < 3; i++) hline(px + 8, px + pw - 8, py + 12 + i * 11, 1.6, GRAY);
  line(px + 8, py + ph - 10, px + pw * 0.55, py + ph - 10, 1.6, INK);
  fillCircle(px + pw - 14, py + ph - 14, 7, RED);
  star(px + pw - 14, py + ph - 14, 4, 2, 5, WHITE);
  const f1x = x + w * 0.62, f2x = x + w * 0.82;
  line(f1x, y + h * 0.16, f1x, y + h * 0.88, 2, INK);
  line(f2x, y + h * 0.16, f2x, y + h * 0.88, 2, INK);
  fillRect(f1x, y + h * 0.16, 24, 9, GOLD);
  fillRect(f1x, y + h * 0.25, 24, 9, TEAL);
  fillRect(f2x, y + h * 0.16, 24, 18, NAVY);
  fillCircle(f2x + 12, y + h * 0.25, 2, WHITE);
  fillCircle(f2x + 6, y + h * 0.2, 1.4, WHITE);
  fillCircle(f2x + 18, y + h * 0.2, 1.4, WHITE);
  fillCircle(f2x + 6, y + h * 0.3, 1.4, WHITE);
  fillCircle(f2x + 18, y + h * 0.3, 1.4, WHITE);
  clearClip();
}
function scenePhone(x, y, w, h) {
  setClip(x, y, w, h);
  fillRect(x, y, w, h, CREAM);
  const pw = Math.min(72, w * 0.3), ph = h * 0.8;
  const px = x + w * 0.24, py = y + h * 0.1;
  fillRoundRect(px, py, pw, ph, 7, DARK);
  fillRoundRect(px + 5, py + 7, pw - 10, ph - 14, 4, WHITE);
  drawText('5%', px + pw / 2, py + ph * 0.58, 15, 2.6, NAVY, 'c', 0);
  line(px + 8, py + ph - 11, px + pw - 8, py + ph - 11, 1.8, LGRAY);
  shield(x + w * 0.74, y + h * 0.6, 36, 46, GOLD);
  checkMark(x + w * 0.74, y + h * 0.6 - 2, 8, 3, WHITE);
  clearClip();
}

// ---------- panels (geometry kept from v6; type re-set in the new fonts) ----------
const M = 30, CW = W - 2 * M;
const PAD = 12;
const GAP_TITLE_SUB = 8, GAP_SUB_SRC = 8, GAP_SRC_BOTTOM = 10;
const REGION_COLOR = { 'ASIA': NAVY, 'EUROPE': TEAL, 'MIDEAST': RED, 'OCEANIA': GOLD, 'N AMERICA': STEEL };
const MARK_COLOR = { 'CONFIRMED': MARKG, 'REPORTED': MARKA, 'CLAIM': MARKR };

function panel(x, y, w, h, band) {
  fillRect(x, y, w, h, PANEL);
  hline(x, x + w, y, 1.2, INK);
  hline(x, x + w, y + h, 1.2, INK);
  vline(x, y, y + h, 1.2, INK);
  vline(x + w, y, y + h, 1.2, INK);
  fillRect(x, y, w, 5, band);
}
function panelAlt(x, y, w, h, band) {
  fillRect(x, y, w, h, PANEL2);
  hline(x, x + w, y, 1.2, INK);
  hline(x, x + w, y + h, 1.2, INK);
  vline(x, y, y + h, 1.2, INK);
  vline(x + w, y, y + h, 1.2, INK);
  fillRect(x, y, w, 5, band);
}
function srcMarkRow(x, innerW, baseline, src, mark, capH) {
  let s = capH;
  const markW = textWidth(mark, 9.5, 0.5);
  while (s > 8 && textWidth(src, s, 0) + markW + 12 > innerW) s -= 0.5;
  drawText(src, x, baseline, s, 1.7, GRAY, 'l', 0);
  drawText(mark, x + innerW, baseline, 9.5, 2.2, MARK_COLOR[mark], 'r', 0.5);
}
function storyText(x, topY, innerW, title, titleCap, sub, subCap, srcBaseline) {
  let tc = titleCap, sc = subCap;
  for (let attempt = 0; attempt < 9; attempt++) {
    const tLines = wrapText(title, innerW, tc, 0);
    const sLines = wrapText(sub, innerW, sc, 0);
    const titleBottom = topY + tc + (tLines.length - 1) * (tc + 5);
    const subTop = titleBottom + GAP_TITLE_SUB;
    const subBottom = subTop + sc + (sLines.length - 1) * (sc + 3.5);
    if (subBottom + GAP_SUB_SRC <= srcBaseline || (tc <= 12 && sc <= 9)) {
      let by = topY + tc;
      for (const ln of tLines) { drawText(ln, x, by, tc, Math.max(2.4, tc * 0.19), INK, 'l', 0); by += tc + 5; }
      by = subTop + sc;
      for (const ln of sLines) { drawText(ln, x, by, sc, 1.7, INK, 'l', 0); by += sc + 3.5; }
      return;
    }
    tc = Math.max(12, tc - 1);
    sc = Math.max(9, sc - 0.5);
  }
}
function drawStoryPanel(x, y, w, h, story, sceneFn, alt, sceneH) {
  if (alt) panelAlt(x, y, w, h, REGION_COLOR[story.region]); else panel(x, y, w, h, REGION_COLOR[story.region]);
  const ix = x + PAD, iw = w - 2 * PAD;
  sceneFn(x + 1, y + 6, w - 2, sceneH);
  const kickerBase = y + 6 + sceneH + 19;
  drawText(story.kicker, ix, kickerBase, 10, 2, REGION_COLOR[story.region], 'l', 1.5);
  const srcBaseline = y + h - GAP_SRC_BOTTOM;
  storyText(ix, kickerBase + GAP_TITLE_SUB, iw, story.title, story.titleCap, story.sub, story.subCap, srcBaseline - 9.5);
  srcMarkRow(ix, iw, srcBaseline, story.src, story.mark, 9.5);
}

// ---------- story data (verified 24 Nov list; wording per brief bans) ----------
const LEADS = [
  { kicker: 'LEAD 01 - SEOUL', region: 'ASIA', field: 'DEFENCE', title: 'RUSSIAN JETS IN DEFENCE ZONE', sub: 'NO AIRSPACE VIOLATION - FALSE ALARMS', src: 'JCS / YONHAP', mark: 'CONFIRMED', titleCap: 17, subCap: 11.5 },
  { kicker: 'LEAD 02 - TOKYO / SEOUL / TAIPEI', region: 'ASIA', field: 'MARKETS', title: 'ASIA STOCKS SURGE', sub: 'CHIP SHARES LEAD; SNAPSHOTS, NOT CLOSES', src: 'REUTERS', mark: 'CONFIRMED', titleCap: 17, subCap: 11.5 },
  { kicker: 'LEAD 03 - JIUQUAN', region: 'ASIA', field: 'SPACE', title: 'SHENZHOU-24 CREW NAMED', sub: 'FIRST FOREIGN ASTRONAUT ON TIANGONG; LAUNCH WED 08:18', src: 'CMSA', mark: 'CONFIRMED', titleCap: 17, subCap: 11.5 }
];
const CARDS1 = [
  { kicker: 'EUROPE - DEFENCE', region: 'EUROPE', field: 'DEFENCE', title: 'DRONE OVER POLAND, HELD FIRE', sub: 'CROSSED NEAR DOROHUSK, TURNED BACK - MON 23:00', src: 'POLISH ARMED FORCES', mark: 'CONFIRMED', titleCap: 13.5, subCap: 10 },
  { kicker: 'EUROPE - CONFLICT', region: 'EUROPE', field: 'CONFLICT', title: 'STRIKE ON ZAPORIZHZHIA', sub: 'UKRAINE SAYS 2 DEAD, 22 HURT, INCL. 2 CHILDREN', src: 'UKRAINIAN OFFICIALS', mark: 'REPORTED', titleCap: 13.5, subCap: 10 },
  { kicker: 'MIDEAST - CONFLICT', region: 'MIDEAST', field: 'CONFLICT', title: 'GAZA: 9 DEAD IN 24 HOURS', sub: 'MEDICS COUNT 9 DEAD, 3 AT KHAN YOUNIS POST', src: 'MEDICS VIA REUTERS', mark: 'REPORTED', titleCap: 13.5, subCap: 10 },
  { kicker: 'MIDEAST - ENERGY', region: 'MIDEAST', field: 'ENERGY', title: 'TANKERS ABLAZE CLAIM', sub: 'IRAN CLAIMS MINES; U.S. PROBES SHIP HACKS', src: 'IRGC / WSJ', mark: 'CLAIM', titleCap: 13.5, subCap: 10 }
];
const CARDS2 = [
  { kicker: 'ASIA - DISASTER', region: 'ASIA', field: 'DISASTER', title: 'QUAKE SHAKES NEPAL', sub: 'ABOUT 5.5; NO CASUALTIES REPORTED', src: 'NCS / EMSC / USGS', mark: 'CONFIRMED', titleCap: 13.5, subCap: 10 },
  { kicker: 'OCEANIA - DIPLOMACY', region: 'OCEANIA', field: 'DIPLOMACY', title: 'SOLOMONS WARNED ON CHINA PACT', sub: 'SOGAVARE WARNS GOVT; WALE SIGNS TREATY WED', src: 'RNZ', mark: 'REPORTED', titleCap: 13.5, subCap: 10 },
  { kicker: 'OCEANIA - TECH POLICY', region: 'OCEANIA', field: 'TECH POLICY', title: 'AUSTRALIA TOUGHENS ONLINE LAW', sub: 'FINES UP TO 5% OF REVENUE; NOT YET LAW', src: 'GOVT ANNOUNCEMENT', mark: 'REPORTED', titleCap: 13.5, subCap: 10 }
];
const BRIEFS = [
  { num: '11', region: 'EUROPE', field: 'SPORT', title: 'CHAMPIONS LEAGUE: 9 TIES TONIGHT', src: 'UEFA', mark: 'CONFIRMED' },
  { num: '12', region: 'ASIA', field: 'POLITICS', title: 'PRABOWO NAMES VP PICKS', src: 'JAPAN TIMES', mark: 'REPORTED' },
  { num: '13', region: 'ASIA', field: 'DISASTER', title: 'PAKISTAN HIT BY 4.1 QUAKE', src: 'NCS', mark: 'CONFIRMED' },
  { num: '14', region: 'N AMERICA', field: 'WEATHER', title: 'STORMS THREATEN THANKSGIVING', src: 'NWS / CNN', mark: 'REPORTED' },
  { num: '15', region: 'ASIA', field: 'DIPLOMACY', title: 'PYONGYANG MULLS SWISS OFFICE SHUT', src: 'N KOREA STMT', mark: 'CLAIM' },
  { num: '16', region: 'ASIA', field: 'POLITICS', title: 'HASINA PLANS DEC 16 RETURN', src: 'SPOKESPERSON', mark: 'CLAIM' }
];
const DAY_STRIP = [
  ['01:32 UTC', 'NEPAL QUAKE', NAVY],
  ['07:52 KST', 'KADIZ FALSE ALARM', RED],
  ['MON 23:00', 'DRONE OVER POLAND', NAVY],
  ['+7.5%', 'KOSPI, INTRADAY', TEAL],
  ['22', 'HORMUZ ATTACKS IN NOV', RED]
];
const MAP_ROWS = [
  '   11........11...111......',
  '  1111......1111..111111....',
  '  11111.....11.111.1111111...',
  '   1111......11...11111.....',
  '    11.......11...11....1...',
  '    111......11........1...',
  '     11.......1............',
  '     1.....................'
];
const DATE_CHECK = ['LIBYA STRIKE - NOV 22', 'COP31 COLLAPSE - NOV 22', 'NVIDIA CEO RETURNS - NOV 23'];

// ---------- assembly ----------
function main() {
  fillAll(PAPER);
  // Masthead: solid filled caps, flanked by rules.
  const mastBase = 56;
  const mastW = dispWidth('24 NOVEMBER 2026', 44, 2);
  drawDisplay('24 NOVEMBER 2026', W / 2, mastBase, 44, INK, 'c', 2);
  hline(M, W / 2 - mastW / 2 - 18, 38, 2, INK);
  hline(W / 2 + mastW / 2 + 18, W - M, 38, 2, INK);
  // Subline: letterspaced small caps.
  const subW = textWidth('TUESDAY - THE WORLD IN ONE DAY', 11, 3);
  drawText('TUESDAY - THE WORLD IN ONE DAY', W / 2, 74, 11, 1.8, INK, 'c', 3);
  hline(M, W / 2 - subW / 2 - 16, 68, 1, GRAY);
  hline(W / 2 + subW / 2 + 16, W - M, 68, 1, GRAY);
  // Count strip.
  const regions = {};
  const fields = {};
  const all = LEADS.concat(CARDS1, CARDS2, BRIEFS);
  for (const s of all) { regions[s.region] = (regions[s.region] || 0) + 1; fields[s.field] = 1; }
  const nRegions = Object.keys(regions).length;
  const nFields = Object.keys(fields).length;
  fillRect(M, 84, CW, 26, INK);
  drawText(all.length + ' STORIES • ' + nRegions + ' REGIONS • ' + nFields + ' FIELDS • ALL CHECKED TO 24 NOV 2026', W / 2, 102, 12, 2.2, PAPER, 'c', 1);
  // Day strip: one line of times and figures, cells divided by hairlines.
  const cellW = CW / DAY_STRIP.length;
  for (let i = 0; i < DAY_STRIP.length; i++) {
    const cx0 = M + i * cellW;
    if (i > 0) vline(cx0, 118, 148, 1, LGRAY);
    const val = DAY_STRIP[i][0], lab = DAY_STRIP[i][1], col = DAY_STRIP[i][2];
    drawText(val, cx0 + cellW / 2, 131, 13, 2.6, col, 'c', 0);
    drawText(lab, cx0 + cellW / 2, 145, 9.5, 1.5, GRAY, 'c', 0.5);
  }
  hline(M, W - M, 152, 1.2, INK);
  // Leads.
  const leadY = 162, leadH = 248, leadW = 310;
  const leadXs = [M, M + leadW + 16, M + 2 * (leadW + 16)];
  const leadScenes = [sceneKorea, sceneStocks, sceneRocket];
  for (let i = 0; i < 3; i++) drawStoryPanel(leadXs[i], leadY, leadW, leadH, LEADS[i], leadScenes[i], i % 2 === 1, 100);
  // Double rule between picture zone and cards.
  doubleRule(M, W - M, 420, INK);
  // Cards row 1.
  const c1Y = 434, cH = 178, c1W = 230;
  const c1Xs = [M, M + c1W + 14, M + 2 * (c1W + 14), M + 3 * (c1W + 14)];
  const c1Scenes = [sceneDrone, sceneStrike, sceneGaza, sceneTanker];
  for (let i = 0; i < 4; i++) drawStoryPanel(c1Xs[i], c1Y, c1W, cH, CARDS1[i], c1Scenes[i], i % 2 === 1, 52);
  // Cards row 2.
  const c2Y = 624, c2W = 312;
  const c2Xs = [M, M + c2W + 14, M + 2 * (c2W + 14)];
  const c2Scenes = [sceneQuake, sceneTreaty, scenePhone];
  for (let i = 0; i < 3; i++) drawStoryPanel(c2Xs[i], c2Y, c2W, cH, CARDS2[i], c2Scenes[i], i % 2 === 0, 52);
  // Briefs header + double rule.
  drawText('MORE OF THE DAY', M, 824, 12, 2.4, INK, 'l', 2);
  drawText('IN ORDER OF SIGNIFICANCE', W - M, 822, 9.5, 1.6, GRAY, 'r', 1);
  doubleRule(M, W - M, 832, INK);
  // Briefs: two columns, three rows.
  const bColW = (CW - 14) / 2;
  for (let i = 0; i < 6; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const bx = M + col * (bColW + 14);
    const base = 856 + row * 26;
    const b = BRIEFS[i];
    const markW = textWidth(b.mark, 9, 0);
    let tc = 12.5, sc = 10, total = 0;
    while (true) {
      total = textWidth(b.num + '. ', tc, 0) + textWidth(b.title, tc, 0) + textWidth(' - ' + b.src, sc, 0) + markW + 14;
      if (total <= bColW || (tc <= 10 && sc <= 8.5)) break;
      if (tc > 10) tc -= 0.5; else sc -= 0.5;
    }
    let tx = bx;
    drawText(b.num + '.', tx, base, tc, 2.6, RED, 'l', 0);
    tx += textWidth(b.num + '. ', tc, 0);
    drawText(b.title, tx, base, tc, 2.3, INK, 'l', 0);
    tx += textWidth(b.title, tc, 0);
    drawText(' - ' + b.src, tx, base, sc, 1.6, GRAY, 'l', 0);
    drawText(b.mark, bx + bColW, base, 9, 2.2, MARK_COLOR[b.mark], 'r', 0);
  }
  hline(M, W - M, 918, 1.2, INK);
  // Footer labels.
  drawText('WHERE THE DAY HAPPENED', M, 934, 10, 2, INK, 'l', 1.5);
  drawText('DATE CHECK: OLD NEWS KEPT OUT', 350, 934, 10, 2, INK, 'l', 1);
  drawText('HOW TO READ THE MARKS', 660, 934, 10, 2, INK, 'l', 1.5);
  // Footer zone 1: dotted world map + region counts.
  const mapX = M, mapY = 942, cell = 5;
  for (let r = 0; r < MAP_ROWS.length; r++) {
    for (let c = 0; c < MAP_ROWS[r].length; c++) {
      if (MAP_ROWS[r][c] === '1') fillCircle(mapX + c * cell + cell / 2, mapY + r * cell + cell / 2, 1.6, NAVY);
    }
  }
  const order = ['ASIA', 'EUROPE', 'MIDEAST', 'OCEANIA', 'N AMERICA'];
  let cy2 = 956;
  for (const rg of order) {
    drawText(rg, mapX + 188, cy2, 9, 1.8, NAVY, 'l', 0.5);
    drawText(String(regions[rg]), mapX + 188 + textWidth(rg, 9, 0.5) + 6, cy2, 9, 2.2, RED, 'l', 0);
    cy2 += 12;
  }
  // Footer zone 2: date-check box.
  fillRect(350, 942, 290, 62, PANEL);
  polyline([[350, 942], [640, 942], [640, 1004], [350, 1004], [350, 942]], 1.2, INK, false);
  let dy = 957;
  drawText('KEPT OUT - NOT 24 NOV NEWS', 358, dy, 9.5, 2.2, RED, 'l', 0.5);
  for (const item of DATE_CHECK) {
    dy += 13;
    drawText('• ' + item, 358, dy, 9, 1.6, INK, 'l', 0);
  }
  // Footer zone 3: legend.
  const legend = [
    ['CONFIRMED', 'MULTIPLE SOURCES', MARKG],
    ['REPORTED', 'SINGLE SOURCE', MARKA],
    ['CLAIM', 'UNVERIFIED CLAIM', MARKR]
  ];
  let ly = 956;
  for (const row of legend) {
    drawText(row[0], 660, ly, 9.5, 2.2, row[2], 'l', 0.5);
    const lw = textWidth(row[0], 9.5, 0.5);
    drawText(' - ' + row[1], 660 + lw, ly, 9.5, 1.6, GRAY, 'l', 0);
    ly += 14;
  }
  // Cut-off line.
  drawText('CUT-OFF 08:00 UTC • AMERICAS DAYTIME TO BE RECHECKED IN FINAL EDITION • SOURCES AS CITED', W / 2, 1018, 8, 1.5, GRAY, 'c', 0.5);
  // Write.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outDir + '/entry.png', encodePNG());
}
main();
