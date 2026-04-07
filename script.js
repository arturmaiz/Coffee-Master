'use strict';

/* ============================================================
   COFFEE MASTER — script.js
   Modular, no-framework. Edit CONFIG to tweak balance.
   ============================================================ */

/* ============================================================
   CONFIG  ← all tunable values live here
   ============================================================ */
const CONFIG = {
  maxLives: 3,

  /* Scoring */
  baseScore:     100,   // points for a correct order
  speedBonusMax:  60,   // extra points for fast service
  wrongPenalty:   30,   // score lost for wrong order

  /* XP / Level */
  xpPerOrder:     25,   // base XP per correct order
  xpSpeedBonus:   15,   // extra XP for fast service
  xpToLevel: (lv) => lv * 100,   // XP needed to reach next level

  /* Customer patience (ms) */
  basePatience:  22000,
  minPatience:    7500,

  /* Customer arrival interval (ms) */
  baseArrival:    6500,
  minArrival:     2100,

  /* Queue */
  maxQueue: 5,

  /* Difficulty steps (0 = easiest, diffSteps = hardest) */
  diffSteps:     10,

  /* Which difficulty step unlocks each ingredient category */
  unlocks: {
    milk:    2,   // step >= 2 → milk options appear in orders
    syrup:   4,
    extras:  6,
    large:   3,   // step >= 3 → large size may appear
  },

  /* Customer names + avatars */
  names: [
    'Emma','Liam','Sophia','Noah','Olivia','James','Ava','William',
    'Mia','Benjamin','Charlotte','Elijah','Amelia','Lucas','Harper',
    'Mason','Evelyn','Logan','Abigail','Ethan','Isabella',
  ],
  avatars: ['☕','🧑‍💼','👩','👨','🧔','👩‍💼','🧑','👴','👩‍🎤','🧑‍🍳','👳','🧕'],

  /* Voice lines — intentionally fun/crude as requested */
  voice: {
    success: [
      "You're fucking amazing!",
      "Perfect brew, absolute legend!",
      "Nailed it!",
      "That is gorgeous!",
      "Get in! Perfect order!",
      "Flawless, coffee god!",
      "Chef's kiss!",
    ],
    fail: [
      "That's not the order!",
      "Wrong drink, chef!",
      "Try again!",
      "Bruh...",
      "Not quite right!",
    ],
    combo3: [
      "Three in a row!",
      "You're on fire!",
      "Can't stop, won't stop!",
    ],
    combo5: [
      "Five in a row! Someone stop this barista!",
      "You're a coffee god!",
      "UNSTOPPABLE!",
    ],
    levelUp: [
      "Level up! You're getting dangerous!",
      "New level! Respect!",
      "You've levelled up, absolute legend!",
    ],
    miss: [
      "They left...",
      "Lost a customer!",
    ],
    buttonCurse: [
      "What the fuck are you doing?!",
      "Holy shit, press it already!",
      "Jesus fucking Christ!",
      "Are you kidding me right now?!",
      "What in the goddamn hell?!",
      "Son of a bitch!",
      "For fuck's sake!",
      "Fucking hell!",
      "Oh shit shit shit!",
      "Motherfucker!",
      "Goddamn it!",
      "What the actual fuck?!",
      "Holy fucking shit!",
      "Christ on a cracker!",
      "You absolute bastard!",
      "Shitting hell!",
      "Bloody fucking hell!",
      "You little shit!",
      "Get your act together, asshole!",
      "What the fuck was that?!",
      "Stop fucking around!",
      "Oh for fuck's sake!",
      "Bullshit!",
      "Absolute clusterfuck!",
      "Fuck this shit!",
    ],
  },
};

/* ============================================================
   DRINK DATA
   ============================================================ */
const DRINKS = {
  sizes:  ['small', 'medium', 'large'],
  bases:  ['espresso', 'americano', 'latte', 'cappuccino', 'mocha'],
  milks:  ['none', 'whole', 'oat', 'skim'],
  syrups: ['none', 'vanilla', 'caramel', 'hazelnut'],
  extras: ['sugar', 'foam', 'cocoa', 'cinnamon'],
};

/* ============================================================
   STATE
   ============================================================ */
const State = {
  screen:    'start',
  score:     0,
  bestScore: parseInt(localStorage.getItem('cm_best') || '0', 10),
  lives:     CONFIG.maxLives,
  combo:     1,
  level:     1,
  xp:        0,
  diffStep:  0,          // 0..CONFIG.diffSteps (increases with level)
  customers: [],         // active CustomerCard objects
  drink:     {},         // current player drink build
  paused:    false,
  tid:       {},         // timer IDs: arrival, raf
  nextId:    0,
  bon:       0,          // bon counter (orders completed)
};

/* ============================================================
   AUDIO — Web Audio API (no external files)
   Rich synthesised sound effects for a warm barista game feel.
   ============================================================ */
const Audio = (() => {
  let ctx = null;
  let muted = false;

  function ctx_() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume in case browser suspended it (autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ── Oscillator tone with optional frequency sweep ── */
  function tone(freq, type, dur, vol = 0.15, freqEnd = null) {
    if (muted) return;
    try {
      const c = ctx_();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
      g.gain.setValueAtTime(0.001, c.currentTime);
      g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    } catch (_) {}
  }

  /* ── Filtered noise burst (steam / liquid / texture) ── */
  function noise(dur = 0.18, vol = 0.09, hiPass = 0, loPass = 22000) {
    if (muted) return;
    try {
      const c   = ctx_();
      const sz  = Math.ceil(c.sampleRate * dur);
      const buf = c.createBuffer(1, sz, c.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      const g   = c.createGain();
      src.buffer = buf;
      if (hiPass > 0) {
        const hp = c.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = hiPass;
        src.connect(hp); hp.connect(g);
      } else {
        src.connect(g);
      }
      if (loPass < 22000) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = loPass;
        g.connect(lp); lp.connect(c.destination);
      } else {
        g.connect(c.destination);
      }
      g.gain.setValueAtTime(0.001, c.currentTime);
      g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      src.start();
    } catch (_) {}
  }

  return {
    /* ── UI tap ── */
    click() {
      tone(880, 'sine', 0.055, 0.08);
    },

    /* ── Ingredient selected — soft brew bubble ── */
    brew() {
      noise(0.09, 0.04, 200, 3000);
      tone(110, 'sine', 0.09, 0.035);
    },

    /* ── Coffee pouring into cup ── */
    pour() {
      noise(0.38, 0.1, 400, 8000);
      tone(180, 'sine', 0.32, 0.05);
      setTimeout(() => tone(240, 'sine', 0.22, 0.04), 80);
    },

    /* ── Correct order — warm major chord cascade ── */
    success() {
      // C5–E5–G5 stagger + octave sparkle
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 'sine', 0.32, 0.14), i * 55));
      setTimeout(() => tone(1047, 'sine', 0.4, 0.08), 185);
      setTimeout(() => noise(0.12, 0.04, 1000, 8000), 60);
    },

    /* ── Wrong order — short descending buzz ── */
    fail() {
      tone(340, 'sawtooth', 0.08, 0.1, 200);
      setTimeout(() => tone(200, 'sawtooth', 0.14, 0.08), 85);
    },

    /* ── Customer left — sad low tone ── */
    miss() {
      tone(260, 'triangle', 0.32, 0.11, 200);
    },

    /* ── Combo hit — escalating ping scaled by current combo ── */
    combo() {
      const base = 580 + clamp(State.combo, 1, 8) * 45;
      tone(base, 'sine', 0.1, 0.1);
      setTimeout(() => tone(base * 1.5, 'sine', 0.14, 0.1), 72);
      setTimeout(() => noise(0.06, 0.03, 800, 6000), 30);
    },

    /* ── Machine start — pressure hum ── */
    machine() {
      // Low rumble builds then fades
      tone(55, 'sawtooth', 0.9, 0.055, 80);
      noise(0.9, 0.025, 0, 600);
      setTimeout(() => noise(0.4, 0.06, 800, 4000), 300);
    },

    /* ── Level up — pentatonic fanfare ── */
    levelup() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => {
          tone(f, 'sine', 0.32, 0.14);
          tone(f * 2, 'sine', 0.24, 0.06);
        }, i * 88);
      });
      setTimeout(() => noise(0.18, 0.04, 600, 8000), 350);
    },

    /* ── Serve button tap ── */
    serve() {
      noise(0.14, 0.1, 300, 5000);
      tone(440, 'sine', 0.1, 0.06);
    },

    /* ── Background music loop — upbeat jazz cafe vibes ── */
    bgmLoop() {
      if (muted) return;
      try {
        const c = ctx_();
        const now = c.currentTime;

        // Jazzy upbeat chord progression on bass synth
        // Cmaj7 - Fmaj7 - Dm7 - G7 pattern, 2 bar loop = 4 sec at 120 bpm
        const pattern = [
          { f: 130.81, dur: 0.5 },  // C3
          { f: 164.81, dur: 0.5 },  // E3
          { f: 196.00, dur: 0.5 },  // G3
          { f: 246.94, dur: 0.5 },  // B3
          { f: 174.61, dur: 0.5 },  // F3
          { f: 220.00, dur: 0.5 },  // A3
          { f: 246.94, dur: 0.5 },  // B3
          { f: 293.66, dur: 0.5 },  // D4
          { f: 146.83, dur: 0.5 },  // D3
          { f: 164.81, dur: 0.5 },  // E3
          { f: 196.00, dur: 0.5 },  // G3
          { f: 220.00, dur: 0.5 },  // A3
          { f: 196.00, dur: 0.5 },  // G3
          { f: 246.94, dur: 0.5 },  // B3
          { f: 293.66, dur: 0.5 },  // D4
          { f: 329.63, dur: 0.5 },  // E4
        ];

        pattern.forEach((note, i) => {
          setTimeout(() => {
            if (muted) return;
            const o = c.createOscillator();
            const g = c.createGain();
            o.connect(g); g.connect(c.destination);
            o.type = 'sine';
            o.frequency.value = note.f;
            g.gain.setValueAtTime(0.001, c.currentTime);
            g.gain.linearRampToValueAtTime(0.06, c.currentTime + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + note.dur);
            o.start(); o.stop(c.currentTime + note.dur + 0.01);
          }, (i * note.dur * 1000) % 4000);
        });
      } catch (_) {}
    },

    /* ── Toggle mute state ── */
    toggleMute() {
      muted = !muted;
      return muted;
    },

    get isMuted() { return muted; },
  };
})();

/* ============================================================
   VOICE — Web Speech API
   Intentionally fun and motivational (adults only 🎉)
   ============================================================ */
const Voice = (() => {
  let muted = false;
  let bestVoice = null;

  /* Pick the highest-quality English voice available.
     Priority: Google neural > Microsoft natural > any en-US > first available */
  function pickBestVoice() {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const prio = [
      v => /Google US English/.test(v.name),
      v => /Google/.test(v.name) && /en/.test(v.lang),
      v => /Microsoft.*Natural/.test(v.name) && /en/.test(v.lang),
      v => /Microsoft/.test(v.name) && /en-US/.test(v.lang),
      v => v.lang === 'en-US',
      v => /en/.test(v.lang),
    ];
    for (const test of prio) {
      const match = voices.find(test);
      if (match) return match;
    }
    return voices[0];
  }

  /* Load voices — they're async in most browsers */
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => { bestVoice = pickBestVoice(); };
    bestVoice = pickBestVoice(); // try immediately too
  }

  function say(text, { rate = 1.1, pitch = 1.05, vol = 1.0 } = {}) {
    if (muted || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (!bestVoice) bestVoice = pickBestVoice();
      if (bestVoice) u.voice = bestVoice;
      u.lang   = 'en-US';
      u.rate   = rate;
      u.pitch  = pitch;
      u.volume = vol;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  return {
    success()      { say(pick(CONFIG.voice.success), { rate: 1.2, pitch: 1.1 }); },
    fail()         { say(pick(CONFIG.voice.fail),    { rate: 1.1, pitch: 0.95 }); },
    combo(n)       { if (n >= 5) say(pick(CONFIG.voice.combo5)); else if (n >= 3) say(pick(CONFIG.voice.combo3)); },
    levelUp()      { say(pick(CONFIG.voice.levelUp), { rate: 1.15, pitch: 1.15 }); },
    miss()         { say(pick(CONFIG.voice.miss),    { rate: 1.0,  pitch: 0.9  }); },
    /* Fired on every button press — loud, punchy curse */
    buttonCurse()  { say(pick(CONFIG.voice.buttonCurse), { rate: 1.25, pitch: 1.1, vol: 1.0 }); },
    toggleMute()   { muted = !muted; return muted; },
  };
})();

/* ============================================================
   UTILS
   ============================================================ */
function rand(arr)         { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, lo, hi)  { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t)     { return a + (b - a) * t; }
function cap(s)            { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function $id(id)           { return document.getElementById(id); }

/* ============================================================
   SVG CUP RENDERER
   Generates a realistic ceramic mug SVG based on drink state.
   Cup shape: wide at top, slightly narrower at bottom.
   ViewBox: 0 0 200 215
   ============================================================ */

/* Gradient colours per ingredient */
const CUP_COLORS = {
  base: {
    espresso:   ['#0d0300', '#1a0600'],
    americano:  ['#251000', '#3d1a00'],
    latte:      ['#5a2e10', '#8c4e28'],
    cappuccino: ['#5a3018', '#8a5030'],
    mocha:      ['#180804', '#2a1008'],
  },
  milk: {
    whole: ['#f0e5d0', '#faf5ec'],
    oat:   ['#c8a050', '#e0c078'],
    skim:  ['#e8e8f5', '#f5f5ff'],
  },
  syrup: {
    vanilla:  ['#c8a828', '#e8c850'],
    caramel:  ['#9a4010', '#c86028'],
    hazelnut: ['#7a4010', '#a06030'],
  },
  extras: {
    foam:     ['#f5f0e5', '#fffef8'],
    cocoa:    ['#2a0e04', '#4a1e08'],
    cinnamon: ['#7a3008', '#a05020'],
    sugar:    ['#f0f0f0', '#ffffff'],
  },
};

/* Fixed foam bubble positions (normalised 0-1, no random = stable across re-renders) */
const FOAM_BUBBLES = [
  {x:.12,y:.25,r:3},{x:.28,y:.65,r:2.5},{x:.45,y:.2,r:3.5},{x:.62,y:.7,r:2},
  {x:.78,y:.35,r:3},{x:.38,y:.8,r:2.5},{x:.55,y:.45,r:2},{x:.72,y:.15,r:3},
  {x:.18,y:.55,r:2.5},{x:.88,y:.6,r:2},{x:.08,y:.8,r:2},{x:.5,y:.9,r:1.5},
];

function buildCupSVG(drink) {
  /* ── coordinate constants ── */
  const W  = 200;           // viewBox width
  const RT = 46;            // rim top y
  const IL = 54;            // inner left x at top
  const IR = 146;           // inner right x at top
  const IB = 174;           // inner bottom y
  const IH = IB - RT;      // inner height = 128

  /* Clip path for liquid area */
  const CLIP_ID = 'cc';
  const clipPath = `M${IL},${RT} L44,${IB} Q44,182 100,182 Q156,182 156,${IB} L${IR},${RT} Z`;

  /* ── build liquid layers (bottom → top) ── */
  const layers = [];
  let top = IB; // current fill top (filling up from bottom)

  // ── Coffee base ──
  if (drink.base) {
    const cols   = CUP_COLORS.base[drink.base] || ['#1a0600','#2a0e00'];
    const heights = { espresso:45, americano:88, latte:70, cappuccino:44, mocha:85 };
    const h      = heights[drink.base] || 60;
    top -= h;
    layers.push({ y: top, h, cols, cls: 'pour-anim', type: 'base', base: drink.base });
  }

  // ── Milk ──
  if (drink.milk && drink.milk !== 'none') {
    const cols = CUP_COLORS.milk[drink.milk] || ['#f0e5d0','#fff'];
    const h    = 24;
    top -= h;
    layers.push({ y: top, h, cols, cls: 'pour-anim', type: 'milk' });
  }

  // ── Syrup ──
  if (drink.syrup && drink.syrup !== 'none') {
    const cols = CUP_COLORS.syrup[drink.syrup] || ['#c8a828','#e8c850'];
    const h    = 9;
    top -= h;
    layers.push({ y: top, h, cols, cls: 'pour-anim', type: 'syrup', opacity: 0.75 });
  }

  // ── Foam (explicit or cappuccino/latte auto) ──
  const autoFoam = drink.base === 'cappuccino' || drink.base === 'latte';
  const hasFoam  = (drink.extras && drink.extras.includes('foam')) || autoFoam;
  if (hasFoam && drink.base) {
    const h = drink.base === 'cappuccino' ? 42 : 20;
    top -= h;
    layers.push({ y: top, h, cols: CUP_COLORS.extras.foam, cls: 'pour-anim', type: 'foam' });
  }

  // ── Cocoa topping ──
  if (drink.extras && drink.extras.includes('cocoa') && drink.base) {
    const h = 6;
    layers.push({ y: top - h, h, cols: CUP_COLORS.extras.cocoa, type: 'cocoa', opacity: 0.6 });
    top -= h;
  }

  // ── Cinnamon topping ──
  if (drink.extras && drink.extras.includes('cinnamon') && drink.base) {
    const h = 5;
    layers.push({ y: top - h, h, cols: CUP_COLORS.extras.cinnamon, type: 'cinnamon', opacity: 0.55 });
    top -= h;
  }

  /* ── Build SVG string ── */
  const defs = `<defs>
    <clipPath id="${CLIP_ID}"><path d="${clipPath}"/></clipPath>
    <linearGradient id="ceramic" x1="0" x2="1" y1="0" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#c8b898"/>
      <stop offset="22%"  stop-color="#f5ede0"/>
      <stop offset="50%"  stop-color="#ffffff"/>
      <stop offset="78%"  stop-color="#f5ede0"/>
      <stop offset="100%" stop-color="#c8b898"/>
    </linearGradient>
    <linearGradient id="saucer" x1="0" x2="1" y1="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#e0d0b8"/>
      <stop offset="100%" stop-color="#b8a880"/>
    </linearGradient>
    ${layers.map((l,i)=>`
    <linearGradient id="lg${i}" x1="0" x2="1" y1="0" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="${l.cols[0]}"/>
      <stop offset="50%"  stop-color="${l.cols[1]}"/>
      <stop offset="100%" stop-color="${l.cols[0]}"/>
    </linearGradient>`).join('')}
  </defs>`;

  // Saucer
  const saucer = `
    <ellipse cx="100" cy="192" rx="66" ry="9" fill="rgba(0,0,0,0.22)"/>
    <ellipse cx="100" cy="189" rx="64" ry="8" fill="url(#saucer)" stroke="#a89870" stroke-width="1.2"/>`;

  // Cup body (ceramic background)
  const body = `<path d="M${IL},${RT} L44,${IB} Q44,183 100,183 Q156,183 156,${IB} L${IR},${RT} Z"
    fill="url(#ceramic)" stroke="#b8a888" stroke-width="1.8"/>`;

  // Interior (empty = warm off-white)
  const interior = `<g clip-path="url(#${CLIP_ID})">
    <rect x="0" y="0" width="${W}" height="220" fill="${layers.length ? 'transparent' : '#f2e8d8'}"/>
    ${layers.map((l,i)=>`<rect x="0" y="${l.y}" width="${W}" height="${l.h}"
      fill="url(#lg${i})" opacity="${l.opacity||1}" class="${l.cls||''}"/>`).join('')}
    ${foamBubblesFor(layers)}
    ${cremaFor(drink, top)}
    ${latteArtFor(drink, top)}
    ${dustFor(layers)}
  </g>`;

  // Handle
  const handle = `
    <path d="M150,76 Q182,76 182,112 Q182,148 150,148"
      fill="none" stroke="url(#ceramic)" stroke-width="18" stroke-linecap="round"/>
    <path d="M150,76 Q182,76 182,112 Q182,148 150,148"
      fill="none" stroke="#b8a888" stroke-width="1.5" stroke-linecap="round"/>`;

  // Rim
  const rim = `<ellipse cx="100" cy="${RT}" rx="46" ry="8.5"
    fill="url(#ceramic)" stroke="#b8a888" stroke-width="1.5"/>`;

  // Shine
  const shine = `<line x1="64" y1="${RT+14}" x2="55" y2="${IB-8}"
    stroke="rgba(255,255,255,0.38)" stroke-width="5" stroke-linecap="round"/>`;

  // Steam (only when drink has a base)
  const steam = drink.base ? `
    <g class="cup-steam" opacity="0.55">
      <path d="M84,${RT-4} Q79,${RT-18} 84,${RT-32}" fill="none"
        stroke="rgba(245,230,204,0.55)" stroke-width="2.2" stroke-linecap="round" class="sp"/>
      <path d="M100,${RT-6} Q95,${RT-22} 100,${RT-38}" fill="none"
        stroke="rgba(245,230,204,0.45)" stroke-width="2" stroke-linecap="round" class="sp"/>
      <path d="M116,${RT-4} Q111,${RT-18} 116,${RT-32}" fill="none"
        stroke="rgba(245,230,204,0.35)" stroke-width="1.8" stroke-linecap="round" class="sp"/>
    </g>` : '';

  return `<svg viewBox="0 0 ${W} 215" xmlns="http://www.w3.org/2000/svg">
    ${defs}${saucer}${body}${interior}${handle}${rim}${shine}${steam}
  </svg>`;
}

/* ── Foam bubbles helper ── */
function foamBubblesFor(layers) {
  const foamLayer = layers.find(l => l.type === 'foam');
  if (!foamLayer) return '';
  const { y, h } = foamLayer;
  const bubbles = FOAM_BUBBLES.map(b => {
    const bx = 48 + b.x * 104;
    const by = y + b.y * (h - b.r * 2) + b.r;
    return `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${b.r}"
      fill="rgba(255,255,255,0.55)" stroke="rgba(200,180,150,0.35)" stroke-width="0.6"/>`;
  }).join('');
  return `<g clip-path="url(#cc)">${bubbles}</g>`;
}

/* ── Espresso crema swirl ── */
function cremaFor(drink, liquidTop) {
  if (drink.base !== 'espresso' || !drink.base) return '';
  return `<g clip-path="url(#cc)">
    <ellipse cx="100" cy="${liquidTop + 7}" rx="38" ry="5.5"
      fill="rgba(180,100,8,0.45)" class="pour-anim"/>
    <path d="M65,${liquidTop+7} Q100,${liquidTop+2} 135,${liquidTop+7}"
      stroke="rgba(220,140,20,0.5)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </g>`;
}

/* ── Latte art (simple heart) ── */
function latteArtFor(drink, liquidTop) {
  if (drink.base !== 'latte') return '';
  const y = liquidTop + 6;
  return `<g clip-path="url(#cc)" opacity="0.5">
    <path d="M90,${y+10} Q82,${y+2} 90,${y} Q100,${y+8} 110,${y} Q118,${y+2} 110,${y+10} L100,${y+22} Z"
      fill="rgba(140,70,20,0.55)"/>
  </g>`;
}

/* ── Cocoa / cinnamon dust dots ── */
function dustFor(layers) {
  const dustLayer = layers.find(l => l.type === 'cocoa' || l.type === 'cinnamon');
  if (!dustLayer) return '';
  const col = dustLayer.type === 'cocoa'
    ? 'rgba(40,12,0,0.65)'
    : 'rgba(120,48,10,0.55)';
  const dots = Array.from({length:18}, (_,i) => {
    const dx = 48 + (i / 17) * 104;
    const dy = dustLayer.y + 2 + (i % 3);
    return `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="1.2" fill="${col}"/>`;
  }).join('');
  return `<g clip-path="url(#cc)">${dots}</g>`;
}

/* ============================================================
   ORDER GENERATION
   ============================================================ */
function generateOrder() {
  const t = clamp(State.diffStep / CONFIG.diffSteps, 0, 1);
  const u = CONFIG.unlocks;

  // Size
  const sizePool = State.diffStep >= u.large ? DRINKS.sizes : ['small','medium'];
  const size = rand(sizePool);

  // Base (always required)
  const base = rand(DRINKS.bases);

  // Milk (unlocked at diffStep >= unlocks.milk)
  let milk = 'none';
  if (State.diffStep >= u.milk) milk = rand(DRINKS.milks);

  // Syrup
  let syrup = 'none';
  if (State.diffStep >= u.syrup) syrup = rand(DRINKS.syrups);

  // Extras (0-2 depending on difficulty)
  let extras = [];
  if (State.diffStep >= u.extras) {
    const maxExtras = Math.floor(lerp(0, 2, t));
    const pool = [...DRINKS.extras];
    for (let i = 0; i < maxExtras; i++) {
      if (!pool.length) break;
      extras.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
  }

  // Patience scales with difficulty
  const patience = lerp(CONFIG.basePatience, CONFIG.minPatience, t);

  return { size, base, milk, syrup, extras, patience };
}

/* ============================================================
   CUSTOMER QUEUE
   ============================================================ */
function spawnCustomer() {
  if (State.paused || State.screen !== 'game') return;
  if (State.customers.length >= CONFIG.maxQueue) return;

  const order    = generateOrder();
  const name     = rand(CONFIG.names);
  const avatar   = rand(CONFIG.avatars);
  const id       = State.nextId++;
  const created  = performance.now();

  const customer = { id, name, avatar, order, created };
  State.customers.push(customer);
  renderCustomerCard(customer);
  markFirstCard();
}

function scheduleNextSpawn() {
  clearTimeout(State.tid.arrival);
  const t    = clamp(State.diffStep / CONFIG.diffSteps, 0, 1);
  const rate = lerp(CONFIG.baseArrival, CONFIG.minArrival, t);
  State.tid.arrival = setTimeout(() => {
    spawnCustomer();
    scheduleNextSpawn();
  }, rate);
}

/* Remove customer from State and DOM */
function removeCustomer(id, animClass) {
  const idx = State.customers.findIndex(c => c.id === id);
  if (idx === -1) return;
  State.customers.splice(idx, 1);
  const el = document.getElementById(`ccard-${id}`);
  if (el) {
    el.classList.add(animClass);
    setTimeout(() => el.remove(), 450);
  }
  markFirstCard();
}

function markFirstCard() {
  document.querySelectorAll('.cust-card').forEach((el, i) => {
    el.classList.toggle('is-first', i === 0);
  });
}

/* Render one customer card into the queue */
function renderCustomerCard(customer) {
  const placeholder = $id('queue-placeholder');
  if (placeholder) placeholder.remove();

  const { id, name, avatar, order } = customer;
  const extrasText = order.extras.length ? order.extras.map(cap).join(', ') : '';
  const milkText   = order.milk  !== 'none' ? `${cap(order.milk)} milk` : '';
  const syrupText  = order.syrup !== 'none' ? cap(order.syrup) : '';
  const subParts   = [milkText, syrupText, extrasText].filter(Boolean).join(' · ');

  const el = document.createElement('div');
  el.className = 'cust-card';
  el.id = `ccard-${id}`;
  el.innerHTML = `
    <div class="card-header">
      <span class="card-avatar">${avatar}</span>
      <span class="card-name">${name}</span>
    </div>
    <div class="card-drink">${cap(order.size)} ${cap(order.base)}</div>
    ${subParts ? `<div class="card-extras">${subParts}</div>` : ''}
    <div class="card-reqs" id="creqs-${id}"></div>
    <div class="card-patience"><div class="card-patience-fill" id="cpat-${id}"></div></div>
  `;
  $id('queue-scroll').appendChild(el);
  buildReqDots(id, order);
}

/* Req dots — one dot per requirement */
function buildReqDots(customerId, order) {
  const container = $id(`creqs-${customerId}`);
  if (!container) return;
  const reqs = orderToReqs(order);
  container.innerHTML = reqs.map(r =>
    `<div class="req-dot" data-req="${r.key}" title="${r.label}"></div>`
  ).join('');
}

/* Flat list of {key, label} for an order */
function orderToReqs(order) {
  const list = [
    { key: `size:${order.size}`,   label: cap(order.size) },
    { key: `base:${order.base}`,   label: cap(order.base) },
  ];
  if (order.milk  !== 'none') list.push({ key: `milk:${order.milk}`,   label: cap(order.milk) + ' milk' });
  if (order.syrup !== 'none') list.push({ key: `syrup:${order.syrup}`, label: cap(order.syrup) });
  order.extras.forEach(e => list.push({ key: `extra:${e}`, label: cap(e) }));
  return list;
}

/* Light up dots that match the current drink build */
function syncReqDots() {
  const d = State.drink;
  State.customers.forEach(c => {
    const container = $id(`creqs-${c.id}`);
    if (!container) return;
    container.querySelectorAll('.req-dot').forEach(dot => {
      const [type, value] = dot.dataset.req.split(':');
      let hit = false;
      if (type === 'size')  hit = d.size  === value;
      if (type === 'base')  hit = d.base  === value;
      if (type === 'milk')  hit = d.milk  === value;
      if (type === 'syrup') hit = d.syrup === value;
      if (type === 'extra') hit = d.extras && d.extras.includes(value);
      dot.classList.toggle('hit', hit);
    });
  });
}

/* Patience RAF loop */
function patienceTick(now) {
  if (State.screen === 'game' && !State.paused) {
    State.customers.forEach(c => {
      const pct = clamp(1 - (now - c.created) / c.order.patience, 0, 1);
      const bar = $id(`cpat-${c.id}`);
      if (bar) {
        bar.style.width = (pct * 100) + '%';
        bar.className = 'card-patience-fill' + (pct < 0.2 ? ' danger' : pct < 0.45 ? ' warn' : '');
      }
      const card = $id(`ccard-${c.id}`);
      if (card) {
        card.classList.toggle('warn-patience',  pct < 0.45 && pct >= 0.2);
        card.classList.toggle('angry-patience', pct < 0.2);
      }
      if (pct <= 0) customerExpired(c.id);
    });
  }
  State.tid.raf = requestAnimationFrame(patienceTick);
}

function customerExpired(id) {
  removeCustomer(id, 'leaving');
  Audio.miss();
  Voice.miss();
  loseLife();
  if (CONFIG.comboResetOnMiss !== false) {
    State.combo = 1;
    updateCombo();
  }
}

/* ============================================================
   DRINK BUILDER
   ============================================================ */
const DrinkBuilder = {
  reset() {
    State.drink = { size: null, base: null, milk: 'none', syrup: 'none', extras: [] };
    document.querySelectorAll('.ing-btn').forEach(b => b.classList.remove('sel'));
    updateCup();
    updateBuildTags();
    syncReqDots();
  },

  set(type, value) {
    Audio.pour();
    const d = State.drink;
    if (type === 'size')  d.size  = value;
    if (type === 'base')  d.base  = value;
    if (type === 'milk')  d.milk  = value;
    if (type === 'syrup') d.syrup = value;
    if (type === 'extra') {
      const idx = d.extras.indexOf(value);
      if (idx === -1) d.extras.push(value);
      else d.extras.splice(idx, 1);
    }

    // Sync button states
    if (['size','base','milk','syrup'].includes(type)) {
      document.querySelectorAll(`[data-type="${type}"]`).forEach(b =>
        b.classList.toggle('sel', b.dataset.value === value));
    } else {
      const btn = document.querySelector(`.ing-btn[data-value="${value}"]`);
      if (btn) btn.classList.toggle('sel', d.extras.includes(value));
    }

    updateCup();
    updateBuildTags();
    syncReqDots();
  },
};

/* ============================================================
   SERVE LOGIC
   ============================================================ */
function serve() {
  if (State.customers.length === 0) {
    showToast('No orders!', false); return;
  }
  const d = State.drink;
  if (!d.size || !d.base) {
    showToast('Incomplete!', false); Audio.fail(); return;
  }

  const customer = State.customers[0];
  const order    = customer.order;
  const correct  = drinksMatch(d, order);

  if (correct) {
    const elapsed   = performance.now() - customer.created;
    const speedPct  = clamp(1 - elapsed / order.patience, 0, 1);
    const pts       = CONFIG.baseScore + Math.round(speedPct * CONFIG.speedBonusMax);
    const total     = pts * State.combo;
    gainScore(total);
    gainXP(CONFIG.xpPerOrder + Math.round(speedPct * CONFIG.xpSpeedBonus));

    State.bon++;
    updateBon();
    State.combo = Math.min(State.combo + 1, 8);
    updateCombo();
    Audio.success();
    Audio.serve();
    Voice.success();
    Voice.combo(State.combo);

    showToast(`+${total}`, true);
    removeCustomer(customer.id, 'correct');
  } else {
    loseScore(CONFIG.wrongPenalty);
    State.combo = 1;
    updateCombo();
    Audio.fail();
    Voice.fail();
    showToast('Wrong order!', false);
    // Flash card
    const card = $id(`ccard-${customer.id}`);
    if (card) {
      card.classList.add('wrong-flash');
      setTimeout(() => card.classList.remove('wrong-flash'), 520);
    }
  }

  DrinkBuilder.reset();
}

/* Compare player drink to order */
function drinksMatch(d, order) {
  if (d.size  !== order.size)  return false;
  if (d.base  !== order.base)  return false;
  if (d.milk  !== order.milk)  return false;
  if (d.syrup !== order.syrup) return false;
  const a = [...d.extras].sort();
  const b = [...order.extras].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/* ============================================================
   SCORING
   ============================================================ */
function gainScore(n) {
  State.score += n;
  $id('score-num').textContent = State.score.toLocaleString();
}
function loseScore(n) {
  State.score = Math.max(0, State.score - n);
  $id('score-num').textContent = State.score.toLocaleString();
}
function loseLife() {
  State.lives = Math.max(0, State.lives - 1);
  renderHearts();
  if (State.lives <= 0) endGame();
}

/* ============================================================
   XP / LEVELS
   ============================================================ */
function gainXP(amount) {
  State.xp += amount;
  const needed = CONFIG.xpToLevel(State.level);
  if (State.xp >= needed) {
    State.xp -= needed;
    State.level++;
    State.diffStep = Math.min(State.level - 1, CONFIG.diffSteps);
    showLevelUp();
    scheduleNextSpawn(); // refresh arrival rate
    Audio.levelup();
    Voice.levelUp();
  }
  updateXP();
}
function updateXP() {
  const needed = CONFIG.xpToLevel(State.level);
  $id('xp-fill').style.width = (clamp(State.xp / needed, 0, 1) * 100) + '%';
  $id('hud-lv').textContent = State.level;
}

function updateBon() {
  const bonEl = $id('bon-counter');
  if (bonEl) {
    bonEl.querySelector('.bon-count').textContent = State.bon;
  }
}

/* ============================================================
   UI RENDERERS
   ============================================================ */

/* Cup SVG */
function updateCup() {
  $id('cup-wrap').innerHTML = buildCupSVG(State.drink);
  // Pulse machine dot
  const dot = $id('machine-dot');
  dot.className = 'machine-status-dot busy';
  setTimeout(() => { dot.className = 'machine-status-dot on'; }, 400);
}

/* Build tags beneath cup */
function updateBuildTags() {
  const d    = State.drink;
  const tags = $id('build-tags');
  const parts = [];
  if (d.size)                  parts.push(cap(d.size));
  if (d.base)                  parts.push(cap(d.base));
  if (d.milk  && d.milk  !== 'none') parts.push(cap(d.milk) + ' milk');
  if (d.syrup && d.syrup !== 'none') parts.push(cap(d.syrup));
  d.extras && d.extras.forEach(e => parts.push(cap(e)));

  if (!parts.length) {
    tags.innerHTML = '<span class="build-hint">← select ingredients below</span>';
    return;
  }
  // Highlight tags that match the first customer's order
  const firstOrder = State.customers[0]?.order;
  tags.innerHTML = parts.map((p, i) => {
    // Map index back to key for matching
    const key = tagKey(d, i);
    const hit  = firstOrder && keyMatchesOrder(key, firstOrder);
    return `<span class="btag${hit ? ' hit' : ''}">${p}</span>`;
  }).join('');
}

function tagKey(d, idx) {
  const keys = [];
  if (d.size)                        keys.push(`size:${d.size}`);
  if (d.base)                        keys.push(`base:${d.base}`);
  if (d.milk  && d.milk  !== 'none') keys.push(`milk:${d.milk}`);
  if (d.syrup && d.syrup !== 'none') keys.push(`syrup:${d.syrup}`);
  d.extras && d.extras.forEach(e => keys.push(`extra:${e}`));
  return keys[idx] || '';
}
function keyMatchesOrder(key, order) {
  if (!key) return false;
  const [type, value] = key.split(':');
  if (type === 'size')  return order.size  === value;
  if (type === 'base')  return order.base  === value;
  if (type === 'milk')  return order.milk  === value;
  if (type === 'syrup') return order.syrup === value;
  if (type === 'extra') return order.extras.includes(value);
  return false;
}

/* Hearts */
function renderHearts() {
  $id('hud-hearts').innerHTML = Array.from({ length: CONFIG.maxLives }, (_, i) =>
    `<span class="heart${i >= State.lives ? ' lost' : ''}">♥</span>`
  ).join('');
}

/* Combo */
function updateCombo() {
  const wrap = $id('combo-wrap');
  $id('combo-num').textContent = `×${State.combo}`;
  wrap.className = 'hud-combo' +
    (State.combo >= 5 ? ' xmax' : State.combo === 4 ? ' x4' : State.combo === 3 ? ' x3' : State.combo >= 2 ? ' x2' : '');
  if (State.combo > 1) {
    wrap.classList.add('pop');
    setTimeout(() => wrap.classList.remove('pop'), 320);
  }
}

/* Toast */
let toastTimer = null;
function showToast(text, ok) {
  const el = $id('toast');
  el.textContent = text;
  el.className   = 'toast';
  void el.offsetWidth; // reflow
  el.classList.add(ok ? 'ok' : 'bad');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 900);
}

/* Level up overlay (auto-dismisses) */
function showLevelUp() {
  State.paused = true;
  $id('lu-num').textContent  = `Level ${State.level}`;
  $id('lu-desc').textContent = levelUpDesc(State.level);
  $id('levelup-screen').classList.add('active');
  $id('levelup-screen').removeAttribute('aria-hidden');
  setTimeout(() => {
    $id('levelup-screen').classList.remove('active');
    $id('levelup-screen').setAttribute('aria-hidden', 'true');
    State.paused = false;
  }, 2600);
}

function levelUpDesc(lv) {
  if (lv === 2) return 'Milk options unlocked!';
  if (lv === 3) return 'Large size available!';
  if (lv === 4) return 'Syrups unlocked!';
  if (lv === 5) return 'Customers are getting impatient…';
  if (lv === 6) return 'Extra toppings unlocked!';
  if (lv === 8) return 'Rush hour! Stay sharp.';
  if (lv === 10) return "You're a Coffee Master!";
  return 'It\'s getting busy in here…';
}

/* ============================================================
   GAME FLOW
   ============================================================ */
function showScreen(name) {
  document.querySelectorAll('.screen:not(#levelup-screen)').forEach(s => {
    s.classList.remove('active');
    s.setAttribute('aria-hidden', 'true');
  });
  const el = $id(`${name}-screen`);
  if (el) {
    el.classList.add('active');
    el.removeAttribute('aria-hidden');
  }
  State.screen = name;
}

function startGame() {
  // Reset state
  Object.assign(State, {
    score: 0, lives: CONFIG.maxLives, combo: 1,
    level: 1, xp: 0, diffStep: 0,
    customers: [], paused: false, nextId: 0, bon: 0,
  });

  // Clear DOM
  $id('queue-scroll').innerHTML = '<div class="queue-placeholder" id="queue-placeholder">☕ Waiting for the first customer…</div>';

  // Reset HUD
  $id('score-num').textContent = '0';
  renderHearts();
  updateCombo();
  updateXP();
  updateBon();
  $id('machine-dot').className = 'machine-status-dot on';

  // Reset drink
  DrinkBuilder.reset();

  showScreen('game');

  // Machine startup sound
  setTimeout(() => Audio.machine(), 120);

  // Start background music loop (4 sec pattern)
  State.tid.bgm = setInterval(() => Audio.bgmLoop(), 4000);
  Audio.bgmLoop();

  // Cancel old timers
  clearTimeout(State.tid.arrival);
  cancelAnimationFrame(State.tid.raf);

  // Spawn first customer immediately, then schedule loop
  setTimeout(spawnCustomer, 800);
  scheduleNextSpawn();

  // Patience ticker
  State.tid.raf = requestAnimationFrame(patienceTick);
}

function pauseGame() {
  State.paused = true;
  $id('pause-screen').classList.add('active');
  $id('pause-screen').removeAttribute('aria-hidden');
}
function resumeGame() {
  State.paused = false;
  $id('pause-screen').classList.remove('active');
  $id('pause-screen').setAttribute('aria-hidden', 'true');
}

function endGame() {
  clearTimeout(State.tid.arrival);
  clearInterval(State.tid.bgm);
  cancelAnimationFrame(State.tid.raf);
  if (State.score > State.bestScore) {
    State.bestScore = State.score;
    localStorage.setItem('cm_best', State.bestScore);
  }
  $id('go-score').textContent = State.score.toLocaleString();
  $id('go-level').textContent = State.level;
  $id('go-best').textContent  = State.bestScore.toLocaleString();
  showScreen('gameover');
}

function goToMenu() {
  clearTimeout(State.tid.arrival);
  cancelAnimationFrame(State.tid.raf);
  $id('start-best').textContent = State.bestScore.toLocaleString();
  showScreen('start');
}

/* ============================================================
   EVENT LISTENERS + INIT
   ============================================================ */
function init() {
  // Seed best score
  $id('start-best').textContent = State.bestScore.toLocaleString();

  // Start / restart / menu
  $id('play-btn').addEventListener('click',    () => { Audio.click(); Voice.buttonCurse(); startGame(); });
  $id('restart-btn').addEventListener('click', () => { Audio.click(); Voice.buttonCurse(); startGame(); });
  $id('menu-btn').addEventListener('click',    () => { Audio.click(); Voice.buttonCurse(); goToMenu(); });

  // Pause
  $id('pause-btn').addEventListener('click',  () => { Audio.click(); Voice.buttonCurse(); pauseGame(); });
  $id('resume-btn').addEventListener('click', () => { Audio.click(); Voice.buttonCurse(); resumeGame(); });
  $id('quit-btn').addEventListener('click',   () => { Audio.click(); Voice.buttonCurse(); goToMenu(); });

  // Serve + Clear
  $id('serve-btn').addEventListener('click', () => { Audio.click(); Voice.buttonCurse(); serve(); });
  $id('clear-btn').addEventListener('click', () => { Audio.click(); Voice.buttonCurse(); DrinkBuilder.reset(); });

  // Mute toggle
  $id('mute-btn').addEventListener('click', () => {
    const nowMuted = Audio.toggleMute();
    Voice.toggleMute();
    const btn = $id('mute-btn');
    btn.textContent = nowMuted ? '🔇' : '🔊';
    btn.classList.toggle('muted', nowMuted);
  });

  // Ingredient buttons — play brew sound + curse on each tap
  document.querySelectorAll('.ing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (State.screen !== 'game' || State.paused) return;
      Audio.brew();
      Voice.buttonCurse();
      DrinkBuilder.set(btn.dataset.type, btn.dataset.value);
    });
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
      if (State.screen === 'game' && !State.paused) pauseGame();
      else if (State.paused) resumeGame();
    }
    if (e.key === 'Enter' && State.screen === 'game' && !State.paused) serve();
    if (e.key.toLowerCase() === 'm') $id('mute-btn').click();
  });

  // Initial empty cup
  $id('cup-wrap').innerHTML = buildCupSVG({});

  showScreen('start');
}

document.addEventListener('DOMContentLoaded', init);
