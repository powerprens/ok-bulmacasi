// Geliştirme testi: TANGLED / UNBLOCK bulmacası (Gemini spesifikasyonu).
// 1) JSON biçim denetimi: segments[0]=kafa, escapePath[0] kafaya komşu,
//    escapePath sonu grid dışında, kurtlar üst üste değil
// 2) Determinizm
// 3) Çözülebilirlik: ters yerleşim sırasıyla çıkış → kural motoru (isPathClear)
//    her adımda yol açık olmalı, tüm kurtlar çıkmalı
// 4) Çıkış animasyonu simülasyonu (pop/unshift tick'leri) → isExited
// 5) Engelleme birimi: Gemini örneği (kırmızı mavi'yi, mavi çıkınca kırmızı açılır)
const src = require("fs").readFileSync(__dirname + "/game.js", "utf8");

const utilPart = src.slice(0, src.indexOf("/* ---------------- Ses motoru"));
const genPart = src.slice(src.indexOf("/* ---------------- Seviye üretici"), src.indexOf("/* ---------------- DOM"));
const engine = eval(utilPart + genPart + "; ({ generateLevel, isPathClear });");
const { generateLevel, isPathClear } = engine;

let ok = true;
const fail = msg => { ok = false; console.log("HATA:", msg); };

const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const outside = (p, n) => p.x < 0 || p.y < 0 || p.x >= n || p.y >= n;

for (let level = 1; level <= 150; level++) {
  const L = generateLevel(level);
  const n = L.gridSize.w;
  if (L.gridSize.h !== n) fail(`Seviye ${level}: kare grid bekleniyordu`);
  if (L.worms.length < 3) fail(`Seviye ${level}: çok az kurt (${L.worms.length})`);

  // 1) biçim denetimi
  const occ = new Set();
  for (const w of L.worms) {
    if (!w.id || !w.color || !Array.isArray(w.segments) || !Array.isArray(w.escapePath))
      fail(`Seviye ${level}: kurt alanları eksik (${w.id})`);
    if (w.segments.length < 2) fail(`Seviye ${level}: kurt çok kısa (${w.id})`);
    if (!adjacent(w.segments[0], w.escapePath[0]))
      fail(`Seviye ${level}: escapePath kafaya komşu başlamıyor (${w.id})`);
    const last = w.escapePath[w.escapePath.length - 1];
    if (!outside(last, n))
      fail(`Seviye ${level}: escapePath grid dışında bitmiyor (${w.id})`);
    // path boyunca ilerleme yönü tutarlı mı (ardışık komşu mu)
    for (let i = 0; i + 1 < w.escapePath.length; i++)
      if (!adjacent(w.escapePath[i], w.escapePath[i + 1]))
        fail(`Seviye ${level}: escapePath kopuk (${w.id})`);
    for (const s of w.segments) {
      const k = s.x + "," + s.y;
      if (occ.has(k)) fail(`Seviye ${level}: kurtlar aynı hücreyi paylaşıyor`);
      occ.add(k);
    }
  }

  // 2) determinizm
  const L2 = generateLevel(level);
  if (JSON.stringify(L.worms) !== JSON.stringify(L2.worms)) fail(`Seviye ${level}: deterministik değil`);

  // 3) çözülebilirlik: ters yerleşim sırası
  const order = [...L.worms].reverse();
  for (const w of order) {
    if (!isPathClear(L, w)) {
      fail(`Seviye ${level}: geçerli sırada ${w.id} yolu kapalı — ÇÖZÜLEMEZ`);
      break;
    }
    // 4) çıkış animasyonu simülasyonu (tick tick pop/unshift)
    let pathIdx = 0;
    let guard = 0;
    while (w.segments.length > 0 && guard++ < 200) {
      if (pathIdx < w.escapePath.length) {
        w.segments.unshift({ ...w.escapePath[pathIdx++] });
        w.segments.pop();
      } else {
        w.segments.pop();
      }
    }
    if (w.segments.length !== 0) fail(`Seviye ${level}: animasyon kurtu bitiremedi (${w.id})`);
    w.isExited = true;
  }
}

// 5) engelleme birimi (Gemini örneği)
{
  const manual = {
    level: 0, gridSize: { w: 8, h: 8 },
    worms: [
      { id: "red_1", color: "#FF0000",
        segments: [{ x: 3, y: 4 }, { x: 3, y: 5 }, { x: 3, y: 6 }],
        escapePath: [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: -1 }],
        isExited: false },
      { id: "blue_1", color: "#0000FF",
        segments: [{ x: 2, y: 5 }, { x: 1, y: 5 }],
        escapePath: [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 9, y: 5 }],
        isExited: false },
    ],
  };
  // başlangıçta ikisi de açık mı? kırmızı yukarı (3,3..) boş ✓ açık olmalı
  if (!isPathClear(manual, manual.worms[0])) fail("Birim: kırmızı başlangıçta açık olmalıydı");
  // mavi, kırmızının (3,5) gövdesi yüzünden kapalı olmalı
  if (isPathClear(manual, manual.worms[1])) fail("Birim: mavi kırmızı tarafından engellenmeliydi (Gemini örneği)");
  // kırmızı çıkınca mavi açılır
  manual.worms[0].isExited = true;
  if (!isPathClear(manual, manual.worms[1])) fail("Birim: kırmızı çıkınca mavi açık olmalıydı");
}

// zorluk eğrisi örnekleri
for (const l of [1, 5, 12, 25, 50, 100]) {
  const L = generateLevel(l);
  const segs = L.worms.reduce((s, w) => s + w.segments.length, 0);
  console.log(`Seviye ${l}: ${L.gridSize.w}x${L.gridSize.h} | ${L.worms.length} kurt | ${segs} segment`);
}

console.log(ok ? "UNBLOCK: TÜM TESTLER GEÇTİ ✅" : "TESTLER BAŞARISIZ ❌");
process.exit(ok ? 0 : 1);
