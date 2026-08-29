// Android ikonlarını üretir + oyun dosyalarını APK assets'ine kopyalar.
// kullanım: node _androidpack.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = __dirname;
const RES = path.join(ROOT, "android", "app", "src", "main", "res");
const ASSETS = path.join(ROOT, "android", "app", "src", "main", "assets");

/* ---- minimal PNG kodlayıcı (RGBA, 3x3 süper örnekleme) ---- */
crc32.table = null;
function crc32(buf) {
  let t = crc32.table;
  if (!t) {
    t = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, draw) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 3; sx++) {
          const c = draw((x + (sx + 0.5) / 3) / size, (y + (sy + 0.5) / 3) / size);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      const A = a / 9, o = 1 + x * 4;
      row[o] = A ? Math.round(r / 9 / A) : 0;
      row[o + 1] = A ? Math.round(g / 9 / A) : 0;
      row[o + 2] = A ? Math.round(b / 9 / A) : 0;
      row[o + 3] = Math.round(A * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- ok çizimi (sağa bakan), k = ölçek (1 = tam boy, merkeze küçültmek için < 1) ---- */
const inTri = (px, py, ax, ay, bx, by, cx, cy) => {
  const s = (ax - px) * (by - py) - (bx - px) * (ay - py);
  const t = (bx - px) * (cy - py) - (cx - px) * (by - py);
  const u = (cx - px) * (ay - py) - (ax - px) * (cy - py);
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
};
const arrow = (px, py, k) => {
  const x = 0.5 + (px - 0.5) / k, y = 0.5 + (py - 0.5) / k;   // merkeze ölçekle
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const tail = x >= 0.20 && x <= 0.50 && y >= 0.42 && y <= 0.58;
  const head = inTri(x, y, 0.80, 0.50, 0.50, 0.28, 0.50, 0.72);
  return head || tail;
};
const WHITE = [238, 241, 246, 1], BG = [8, 8, 13, 1], TRANS = [0, 0, 0, 0];

/* ---- mipmap ikonları ---- */
const DENSITIES = [
  ["mipmap-mdpi", 48, 108], ["mipmap-hdpi", 72, 162], ["mipmap-xhdpi", 96, 216],
  ["mipmap-xxhdpi", 144, 324], ["mipmap-xxxhdpi", 192, 432],
];
for (const [dir, legacy, fg] of DENSITIES) {
  const d = path.join(RES, dir);
  fs.mkdirSync(d, { recursive: true });
  // klasik ikon (Android < 8): dolgun kare + ok
  fs.writeFileSync(path.join(d, "ic_launcher.png"), png(legacy, (x, y) => arrow(x, y, 1) ? WHITE : BG));
  fs.writeFileSync(path.join(d, "ic_launcher_round.png"), png(legacy, (x, y) => arrow(x, y, 1) ? WHITE : BG));
  // uyarlanabilir ön plan: şeffaf zemin + merkezde küçük ok (güvenli bölge)
  fs.writeFileSync(path.join(d, "ic_launcher_foreground.png"), png(fg, (x, y) => arrow(x, y, 0.52) ? WHITE : TRANS));
}
console.log("ikonlar üretildi (5 yoğunluk, klasik + uyarlanabilir)");

/* ---- oyun dosyalarını assets'e göm ---- */
fs.mkdirSync(ASSETS, { recursive: true });
for (const f of ["index.html", "game.js", "style.css"])
  fs.copyFileSync(path.join(ROOT, f), path.join(ASSETS, f));

// APK içi kopyada PWA satırları gereksiz (file:// içinde manifest çalışmaz)
const idx = path.join(ASSETS, "index.html");
let html = fs.readFileSync(idx, "utf8");
html = html.replace(/\s*<link rel="manifest"[^>]*>/, "")
           .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, "")
           .replace(/\s*<meta name="apple-mobile-web-app[^>]*>/g, "");
fs.writeFileSync(idx, html);
console.log("assets hazır: index.html, game.js, style.css");
