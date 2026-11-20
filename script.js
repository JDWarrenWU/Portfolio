/* ==========================================================================
   Jack's Desktop: interactions

   1. Helpers           5. Work tabs & projects
   2. Sound & clock     6. Contact
   3. (removed)         7. Music
   4. Windows           8. Snake
   ========================================================================== */
'use strict';

/* 1. Helpers --------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isNarrow = () => matchMedia('(max-width: 760px)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// localStorage can be blocked (private windows), so never let it throw
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

/* 2. Sound & clock ---------------------------------------------------------- */
let sfxOn = store.get('jack-sfx') !== 'off';
let audioCtx;

// a short sine "blip"; f = start pitch in Hz, d = length in seconds
function blip(f = 880, d = 0.09) {
  if (!sfxOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), t = audioCtx.currentTime;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + d);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + d);
  } catch {}
}

const SPEAKER_ON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10L5 10H2z"/><path d="M11 5.5c1 .8 1 4.2 0 5M13 4c1.8 1.6 1.8 6.4 0 8" stroke="#111" stroke-width="1.3" fill="none"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10L5 10H2z"/><path d="M11 6l4 4M15 6l-4 4" stroke="#111" stroke-width="1.3"/></svg>';
const sfxToggle = $('#sfx-toggle');

function renderSfxToggle() {
  sfxToggle.innerHTML = sfxOn ? SPEAKER_ON : SPEAKER_OFF;
  sfxToggle.setAttribute('aria-pressed', sfxOn);
  sfxToggle.setAttribute('aria-label', sfxOn ? 'Turn sound effects off' : 'Turn sound effects on');
}
sfxToggle.addEventListener('click', () => {
  sfxOn = !sfxOn;
  store.set('jack-sfx', sfxOn ? 'on' : 'off');
  renderSfxToggle();
  blip(1100);
});
renderSfxToggle();

const clock = $('#clock');
const tick = () => { clock.textContent = new Date().toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); };
tick();
setInterval(tick, 15000);

/* 4. Windows ----------------------------------------------------------------
   Every window is positioned by its --x / --y custom properties:
   floating windows use them as left/top, the home window as a translate. */
const desktop = $('#desktop');
let topZ = 10;
let cascade = 0;

const bringToFront = win => { win.style.zIndex = ++topZ; };
const getPos = win => ({
  x: parseFloat(win.style.getPropertyValue('--x')) || 0,
  y: parseFloat(win.style.getPropertyValue('--y')) || 0,
});
const setPos = (win, x, y) => {
  win.style.setProperty('--x', x + 'px');
  win.style.setProperty('--y', y + 'px');
};

function openWindow(name, opener) {
  const win = $('#win-' + name);
  if (!win) return;
  if (win.hidden) {
    win.hidden = false;
    if (!win.dataset.placed) { // first open: center, then cascade later windows
      const offset = (cascade++ % 4) * 26;
      setPos(win, Math.max(8, (desktop.clientWidth - win.offsetWidth) / 2 + offset - 30), 28 + offset);
      win.dataset.placed = 'yes';
    }
    win.classList.remove('pop');
    void win.offsetWidth; // restart the pop animation
    win.classList.add('pop');
    win.returnFocus = opener;
    blip(880);
  }
  bringToFront(win);
  $('.close', win).focus({ preventScroll: true });
}

function closeWindow(win) {
  win.hidden = true;
  blip(520);
  win.returnFocus?.focus({ preventScroll: true });
}

function makeDraggable(win) {
  const bar = $('.win-bar', win);
  win.addEventListener('pointerdown', () => bringToFront(win));
  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button') || isNarrow()) return;
    e.preventDefault();

    const start = getPos(win);
    const r = win.getBoundingClientRect();
    const d = desktop.getBoundingClientRect();
    // keep at least 80px of the window and the whole title bar on the desktop
    const bounds = {
      minX: start.x - (r.left - d.left) - r.width + 80, maxX: start.x + (d.right - r.left) - 80,
      minY: start.y - (r.top - d.top) - 20,             maxY: start.y + (d.bottom - r.top) - 40,
    };

    const move = ev => setPos(win,
      clamp(start.x + ev.clientX - e.clientX, bounds.minX, bounds.maxX),
      clamp(start.y + ev.clientY - e.clientY, bounds.minY, bounds.maxY));
    const end = () => {
      win.classList.remove('dragging');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
    };

    win.classList.add('dragging');
    bar.setPointerCapture(e.pointerId);
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  });
}

$$('.win').forEach(makeDraggable);
$$('.float').forEach(win => {
  $('.close', win).addEventListener('click', () => closeWindow(win));
  win.addEventListener('keydown', e => { if (e.key === 'Escape') closeWindow(win); });
});
$$('[data-open]').forEach(btn => btn.addEventListener('click', () => openWindow(btn.dataset.open, btn)));

/* 5. Work tabs & projects -------------------------------------------------- */
const tabs = $$('.seg [role="tab"]');
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => {
    const selected = t === tab;
    t.setAttribute('aria-selected', selected);
    $('#' + t.getAttribute('aria-controls')).hidden = !selected;
  });
  blip(1300, 0.04);
}));

// Edit this list to change the design work. Projects show in this order, grouped by `group`.
// pages = number of images in images/work named <img>-1.jpg, <img>-2.jpg, ...
// The gallery tile uses images/work/thumbs/<img>.jpg; page thumbnails live in images/work/thumbs/pages/.
// pdf = optional link to the full file in PortfolioPieces
const GROUPS = {
  sl:    { title: 'Student Life', note: 'Design Editor at the independent student newspaper of Washington University in St. Louis.' },
  other: { title: 'Other projects' },
};
const PROJECTS = [
  { group: 'sl', img: 'sl-ai',       pages: 2,  title: 'AI Special Issue', kind: 'Special issue', desc: '' },
  { group: 'sl', img: 'sl-features', pages: 9,  title: 'Features & Scene', kind: 'Feature spreads', desc: '' },
  { group: 'sl', img: 'sl-sports',   pages: 10, title: 'Sports',           kind: 'Sports pages', desc: '' },
  { group: 'sl', img: 'sl-front',    pages: 4,  title: 'Front Pages',      kind: 'Front pages', desc: '' },

  { group: 'other', img: 'imagining-earth',  pages: 1, pdf: 'PortfolioPieces/Imagining Earth.pdf',                        title: 'Imagining Earth',      kind: 'Exhibition poster', desc: '' },
  { group: 'other', img: 'algernon',         pages: 1, pdf: 'PortfolioPieces/Flowers for Algernon Cover.pdf',             title: 'Flowers for Algernon', kind: 'Book cover', desc: '' },
  { group: 'other', img: 'pay-attention',    pages: 9, pdf: 'PortfolioPieces/Pay Attention to how you pay Attention.pdf', title: 'Pay Attention',        kind: 'Editorial booklet', desc: '' },
  { group: 'other', img: 'tintinnabulation', pages: 3, pdf: 'PortfolioPieces/Tintinnabulation.pdf',                       title: 'Tintinnabulation',     kind: 'Typographic series', desc: '' },
  { group: 'other', img: 'texture-booklet',  pages: 5, pdf: 'PortfolioPieces/texturebooklet.pdf',                         title: 'Texture Booklet',      kind: 'Booklet', desc: '' },
];

const pageSrc = (p, n) => `images/work/${p.img}-${n}.jpg`;
let currentProject = 0, currentPage = 1;

// show one page of the current project, fitted whole inside the viewer
function showPage(n) {
  const p = PROJECTS[currentProject];
  currentPage = n;
  const img = $('#pj-page');
  img.src = pageSrc(p, n);
  img.alt = p.pages > 1 ? `${p.title}, page ${n} of ${p.pages}` : p.title;
  $$('#pj-pages button').forEach((b, k) => b.setAttribute('aria-current', k + 1 === n));
  $('#pj-pages button[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const gallery = $('#gallery');
gallery.innerHTML = Object.entries(GROUPS).map(([key, g]) => `
  <div class="gallery-group group-${key}">
    <div>
      <h3 class="group-title">${g.title}</h3>
      ${g.note ? `<p class="small muted">${g.note}</p>` : ''}
    </div>
    <div class="gallery-grid">
      ${PROJECTS.map((p, i) => p.group !== key ? '' : `
        <button class="tile" data-project="${i}" aria-label="Open ${p.title}">
          <img class="thumb" src="images/work/thumbs/${p.img}.jpg" alt="" loading="lazy">
          <span><b>${p.title}</b></span>
        </button>`).join('')}
    </div>
  </div>`).join('');

function showProject(index) {
  currentProject = (index + PROJECTS.length) % PROJECTS.length;
  const p = PROJECTS[currentProject];
  const strip = $('#pj-pages');
  strip.replaceChildren(...(p.pages > 1 ? Array.from({ length: p.pages }, (_, k) => {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', `Page ${k + 1} of ${p.pages}`);
    btn.innerHTML = `<img src="images/work/thumbs/pages/${p.img}-${k + 1}.jpg" alt="" loading="lazy">`;
    btn.addEventListener('click', () => { showPage(k + 1); blip(1200, 0.03); });
    return btn;
  }) : []));
  showPage(1);
  const pdf = $('#pj-pdf');
  pdf.hidden = !p.pdf;
  if (p.pdf) pdf.href = encodeURI(p.pdf);
  $('#pj-bar').textContent = p.title;
  $('#win-project').setAttribute('aria-label', p.title);
  $('#pj-desc').textContent = p.desc;
  $('#pj-desc').hidden = !p.desc;
  $('#pj-count').textContent = `${currentProject + 1} of ${PROJECTS.length}`;

  const heading = document.createElement('h2');
  heading.className = 'display';
  heading.textContent = p.title;
  $('#pj-title').replaceChildren(heading);
}

/* Lightbox: a full-screen viewer for reading pages up close.
   "Fit page" shows the whole page; "Zoom in" fills the width so tall pages scroll. */
const lb = $('#lightbox'), lbImg = $('#lb-img'), lbStage = $('#lb-stage');
let lbReturn = null;
function lbSetZoom(on) {
  lb.classList.toggle('zoomed', on);
  $('#lb-zoom').setAttribute('aria-pressed', on);
  $('#lb-zoom span').textContent = on ? 'Fit page' : 'Zoom in';
}
function lbRender() {
  const p = PROJECTS[currentProject];
  lbImg.src = pageSrc(p, currentPage);
  lbImg.alt = p.pages > 1 ? `${p.title}, page ${currentPage} of ${p.pages}` : p.title;
  $('#lb-title').textContent = p.title;
  $('#lb-count').textContent = p.pages > 1 ? `${currentPage} / ${p.pages}` : '';
  $('#lb-prev').hidden = $('#lb-next').hidden = p.pages < 2;
  lbSetZoom(false);
  lbStage.scrollTo(0, 0);
}
function lbOpen() {
  lbReturn = document.activeElement;
  lbRender();
  lb.hidden = false;
  document.body.classList.add('lb-open');
  $('#lb-close').focus();
  blip(880);
}
function lbClose() {
  lb.hidden = true;
  document.body.classList.remove('lb-open');
  showPage(currentPage); // keep the small viewer on the page you ended on
  lbReturn?.focus({ preventScroll: true });
  blip(520);
}
function lbStep(d) {
  const p = PROJECTS[currentProject];
  if (p.pages < 2) return;
  currentPage = ((currentPage - 1 + d + p.pages) % p.pages) + 1;
  lbRender();
  blip(1000, 0.04);
}
$('#pj-img').addEventListener('click', lbOpen);
$('#lb-close').addEventListener('click', lbClose);
$('#lb-prev').addEventListener('click', () => lbStep(-1));
$('#lb-next').addEventListener('click', () => lbStep(1));
$('#lb-zoom').addEventListener('click', () => lbSetZoom(!lb.classList.contains('zoomed')));
lbImg.addEventListener('click', () => lbSetZoom(!lb.classList.contains('zoomed')));
lbStage.addEventListener('click', e => { if (e.target === lbStage) lbClose(); });
lb.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); lbClose(); }
  else if (e.key === 'ArrowRight') lbStep(1);
  else if (e.key === 'ArrowLeft') lbStep(-1);
});

$$('[data-project]', gallery).forEach(btn => btn.addEventListener('click', () => {
  showProject(+btn.dataset.project);
  openWindow('project', btn);
}));
$('#pj-prev').addEventListener('click', () => { showProject(currentProject - 1); blip(1000, 0.04); });
$('#pj-next').addEventListener('click', () => { showProject(currentProject + 1); blip(1000, 0.04); });

/* 6. Contact ----------------------------------------------------------------- */
$('#copy-email').addEventListener('click', () => {
  const email = $('#email'), toast = $('#toast');
  const selectInstead = () => {
    getSelection().selectAllChildren(email);
    toast.textContent = 'Selected. Press Command-C to copy.';
  };
  try {
    navigator.clipboard.writeText(email.textContent).then(() => { toast.textContent = 'Copied to clipboard.'; blip(1200); }, selectInstead);
  } catch { selectInstead(); }
});

$('#soon-ok').addEventListener('click', () => closeWindow($('#win-soon')));

/* 7. Music ------------------------------------------------------------------- */
const song = $('#song');
const musicToggle = $('#music-toggle');
const nowPlaying = $('#now-playing');
const npText = $('#np-text');
const CREDIT = npText.innerHTML;
song.volume = 0.6;

function renderMusic() {
  const playing = !song.paused;
  musicToggle.setAttribute('aria-pressed', playing);
  musicToggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} music: Raccoon Dreams by Stevia Sphere`);
  nowPlaying.hidden = !playing;
}
musicToggle.addEventListener('click', () => {
  if (!song.paused) return song.pause();
  song.play().catch(() => {
    npText.textContent = 'The song could not be played.';
    nowPlaying.hidden = false;
    setTimeout(() => { npText.innerHTML = CREDIT; renderMusic(); }, 2500);
  });
});
song.addEventListener('play', renderMusic);
song.addEventListener('pause', renderMusic);

/* 8. Snake ------------------------------------------------------------------- */
(() => {
  const GRID = 18;                       // cells per side
  const START_SPEED = 130, MIN_SPEED = 65; // ms per step
  const KEYS = {
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  };

  const win = $('#win-snake');
  const canvas = $('#sn-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = $('#sn-overlay'), message = $('#sn-msg'), startBtn = $('#sn-start');
  const scoreEl = $('#sn-score'), bestEl = $('#sn-best');

  let snake, dir, turns, food, score, speed, timer;
  let state = 'idle'; // idle | running | paused | over
  let best = +store.get('jack-snake-best') || 0;
  bestEl.textContent = best;

  function reset() {
    const mid = GRID / 2;
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = { x: 1, y: 0 };
    turns = [];
    score = 0;
    speed = START_SPEED;
    scoreEl.textContent = 0;
    placeFood();
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some(s => s.x === food.x && s.y === food.y));
  }

  /* drawing */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  function draw() {
    const size = canvas.width, cell = size / GRID;
    ctx.fillStyle = '#f3ecd4';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ebe2c4';
    for (let y = 0; y < GRID; y++) for (let x = y % 2; x < GRID; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);

    // apple
    const ax = (food.x + 0.5) * cell, ay = (food.y + 0.55) * cell, ar = cell * 0.4;
    const apple = ctx.createRadialGradient(ax - ar * 0.3, ay - ar * 0.4, ar * 0.1, ax, ay, ar);
    apple.addColorStop(0, '#ff9c90'); apple.addColorStop(0.5, '#e5392b'); apple.addColorStop(1, '#a8180e');
    ctx.fillStyle = apple;
    ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5cc236';
    ctx.beginPath(); ctx.ellipse(ax + ar * 0.35, ay - ar * 1.05, ar * 0.35, ar * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();

    // snake: glossy Aqua segments, fading toward the tail
    snake.forEach((seg, i) => {
      const pad = cell * 0.08, w = cell - pad * 2, x = seg.x * cell + pad, y = seg.y * cell + pad;
      const head = i === 0;
      const gel = ctx.createLinearGradient(0, y, 0, y + w);
      gel.addColorStop(0, head ? '#9ccaff' : '#c3e1ff');
      gel.addColorStop(0.5, head ? '#3c8ae6' : '#6fb1f7');
      gel.addColorStop(0.52, head ? '#1f5fbf' : '#3c8ae6');
      gel.addColorStop(1, '#7fc0ff');
      ctx.globalAlpha = 1 - (i / Math.max(1, snake.length - 1)) * 0.35;
      ctx.fillStyle = gel;
      roundRect(x, y, w, w, w * 0.3); ctx.fill();
      ctx.strokeStyle = 'rgb(20 60 130 / .6)'; ctx.lineWidth = Math.max(1, cell * 0.05); ctx.stroke();
      ctx.fillStyle = 'rgb(255 255 255 / .7)';
      roundRect(x + w * 0.15, y + w * 0.08, w * 0.7, w * 0.3, w * 0.15); ctx.fill();
      ctx.globalAlpha = 1;

      if (head) { // two eyes looking where it is going
        const cx = x + w / 2, cy = y + w / 2, o = w * 0.2;
        ctx.fillStyle = '#0a1c38';
        for (const side of [1, -1]) {
          ctx.beginPath();
          ctx.arc(cx + dir.x * o + side * dir.y * o, cy + dir.y * o + side * dir.x * o, w * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  function fitCanvas() {
    const px = Math.round((canvas.clientWidth || 320) * Math.min(2, devicePixelRatio || 1));
    if (canvas.width !== px) canvas.width = canvas.height = px;
    draw();
  }

  /* game loop */
  function step() {
    if (win.hidden) return pause(); // closing the window pauses the game
    if (turns.length) dir = turns.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const eats = head.x === food.x && head.y === food.y;
    const body = eats ? snake : snake.slice(0, -1); // the tail moves away unless we grow
    const crashed = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID
      || body.some(s => s.x === head.x && s.y === head.y);
    if (crashed) return gameOver();

    snake.unshift(head);
    if (eats) {
      scoreEl.textContent = ++score;
      speed = Math.max(MIN_SPEED, START_SPEED - score * 3);
      blip(1300, 0.05);
      placeFood();
    } else {
      snake.pop();
    }
    draw();
    timer = setTimeout(step, speed);
  }

  function showOverlay(html, buttonLabel) {
    message.innerHTML = html;
    message.hidden = false;
    $('span', startBtn).textContent = buttonLabel;
    overlay.hidden = false;
  }

  function start() {
    if (state === 'idle' || state === 'over') reset();
    state = 'running';
    overlay.hidden = true;
    clearTimeout(timer);
    draw();
    timer = setTimeout(step, speed);
    canvas.focus({ preventScroll: true });
  }

  function pause() {
    if (state !== 'running') return;
    state = 'paused';
    clearTimeout(timer);
    showOverlay('Paused.', 'Resume');
  }

  function gameOver() {
    state = 'over';
    clearTimeout(timer);
    blip(220, 0.25);
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      store.set('jack-snake-best', best);
    }
    showOverlay(`Game over.<br>You ate ${score} apple${score === 1 ? '' : 's'}.`, 'Play again');
  }

  // queue up to 3 turns so quick key presses aren't lost; ignore reversing into yourself
  function turn(x, y) {
    if (state !== 'running') return;
    const last = turns.at(-1) || dir;
    if ((x === -last.x && y === -last.y) || (x === last.x && y === last.y)) return;
    if (turns.length < 3) turns.push({ x, y });
  }

  /* controls */
  startBtn.addEventListener('click', start);

  document.addEventListener('keydown', e => {
    if (win.hidden) return;
    const key = e.key.toLowerCase();
    if (KEYS[key] && state === 'running') {
      e.preventDefault();
      turn(...KEYS[key]);
    } else if (key === ' ' && (state === 'running' || document.activeElement === canvas)) {
      e.preventDefault();
      state === 'running' ? pause() : start();
    }
  });

  $$('.pad [data-dir]').forEach(btn => btn.addEventListener('click', () => turn(...btn.dataset.dir.split(',').map(Number))));

  let swipeStart = null; // swipe on the board
  canvas.addEventListener('pointerdown', e => { swipeStart = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
  });

  reset();
  new ResizeObserver(fitCanvas).observe(canvas);
  fitCanvas();
})();
