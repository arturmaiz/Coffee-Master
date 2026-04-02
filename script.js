/* ============================================================
   COFFEE MASTER — Game Script
   Clean, modular, fully commented
   ============================================================ */

'use strict';

/* ============================================================
   CONSTANTS & BALANCE TWEAKS
   Edit these values to adjust difficulty, scoring, etc.
   ============================================================ */
const CONFIG = {
  // Lives / reputation
  maxLives: 3,

  // Scoring
  baseScore:        120,   // Points for a correct order
  speedBonusMax:    80,    // Extra points for very fast service
  wrongOrderPenalty:30,    // Score lost for wrong order
  missedOrderPenalty:0,    // Score lost when customer leaves (lives handled separately)

  // Combo
  comboResetOnMiss: true,  // Reset combo if customer leaves angry

  // Timing (milliseconds)
  basePatience:     22000, // Starting patience per customer
  minPatience:      8000,  // Minimum patience at max difficulty
  baseArrivalRate:  6000,  // ms between new customers (start)
  minArrivalRate:   2200,  // ms between new customers (min)

  // Queue
  maxQueueSize:     5,

  // Difficulty ramp
  difficultyInterval: 18000, // ms between difficulty ticks
  difficultySteps:    10,    // Total steps until max difficulty

  // Order complexity per difficulty step
  complexityThreshold: { milk:2, syrup:4, extra:6, large:1 },
  // step >= threshold before that category appears in orders

  // Customer name pool
  names: [
    'Emma','Liam','Sophia','Noah','Olivia','James','Ava','William',
    'Mia','Benjamin','Charlotte','Elijah','Amelia','Lucas','Harper',
    'Mason','Evelyn','Logan','Abigail','Ethan'
  ],
};

/* ============================================================
   DRINK DEFINITIONS
   Each property group defines what can appear in orders.
   ============================================================ */
const DRINK = {
  sizes:   ['small','medium','large'],
  bases:   ['espresso','americano','latte','cappuccino','mocha'],
  milks:   ['none','whole','oat','skim'],
  syrups:  ['none','vanilla','caramel','hazelnut'],
  extras:  ['sugar','foam','cocoa','cinnamon'], // toggles
};

/* Layer colours match .layer-* CSS classes */
const LAYER_SIZES = { // height in px per layer inside cup
  base: 32, milk: 18, syrup: 10, extra: 8,
};

/* ============================================================
   GAME STATE
   ============================================================ */
const State = {
  screen:       'start',   // 'start' | 'game' | 'pause' | 'gameover'
  score:        0,
  bestScore:    parseInt(localStorage.getItem('coffeemaster_best') || '0'),
  lives:        CONFIG.maxLives,
  combo:        1,
  diffLevel:    0,         // 0..difficultySteps
  rushPct:      0,         // 0..1, shown on rush bar
  customers:    [],        // active order cards
  currentDrink: {},        // player's current build
  paused:       false,

  // Timers
  arrivalTimer:    null,
  difficultyTimer: null,
  patienceRafId:   null,
  nextCustomerId:  0,
};

/* ============================================================
   AUDIO (Web Audio API — no files needed)
   ============================================================ */
const Audio = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function beep(freq, type, dur, vol = 0.18) {
    try {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(); o.stop(c.currentTime + dur);
    } catch(e) {}
  }

  function noise(dur = 0.15, vol = 0.08) {
    try {
      const c = getCtx();
      const bufSize = c.sampleRate * dur;
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      const g = c.createGain();
      src.buffer = buf; src.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      src.start();
    } catch(e) {}
  }

  return {
    click:   () => beep(900, 'sine', 0.06, 0.12),
    pour:    () => noise(0.25, 0.1),
    success: () => { beep(600,'sine',0.12,0.18); setTimeout(()=>beep(900,'sine',0.18,0.18),100); },
    fail:    () => { beep(220,'sawtooth',0.18,0.18); setTimeout(()=>beep(160,'sawtooth',0.2,0.15),100); },
    miss:    () => beep(280, 'triangle', 0.3, 0.15),
    combo:   () => { beep(800,'sine',0.1,0.12); setTimeout(()=>beep(1100,'sine',0.14,0.14),90); },
  };
})();

/* ============================================================
   UTILITY
   ============================================================ */
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

/* ============================================================
   ORDER GENERATION
   Builds a random order appropriate for current difficulty.
   ============================================================ */
function generateOrder() {
  const t = clamp(State.diffLevel / CONFIG.difficultySteps, 0, 1);
  const thresh = CONFIG.complexityThreshold;

  // Size: large only available after threshold
  let sizePool = State.diffLevel >= thresh.large
    ? DRINK.sizes
    : ['small','medium'];
  const size = rand(sizePool);

  const base = rand(DRINK.bases);

  // Milk: available after threshold
  let milk = 'none';
  if (State.diffLevel >= thresh.milk) {
    milk = rand(DRINK.milks);
  }

  // Syrup: available after threshold
  let syrup = 'none';
  if (State.diffLevel >= thresh.syrup) {
    syrup = rand(DRINK.syrups);
  }

  // Extras: available after threshold, pick 0–2 based on difficulty
  let extras = [];
  if (State.diffLevel >= thresh.extra) {
    const maxExtras = Math.floor(lerp(0, 2, t));
    const pool = [...DRINK.extras];
    for (let i = 0; i < maxExtras; i++) {
      if (pool.length === 0) break;
      const idx = Math.floor(Math.random() * pool.length);
      extras.push(pool.splice(idx, 1)[0]);
    }
  }

  // Patience scales with difficulty
  const patience = lerp(CONFIG.basePatience, CONFIG.minPatience, t);

  return { size, base, milk, syrup, extras, patience };
}

/* ============================================================
   CUSTOMER SYSTEM
   ============================================================ */
function spawnCustomer() {
  if (State.paused || State.screen !== 'game') return;
  if (State.customers.length >= CONFIG.maxQueueSize) return;

  const order   = generateOrder();
  const name    = rand(CONFIG.names);
  const id      = State.nextCustomerId++;
  const created = performance.now();

  const customer = { id, name, order, created, patience: order.patience, element: null };

  State.customers.push(customer);
  renderOrderCard(customer);
}

function scheduleNextCustomer() {
  clearTimeout(State.arrivalTimer);
  const t = clamp(State.diffLevel / CONFIG.difficultySteps, 0, 1);
  const rate = lerp(CONFIG.baseArrivalRate, CONFIG.minArrivalRate, t);
  State.arrivalTimer = setTimeout(() => {
    spawnCustomer();
    scheduleNextCustomer();
  }, rate);
}

/* ============================================================
   PATIENCE / TICKER
   Runs every frame via requestAnimationFrame to update
   patience bars and handle customer expiry.
   ============================================================ */
function patienceTick(now) {
  if (State.paused || State.screen !== 'game') {
    State.patienceRafId = requestAnimationFrame(patienceTick);
    return;
  }

  State.customers.forEach(c => {
    const elapsed = now - c.created;
    const pct = clamp(1 - elapsed / c.patience, 0, 1);

    // Update bar
    const bar = document.getElementById(`pbar-${c.id}`);
    if (bar) {
      bar.style.width = (pct * 100) + '%';
      bar.className = 'patience-bar' + (pct < 0.25 ? ' urgent' : pct < 0.55 ? ' warn' : '');
    }

    // Live req-tag highlighting
    highlightMatchedTags(c.id);

    // Expired?
    if (pct <= 0) {
      customerLeaves(c.id, false);
    }
  });

  State.patienceRafId = requestAnimationFrame(patienceTick);
}

/* ============================================================
   DRINK BUILDER
   Manages the player's current drink selection.
   ============================================================ */
const DrinkBuilder = {
  reset() {
    State.currentDrink = { size: null, base: null, milk: 'none', syrup: 'none', extras: [] };
    renderCup();
    this.clearSelections();
  },

  setIngredient(type, value) {
    Audio.pour();
    if (type === 'size')  State.currentDrink.size  = value;
    if (type === 'base')  State.currentDrink.base  = value;
    if (type === 'milk')  State.currentDrink.milk  = value;
    if (type === 'syrup') State.currentDrink.syrup = value;

    if (type === 'sugar' || type === 'foam' || type === 'topping') {
      const extras = State.currentDrink.extras;
      const idx = extras.indexOf(value);
      if (idx === -1) extras.push(value);
      else            extras.splice(idx, 1);
    }

    renderCup();
    this.syncButtons(type, value);

    // Live-highlight matching cards
    State.customers.forEach(c => highlightMatchedTags(c.id));
  },

  syncButtons(type, value) {
    // For radio-style groups: deselect siblings
    if (['size','base','milk','syrup'].includes(type)) {
      document.querySelectorAll(`[data-type="${type}"]`).forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === value);
      });
    } else {
      // Toggle-style extras
      const btn = document.querySelector(`.ingredient-btn[data-value="${value}"]`);
      if (btn) btn.classList.toggle('selected', State.currentDrink.extras.includes(value));
    }
  },

  clearSelections() {
    document.querySelectorAll('.ingredient-btn').forEach(b => b.classList.remove('selected'));
  },
};

/* ============================================================
   SERVE LOGIC
   Checks player's drink against the oldest (first) order.
   ============================================================ */
function serveDrink() {
  if (State.customers.length === 0) {
    showFeedback('No orders!', false);
    return;
  }

  const d = State.currentDrink;
  if (!d.size || !d.base) {
    showFeedback('Incomplete!', false);
    Audio.fail();
    return;
  }

  // Find first customer
  const customer = State.customers[0];
  const order    = customer.order;

  const correct = matchesOrder(d, order);

  if (correct) {
    const elapsed = performance.now() - customer.created;
    const speedPct = clamp(1 - elapsed / order.patience, 0, 1);
    const bonus = Math.round(speedPct * CONFIG.speedBonusMax);
    const points = CONFIG.baseScore + bonus;
    gainScore(points * State.combo);

    State.combo = Math.min(State.combo + 1, 8);
    updateComboDisplay();
    Audio.success();
    if (State.combo > 2) Audio.combo();

    showFeedback(`+${points * (State.combo - 1 > 1 ? State.combo - 1 : 1)} ✓`, true);
    customerLeaves(customer.id, true);
  } else {
    loseScore(CONFIG.wrongOrderPenalty);
    State.combo = 1;
    updateComboDisplay();
    Audio.fail();
    showFeedback('Wrong order!', false);
    flashCard(customer.id);
  }

  DrinkBuilder.reset();
}

/* Returns true if the player's drink matches the order */
function matchesOrder(drink, order) {
  if (drink.size  !== order.size)  return false;
  if (drink.base  !== order.base)  return false;
  if (drink.milk  !== order.milk)  return false;
  if (drink.syrup !== order.syrup) return false;
  // Extras: same set, order-independent
  const a = [...drink.extras].sort();
  const b = [...order.extras].sort();
  return a.length === b.length && a.every((v,i) => v === b[i]);
}

/* ============================================================
   CUSTOMER LIFECYCLE
   ============================================================ */
function customerLeaves(id, served) {
  const idx = State.customers.findIndex(c => c.id === id);
  if (idx === -1) return;

  const customer = State.customers[idx];
  State.customers.splice(idx, 1);

  const el = customer.element;
  if (el) {
    el.classList.add(served ? 'served' : 'expired');
    setTimeout(() => el.remove(), 420);
  }

  if (!served) {
    Audio.miss();
    loseLife();
    if (CONFIG.comboResetOnMiss) {
      State.combo = 1;
      updateComboDisplay();
    }
  }
}

/* ============================================================
   SCORING
   ============================================================ */
function gainScore(amount) {
  State.score += amount;
  updateScoreDisplay();
}

function loseScore(amount) {
  State.score = Math.max(0, State.score - amount);
  updateScoreDisplay();
}

function loseLife() {
  State.lives--;
  renderHearts();
  if (State.lives <= 0) endGame();
}

/* ============================================================
   DIFFICULTY SCALING
   ============================================================ */
function startDifficultyRamp() {
  clearInterval(State.difficultyTimer);
  State.difficultyTimer = setInterval(() => {
    if (State.paused || State.screen !== 'game') return;
    if (State.diffLevel < CONFIG.difficultySteps) {
      State.diffLevel++;
      updateRushBar();
    }
  }, CONFIG.difficultyInterval);
}

function updateRushBar() {
  const pct = (State.diffLevel / CONFIG.difficultySteps) * 100;
  const bar = document.getElementById('rush-bar');
  bar.style.width = pct + '%';
  bar.className = 'rush-bar' + (pct >= 100 ? ' max' : pct >= 60 ? ' hot' : '');
}

/* ============================================================
   UI RENDERING
   ============================================================ */

/* --- Order card --- */
function renderOrderCard(customer) {
  const list = document.getElementById('queue-list');
  const card = document.createElement('div');
  card.className = 'order-card';
  card.id = `order-${customer.id}`;
  customer.element = card;

  const order = customer.order;
  const reqs  = buildRequirements(order);

  card.innerHTML = `
    <div class="patience-bar-wrap">
      <div class="patience-bar" id="pbar-${customer.id}" style="width:100%"></div>
    </div>
    <div class="customer-name">${customer.name}</div>
    <div class="order-requirements" id="reqs-${customer.id}">
      ${reqs.map(r => `<span class="req-tag" data-req="${r.key}">${r.label}</span>`).join('')}
    </div>
  `;

  list.appendChild(card);
}

/* Builds a flat list of {key, label} requirement pairs from an order */
function buildRequirements(order) {
  const reqs = [];
  reqs.push({ key: `size:${order.size}`,   label: capitalize(order.size) });
  reqs.push({ key: `base:${order.base}`,   label: capitalize(order.base) });
  if (order.milk  !== 'none') reqs.push({ key: `milk:${order.milk}`,   label: capitalize(order.milk) + ' milk' });
  if (order.syrup !== 'none') reqs.push({ key: `syrup:${order.syrup}`, label: capitalize(order.syrup) });
  order.extras.forEach(e => reqs.push({ key: `extra:${e}`, label: capitalize(e) }));
  return reqs;
}

/* Highlight matched req-tags in real time */
function highlightMatchedTags(customerId) {
  const customer = State.customers.find(c => c.id === customerId);
  if (!customer) return;
  const container = document.getElementById(`reqs-${customerId}`);
  if (!container) return;
  const d = State.currentDrink;

  container.querySelectorAll('.req-tag').forEach(tag => {
    const [type, value] = tag.dataset.req.split(':');
    let matched = false;
    if (type === 'size')  matched = d.size  === value;
    if (type === 'base')  matched = d.base  === value;
    if (type === 'milk')  matched = d.milk  === value;
    if (type === 'syrup') matched = d.syrup === value;
    if (type === 'extra') matched = d.extras && d.extras.includes(value);
    tag.classList.toggle('matched', matched);
  });
}

/* Flash card red for wrong order */
function flashCard(id) {
  const card = document.getElementById(`order-${id}`);
  if (!card) return;
  card.style.borderColor = 'rgba(192,57,43,0.8)';
  card.style.boxShadow   = '0 0 16px rgba(192,57,43,0.4)';
  setTimeout(() => {
    card.style.borderColor = '';
    card.style.boxShadow   = '';
  }, 600);
}

/* --- Cup visual --- */
function renderCup() {
  const layers  = document.getElementById('cup-layers');
  const contents = document.getElementById('cup-contents');
  const d = State.currentDrink;

  layers.innerHTML = '';
  const tags = [];

  // Build layers bottom-to-top: base → milk → syrup → extras
  // flex-direction: column-reverse so first pushed = bottom

  function addLayer(cls, heightPx) {
    const div = document.createElement('div');
    div.className = `cup-layer layer-${cls}`;
    div.style.height = heightPx + 'px';
    layers.appendChild(div);
  }

  if (d.base) {
    addLayer(d.base, 30);
    tags.push(capitalize(d.base));
  }
  if (d.milk && d.milk !== 'none') {
    addLayer(d.milk, 16);
    tags.push(capitalize(d.milk) + ' milk');
  }
  if (d.syrup && d.syrup !== 'none') {
    addLayer(d.syrup, 10);
    tags.push(capitalize(d.syrup));
  }
  if (d.extras) {
    d.extras.forEach(e => {
      addLayer(e, 8);
      tags.push(capitalize(e));
    });
  }

  if (tags.length === 0) {
    contents.innerHTML = d.size
      ? `<span class="ingredient-tag">${capitalize(d.size)}</span>`
      : '<span class="empty-hint">Select size to begin</span>';
  } else {
    const sizeTag = d.size ? `<span class="ingredient-tag">${capitalize(d.size)}</span>` : '';
    contents.innerHTML = sizeTag + tags.map(t => `<span class="ingredient-tag">${t}</span>`).join('');
  }
}

/* --- Score --- */
function updateScoreDisplay() {
  document.getElementById('score-display').textContent = State.score.toLocaleString();
}

/* --- Combo --- */
function updateComboDisplay() {
  const el = document.getElementById('combo-display');
  const val = document.getElementById('combo-value');
  val.textContent = `x${State.combo}`;
  el.className = 'hud-item combo-display';
  if (State.combo >= 5)      el.classList.add('combo-high');
  else if (State.combo >= 4) el.classList.add('combo-x4');
  else if (State.combo >= 3) el.classList.add('combo-x3');
  else if (State.combo >= 2) el.classList.add('combo-x2');

  if (State.combo > 1) {
    el.classList.add('pop');
    setTimeout(() => el.classList.remove('pop'), 350);
  }
}

/* --- Hearts --- */
function renderHearts() {
  const el = document.getElementById('hearts');
  el.innerHTML = '';
  for (let i = 0; i < CONFIG.maxLives; i++) {
    const h = document.createElement('span');
    h.className = 'heart' + (i >= State.lives ? ' lost' : '');
    h.textContent = '♥';
    el.appendChild(h);
  }
}

/* --- Feedback flash --- */
let feedbackTimeout = null;
function showFeedback(text, success) {
  const el = document.getElementById('feedback');
  el.textContent = text;
  el.className = 'feedback';
  clearTimeout(feedbackTimeout);
  // Force reflow
  void el.offsetWidth;
  el.classList.add(success ? 'show-success' : 'show-error');
  feedbackTimeout = setTimeout(() => { el.className = 'feedback'; }, 950);
}

/* ============================================================
   GAME STATES
   ============================================================ */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`${name}-screen`);
  if (target) target.classList.add('active');
  State.screen = name;
}

function startGame() {
  // Reset state
  State.score      = 0;
  State.lives      = CONFIG.maxLives;
  State.combo      = 1;
  State.diffLevel  = 0;
  State.customers  = [];
  State.paused     = false;
  State.nextCustomerId = 0;

  // Clear queue UI
  document.getElementById('queue-list').innerHTML = '';

  // Reset drink builder
  DrinkBuilder.reset();

  // Reset HUD
  updateScoreDisplay();
  updateComboDisplay();
  renderHearts();
  updateRushBar();

  showScreen('game');

  // Start systems
  spawnCustomer(); // immediate first customer
  scheduleNextCustomer();
  startDifficultyRamp();
  cancelAnimationFrame(State.patienceRafId);
  State.patienceRafId = requestAnimationFrame(patienceTick);
}

function pauseGame() {
  State.paused = true;
  showScreen('pause');
}

function resumeGame() {
  State.paused = false;
  // Shift customer created times to account for paused duration
  // (simple approach: just let patience tick resume; bars may jump slightly)
  showScreen('game');
}

function endGame() {
  // Stop timers
  clearTimeout(State.arrivalTimer);
  clearInterval(State.difficultyTimer);
  cancelAnimationFrame(State.patienceRafId);

  // Update best score
  if (State.score > State.bestScore) {
    State.bestScore = State.score;
    localStorage.setItem('coffeemaster_best', State.bestScore);
  }

  // Show gameover screen
  document.getElementById('final-score').textContent = State.score.toLocaleString();
  document.getElementById('final-best').textContent  = State.bestScore.toLocaleString();
  showScreen('gameover');
}

function goToMenu() {
  clearTimeout(State.arrivalTimer);
  clearInterval(State.difficultyTimer);
  cancelAnimationFrame(State.patienceRafId);
  document.getElementById('start-best-score').textContent = State.bestScore.toLocaleString();
  showScreen('start');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function init() {
  // Start screen
  document.getElementById('play-btn').addEventListener('click', () => {
    Audio.click(); startGame();
  });

  // Pause
  document.getElementById('pause-btn').addEventListener('click', () => {
    Audio.click(); pauseGame();
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    Audio.click(); resumeGame();
  });
  document.getElementById('quit-btn').addEventListener('click', () => {
    Audio.click(); goToMenu();
  });

  // Game over
  document.getElementById('restart-btn').addEventListener('click', () => {
    Audio.click(); startGame();
  });
  document.getElementById('menu-btn').addEventListener('click', () => {
    Audio.click(); goToMenu();
  });

  // Clear & Serve
  document.getElementById('clear-btn').addEventListener('click', () => {
    Audio.click(); DrinkBuilder.reset();
  });
  document.getElementById('serve-btn').addEventListener('click', () => {
    Audio.click(); serveDrink();
  });

  // Ingredient buttons (event delegation)
  document.querySelectorAll('.ingredient-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (State.screen !== 'game' || State.paused) return;
      DrinkBuilder.setIngredient(btn.dataset.type, btn.dataset.value);
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'p') {
      if (State.screen === 'game') pauseGame();
      else if (State.screen === 'pause') resumeGame();
    }
    if (e.key === 'Enter' && State.screen === 'game') serveDrink();
  });

  // Seed best score on start screen
  document.getElementById('start-best-score').textContent = State.bestScore.toLocaleString();

  // Show start screen
  showScreen('start');
}

// Bootstrap
document.addEventListener('DOMContentLoaded', init);
