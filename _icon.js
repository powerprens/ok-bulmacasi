// PWA ikon üretici (bağımlılık yok): siyah kare + sağa bakan beyaz ok
// kullanım: node _icon.js  →  icon-192.png, icon-512.png
const fs = require("fs");
const zlib = require("zlib");

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
      let r = 0, g = 0, b = 0, a = 0;               // 3x3 süper örnekleme (yumuşak kenar)
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
  ihdr[8] = 8; ihdr[9] = 6;                          // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const inTri = (px, py, ax, ay, bx, by, cx, cy) => {
  const s = (ax - px) * (by - py) - (bx - px) * (ay - py);
  const t = (bx - px) * (cy - py) - (cx - px) * (by - py);
  const u = (cx - px) * (ay - py) - (ax - px) * (cy - py);
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
};

const draw = (px, py) => {
  const tail = px >= 0.20 && px <= 0.50 && py >= 0.42 && py <= 0.58;
  const head = inTri(px, py, 0.80, 0.50, 0.50, 0.28, 0.50, 0.72);
  return head || tail ? [238, 241, 246, 1] : [16, 16, 24, 1];
};

fs.writeFileSync(__dirname + "/icon-192.png", png(192, draw));
fs.writeFileSync(__dirname + "/icon-512.png", png(512, draw));
console.log("ikonlar yazıldı: icon-192.png, icon-512.png");
