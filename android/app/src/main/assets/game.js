/* =========================================================
   Amaze GO! — Tangled / Unblock Bulmacası
   (Gemini Pro spesifikasyonuna + videodaki gerçek oynanışa birebir)

   Mekanik: "trafik sıkışıklığı" tarzı sıra bulmacası.
   - Tahtada çok sayıda segment-kanallı KURT (worm) var; hareketsizler
     ve birbirlerinin çıkış yollarını kapatıyorlar.
   - Oyuncı bir kurda DOKUNUR. Kafasından ekran kenarına giden çıkış
     yolu (escapePath) başka bir kurt tarafından tamamen boşsa kurt
     o yoldan solup tahtadan çıkar. Yol doluysa reddeder (titrer).
   - Yolu kapalıysa kurt reddeder: titrer, hata sesi çalar, kalp gider.
   - 3 hatalı dokunuşta (yanma hakkı) bölüm sona erer, yeniden başlanır.
   - Amaç: tüm kurtları DOĞRU SIRAYLA dokunarak tahtadan temizlemek.

   Veri yapısı (spesifikasyondaki gibi):
   - Worm: { id, color, segments[{x,y}] (index 0 = kafa),
             escapePath[{x,y}] (kafaya komşu hücreden başlar, grid
             dışında biter), isExited }
   - Seviye JSON'u: { level, gridSize:{w,h}, worms:[...] }
   ========================================================= */

"use strict";

/* ---------------- Yardımcılar ---------------- */

const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
  r = Math.round(lerp(r, t, p)); g = Math.round(lerp(g, t, p)); b = Math.round(lerp(b, t, p));
  return `rgb(${r},${g},${b})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (_) {} }
}

/* ---------------- Sabitler ---------------- */

const DIR_VEC = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const DIRS = ["up", "right", "down", "left"];
const WORM_COLORS = ["#eef1f6"];                 // tek renk: beyaz kurtlar (siyah tahta üstünde)

/* ---------------- Ses motoru ---------------- */

const audio = {
  ctx: null, master: null, noiseBuf: null, muted: false,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  },

  tone(type, f0, f1, dur, vol, when = 0) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  whoosh() {                                        // kurt çıkışı: kayma sesi
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.35);
  },

  tick()  { this.tone("sine", 640, 540, 0.028, 0.045); },          // segment adımı
  pop()   { this.tone("sine", 520, 1240, 0.11, 0.22);
            this.tone("sine", 780, 1860, 0.09, 0.1, 0.015); },    // kurt tamamen çıktı
  deny()  { this.tone("square", 150, 110, 0.1, 0.1);
            this.tone("square", 120, 90, 0.1, 0.07, 0.05); },     // yol kapalı
  win()   { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
            this.tone("sine", f, f, 0.24, 0.22, i * 0.095)); },
  lose()  { this.tone("sawtooth", 320, 150, 0.35, 0.15);          // yanma hakkı bitti
            this.tone("sawtooth", 240, 100, 0.42, 0.11, 0.12); },
  click() { this.tone("sine", 880, 660, 0.05, 0.1); },
};

/* ---------------- Seviye üretici ---------------- */
/* Şemalı üretim — garantili doluluk ve çözülebilirlik:
   - İç bölge ([1, n-1) karesi) satır satır YATAY kurtlarla %100 doldurulur.
   - En dıştaki 1 hücrelik halka hep boş kalır: hava + çıkış koridorları orada.
   - Her satırın tek çıkış yönü (sol/sağ) vardır; alt/üst kenar satırındaki
     bazı kurtlar halkadan dikey (aşağı/yukarı) çıkar.
   - Çözülebilirlik: kurtlar "çıkış sırasının tersi" yerleştirilir. Satır
     içinde çıkışa UZAK olan önce yerleşir (yolu o an boştur); satırlar
     birbirinden bağımsız olduğundan global sıra serbestçe karıştırılır.
     Böylece ters yerleşim sırası daima bir çözümdür. */

function generateLevel(level) {
  const n = Math.min(7 + Math.floor((level - 1) / 3), 30);     // 7x7 → 30x30 (seviye 70+)
  const rng = mulberry32(level * 7919 + 101);
  const lo = 1, hi = n - 1;                                    // iç bölge: kenarda 1 hücre hava

  const rows = [];
  for (let y = lo; y < hi; y++) {
    const dirRight = rng() < 0.5;                              // satır çıkış yönü
    const edgeRow = y === lo || y === hi - 1;

    // satırı 2-6 hücrelik parçalara böl (yoğun doku için uzunlar ağırlıklı)
    const spans = [];
    let x = lo;
    while (x < hi) {
      const r = rng();
      const len = r < 0.12 ? 2 : r < 0.34 ? 3 : r < 0.58 ? 4 : r < 0.8 ? 5 : 6;
      spans.push([x, Math.min(x + len, hi) - 1]);
      x += len;
    }
    if (spans.length > 1 && spans[spans.length - 1][0] === spans[spans.length - 1][1]) {
      spans[spans.length - 2][1] = hi - 1;                     // tek hücrelik son parçayı birleştir
      spans.pop();
    }

    const row = [];
    for (const [a, b] of spans) {
      let exit = dirRight ? 1 : -1;                            // 1:sağ -1:sol 2:aşağı -2:yukarı
      if (edgeRow && rng() < 0.45) exit = y === hi - 1 ? 2 : -2;

      const headAtB = Math.abs(exit) === 2 ? rng() < 0.5 : exit === 1;
      const head = { x: headAtB ? b : a, y };
      const segments = [head];                                 // index 0 = kafa
      if (headAtB) for (let c = b - 1; c >= a; c--) segments.push({ x: c, y });
      else for (let c = a + 1; c <= b; c++) segments.push({ x: c, y });

      const escapePath = [];
      if (exit === 1) {
        for (let c = b + 1; c < n; c++) escapePath.push({ x: c, y });
        escapePath.push({ x: n, y });
      } else if (exit === -1) {
        for (let c = a - 1; c >= 0; c--) escapePath.push({ x: c, y });
        escapePath.push({ x: -1, y });
      } else if (exit === 2) {                                 // halkadan aşağı
        escapePath.push({ x: head.x, y: n - 1 }, { x: head.x, y: n });
      } else {                                                 // halkadan yukarı
        escapePath.push({ x: head.x, y: 0 }, { x: head.x, y: -1 });
      }
      row.push({ vertical: Math.abs(exit) === 2, a, b, segments, escapePath });
    }

    // satır içi yerleşim sırası: çıkışa UZAK olan (karşı uçtaki) önce yerleşir;
    // dikey çıkışlılar dahil tüm kurtlar span sırasına göre dizilir (gövde
    // hücreleri de satırda yer kapladığından sıralama herkes için bağlayıcı)
    row.sort((p, q) => dirRight ? p.a - q.a : q.b - p.b);
    rows.push(row);
  }

  // satırlar bağımsız: global yerleşim sırasını serbestçe karıştır
  const order = [];
  const pending = rows.map((_, i) => i);
  while (pending.length) {
    const i = Math.floor(rng() * pending.length);
    order.push(rows[pending[i]].shift());
    if (!rows[pending[i]].length) pending.splice(i, 1);
  }

  const worms = order.map((w, i) => ({
    id: "worm_" + (i + 1),
    color: WORM_COLORS[i % WORM_COLORS.length],
    segments: w.segments,
    escapePath: w.escapePath,
    isExited: false,
  }));
  // not: yerleşim sırası worms[0..k]; ÇIKIŞ sırası tersidir (son yerleşen ilk çıkar)
  return { level, gridSize: { w: n, h: n }, worms, mistakes: 0 };
}

/* ---------------- Doğrulama (Kural Motoru) ---------------- */
/* Kurt A'nın çıkış yolu, çıkmamış başka bir kurdun HERHANGİ bir
   segmentiyle çakışıyorsa yol kapalıdır. */

function isPathClear(levelData, worm) {
  for (const p of worm.escapePath) {
    for (const other of levelData.worms) {
      if (other === worm || other.isExited) continue;
      for (const s of other.segments)
        if (s.x === p.x && s.y === p.y) return false;
    }
  }
  return true;
}

/* ---------------- DOM & kayıt ---------------- */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const levelNumEl = document.getElementById("levelNum");
const hintEl = document.getElementById("hint");
const overlayEl = document.getElementById("overlay");
const overlayPanel = document.getElementById("overlayPanel");

const SAVE_KEY = "okbulmaca_save";

function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; }
  catch (_) { return {}; }
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ level: game.level, muted: audio.muted })); }
  catch (_) {}
}

/* ---------------- Oyun durumu ---------------- */

const game = {
  level: 1,
  state: "dealing",            // dealing | playing | won | lost
  lives: 3,                    // yanma hakkı: 3 hatalı dokunuş → bölüm sonu
  view: 300,
  dealT: 0,
  escapeTick: 0.045,
  lvl: null,                   // generateLevel çıktısı (JSON biçimi)
  anim: null,                  // { worm, pathIdx, timer } çıkış animasyonu
  shakeWorm: null,             // { worm, t } reddedilen kurt
  exitedBurst: null,           // tam çıkış parçacığı zamanı
  particles: [],
};

const livesEl = document.getElementById("lives");
function updateLives() {
  livesEl.innerHTML = [0, 1, 2]
    .map(i => `<span class="${i < game.lives ? "on" : "lost"}">❤</span>`).join("");
}

function startLevel(level) {
  game.level = level;
  game.lvl = generateLevel(level);
  game.anim = null;
  game.shakeWorm = null;
  game.particles = [];
  game.dealT = 0;
  game.state = "dealing";
  game.lives = 3;
  const wc = game.lvl.worms.length;
  game.escapeTick = wc > 120 ? 0.026 : wc > 40 ? 0.033 : ESCAPE_TICK;  // kalabalık tahta → hızlı akış

  levelNumEl.textContent = level;
  updateLives();
  hintEl.textContent = "Bir kurda dokun: yolu boşsa çıkar · 3 hata hakkın var";
  hideOverlay();
  persist();
}

/* ---------------- Parçacıklar ---------------- */

const CONFETTI_COLORS = ["#f472b6", "#34d399", "#60a5fa", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee"];

function spawnConfetti() {
  for (let i = 0; i < 110; i++) {
    game.particles.push({
      x: game.view / 2 + (Math.random() - 0.5) * game.view * 0.4,
      y: game.view * 0.38,
      vx: (Math.random() - 0.5) * 560,
      vy: -120 - Math.random() * 380,
      size: 4 + Math.random() * 7,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
      life: 1.4 + Math.random() * 0.9,
    });
  }
}

function spawnBurst(x, y, color, n = 12, speed = 220) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    game.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      size: 2.5 + Math.random() * 3.5, color,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 8,
      life: 0.5 + Math.random() * 0.35,
    });
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.vy += 720 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt; p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}

/* ---------------- Ölçüler ---------------- */

function resize() {
  const s = Math.max(220, Math.min(stage.clientWidth, stage.clientHeight));
  const dpr = window.devicePixelRatio || 1;
  game.view = s;
  canvas.style.width = s + "px";
  canvas.style.height = s + "px";
  canvas.width = Math.round(s * dpr);
  canvas.height = Math.round(s * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function metrics() {
  const S = game.view;
  const n = game.lvl.gridSize.w;
  const pad = S * 0.05;
  const cell = (S - pad * 2) / n;
  return { S, n, pad, cell };
}

function cellPx(x, y) {
  const { pad, cell } = metrics();
  return { px: pad + (x + 0.5) * cell, py: pad + (y + 0.5) * cell };
}

/* ---------------- Etkileşim: dokunma → kural motoru ---------------- */

function wormAt(x, y) {
  for (const w of game.lvl.worms) {
    if (w.isExited) continue;
    for (const s of w.segments)
      if (s.x === x && s.y === y) return w;
  }
  return null;
}

function tapWorm(worm) {
  if (game.state !== "playing" || game.anim) return;

  if (!isPathClear(game.lvl, worm)) {
    // YOL KAPALI → reddet: titreme + hata sesi + kalp kaybı
    game.lvl.mistakes++;
    game.lives--;
    updateLives();
    game.shakeWorm = { worm, t: 0.38 };
    audio.deny();
    vibrate([30, 50, 30]);
    if (game.lives <= 0) {                        // 3 hata → bölüm sona erer
      game.state = "lost";
      audio.lose();
      vibrate([60, 40, 60, 40, 140]);
      setTimeout(() => { if (game.state === "lost") showFailOverlay(); }, 700);
    }
    return;
  }

  // YOL AÇIK → kaçış animasyonu başlat
  game.anim = { worm, pathIdx: 0, timer: 0 };
  audio.whoosh();
  vibrate(12);
}

/* ---------------- Güncelleme: kaçış animasyonu (tick tabanlı) ---------------- */

const ESCAPE_TICK = 0.045;    // saniye/segment

function update(dt) {
  game.dealT += dt;
  if (game.state === "dealing" && game.dealT > 0.55) game.state = "playing";

  if (game.anim) {
    const A = game.anim;
    A.timer += dt;
    while (A.timer >= game.escapeTick) {
      A.timer -= game.escapeTick;
      // spesifikasyon: kuyruğu pop et, escapePath'in sonraki koordinatını kafaya ekle
      if (A.pathIdx < A.worm.escapePath.length) {
        A.worm.segments.unshift({ ...A.worm.escapePath[A.pathIdx++] });
        A.worm.segments.pop();
      } else {
        A.worm.segments.pop();                      // kalan gövde grid dışına akar
      }
      if (A.pathIdx % 2 === 0) audio.tick();
      if (A.worm.segments.length === 0) {           // tamamen çıktı
        A.worm.isExited = true;
        const head = A.worm.escapePath[A.worm.escapePath.length - 1];
        const p = cellPx(Math.min(Math.max(head.x, 0), game.lvl.gridSize.w - 1),
                          Math.min(Math.max(head.y, 0), game.lvl.gridSize.h - 1));
        spawnBurst(p.px, p.py, A.worm.color, 14, 240);
        audio.pop();
        game.anim = null;
        checkWin();
        break;
      }
    }
  }

  if (game.shakeWorm) {
    game.shakeWorm.t -= dt;
    if (game.shakeWorm.t <= 0) game.shakeWorm = null;
  }

  updateParticles(dt);
}

function checkWin() {
  if (game.state !== "playing") return;
  if (game.lvl.worms.every(w => w.isExited)) {
    game.state = "won";
    spawnConfetti();
    audio.win();
    vibrate([40, 60, 40]);
    setTimeout(() => { if (game.state === "won") showWinOverlay(); }, 900);
  }
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

/* ---------------- Çizim ---------------- */

function drawPanel(S) {
  roundRectPath(ctx, 0, 0, S, S, S * 0.055);
  const pg = ctx.createLinearGradient(0, 0, 0, S);
  pg.addColorStop(0, "#191922");                   // siyah zarif zemin
  pg.addColorStop(1, "#0a0a11");
  ctx.fillStyle = pg;
  ctx.fill();
}

function drawWorm(w, cell, alpha, shakeX) {
  if (w.segments.length === 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const draw = (dx, dy) => {
    // gövde: kalın, yuvarlak uçlu zincir çizgisi
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const drawChain = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let p0 = cellPx(w.segments[0].x, w.segments[0].y);
      ctx.moveTo(p0.px + dx, p0.py + dy);
      for (let i = 1; i < w.segments.length; i++) {
        const p = cellPx(w.segments[i].x, w.segments[i].y);
        ctx.lineTo(p.px + dx, p.py + dy);
      }
      ctx.stroke();
    };
    drawChain(cell * 0.62, shade(w.color, -48));   // koyu dış hat
    drawChain(cell * 0.46, w.color);                // ana renk
    drawChain(cell * 0.18, shade(w.color, 30));     // üst parlama

    // kafa: çıkış yönünü gösteren ok ucu (beyaz gövde üstünde koyu uç + beyaz kontur)
    const h = w.segments[0];
    const hp = cellPx(h.x, h.y);
    const dir = w.escapePath[0];
    const angle = Math.atan2(dir.y - h.y, dir.x - h.x);
    ctx.save();
    ctx.translate(hp.px + dx, hp.py + dy);
    ctx.rotate(angle);
    ctx.fillStyle = "#10101a";
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = cell * 0.1;
    const s = cell * 0.34;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.45, -s * 0.62);
    ctx.lineTo(-s * 0.45, s * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  };

  draw(shakeX || 0, 0);
  ctx.restore();
}

function render() {
  const { S, n, pad, cell } = metrics();
  ctx.clearRect(0, 0, S, S);
  drawPanel(S);                                    // düz siyah zemin (hücre deseni yok)

  // kurtlar (tahtaya klibelensin: grid dışına çıkan kısımlar görünmez)
  ctx.save();
  roundRectPath(ctx, 0, 0, S, S, S * 0.055);
  ctx.clip();

  const dealScale = game.state === "dealing" ? easeOutBack(clamp01(game.dealT / 0.45)) : 1;
  for (const w of game.lvl.worms) {
    if (w.isExited || w.segments.length === 0) continue;
    let shakeX = 0;
    if (game.shakeWorm && game.shakeWorm.worm === w) {
      const k = game.shakeWorm.t / 0.38;
      shakeX = Math.sin(game.shakeWorm.t * 55) * 9 * k;
    }
    drawWorm(w, cell, 1, shakeX);
    void dealScale;
  }
  ctx.restore();

  // reddedilen kurt üzerinde uyarı
  if (game.shakeWorm) {
    const w = game.shakeWorm.worm;
    const h = w.segments[Math.floor(w.segments.length / 2)];
    const p = cellPx(h.x, h.y);
    ctx.save();
    ctx.globalAlpha = clamp01(game.shakeWorm.t / 0.38) * 0.9;
    ctx.fillStyle = "#ef4444";
    ctx.font = `800 ${Math.round(cell * 0.55)}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✕", p.px, p.py);
    ctx.restore();
  }

  // parçacıklar
  for (const p of game.particles) {
    ctx.save();
    ctx.globalAlpha = clamp01(p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.72);
    ctx.restore();
  }
}

/* ---------------- Girdi ---------------- */

canvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  audio.ensure();
  if (game.state !== "playing" || game.anim) return;

  const rect = canvas.getBoundingClientRect();
  const { pad, cell } = metrics();
  const fx = (e.clientX - rect.left - pad) / cell - 0.5;   // hücre koordinatı (merkez = tam sayı)
  const fy = (e.clientY - rect.top - pad) / cell - 0.5;
  const x = Math.floor(fx + 0.5), y = Math.floor(fy + 0.5);
  if (x < -1 || y < -1 || x > game.lvl.gridSize.w || y > game.lvl.gridSize.h) return;

  let worm = (x >= 0 && y >= 0 && x < game.lvl.gridSize.w && y < game.lvl.gridSize.h)
    ? wormAt(x, y) : null;
  if (!worm) {
    // küçük ekranda parmak isabeti: baskının EN YAKIN gövdesine eşleştir
    let bestD = 0.85;
    for (const w of game.lvl.worms) {
      if (w.isExited) continue;
      for (const s of w.segments) {
        const d = Math.hypot(s.x - fx, s.y - fy);
        if (d < bestD) { bestD = d; worm = w; }
      }
    }
  }
  if (worm) tapWorm(worm);
});

canvas.addEventListener("contextmenu", e => e.preventDefault());

/* ---------------- Overlay ekranları ---------------- */

function hideOverlay() {
  overlayEl.classList.add("hidden");
  overlayPanel.innerHTML = "";
}

function showOverlay(html) {
  overlayPanel.innerHTML = html;
  overlayEl.classList.remove("hidden");
}

function showWinOverlay() {
  const m = game.lvl.mistakes;
  const stars = m === 0 ? 3 : m === 1 ? 2 : 1;
  const starHtml = [1, 2, 3].map(i => `<span class="${i <= stars ? "on" : "off"}">★</span>`).join("");
  showOverlay(`
    <div class="big-emoji">🎉</div>
    <h2>LEVEL COMPLETE!</h2>
    <div class="stars">${starHtml}</div>
    <p>Seviye ${game.level} tamamlandı${m > 0 ? ` (${m} hatalı dokunuş)` : " — kusursuz!"}</p>
    <button class="main-btn" id="btnNext">SONRAKİ SEVİYE →</button>
  `);
  document.getElementById("btnNext").addEventListener("click", () => {
    audio.click();
    startLevel(game.level + 1);
  });
}

function showFailOverlay() {
  showOverlay(`
    <div class="big-emoji">💔</div>
    <h2>BÖLÜM SONA ERDİ!</h2>
    <p>Seviye ${game.level} — 3 hatalı dokunuş yaptın, yanma hakkın bitti.</p>
    <button class="main-btn" id="btnRetry">TEKRAR DENE ↻</button>
  `);
  document.getElementById("btnRetry").addEventListener("click", () => {
    audio.click();
    startLevel(game.level);
  });
}

function showHelpOverlay() {
  showOverlay(`
    <div class="big-emoji">🐛</div>
    <h2>Nasıl Oynanır?</h2>
    <div class="rules">
      <div>🐛 Tahtada birbirine dolanmış <b>beyaz kurtlar</b> var; kafalarındaki koyu ok uçları çıkış yönlerini gösterir.</div>
      <div>👉 Bir kurda <b>dokun</b>: kafasından kenara giden yol <b>boşsa</b> kurt solup tahtadan çıkar.</div>
      <div>⛔ Yolu başka bir kurt <b>kapatıyorsa</b> reddedip titrer — önce o kurdu çıkarmalısın.</div>
      <div>💔 <b>3 hatalı dokunuş</b> hakkın var; üçüncüde bölüm sona erer ve baştan başlarsın.</div>
      <div>🧠 Doğru <b>sırayı</b> bul: tüm kurtları tahtadan temizle!</div>
      <div>⭐ Hatasız tamamlarsan 3 yıldız kazanırsın.</div>
    </div>
    <button class="main-btn" id="btnOk">ANLADIM</button>
  `);
  document.getElementById("btnOk").addEventListener("click", () => {
    audio.click();
    hideOverlay();
  });
}

/* ---------------- Üst bar düğmeleri ---------------- */

const btnSound = document.getElementById("btnSound");
function updateSoundIcon() { btnSound.textContent = audio.muted ? "🔇" : "🔊"; }

btnSound.addEventListener("click", () => {
  audio.muted = !audio.muted;
  if (!audio.muted) audio.click();
  updateSoundIcon();
  persist();
});

document.getElementById("btnRestart").addEventListener("click", () => {
  audio.click();
  startLevel(game.level);
});

document.getElementById("btnHelp").addEventListener("click", () => {
  audio.click();
  showHelpOverlay();
});

/* ---------------- Başlat ---------------- */

const saved = loadSave();
const urlLevel = parseInt((location.hash || "").slice(1), 10);   // geliştirme: #9 → seviye 9
game.level = urlLevel || saved.level || 1;
audio.muted = !!saved.muted;
updateSoundIcon();

resize();
window.addEventListener("resize", resize);
startLevel(game.level);
requestAnimationFrame(frame);
