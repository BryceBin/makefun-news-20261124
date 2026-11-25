// Final edition, fresh rewrite: 24 November 2026 world news in one image.
// Written from scratch in this session. Node standard library only.
// Deterministic: no clock, no randomness, no network, no external assets.
// Renders a 1024x1024 PNG to $MAKEFUN_OUTPUT_DIR/entry.png.
//
// Layout notes: the briefs band ("MORE FROM TUESDAY") was rebuilt with
// tall rows so a headline, its category/source line and its status pill
// never touch: headline on top, sub-line 7px below it, pill clear above.
import * as fs from "node:fs";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

// ---------- palette ----------
const NAVY: RGB = [13, 28, 48];
const NAVY2: RGB = [26, 46, 76];
const GOLD: RGB = [198, 158, 38];
const GOLDDK: RGB = [146, 114, 20];
const PAPER: RGB = [247, 242, 230];
const PAPER2: RGB = [240, 232, 213];
const CARDALT: RGB = [243, 238, 224];
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [18, 22, 28];
const GREY: RGB = [94, 100, 108];
const LGREY: RGB = [206, 204, 196];
const GREEN: RGB = [28, 118, 50];
const AMBER: RGB = [150, 102, 0];
const RED: RGB = [176, 52, 42];
const SKY: RGB = [188, 214, 230];
const SEA: RGB = [52, 108, 138];
const GRASS: RGB = [96, 140, 78];

// ---------- raster canvas ----------
class Canvas {
  data: Uint8Array;
  constructor() {
    this.data = new Uint8Array(W * H * 3);
  }
  px(x: number, y: number, c: RGB): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const o = (iy * W + ix) * 3;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
  }
  box(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      let o = (yy * W + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.data[o] = c[0];
        this.data[o + 1] = c[1];
        this.data[o + 2] = c[2];
        o += 3;
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.px(x, y, c);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(H - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }
  seg(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x1 + dx * t, y1 + dy * t, w / 2, c);
    }
  }
  dash(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, on: number, off: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    let d = 0;
    while (d < len) {
      const a = d / len;
      const b = Math.min(1, (d + on) / len);
      this.seg(x1 + dx * a, y1 + dy * a, x1 + dx * b, y1 + dy * b, w, c);
      d += on + off;
    }
  }
  ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
    const steps = Math.max(24, Math.ceil(2 * Math.PI * r));
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      this.disc(cx + r * Math.cos(a), cy + r * Math.sin(a), w / 2, c);
    }
  }
  arcDash(cx: number, cy: number, r: number, a0: number, a1: number, w: number, c: RGB): void {
    const steps = 72;
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i <= steps; i++) {
      const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (i > 0 && i % 4 < 2) this.seg(prevX, prevY, px, py, w, c);
      prevX = px;
      prevY = py;
    }
  }
  poly(pts: Array<[number, number]>, c: RGB): void {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    for (let y = Math.max(0, Math.floor(lo)); y <= Math.min(H - 1, Math.ceil(hi)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const mid = y + 0.5;
        if ((a[1] <= mid && b[1] > mid) || (b[1] <= mid && a[1] > mid)) {
          xs.push(a[0] + ((mid - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
          this.px(x, y, c);
        }
      }
    }
  }
  frame(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
    this.box(x, y, w, t, c);
    this.box(x, y + h - t, w, t, c);
    this.box(x, y, t, h, c);
    this.box(x + w - t, y, t, h, c);
  }
}

const cv = new Canvas();

// ---------- PNG writer (filter 0 rows, zlib level 9) ----------
const CRC_TABLE: Int32Array = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    t[n] = v;
  }
  return t;
})();

function crcOf(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(kind: string, payload: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(kind, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crcOf(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, Buffer.from(payload), tail]);
}

function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(cv.data.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---------- block-letter font: 5x7 bitmaps, uniform 6-unit advance ----------
// Every glyph is 7 rows of 5 bits. Rendered as filled cells, so letters stay
// solid and bold from masthead size down to footnote size.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function unitFor(capH: number): number {
  return capH / 7;
}
function measure(text: string, capH: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * unitFor(capH) - unitFor(capH);
}
function drawGlyph(ch: string, x: number, y: number, capH: number, c: RGB): void {
  const rows = FONT[ch];
  if (!rows) return;
  const u = unitFor(capH);
  for (let r = 0; r < 7; r++) {
    const y0 = y + Math.round(r * u);
    const y1 = y + Math.round((r + 1) * u);
    for (let col = 0; col < 5; col++) {
      if (rows[r][col] !== "1") continue;
      const x0 = x + Math.round(col * u);
      const x1 = x + Math.round((col + 1) * u);
      cv.box(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), c);
    }
  }
}
function drawText(text: string, x: number, y: number, capH: number, c: RGB, align: "l" | "c" | "r" = "l"): void {
  const w = measure(text, capH);
  let cx = x;
  if (align === "c") cx = x - w / 2;
  if (align === "r") cx = x - w;
  const u = unitFor(capH);
  for (let i = 0; i < text.length; i++) {
    drawGlyph(text[i], cx + i * 6 * u, y, capH, c);
  }
}
function wrapWords(text: string, capH: number, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const trial = cur === "" ? wd : cur + " " + wd;
    if (measure(trial, capH) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = wd;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
// Shrink the size until the text fits in maxLines; returns [lines, size].
function fitText(text: string, startH: number, minH: number, maxW: number, maxLines: number): [string[], number] {
  for (let h = startH; h >= minH - 0.001; h -= 0.5) {
    const lines = wrapWords(text, h, maxW);
    if (lines.length <= maxLines) return [lines, h];
  }
  return [wrapWords(text, minH, maxW).slice(0, maxLines), minH];
}
function drawBlock(lines: string[], x: number, y: number, capH: number, pitch: number, c: RGB): void {
  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * pitch, capH, c, "l");
  }
}

// ---------- stories (wordings fixed by the brief) ----------
type Mark = "CONFIRMED" | "REPORTED" | "CLAIM";
type Story = {
  id: number;
  place: string;
  region: string;
  field: string;
  title: string;
  sub: string;
  src: string;
  mark: Mark;
  kind: "lead" | "card" | "brief";
};
const STORIES: Story[] = [
  { id: 1, place: "SEOUL", region: "ASIA", field: "DEFENCE", title: "RUSSIAN JETS IN DEFENCE ZONE", sub: "NO AIRSPACE VIOLATION - FALSE ALARMS", src: "JCS / YONHAP", mark: "CONFIRMED", kind: "lead" },
  { id: 2, place: "TOKYO / SEOUL / TAIPEI", region: "ASIA", field: "MARKETS", title: "ASIA STOCKS SURGE", sub: "TAIEX +9.0% - KOSPI +6.3% - NIKKEI +3.9% AT CLOSE", src: "REUTERS / AP", mark: "CONFIRMED", kind: "lead" },
  { id: 3, place: "JIUQUAN", region: "ASIA", field: "SPACE", title: "SHENZHOU-24 CREW NAMED", sub: "FIRST FOREIGN ASTRONAUT ON TIANGONG; LAUNCH WED 08:18", src: "CMSA", mark: "CONFIRMED", kind: "lead" },
  { id: 4, place: "", region: "EUROPE", field: "DEFENCE", title: "DRONE OVER POLAND, HELD FIRE", sub: "ENTERED FOR 8 MIN, TURNED BACK - MON 23:00", src: "POLISH ARMED FORCES", mark: "CONFIRMED", kind: "card" },
  { id: 5, place: "", region: "EUROPE", field: "CONFLICT", title: "STRIKE ON ZAPORIZHZHIA", sub: "UKRAINE SAYS 2 DEAD, 22 HURT, INCL. 2 CHILDREN", src: "UKRAINIAN OFFICIALS", mark: "REPORTED", kind: "card" },
  { id: 6, place: "", region: "MIDEAST", field: "CONFLICT", title: "GAZA: 6 DEAD ON TUESDAY", sub: "MEDICS: 3 AT KHAN YOUNIS, 3 NEAR NETZARIM", src: "MEDICS VIA REUTERS", mark: "REPORTED", kind: "card" },
  { id: 7, place: "", region: "MIDEAST", field: "CONFLICT", title: "RIYADH TOWER HIT AGAIN", sub: "11 HURT AT PIF TOWER; UK SANCTIONS HOUTHIS", src: "SAUDI CIVIL DEFENCE", mark: "REPORTED", kind: "card" },
  { id: 8, place: "", region: "ASIA", field: "DISASTER", title: "QUAKE SHAKES NEPAL", sub: "ABOUT 5.5; NO CASUALTIES REPORTED", src: "NCS / EMSC / USGS", mark: "CONFIRMED", kind: "card" },
  { id: 9, place: "", region: "OCEANIA", field: "DIPLOMACY", title: "SOLOMONS DROPS CHINA PACT", sub: "TELLS BEIJING PACT ENDS; AUSTRALIA TREATY WED", src: "SMH / RNZ", mark: "REPORTED", kind: "card" },
  { id: 10, place: "", region: "OCEANIA", field: "TECH POLICY", title: "AUSTRALIA TOUGHENS ONLINE LAW", sub: "FINES UP TO 5% OF REVENUE; NOT YET LAW", src: "GOVT ANNOUNCEMENT", mark: "REPORTED", kind: "card" },
  { id: 11, place: "", region: "MIDEAST", field: "ENERGY", title: "TANKERS HIT IN HORMUZ", sub: "UKMTO REPORTS 3 HIT; IRAN CLAIMS MINES", src: "UKMTO / IRGC", mark: "CLAIM", kind: "card" },
  { id: 12, place: "", region: "EUROPE", field: "SPORT", title: "REAL HIT 5; CITY, ARSENAL HELD", sub: "", src: "UEFA", mark: "CONFIRMED", kind: "brief" },
  { id: 13, place: "", region: "N AMERICA", field: "MARKETS", title: "DOW TOPS 50,000; NASDAQ FALLS", sub: "", src: "AP / REUTERS", mark: "CONFIRMED", kind: "brief" },
  { id: 14, place: "", region: "LATIN AMERICA", field: "HEALTH", title: "WHO URGES END TO CUBA FUEL BLOCKADE", sub: "", src: "WHO / REUTERS", mark: "CONFIRMED", kind: "brief" },
  { id: 15, place: "", region: "N AMERICA", field: "WEATHER", title: "STORMS THREATEN THANKSGIVING", sub: "", src: "NWS / CNN", mark: "REPORTED", kind: "brief" },
  { id: 16, place: "", region: "ASIA", field: "DIPLOMACY", title: "PYONGYANG MULLS SWISS OFFICE SHUT", sub: "", src: "N KOREA STMT", mark: "CLAIM", kind: "brief" },
  { id: 17, place: "", region: "ASIA", field: "POLITICS", title: "DHAKA REJECTS HASINA RETURN BID", sub: "", src: "DHAKA GOVT", mark: "REPORTED", kind: "brief" },
];
const MARK_FILL: Record<Mark, RGB> = { CONFIRMED: GREEN, REPORTED: AMBER, CLAIM: RED };

// ---------- picture scenes: flat shapes, one per story ----------
function jetShape(cx: number, cy: number, s: number, c: RGB): void {
  cv.poly(
    [
      [cx - 24 * s, cy + 9 * s],
      [cx + 26 * s, cy],
      [cx - 12 * s, cy + 1 * s],
      [cx - 18 * s, cy + 12 * s],
    ],
    c
  );
  cv.poly(
    [
      [cx - 16 * s, cy - 1 * s],
      [cx - 5 * s, cy - 13 * s],
      [cx - 1 * s, cy - 1 * s],
    ],
    c
  );
}
function picture(x: number, y: number, w: number, h: number, id: number): void {
  const cx = x + w / 2;
  if (id === 1) {
    cv.box(x, y, w, h, SKY);
    cv.box(x, y + h * 0.7, w, h * 0.3, SEA);
    cv.ellipse(cx, y + h * 0.84, w * 0.3, h * 0.18, GRASS);
    cv.poly(
      [
        [cx - 24, y + h * 0.64],
        [cx - 12, y + h * 0.53],
        [cx, y + h * 0.64],
        [cx, y + h * 0.73],
        [cx - 24, y + h * 0.73],
      ],
      [139, 92, 62]
    );
    cv.arcDash(cx, y + h * 0.84, Math.min(w, h) * 0.5, 200, 340, 2, RED);
    jetShape(x + w * 0.24, y + h * 0.26, 0.9, [38, 42, 48]);
    jetShape(x + w * 0.64, y + h * 0.15, 0.65, [58, 62, 68]);
    cv.disc(cx + 36, y + h * 0.6, 7, RED);
    drawText("!", cx + 36, y + h * 0.6 - 6, 12, WHITE, "c");
  } else if (id === 2) {
    cv.box(x, y, w, h, [233, 242, 229]);
    const base = y + h * 0.78;
    cv.seg(x + 14, base, x + w - 14, base, 2, INK);
    const vals = [9.0, 6.3, 3.9];
    const names = ["TAIEX", "KOSPI", "NIKKEI"];
    const cols: RGB[] = [GREEN, [44, 156, 74], [126, 175, 104]];
    for (let i = 0; i < 3; i++) {
      const bw = 46;
      const bx = x + 34 + i * 92;
      const bh = (h * 0.44 * vals[i]) / 9.0;
      cv.box(bx, base - bh, bw, bh, cols[i]);
      drawText(vals[i].toFixed(1) + "%", bx + bw / 2, base - bh - 15, 12, INK, "c");
      drawText(names[i], bx + bw / 2, base + 4, 9, GREY, "c");
    }
  } else if (id === 3) {
    cv.box(x, y, w, h, [26, 40, 72]);
    const starPts: Array<[number, number]> = [
      [0.1, 0.16], [0.24, 0.08], [0.42, 0.2], [0.66, 0.1], [0.82, 0.22], [0.92, 0.08], [0.55, 0.28], [0.18, 0.34],
    ];
    for (const s of starPts) cv.disc(x + w * s[0], y + h * s[1], 1.6, WHITE);
    cv.disc(x + w * 0.86, y + h * 0.24, 13, [231, 227, 199]);
    cv.box(x, y + h * 0.86, w, h * 0.14, [106, 90, 68]);
    cv.box(cx - 34, y + h * 0.78, 68, 10, [52, 56, 62]);
    cv.poly(
      [
        [cx - 13, y + h * 0.2],
        [cx, y + h * 0.08],
        [cx + 13, y + h * 0.2],
      ],
      RED
    );
    cv.box(cx - 13, y + h * 0.2, 26, h * 0.58, WHITE);
    cv.disc(cx, y + h * 0.36, 6, [88, 148, 198]);
    cv.poly(
      [
        [cx - 13, y + h * 0.62],
        [cx - 26, y + h * 0.8],
        [cx - 13, y + h * 0.78],
      ],
      RED
    );
    cv.poly(
      [
        [cx + 13, y + h * 0.62],
        [cx + 26, y + h * 0.8],
        [cx + 13, y + h * 0.78],
      ],
      RED
    );
    cv.disc(cx - 16, y + h * 0.84, 7, [178, 178, 178]);
    cv.disc(cx + 18, y + h * 0.84, 6, [158, 158, 158]);
  } else if (id === 4) {
    cv.box(x, y, w, h, [218, 230, 238]);
    cv.box(x, y + h * 0.76, w, h * 0.24, [108, 148, 98]);
    cv.dash(cx, y + 6, cx, y + h * 0.78, 2, RED, 7, 5);
    cv.box(x + w * 0.7, y + h * 0.42, 4, h * 0.36, [88, 88, 88]);
    cv.box(x + w * 0.7 - 24, y + h * 0.52, 52, 5, WHITE);
    cv.box(x + w * 0.7 - 24, y + h * 0.57, 52, 5, RED);
    const dx = x + w * 0.3;
    const dy = y + h * 0.3;
    cv.box(dx - 16, dy - 6, 32, 12, [38, 42, 48]);
    cv.seg(dx - 30, dy - 12, dx - 14, dy - 6, 2, [38, 42, 48]);
    cv.seg(dx + 30, dy - 12, dx + 14, dy - 6, 2, [38, 42, 48]);
    cv.seg(dx - 30, dy + 12, dx - 14, dy + 6, 2, [38, 42, 48]);
    cv.seg(dx + 30, dy + 12, dx + 14, dy + 6, 2, [38, 42, 48]);
    cv.ellipse(dx - 32, dy - 13, 9, 3, [38, 42, 48]);
    cv.ellipse(dx + 32, dy - 13, 9, 3, [38, 42, 48]);
    cv.ellipse(dx - 32, dy + 13, 9, 3, [38, 42, 48]);
    cv.ellipse(dx + 32, dy + 13, 9, 3, [38, 42, 48]);
    cv.dash(dx + 20, dy, x + w * 0.66, y + h * 0.22, 1.6, GREY, 5, 4);
  } else if (id === 5) {
    cv.box(x, y, w, h, [199, 199, 199]);
    cv.disc(x + w * 0.62, y + h * 0.22, 16, [148, 148, 148]);
    cv.disc(x + w * 0.72, y + h * 0.14, 11, [163, 163, 163]);
    cv.poly(
      [
        [x + 30, y + h],
        [x + 30, y + h * 0.34],
        [x + 44, y + h * 0.3],
        [x + 52, y + h * 0.4],
        [x + 70, y + h * 0.34],
        [x + 82, y + h * 0.46],
        [x + 96, y + h * 0.38],
        [x + 112, y + h * 0.5],
        [x + 112, y + h],
      ],
      [136, 120, 104]
    );
    cv.box(x + 44, y + h * 0.56, 12, 14, [38, 38, 38]);
    cv.box(x + 72, y + h * 0.56, 12, 14, [38, 38, 38]);
    cv.box(x + 44, y + h * 0.78, 12, 14, [50, 50, 50]);
    cv.box(x + 140, y + h * 0.6, 52, h * 0.4, [118, 108, 96]);
    cv.seg(x + 30, y + h * 0.62, x + 60, y + h * 0.8, 2, [68, 58, 48]);
  } else if (id === 6) {
    cv.box(x, y, w, h, [230, 215, 174]);
    cv.box(x, y + h * 0.62, w, h * 0.38, [188, 168, 128]);
    cv.box(x + 16, y + h * 0.3, 28, h * 0.32, [108, 98, 86]);
    cv.box(x + 150, y + h * 0.22, 32, h * 0.4, [128, 116, 100]);
    cv.disc(x + w * 0.55, y + h * 0.26, 13, [148, 148, 148]);
    cv.poly(
      [
        [x + w * 0.52, y + h * 0.88],
        [x + w * 0.66, y + h * 0.6],
        [x + w * 0.8, y + h * 0.88],
      ],
      WHITE
    );
    cv.box(x + w * 0.63, y + h * 0.66, 8, 16, RED);
    cv.box(x + w * 0.59, y + h * 0.7, 16, 8, RED);
  } else if (id === 7) {
    cv.box(x, y, w, h, [212, 226, 238]);
    cv.disc(x + w * 0.7, y + h * 0.18, 12, [148, 148, 148]);
    cv.disc(x + w * 0.66, y + h * 0.1, 8, [163, 163, 163]);
    cv.poly(
      [
        [cx - 20, y + h],
        [cx - 26, y + h * 0.22],
        [cx + 26, y + h * 0.22],
        [cx + 20, y + h],
      ],
      [56, 72, 88]
    );
    for (let r = 0; r < 4; r++) {
      for (let cI = 0; cI < 2; cI++) {
        cv.box(cx - 16 + cI * 18, y + h * 0.3 + r * 16, 10, 8, [218, 208, 158]);
      }
    }
    cv.seg(x + w * 0.84, y + h * 0.16, x + w * 0.76, y + h * 0.26, 1.6, GREY);
    cv.disc(x + w * 0.86, y + h * 0.14, 3, INK);
    cv.poly(
      [
        [cx - 30, y + h * 0.24],
        [cx - 22, y + h * 0.16],
        [cx - 14, y + h * 0.24],
      ],
      [198, 118, 38]
    );
  } else if (id === 8) {
    cv.box(x, y, w, h, [232, 238, 243]);
    cv.poly(
      [
        [x + 10, y + h * 0.66],
        [x + 60, y + h * 0.18],
        [x + 110, y + h * 0.66],
      ],
      [120, 136, 151]
    );
    cv.poly(
      [
        [x + 90, y + h * 0.66],
        [x + 150, y + h * 0.1],
        [x + 210, y + h * 0.66],
      ],
      [148, 162, 176]
    );
    cv.box(x, y + h * 0.66, w, h * 0.34, [168, 158, 138]);
    cv.seg(x + 20, y + h * 0.7, x + 50, y + h * 0.8, 3, INK);
    cv.seg(x + 50, y + h * 0.8, x + 80, y + h * 0.72, 3, INK);
    cv.seg(x + 80, y + h * 0.72, x + 110, y + h * 0.86, 3, INK);
    cv.seg(x + 110, y + h * 0.86, x + 140, y + h * 0.76, 3, INK);
    cv.seg(x + 140, y + h * 0.76, x + 180, y + h * 0.88, 3, INK);
    cv.poly(
      [
        [x + 150, y + h * 0.66],
        [x + 150, y + h * 0.52],
        [x + 164, y + h * 0.44],
        [x + 178, y + h * 0.52],
        [x + 178, y + h * 0.66],
      ],
      [148, 78, 58]
    );
    cv.ring(cx, y + h * 0.34, 26, 2, RED);
    cv.ring(cx, y + h * 0.34, 40, 1.6, RED);
    cv.disc(cx, y + h * 0.34, 4, RED);
  } else if (id === 9) {
    cv.box(x, y, w, h, [237, 230, 211]);
    cv.box(x + w * 0.14, y + h * 0.18, w * 0.42, h * 0.56, WHITE);
    cv.frame(x + w * 0.14, y + h * 0.18, w * 0.42, h * 0.56, 2, GREY);
    for (let i = 0; i < 3; i++) {
      cv.seg(x + w * 0.2, y + h * (0.3 + i * 0.13), x + w * 0.5, y + h * (0.3 + i * 0.13), 1.6, LGREY);
    }
    cv.box(x + w * 0.44, y + h * 0.3, w * 0.42, h * 0.56, [250, 248, 240]);
    cv.frame(x + w * 0.44, y + h * 0.3, w * 0.42, h * 0.56, 2, GREY);
    for (let i = 0; i < 3; i++) {
      cv.seg(x + w * 0.5, y + h * (0.42 + i * 0.13), x + w * 0.8, y + h * (0.42 + i * 0.13), 1.6, LGREY);
    }
    cv.disc(x + w * 0.68, y + h * 0.3, 13, RED);
    cv.disc(x + w * 0.68, y + h * 0.3, 8, WHITE);
    cv.disc(x + w * 0.68, y + h * 0.3, 3, RED);
    cv.seg(x + w * 0.22, y + h * 0.82, x + w * 0.42, y + h * 0.74, 3, INK);
  } else if (id === 10) {
    cv.box(x, y, w, h, [230, 236, 243]);
    cv.box(cx - 36, y + 6, 72, h - 10, [32, 36, 42]);
    cv.box(cx - 30, y + 12, 60, h - 22, [218, 230, 238]);
    drawText("5%", cx, y + h * 0.32, 26, RED, "c");
    cv.seg(x + w * 0.16, y + h * 0.22, x + w * 0.24, y + h * 0.22, 2, INK);
    cv.seg(x + w * 0.76, y + h * 0.22, x + w * 0.84, y + h * 0.22, 2, INK);
  } else if (id === 11) {
    cv.box(x, y, w, h, [205, 222, 232]);
    cv.box(x, y + h * 0.58, w, h * 0.42, SEA);
    for (let i = 0; i < 3; i++) {
      const tx = x + 22 + i * 74;
      cv.box(tx, y + h * 0.44, 58, 14, [28, 28, 32]);
      cv.box(tx + 38, y + h * 0.3, 16, 14, WHITE);
      if (i === 1) {
        cv.disc(tx + 20, y + h * 0.34, 9, [148, 148, 148]);
        cv.poly(
          [
            [tx + 14, y + h * 0.3],
            [tx + 20, y + h * 0.2],
            [tx + 26, y + h * 0.3],
          ],
          [218, 118, 28]
        );
      }
    }
    cv.dash(x + 8, y + h * 0.7, x + w - 8, y + h * 0.7, 1.6, WHITE, 6, 5);
  }
}

// ---------- status pill ----------
function pillWidth(mark: string, capH: number): number {
  return measure(mark, capH) + 12;
}
function drawPill(mark: Mark, x: number, y: number, h: number, capH: number): void {
  const pw = pillWidth(mark, capH);
  cv.box(x, y, pw, h, MARK_FILL[mark]);
  drawText(mark, x + pw / 2, y + (h - capH) / 2, capH, WHITE, "c");
}

// ---------- lead / card panel ----------
function drawPanel(s: Story, x: number, y: number, w: number, h: number, lead: boolean, picH: number): void {
  const bg = lead ? WHITE : s.id % 2 === 0 ? WHITE : CARDALT;
  cv.box(x, y, w, h, bg);
  cv.frame(x, y, w, h, 2, [58, 58, 58]);
  picture(x + 2, y + 2, w - 4, picH - 4, s.id);
  cv.box(x, y + picH, w, 2, GOLD);
  const tx = x + 10;
  const tw = w - 20;
  let ty = y + picH + 7;
  if (lead) {
    drawText("LEAD 0" + s.id + " - " + s.place, tx, ty, 11, GOLDDK, "l");
    ty += 14;
    drawText(s.region + " / " + s.field, tx, ty, 10, GREY, "l");
    ty += 13;
  } else {
    drawText(s.region + " / " + s.field, tx, ty, 10, GOLDDK, "l");
    ty += 13;
  }
  const srcTop = y + h - 19;
  const [tLines, tH] = fitText(s.title, lead ? 20 : 15, lead ? 17 : 12, tw, 2);
  const titleBottom = ty + tLines.length * (tH + 3) - 3;
  drawBlock(tLines, tx, ty, tH, tH + 3, INK);
  // Sub-lines get whatever vertical room is left above the source row,
  // shrinking if needed, so they can never reach the source row.
  const room = srcTop - 3 - titleBottom;
  let subH = lead ? 12 : 10.5;
  let subLines = wrapWords(s.sub, subH, tw);
  while (subLines.length * (subH + 2) - 2 > room && subH > 8.5) {
    subH -= 0.5;
    subLines = wrapWords(s.sub, subH, tw);
  }
  if (subLines.length > 2) subLines = subLines.slice(0, 2);
  drawBlock(subLines, tx, titleBottom + 3, subH, subH + 2, [50, 54, 60]);
  // Source + mark row, pinned to the bottom, with a shrink guard so the
  // source text can never run into the pill.
  let srcH = 9.5;
  const pw = pillWidth(s.mark, 10);
  while (measure(s.src, srcH) + pw + 10 > tw && srcH > 8) srcH -= 0.5;
  drawText(s.src, tx, srcTop + 2, srcH, GREY, "l");
  drawPill(s.mark, x + w - 10 - pw, srcTop, 16, 10);
}

// ---------- brief row: headline / sub-line / pill kept apart by construction ----------
function drawBrief(s: Story, x: number, y: number, w: number, h: number): void {
  cv.box(x, y, w, h, WHITE);
  cv.frame(x, y, w, h, 1, LGREY);
  cv.box(x, y, 5, h, GOLD);
  const pillH = 14;
  const pillY = y + 5;
  const pw = pillWidth(s.mark, 9);
  drawPill(s.mark, x + w - 8 - pw, pillY, pillH, 9);
  const headW = w - 14 - 8 - pw - 12;
  const [tLines, tH] = fitText(s.title, 14, 11, headW, 1);
  drawBlock(tLines, x + 14, y + 4, tH, tH + 3, INK);
  // Sub-line sits 7px below the headline's ink bottom; the pill ends at
  // pillY + 14 = y + 19, the sub-line starts at y + 24, so nothing touches.
  const meta = s.region + " / " + s.field + "  -  " + s.src;
  drawText(meta, x + 14, y + 24, 9, GREY, "l");
}

// ---------- dotted world map ----------
function dottedMap(x: number, y: number, w: number, h: number): void {
  cv.box(x, y, w, h, [230, 236, 238]);
  const blobs: Array<[number, number, number, number]> = [
    [0.16, 0.3, 0.13, 0.2],
    [0.28, 0.22, 0.08, 0.12],
    [0.24, 0.62, 0.07, 0.2],
    [0.48, 0.24, 0.05, 0.1],
    [0.52, 0.42, 0.07, 0.18],
    [0.6, 0.26, 0.16, 0.22],
    [0.72, 0.48, 0.1, 0.14],
    [0.86, 0.72, 0.07, 0.09],
  ];
  for (let gy = y + 5; gy < y + h - 4; gy += 9) {
    for (let gx = x + 5; gx < x + w - 4; gx += 9) {
      const nx = (gx - x) / w;
      const ny = (gy - y) / h;
      for (const b of blobs) {
        const dx = (nx - b[0]) / b[2];
        const dy = (ny - b[1]) / b[3];
        if (dx * dx + dy * dy <= 1) {
          cv.disc(gx, gy, 2.2, NAVY2);
          break;
        }
      }
    }
  }
}

// ---------- full layout ----------
function render(): void {
  cv.box(0, 0, W, H, PAPER);
  // Masthead
  cv.box(0, 0, W, 92, NAVY);
  cv.box(0, 88, W, 4, GOLD);
  drawText("24 NOVEMBER 2026", W / 2, 12, 46, WHITE, "c");
  drawText("TUESDAY - THE WORLD IN ONE DAY", W / 2, 64, 14, GOLD, "c");
  // Count strip, computed from the story table
  const regions = new Set(STORIES.map((s) => s.region)).size;
  const fields = new Set(STORIES.map((s) => s.field)).size;
  const conf = STORIES.filter((s) => s.mark === "CONFIRMED").length;
  const rep = STORIES.filter((s) => s.mark === "REPORTED").length;
  const clm = STORIES.filter((s) => s.mark === "CLAIM").length;
  const strip =
    STORIES.length + " STORIES - " + regions + " REGIONS - " + fields + " FIELDS - " +
    conf + " CONFIRMED - " + rep + " REPORTED - " + clm + " CLAIM";
  cv.box(0, 92, W, 26, WHITE);
  drawText(strip, W / 2, 100, 13, INK, "c");
  cv.seg(0, 118, W, 118, 1, LGREY);
  // Day strip: 5 cells
  const dayCells: Array<[string, string]> = [
    ["01:32 UTC", "NEPAL QUAKE"],
    ["07:52 KST", "KADIZ FALSE ALARM"],
    ["MON 23:00", "DRONE OVER POLAND"],
    ["+6.3%", "KOSPI AT CLOSE"],
    ["50,019", "DOW TOPS 50,000"],
  ];
  const cellW = 193;
  for (let i = 0; i < 5; i++) {
    const cx0 = 16 + i * (cellW + 6);
    cv.box(cx0, 124, cellW, 46, i % 2 === 0 ? WHITE : PAPER2);
    cv.frame(cx0, 124, cellW, 46, 1, LGREY);
    drawText(dayCells[i][0], cx0 + cellW / 2, 129, 15, NAVY, "c");
    drawText(dayCells[i][1], cx0 + cellW / 2, 149, 9.5, GREY, "c");
  }
  // Leads
  const leads = STORIES.filter((s) => s.kind === "lead");
  const leadXs = [16, 351, 686];
  for (let i = 0; i < leads.length; i++) {
    drawPanel(leads[i], leadXs[i], 176, 322, 224, true, 96);
  }
  // Cards, two rows of four
  const cards = STORIES.filter((s) => s.kind === "card");
  const cardXs = [16, 266, 516, 766];
  for (let i = 0; i < 4; i++) drawPanel(cards[i], cardXs[i], 406, 240, 178, false, 72);
  for (let i = 0; i < 4; i++) drawPanel(cards[4 + i], cardXs[i], 590, 240, 178, false, 72);
  // Briefs band: header, then three tall rows (pitch 40, height 38)
  drawText("MORE FROM TUESDAY", 16, 774, 12, NAVY, "l");
  cv.seg(150, 780, W - 16, 780, 1, LGREY);
  const briefs = STORIES.filter((s) => s.kind === "brief");
  const briefW = 490;
  for (let i = 0; i < briefs.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawBrief(briefs[i], 16 + col * (briefW + 12), 788 + row * 40, briefW, 38);
  }
  // Footer
  cv.box(0, 910, W, 92, WHITE);
  cv.seg(0, 910, W, 910, 2, GOLD);
  dottedMap(16, 918, 330, 66);
  drawText("DOTTED WORLD MAP - NOT TO SCALE", 181, 988, 8, GREY, "c");
  const order = ["ASIA", "EUROPE", "MIDEAST", "OCEANIA", "N AMERICA", "LATIN AMERICA"];
  const counts = order
    .map((r) => [r, STORIES.filter((s) => s.region === r).length] as [string, number])
    .filter((p) => p[1] > 0);
  drawText("STORIES BY REGION", 366, 920, 11, NAVY, "l");
  drawText(counts.slice(0, 3).map((p) => p[0] + " " + p[1]).join("   "), 366, 936, 11, INK, "l");
  drawText(counts.slice(3, 5).map((p) => p[0] + " " + p[1]).join("   "), 366, 951, 11, INK, "l");
  drawText(counts.slice(5).map((p) => p[0] + " " + p[1]).join("   "), 366, 966, 11, INK, "l");
  drawText("MARKS:", 366, 984, 9, GREY, "l");
  let lx = 366 + measure("MARKS: ", 9) + 4;
  const marks: Mark[] = ["CONFIRMED", "REPORTED", "CLAIM"];
  for (const m of marks) {
    const pw = pillWidth(m, 10);
    drawPill(m, lx, 980, 16, 10);
    lx += pw + 8;
  }
  // Date check box
  cv.box(716, 918, 292, 72, PAPER2);
  cv.frame(716, 918, 292, 72, 2, NAVY);
  drawText("DATE CHECK - NOT 24 NOV NEWS", 730, 925, 11, NAVY, "l");
  drawText("LIBYA STRIKE - NOV 22", 730, 943, 10, GREY, "l");
  drawText("COP31 COLLAPSE - NOV 22", 730, 957, 10, GREY, "l");
  drawText("NVIDIA CEO RETURNS - NOV 23", 730, 971, 10, GREY, "l");
  // Bottom bar
  cv.box(0, 1002, W, 22, NAVY);
  drawText("FULL DAY CHECKED - 24 NOV 2026 - SOURCES AS CITED", W / 2, 1007, 11, WHITE, "c");
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  fs.mkdirSync(outDir, { recursive: true });
  render();
  fs.writeFileSync(outDir + "/entry.png", encodePng());
}
main();
