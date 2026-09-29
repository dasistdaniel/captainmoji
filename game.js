'use strict';
// Captain Moji – Prototyp: Deck 1 🛡️ Schilde

// ---------- Konstanten & Konfiguration ----------
const VIEW_W = 15, VIEW_H = 9;
const FOV_RADIUS = 7;
const T = { WALL: 0, FLOOR: 1, DOOR: 2 };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const E = {
  captain: '🧑‍🚀', drone: '🤖', wall: '🟫', door: '🚪',
  wrench: '🔧', battery: '🔋', medkit: '🩹', generator: '🛡️',
  terminal: '🖥️', crate: '📦',
};

const PLAYER_BASE = { maxHp: 10, ammo: 3, meleeDmg: 2, blasterDmg: 3, blasterRange: 6 };

const ENEMY_TYPES = {
  drone: { emoji: E.drone, name: 'Sicherheitsdrohne', hp: 3, dmg: 1, hit: 0.75, sight: 8 },
};

// Hindernisse im Raum. Alle blockieren Bewegung und Schüsse, aber nicht die Sicht.
const PROPS = {
  crate:    { emoji: E.crate,    name: 'Kiste',    scale: 0.72, hp: 2 },
  terminal: { emoji: E.terminal, name: 'Terminal', scale: 0.72 },
  bed:      { emoji: '🛏️',       name: 'Koje',     scale: 0.8 },
  plant:    { emoji: '🪴',       name: 'Pflanze',  scale: 0.7 },
};

// Raumtypen: eigener Boden, eigene Hindernisse. `scatter` = frei im Raum statt an der Wand.
const ROOM_THEMES = {
  bruecke:   { name: 'Brücke',              icon: E.terminal, floor: ['#15203a', '#182440'], props: { terminal: [1, 1] } },
  generator: { name: 'Schildgenerator',     icon: E.generator, floor: ['#122429', '#15292f'], props: {}, bolts: 0.1 },
  lager:     { name: 'Lagerraum',           icon: E.crate,    floor: ['#221e18', '#26211a'], props: { crate: [2, 4] }, scatter: true },
  kontroll:  { name: 'Kontrollraum',        icon: E.terminal, floor: ['#15203a', '#182440'], props: { terminal: [1, 2] } },
  quartier:  { name: 'Mannschaftsquartier', icon: '🛏️',       floor: ['#1f1a2b', '#231d30'], props: { bed: [2, 3], plant: [0, 1] } },
  technik:   { name: 'Technikraum',         icon: '🔩',       floor: ['#172420', '#1a2823'], props: { crate: [0, 2] }, bolts: 0.12 },
  messe:     { name: 'Messe',               icon: '🪴',       floor: ['#1a2233', '#1d2638'], props: { plant: [1, 3] } },
};

// Jedes Deck ist nur eine Konfiguration – weitere Decks kommen später dazu.
const DECKS = [
  {
    id: 1, name: 'Schilde', icon: E.generator,
    w: 50, h: 30, maxRooms: 10,
    themes: ['lager', 'lager', 'kontroll', 'quartier', 'technik', 'messe'],
    enemies: { drone: [5, 7] },
    // Verhalten der Gegner: schlafend 💤, patrouillierend, bewachend
    modes: { sleep: 0.35, patrol: 0.3, guard: 0.35 },
    items: { medkit: [1, 2], battery: [2, 3] },
    crateLoot: { battery: 0.3, medkit: 0.15 },
    goalItem: 'wrench', station: 'generator',
    intro: 'Finde das 🔧 und bring es zum 🛡️ Schildgenerator.',
  },
];

const ITEMS = {
  wrench:  { emoji: E.wrench,  name: 'Werkzeug' },
  battery: { emoji: E.battery, name: 'Energiezelle' },
  medkit:  { emoji: E.medkit,  name: 'Medkit' },
};

// ---------- Hilfsfunktionen ----------
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// gewichtete Auswahl aus { key: gewicht } – Rest bis 1 ergibt null
function rollTable(table) {
  let r = Math.random();
  for (const [k, w] of Object.entries(table)) { if (r < w) return k; r -= w; }
  return null;
}

// ---------- Spielzustand ----------
let G = null;        // aktueller Run
let state = 'title'; // title | play | dead | won

function newRun() {
  G = {
    deckIndex: 0,
    player: { x: 0, y: 0, hp: PLAYER_BASE.maxHp, maxHp: PLAYER_BASE.maxHp,
              ammo: PLAYER_BASE.ammo, medkits: 0, hasTool: false, face: [1, 0] },
    log: [],
    effects: [],
    shake: { until: 0, mag: 0 },
  };
  loadDeck(DECKS[G.deckIndex]);
}

// ---------- Deck-Generierung ----------
function loadDeck(cfg) {
  const map = generateMap(cfg);
  Object.assign(G, map, {
    cfg, enemies: [], items: new Map(), props: new Map(), deco: new Map(), station: null,
    visitedRooms: new Set([0]),
    explored: new Uint8Array(map.w * map.h), visible: new Uint8Array(map.w * map.h),
  });

  const { rooms } = G;
  const start = rooms[0];
  G.player.x = G.player.rx = start.cx;
  G.player.y = G.player.ry = start.cy;

  // Station in den am weitesten entfernten Raum
  const dist = bfs(G.player.x, G.player.y, () => true);
  let far = 1, best = -1;
  for (let i = 1; i < rooms.length; i++) {
    const d = dist[idx(rooms[i].cx, rooms[i].cy)];
    if (d > best) { best = d; far = i; }
  }
  G.station = { x: rooms[far].cx, y: rooms[far].cy, type: cfg.station, repaired: false, room: far };

  rooms.forEach((r, i) => { r.theme = i === 0 ? 'bruecke' : i === far ? 'generator' : pick(cfg.themes); });
  rooms.forEach((r, i) => placeProps(i));
  placeDeco();

  // Zielitem weder im Start- noch im Stationsraum, möglichst weit weg vom Start
  const others = rooms.map((r, i) => i).filter(i => i !== 0 && i !== far);
  others.sort((a, b) => dist[idx(rooms[b].cx, rooms[b].cy)] - dist[idx(rooms[a].cx, rooms[a].cy)]);
  const toolRoom = others[rand(0, Math.min(2, others.length - 1))];
  placeItem(cfg.goalItem, toolRoom);

  for (const [type, [a, b]] of Object.entries(cfg.items)) {
    const n = rand(a, b);
    for (let i = 0; i < n; i++) placeItem(type, rand(1, rooms.length - 1));
  }
  for (const [type, [a, b]] of Object.entries(cfg.enemies)) {
    const n = rand(a, b);
    for (let i = 0; i < n; i++) {
      const ri = rand(1, rooms.length - 1);
      const p = freeTileInRoom(ri);
      if (p) G.enemies.push(makeEnemy(type, p.x, p.y, rollTable(cfg.modes) || 'guard', ri));
    }
  }

  updateFov();
  addLog(`${cfg.icon} Deck ${cfg.id}: ${cfg.name}. ${cfg.intro}`);
}

function generateMap(cfg) {
  const w = cfg.w, h = cfg.h;
  const tiles = new Uint8Array(w * h).fill(T.WALL);
  const roomAt = new Int16Array(w * h).fill(-1);
  const at = (x, y) => y * w + x;
  let rooms = [];

  for (let tries = 0; tries < 500 && rooms.length < cfg.maxRooms; tries++) {
    const rw = rand(5, 10), rh = rand(4, 7);
    const x = rand(1, w - rw - 1), y = rand(1, h - rh - 1);
    const overlaps = rooms.some(r => x - 2 < r.x + r.w && x + rw + 2 > r.x && y - 2 < r.y + r.h && y + rh + 2 > r.y);
    if (!overlaps) rooms.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) });
  }
  rooms.sort((a, b) => a.cx - b.cx);

  rooms.forEach((r, i) => {
    for (let yy = r.y; yy < r.y + r.h; yy++)
      for (let xx = r.x; xx < r.x + r.w; xx++) { tiles[at(xx, yy)] = T.FLOOR; roomAt[at(xx, yy)] = i; }
  });

  const carve = (x, y) => { if (tiles[at(x, y)] === T.WALL) tiles[at(x, y)] = T.FLOOR; };
  const corridor = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = Math.random() < 0.5;
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x, y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i]);
  // ein paar Extra-Verbindungen für Rundwege
  for (let i = 0; i < 2 && rooms.length > 3; i++) {
    const a = rand(0, rooms.length - 1), b = rand(0, rooms.length - 1);
    if (Math.abs(a - b) > 1) corridor(rooms[a], rooms[b]);
  }

  // Türen: Gangfelder im Wandring eines Raums, die ein klarer Durchgang sind
  const isWall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || tiles[at(x, y)] === T.WALL;
  rooms.forEach(r => {
    for (let yy = r.y - 1; yy <= r.y + r.h; yy++)
      for (let xx = r.x - 1; xx <= r.x + r.w; xx++) {
        const onRing = xx === r.x - 1 || xx === r.x + r.w || yy === r.y - 1 || yy === r.y + r.h;
        if (!onRing || tiles[at(xx, yy)] !== T.FLOOR || roomAt[at(xx, yy)] !== -1) continue;
        const lr = isWall(xx - 1, yy) && isWall(xx + 1, yy) && !isWall(xx, yy - 1) && !isWall(xx, yy + 1);
        const ud = isWall(xx, yy - 1) && isWall(xx, yy + 1) && !isWall(xx - 1, yy) && !isWall(xx + 1, yy);
        if (lr || ud) tiles[at(xx, yy)] = T.DOOR;
      }
  });

  return { w, h, tiles, roomAt, rooms };
}

// Hindernisse eines Raums setzen – nie so, dass ein Bodenfeld unerreichbar wird
function placeProps(ri) {
  const r = G.rooms[ri], theme = ROOM_THEMES[r.theme];
  for (const [type, [a, b]] of Object.entries(theme.props)) {
    let n = rand(a, b);
    for (let tries = 0; n > 0 && tries < 40; tries++) {
      const x = rand(r.x, r.x + r.w - 1), y = rand(r.y, r.y + r.h - 1);
      const atWall = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
      if (!theme.scatter && !atWall) continue;
      if (occupied(x, y) || (x === r.cx && y === r.cy)) continue;
      // nicht direkt vor Eingänge stellen
      if (Object.values(DIRS).some(([dx, dy]) => passable(x + dx, y + dy) && G.roomAt[idx(x + dx, y + dy)] !== ri)) continue;
      const key = idx(x, y);
      G.props.set(key, { type, x, y, hp: PROPS[type].hp || 0 });
      if (allReachable()) n--;
      else G.props.delete(key);
    }
  }
}

function allReachable() {
  const d = bfs(G.player.x, G.player.y, (x, y) => !isStation(x, y));
  const st = idx(G.station.x, G.station.y);
  for (let i = 0; i < d.length; i++)
    if (G.tiles[i] !== T.WALL && d[i] === -1 && i !== st && !G.props.has(i)) return false;
  return true;
}

// Bodendetails: Lüftungsgitter und Schrauben (nur Optik)
function placeDeco() {
  for (let i = 0; i < G.tiles.length; i++) {
    if (G.tiles[i] !== T.FLOOR || G.props.has(i)) continue;
    const ri = G.roomAt[i];
    const theme = ri >= 0 ? ROOM_THEMES[G.rooms[ri].theme] : null;
    const r = Math.random();
    if (r < 0.05) G.deco.set(i, 'vent');
    else if (theme && theme.bolts && r < 0.05 + theme.bolts) G.deco.set(i, 'bolt');
  }
}

function idx(x, y) { return y * G.w + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < G.w && y < G.h; }
function tileAt(x, y) { return inBounds(x, y) ? G.tiles[idx(x, y)] : T.WALL; }
function passable(x, y) { return tileAt(x, y) !== T.WALL; }
function enemyAt(x, y) { return G.enemies.find(e => e.x === x && e.y === y); }
function propAt(x, y) { return inBounds(x, y) ? G.props.get(idx(x, y)) : undefined; }
function isStation(x, y) { return G.station && G.station.x === x && G.station.y === y; }
function occupied(x, y) {
  return (G.player.x === x && G.player.y === y) || enemyAt(x, y) || isStation(x, y) ||
         G.items.has(idx(x, y)) || G.props.has(idx(x, y));
}

function freeTileInRoom(ri) {
  const r = G.rooms[ri];
  for (let t = 0; t < 40; t++) {
    const x = rand(r.x, r.x + r.w - 1), y = rand(r.y, r.y + r.h - 1);
    if (!occupied(x, y)) return { x, y };
  }
  return null;
}

function placeItem(type, ri) {
  const p = freeTileInRoom(ri);
  if (p) G.items.set(idx(p.x, p.y), { type, x: p.x, y: p.y });
}

function makeEnemy(type, x, y, mode = 'guard', home = -1) {
  const t = ENEMY_TYPES[type];
  return { type, x, y, rx: x, ry: y, hp: t.hp, maxHp: t.hp, alert: 0, mode, home };
}

// Breitensuche – Distanzkarte von (sx, sy); Wände und Hindernisse blockieren
function bfs(sx, sy, canPass) {
  const dist = new Int16Array(G.w * G.h).fill(-1);
  const q = [sx, sy];
  dist[idx(sx, sy)] = 0;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1], d = dist[idx(x, y)];
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (!passable(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (dist[ni] !== -1 || (G.props && G.props.has(ni)) || !canPass(nx, ny)) continue;
      dist[ni] = d + 1;
      q.push(nx, ny);
    }
  }
  return dist;
}

// ---------- Sicht / Nebel des Krieges ----------
function lineOfSight(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    if (!(x === x0 && y === y0) && tileAt(x, y) === T.WALL) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return true;
}

function revealRoom(ri) {
  const r = G.rooms[ri];
  for (let y = r.y - 1; y <= r.y + r.h; y++)
    for (let x = r.x - 1; x <= r.x + r.w; x++)
      if (inBounds(x, y)) G.visible[idx(x, y)] = 1;
}

function updateFov() {
  const p = G.player;
  G.visible.fill(0);
  for (let y = p.y - FOV_RADIUS; y <= p.y + FOV_RADIUS; y++)
    for (let x = p.x - FOV_RADIUS; x <= p.x + FOV_RADIUS; x++) {
      if (!inBounds(x, y)) continue;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 > FOV_RADIUS * FOV_RADIUS + 1) continue;
      if (lineOfSight(p.x, p.y, x, y)) G.visible[idx(x, y)] = 1;
    }
  // Wer einen Raum betritt (oder in der Tür steht), sieht den ganzen Raum
  const ri = G.roomAt[idx(p.x, p.y)];
  if (ri >= 0) revealRoom(ri);
  else if (tileAt(p.x, p.y) === T.DOOR) {
    for (const [dx, dy] of Object.values(DIRS)) {
      const r2 = G.roomAt[idx(p.x + dx, p.y + dy)];
      if (r2 >= 0) revealRoom(r2);
    }
  }
  for (let i = 0; i < G.visible.length; i++) if (G.visible[i]) G.explored[i] = 1;
}

// ---------- Log ----------
function addLog(msg) {
  G.log.push(msg);
  if (G.log.length > 3) G.log.shift();
  renderLog();
}

// ---------- Sound (per WebAudio erzeugt, keine Dateien) ----------
const Sound = (() => {
  let ac = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem('captainMoji.muted') === '1'; } catch (e) { /* egal */ }

  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.1, delay = 0 }) {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.15, vol = 0.2, freq = 2000, delay = 0 }) {
    const a = audio(); if (!a || muted) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + delay;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(100, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(a.destination);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const arp = (notes, type, gap, dur, vol) =>
    notes.forEach((f, i) => tone({ type, f0: f, f1: f * 0.98, dur, vol, delay: i * gap }));

  const SFX = {
    step:    () => noise({ dur: 0.05, vol: 0.06, freq: 700 }),
    bump:    () => noise({ dur: 0.07, vol: 0.12, freq: 400 }),
    shoot:   () => tone({ type: 'square', f0: 1400, f1: 160, dur: 0.18, vol: 0.07 }),
    hit:     () => { noise({ dur: 0.12, vol: 0.22, freq: 3000 }); tone({ type: 'square', f0: 240, f1: 110, dur: 0.08, vol: 0.05 }); },
    explode: () => { noise({ dur: 0.5, vol: 0.35, freq: 1600 }); tone({ type: 'sawtooth', f0: 130, f1: 35, dur: 0.45, vol: 0.09 }); },
    hurt:    () => { tone({ type: 'sawtooth', f0: 190, f1: 55, dur: 0.24, vol: 0.13 }); noise({ dur: 0.1, vol: 0.14, freq: 1200 }); },
    miss:    () => tone({ type: 'sine', f0: 520, f1: 300, dur: 0.09, vol: 0.05 }),
    pickup:  () => arp([660, 990], 'sine', 0.07, 0.12, 0.11),
    tool:    () => arp([523, 784, 1047], 'triangle', 0.08, 0.18, 0.12),
    heal:    () => arp([523, 659, 784], 'triangle', 0.07, 0.16, 0.11),
    empty:   () => tone({ type: 'square', f0: 130, f1: 100, dur: 0.07, vol: 0.06 }),
    deny:    () => arp([220, 165], 'square', 0.09, 0.12, 0.05),
    win:     () => arp([523, 659, 784, 1047, 1319], 'triangle', 0.11, 0.3, 0.12),
    death:   () => arp([392, 330, 262, 196], 'sawtooth', 0.18, 0.32, 0.09),
    crate:   () => { noise({ dur: 0.25, vol: 0.3, freq: 900 }); tone({ type: 'triangle', f0: 160, f1: 70, dur: 0.2, vol: 0.1 }); },
    beep:    () => arp([880, 1175, 880], 'square', 0.06, 0.06, 0.04),
    alarm:   () => arp([740, 988, 740, 988], 'square', 0.1, 0.09, 0.05),
    wake:    () => tone({ type: 'sine', f0: 200, f1: 700, dur: 0.25, vol: 0.07 }),
  };

  return {
    play(name) { try { SFX[name] && SFX[name](); } catch (e) { /* Audio ist optional */ } },
    unlock() { try { audio(); } catch (e) { /* egal */ } },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('captainMoji.muted', muted ? '1' : '0'); } catch (e) { /* egal */ }
      if (!muted) this.play('pickup');
      renderSoundBtn();
    },
  };
})();

// ---------- Spieleraktionen ----------
function playerMove(dir) {
  const p = G.player;
  const [dx, dy] = DIRS[dir];
  p.face = [dx, dy];
  const nx = p.x + dx, ny = p.y + dy;

  const enemy = enemyAt(nx, ny);
  if (enemy) {
    bump(p, dx, dy);
    damageEnemy(enemy, PLAYER_BASE.meleeDmg, 'Nahkampf');
    return true;
  }
  const prop = propAt(nx, ny);
  if (prop) return useProp(prop, dx, dy);
  if (isStation(nx, ny)) return useStation(dx, dy);
  if (!passable(nx, ny)) { bump(p, dx, dy, 0.12); Sound.play('bump'); return false; }

  p.x = nx; p.y = ny;
  Sound.play('step');
  pickup();
  enterRoom();
  return true;
}

function enterRoom() {
  const ri = G.roomAt[idx(G.player.x, G.player.y)];
  if (ri < 0 || G.visitedRooms.has(ri)) return;
  G.visitedRooms.add(ri);
  const th = ROOM_THEMES[G.rooms[ri].theme];
  addLog(`${th.icon} ${th.name}`);
}

function useProp(prop, dx, dy) {
  const p = G.player;
  if (prop.type === 'crate') {
    bump(p, dx, dy);
    damageProp(prop, PLAYER_BASE.meleeDmg);
    return true;
  }
  bump(p, dx, dy, 0.12);
  if (prop.type === 'terminal') { useTerminal(prop); return false; }
  Sound.play('bump');
  return false;
}

function damageProp(prop, dmg) {
  prop.hp -= dmg;
  sparks(prop.x, prop.y, '#c8955a', 10);
  if (prop.hp > 0) { Sound.play('hit'); return; }
  G.props.delete(idx(prop.x, prop.y));
  Sound.play('crate');
  shake(2, 120);
  const loot = rollTable(G.cfg.crateLoot);
  if (loot) {
    G.items.set(idx(prop.x, prop.y), { type: loot, x: prop.x, y: prop.y });
    floatText(prop.x, prop.y, ITEMS[loot].emoji, '#ffffff');
    addLog(`${E.crate} Kiste aufgebrochen: ${ITEMS[loot].emoji} ${ITEMS[loot].name}!`);
  } else {
    addLog(`${E.crate} Kiste aufgebrochen – leer.`);
  }
}

const COMPASS = ['Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten', 'Norden', 'Nordosten'];
function compass(from, to) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return COMPASS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
function distWord(from, to) {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return d < 12 ? 'ganz in der Nähe' : d < 24 ? 'nicht weit' : 'weit entfernt';
}

// Terminals verraten, wo es weitergeht. Kostet keinen Zug.
function useTerminal(prop) {
  const p = G.player;
  Sound.play('beep');
  addEffect({ type: 'hit', ent: { rx: prop.x, ry: prop.y }, ms: 250, color: 'rgba(79,209,255,0.5)' });
  if (p.hasTool) {
    addLog(`${E.terminal} Schildgenerator: im ${compass(prop, G.station)}, ${distWord(prop, G.station)}.`);
  } else {
    const tool = [...G.items.values()].find(i => i.type === G.cfg.goalItem);
    if (tool) addLog(`${E.terminal} Werkzeug-Signal ${E.wrench}: im ${compass(prop, tool)}, ${distWord(prop, tool)}.`);
  }
  if (!prop.used) {
    prop.used = true;
    // Schiffsplan: Der Raum mit dem Schildgenerator wird auf der Karte markiert
    const r = G.rooms[G.station.room];
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++) G.explored[idx(x, y)] = 1;
    floatText(prop.x, prop.y, 'Schiffsplan geladen', '#4fd1ff', 1200);
  }
}

function pickup() {
  const p = G.player, key = idx(p.x, p.y);
  const it = G.items.get(key);
  if (!it) return;
  G.items.delete(key);
  if (it.type === 'battery') {
    p.ammo += 2;
    floatText(p.x, p.y, `+2 ${E.battery}`, '#8ef58e');
    Sound.play('pickup');
    addLog(`${E.battery} Energiezelle: +2 Schuss.`);
  } else if (it.type === 'medkit') {
    p.medkits++;
    floatText(p.x, p.y, `+1 ${E.medkit}`, '#8ef58e');
    Sound.play('pickup');
    addLog(`${E.medkit} Medkit eingesteckt.`);
  } else if (it.type === 'wrench') {
    p.hasTool = true;
    floatText(p.x, p.y, E.wrench, '#ffd84f');
    Sound.play('tool');
    addLog(`${E.wrench} Werkzeug gefunden! Ab zum ${E.generator} Schildgenerator.`);
  }
}

function useStation(dx, dy) {
  const p = G.player;
  bump(p, dx, dy, 0.15);
  if (!p.hasTool) {
    Sound.play('deny');
    addLog(`${E.generator} Der Schildgenerator ist defekt. Du brauchst ein ${E.wrench}.`);
    return false;
  }
  p.hasTool = false;
  G.station.repaired = true;
  state = 'won';
  sparks(G.station.x, G.station.y, '#4fd1ff', 24);
  floatText(G.station.x, G.station.y, 'Schilde online!', '#4fd1ff', 1400);
  Sound.play('win');
  addLog(`${E.generator} Schilde repariert!`);
  setTimeout(() => showScreen('won'), 1200);
  return false;
}

function playerShoot() {
  const p = G.player;
  if (p.ammo <= 0) {
    Sound.play('empty');
    floatText(p.x, p.y, 'leer!', '#9aa6c0');
    addLog(`${E.battery} Keine Energie! Finde Energiezellen.`);
    return false;
  }
  p.ammo--;
  const [dx, dy] = p.face;
  let x = p.x, y = p.y, hit = null, prop = null;
  for (let i = 0; i < PLAYER_BASE.blasterRange; i++) {
    const nx = x + dx, ny = y + dy;
    if (!passable(nx, ny) || isStation(nx, ny)) break;
    x = nx; y = ny;
    prop = propAt(x, y);
    hit = enemyAt(x, y);
    if (hit || prop) break;
  }
  Sound.play('shoot');
  bump(p, -dx, -dy, 0.1);
  addEffect({ type: 'laser', x0: p.x, y0: p.y, x1: x, y1: y, ms: 170 });
  if (hit) damageEnemy(hit, PLAYER_BASE.blasterDmg, 'Blaster');
  else if (prop && prop.type === 'crate') damageProp(prop, PLAYER_BASE.blasterDmg);
  else {
    // Einschlag am Ende des Strahls
    const edge = prop ? 0 : 0.45;
    sparks(x + dx * edge, y + dy * edge, '#4fd1ff', 6);
    addLog('Pew! Daneben.');
  }
  return true;
}

function playerUseItem() {
  const p = G.player;
  if (p.medkits <= 0) { Sound.play('deny'); addLog(`Kein ${E.medkit} Medkit dabei.`); return false; }
  if (p.hp >= p.maxHp) { Sound.play('deny'); addLog('Du bist schon voll geheilt.'); return false; }
  p.medkits--;
  const heal = Math.min(4, p.maxHp - p.hp);
  p.hp += heal;
  floatText(p.x, p.y, `+${heal}`, '#6dff8a');
  sparks(p.x, p.y, '#6dff8a', 10);
  Sound.play('heal');
  addLog(`${E.medkit} Medkit benutzt: +${heal} ❤️`);
  return true;
}

function damageEnemy(e, dmg, how) {
  const t = ENEMY_TYPES[e.type];
  const surprised = e.mode === 'sleep';
  if (surprised) { dmg *= 2; how = 'Überraschungsangriff'; }
  const wasCalm = e.alert === 0;
  e.hp -= dmg;
  addEffect({ type: 'hit', ent: e, ms: 160 });
  floatText(e.x, e.y, `-${dmg}`, '#ffd84f');
  sparks(e.x, e.y, '#ffcf4f', 8);
  if (e.hp <= 0) {
    G.enemies.splice(G.enemies.indexOf(e), 1);
    addEffect({ type: 'boom', x: e.x, y: e.y, ms: 450 });
    sparks(e.x, e.y, '#ff8a3d', 18);
    shake(4, 180);
    Sound.play('explode');
    addLog(`💥 ${t.emoji} ${t.name} zerstört!${surprised ? ' (Überraschung!)' : ''}`);
  } else {
    Sound.play('hit');
    addLog(`${how}: ${t.emoji} −${dmg}`);
    if (e.mode === 'sleep') e.mode = 'guard';
    e.alert = 6;
    if (wasCalm) raiseAlarm([e]);
  }
}

// ---------- Gegnerzug ----------
const ALERT_TURNS = 6, ALARM_RADIUS = 7, WAKE_RADIUS = 2;

function enemiesAct() {
  const p = G.player;
  const dist = bfs(p.x, p.y, () => true);
  const spotted = [];
  for (const e of G.enemies.slice()) {
    const t = ENEMY_TYPES[e.type];
    const d = manhattan(e, p);
    const sees = G.visible[idx(e.x, e.y)] && d <= t.sight;

    if (e.mode === 'sleep') {
      // Schlafende Drohnen wachen nur auf, wenn man direkt an ihnen vorbeiläuft
      if (sees && d <= WAKE_RADIUS) { e.mode = 'guard'; e.alert = ALERT_TURNS; spotted.push(e); }
      continue;
    }

    if (sees) { if (e.alert === 0) spotted.push(e); e.alert = ALERT_TURNS; }
    else if (e.alert > 0 && --e.alert === 0) floatText(e.x, e.y, '❓', '#9aa6c0');

    if (d === 1 && e.alert > 0) { enemyAttack(e, t); continue; }

    if (e.alert > 0) {
      const cur = dist[idx(e.x, e.y)];
      const moves = freeSteps(e).filter(([x, y]) => dist[idx(x, y)] !== -1 && dist[idx(x, y)] < cur);
      if (moves.length) [e.x, e.y] = pick(moves);
    } else if (e.mode === 'patrol') {
      patrolStep(e);
    } else if (Math.random() < 0.4) {
      // Wachen bleiben in ihrem Raum
      const moves = freeSteps(e).filter(([x, y]) => e.home < 0 || G.roomAt[idx(x, y)] === e.home);
      if (moves.length) [e.x, e.y] = pick(moves);
    }
  }
  if (spotted.length) raiseAlarm(spotted);
}

function freeSteps(e) {
  return Object.values(DIRS).map(([dx, dy]) => [e.x + dx, e.y + dy])
    .filter(([x, y]) => passable(x, y) && !occupied(x, y));
}

// Patrouille: von Raum zu Raum laufen
function patrolStep(e) {
  if (!e.route || e.route.dist[idx(e.x, e.y)] === 0 || e.route.stuck > 3) {
    const ri = rand(0, G.rooms.length - 1);
    const r = G.rooms[ri];
    const tx = rand(r.x, r.x + r.w - 1), ty = rand(r.y, r.y + r.h - 1);
    if (G.props.has(idx(tx, ty)) || isStation(tx, ty)) return;
    e.route = { dist: bfs(tx, ty, (x, y) => !isStation(x, y)), stuck: 0 };
  }
  const dist = e.route.dist, cur = dist[idx(e.x, e.y)];
  const moves = freeSteps(e).filter(([x, y]) => dist[idx(x, y)] !== -1 && dist[idx(x, y)] < cur);
  if (moves.length) [e.x, e.y] = pick(moves);
  else e.route.stuck++;
}

// Drohnen entdecken den Captain und alarmieren ihre Nachbarn (eine Meldung pro Runde)
function raiseAlarm(spotters) {
  const alerted = new Set(spotters);
  for (const e of spotters) {
    floatText(e.x, e.y, '❗', '#ff5a6e');
    for (const o of G.enemies) {
      if (alerted.has(o) || o.alert > 0 || manhattan(o, e) > ALARM_RADIUS) continue;
      if (o.mode === 'sleep') o.mode = 'guard';
      o.alert = ALERT_TURNS;
      alerted.add(o);
      floatText(o.x, o.y, '❗', '#ff5a6e');
    }
  }
  if (alerted.size > 1) {
    Sound.play('alarm');
    addLog(`🚨 Alarm! ${alerted.size} Drohnen jagen dich.`);
  } else {
    Sound.play('wake');
    addLog(`${ENEMY_TYPES[spotters[0].type].emoji} hat dich entdeckt!`);
  }
}

function enemyAttack(e, t) {
  const p = G.player;
  bump(e, p.x - e.x, p.y - e.y);
  if (Math.random() > t.hit) {
    floatText(p.x, p.y, 'verfehlt', '#9aa6c0');
    Sound.play('miss');
    addLog(`${t.emoji} verfehlt dich.`);
    return;
  }
  p.hp -= t.dmg;
  addEffect({ type: 'hurt', ms: 220 });
  floatText(p.x, p.y, `-${t.dmg}`, '#ff5a6e');
  shake(6, 220);
  Sound.play('hurt');
  addLog(`${t.emoji} trifft dich: −${t.dmg} ❤️`);
}

// ---------- Rundenablauf ----------
function act(action) {
  if (state !== 'play') return;
  let used = false;
  if (action === 'shoot') used = playerShoot();
  else if (action === 'item') used = playerUseItem();
  else if (action === 'wait') used = true;
  else if (DIRS[action]) used = playerMove(action);

  if (state === 'play' && used) {
    enemiesAct();
    updateFov();
    if (G.player.hp <= 0) {
      G.player.hp = 0;
      state = 'dead';
      addEffect({ type: 'boom', x: G.player.x, y: G.player.y, ms: 700 });
      shake(10, 400);
      Sound.play('death');
      addLog('☠️ Der Captain ist gefallen.');
      setTimeout(() => showScreen('dead'), 900);
    }
  }
  renderHud();
  requestRender();
}

// ---------- Effekte ----------
function addEffect(f) {
  f.t0 = performance.now();
  f.until = f.t0 + f.ms;
  G.effects.push(f);
  requestRender();
}

function floatText(x, y, text, color, ms = 800) {
  addEffect({ type: 'float', x, y, text, color, ms });
}

function sparks(x, y, color, n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3;
    parts.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 0.04 + Math.random() * 0.05 });
  }
  addEffect({ type: 'sparks', x, y, color, parts, ms: 350 + Math.random() * 150 });
}

function shake(mag, ms) {
  const now = performance.now();
  G.shake = { mag: Math.max(mag, G.shake.until > now ? G.shake.mag : 0), until: now + ms, ms };
  requestRender();
}

// kurzes Vorschnellen in eine Richtung (Angriff, gegen Wand laufen, Rückstoß)
function bump(ent, dx, dy, amount = 0.28) {
  ent.bump = { dx, dy, amount, t0: performance.now(), ms: 150 };
  requestRender();
}

// ---------- Darstellung ----------
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
let tile = 40, dpr = 1;

const COLORS = {
  corridor: '#161c2a', door: '#2a2233',
  fog: 'rgba(0,0,0,0.6)', laser: '#4fd1ff', hit: 'rgba(255,255,255,0.55)',
};

function resize() {
  const center = document.getElementById('center');
  const hud = document.getElementById('hud');
  const log = document.getElementById('log');
  const keys = document.getElementById('keys');
  const cs = center.getBoundingClientRect();
  const keysH = keys.offsetParent ? keys.offsetHeight + 6 : 0;
  const availW = cs.width - 12 - 4;
  const availH = cs.height - 12 - hud.offsetHeight - 6 - log.offsetHeight - 6 - keysH - 4;
  tile = Math.max(12, Math.floor(Math.min(availW / VIEW_W, availH / VIEW_H)));
  dpr = window.devicePixelRatio || 1;
  canvas.style.width = tile * VIEW_W + 'px';
  canvas.style.height = tile * VIEW_H + 'px';
  canvas.width = Math.round(tile * VIEW_W * dpr);
  canvas.height = Math.round(tile * VIEW_H * dpr);
  log.style.width = tile * VIEW_W + 4 + 'px';
  glyphCache.clear();
  if (G) requestRender();
}

// Emojis einmal pro Größe vorrendern – fillText mit Emojis ist teuer
const glyphCache = new Map();
function glyph(ch, cssPx) {
  const px = Math.max(4, Math.round(cssPx * dpr));
  const key = ch + '|' + px;
  let c = glyphCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(px * 1.35);
    const g = c.getContext('2d');
    g.font = `${px}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, c.width / 2, c.height / 2 + px * 0.06);
    glyphCache.set(key, c);
  }
  return c;
}

// cx/cy = Mittelpunkt in CSS-Pixeln
function drawEmoji(ch, cx, cy, scale = 0.8, alpha = 1) {
  const c = glyph(ch, tile * scale);
  const s = c.width / dpr;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(c, cx - s / 2, cy - s / 2, s, s);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

function bumpOffset(ent, now) {
  const b = ent.bump;
  if (!b) return [0, 0];
  const t = (now - b.t0) / b.ms;
  if (t >= 1) { ent.bump = null; return [0, 0]; }
  const k = Math.sin(t * Math.PI) * b.amount;
  return [b.dx * k, b.dy * k];
}

// Anzeigeposition gleitet zur echten Position
function glide(ent, dt) {
  const k = 1 - Math.exp(-dt * 22);
  ent.rx += (ent.x - ent.rx) * k;
  ent.ry += (ent.y - ent.ry) * k;
  if (Math.abs(ent.x - ent.rx) < 0.01) ent.rx = ent.x;
  if (Math.abs(ent.y - ent.ry) < 0.01) ent.ry = ent.y;
  return ent.rx !== ent.x || ent.ry !== ent.y;
}

let rafId = 0, lastFrame = 0;
function requestRender() {
  if (rafId || !G) return;
  rafId = requestAnimationFrame(frame);
}

function frame(now) {
  rafId = 0;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
  lastFrame = now;
  let busy = glide(G.player, dt) || !!G.player.bump;
  for (const e of G.enemies) busy = glide(e, dt) || !!e.bump || busy;
  G.effects = G.effects.filter(f => f.until > now);
  busy = busy || G.effects.length > 0 || G.shake.until > now;
  render(now);
  if (busy) requestRender();
  else lastFrame = 0;
}

function render(now = performance.now()) {
  if (!G) return;
  const W = VIEW_W * tile, H = VIEW_H * tile;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Kamera folgt der Anzeigeposition des Captains
  const p = G.player;
  const camX = clamp(p.rx - (VIEW_W >> 1), 0, G.w - VIEW_W);
  const camY = clamp(p.ry - (VIEW_H >> 1), 0, G.h - VIEW_H);
  let sx = 0, sy = 0;
  if (G.shake.until > now) {
    const m = G.shake.mag * ((G.shake.until - now) / G.shake.ms);
    sx = (Math.random() * 2 - 1) * m; sy = (Math.random() * 2 - 1) * m;
  }
  const ox = Math.round(-camX * tile + sx), oy = Math.round(-camY * tile + sy);
  const px = (x) => x * tile + ox, py = (y) => y * tile + oy;       // Feld -> Pixel (linke/obere Kante)
  const mx = (x) => px(x) + tile / 2, my = (y) => py(y) + tile / 2; // Feldmitte

  const isWallEdge = (x, y) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (inBounds(x + dx, y + dy) && G.tiles[idx(x + dx, y + dy)] !== T.WALL) return true;
    return false;
  };

  const x0 = Math.floor(camX), y0 = Math.floor(camY);
  for (let y = y0 - 1; y <= y0 + VIEW_H + 1; y++)
    for (let x = x0 - 1; x <= x0 + VIEW_W + 1; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (!G.explored[i]) continue;
      const t = G.tiles[i];
      if (t === T.WALL) {
        if (isWallEdge(x, y)) drawEmoji(E.wall, mx(x), my(y), 0.92);
      } else {
        const ri = G.roomAt[i];
        ctx.fillStyle = t === T.DOOR ? COLORS.door : ri >= 0 ? ROOM_THEMES[G.rooms[ri].theme].floor[(x + y) & 1] : COLORS.corridor;
        ctx.fillRect(px(x), py(y), tile + 0.5, tile + 0.5);
        if (t === T.DOOR) drawEmoji(E.door, mx(x), my(y), 0.75);
        const deco = G.deco.get(i);
        if (deco === 'vent') drawVent(px(x), py(y));
        else if (deco === 'bolt') drawEmoji('🔩', px(x) + tile * 0.3, py(y) + tile * 0.7, 0.32, 0.45);
        const pr = G.props.get(i);
        if (pr) drawEmoji(PROPS[pr.type].emoji, mx(x), my(y), PROPS[pr.type].scale);
        const it = G.items.get(i);
        if (it) {
          // Items schweben leicht
          const bob = Math.sin(now / 350 + x + y) * tile * 0.04;
          drawEmoji(ITEMS[it.type].emoji, mx(x), my(y) + bob, 0.66);
        }
      }
      if (isStation(x, y)) {
        const pulse = G.station.repaired ? 1 : 0.85 + Math.sin(now / 300) * 0.05;
        drawEmoji(G.station.repaired ? '✨' : E.generator, mx(x), my(y), pulse);
      }
      if (!G.visible[i]) { ctx.fillStyle = COLORS.fog; ctx.fillRect(px(x), py(y), tile + 0.5, tile + 0.5); }
    }

  // Gegner (nur auf sichtbaren Feldern)
  for (const e of G.enemies) {
    if (!G.visible[idx(e.x, e.y)]) continue;
    const [bx, by] = bumpOffset(e, now);
    const ex = mx(e.rx + bx), ey = my(e.ry + by);
    const asleep = e.mode === 'sleep';
    const hover = asleep ? 0 : Math.sin(now / 260 + e.x * 3) * tile * 0.03;
    drawEmoji(ENEMY_TYPES[e.type].emoji, ex, ey + hover, 0.78, asleep ? 0.7 : 1);
    if (asleep) {
      const zz = (now / 900 + e.x * 0.37) % 1;
      drawEmoji('💤', ex + tile * 0.3, ey - tile * (0.25 + zz * 0.15), 0.34, 1 - zz * 0.6);
    } else if (e.alert > 0) {
      drawEmoji('❗', ex + tile * 0.32, ey - tile * 0.3, 0.3);
    }
    if (e.hp < e.maxHp) {
      const l = ex - tile * 0.35, top = ey - tile * 0.44;
      ctx.fillStyle = '#400';
      ctx.fillRect(l, top, tile * 0.7, tile * 0.08);
      ctx.fillStyle = '#f44';
      ctx.fillRect(l, top, tile * 0.7 * e.hp / e.maxHp, tile * 0.08);
    }
  }

  // Captain + Blickrichtung
  if (state !== 'dead') {
    const [bx, by] = bumpOffset(p, now);
    const cx0 = mx(p.rx + bx), cy0 = my(p.ry + by);
    drawEmoji(E.captain, cx0, cy0, 0.8);
    const [fx, fy] = p.face;
    const cx = cx0 + fx * tile * 0.47, cy = cy0 + fy * tile * 0.47;
    const s = tile * 0.09;
    ctx.fillStyle = COLORS.laser;
    ctx.beginPath();
    ctx.moveTo(cx + fx * s, cy + fy * s);
    ctx.lineTo(cx - fx * s + fy * s, cy - fy * s + fx * s);
    ctx.lineTo(cx - fx * s - fy * s, cy - fy * s - fx * s);
    ctx.fill();
  }

  // Effekte
  for (const f of G.effects) {
    const t = (now - f.t0) / f.ms; // 0..1
    if (f.type === 'laser') {
      ctx.globalAlpha = 1 - t * 0.6;
      ctx.strokeStyle = COLORS.laser;
      ctx.lineWidth = Math.max(2, tile * 0.09 * (1 - t * 0.5));
      ctx.shadowColor = COLORS.laser; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(mx(f.x0), my(f.y0));
      ctx.lineTo(mx(f.x1), my(f.y1));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    } else if (f.type === 'hit') {
      const ent = f.ent;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = f.color || COLORS.hit;
      ctx.beginPath();
      ctx.arc(mx(ent.rx), my(ent.ry), tile * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.type === 'boom') {
      drawEmoji('💥', mx(f.x), my(f.y), 0.6 + t * 0.7, 1 - t);
    } else if (f.type === 'sparks') {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 1 - t;
      const dist = t * (f.ms / 1000);
      for (const s of f.parts) {
        const x = mx(f.x + s.vx * dist), y = my(f.y + s.vy * dist + dist * dist * 2);
        const r = s.s * tile;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
    } else if (f.type === 'float') {
      const size = Math.max(12, Math.round(tile * 0.36));
      ctx.font = `700 ${size}px system-ui, "Segoe UI", sans-serif, ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const x = mx(f.x), y = my(f.y) - tile * (0.35 + t * 0.6);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    } else if (f.type === 'hurt') {
      ctx.globalAlpha = 1 - t;
      const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
      grad.addColorStop(0, 'rgba(255,0,40,0)');
      grad.addColorStop(1, 'rgba(255,0,40,0.4)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // Items und Station schweben/pulsieren – dafür langsam weiterzeichnen
  scheduleIdle();
}

// Lüftungsgitter auf dem Boden
function drawVent(x, y) {
  const m = tile * 0.22, w = tile - 2 * m;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + m, y + m, w, w);
  ctx.strokeStyle = 'rgba(140,160,190,0.18)';
  ctx.lineWidth = Math.max(1, tile * 0.03);
  ctx.beginPath();
  for (let k = 1; k <= 3; k++) {
    const yy = y + m + (w * k) / 4;
    ctx.moveTo(x + m + 2, yy); ctx.lineTo(x + m + w - 2, yy);
  }
  ctx.stroke();
}

// Idle-Animation (schwebende Items) mit wenigen Bildern pro Sekunde, spart Akku
let idleTimer = 0;
function scheduleIdle() {
  if (idleTimer || state !== 'play') return;
  idleTimer = setTimeout(() => { idleTimer = 0; requestRender(); }, 80);
}

function renderHud() {
  const p = G.player;
  const hp = document.getElementById('hud-hp');
  hp.textContent = `❤️ ${p.hp}/${p.maxHp}`;
  hp.classList.toggle('low', p.hp <= 3);
  document.getElementById('hud-ammo').textContent = `${E.battery} ${p.ammo}`;
  document.getElementById('hud-med').textContent = `${E.medkit} ${p.medkits}`;
  const tool = document.getElementById('hud-tool');
  tool.textContent = p.hasTool ? `${E.wrench} ✔` : `${E.wrench} –`;
  tool.classList.toggle('got', p.hasTool);
  document.getElementById('hud-deck').textContent = `${G.cfg.icon} Deck ${G.cfg.id}`;
}

function renderSoundBtn() {
  document.getElementById('hud-sound').textContent = Sound.muted ? '🔇' : '🔊';
}

function renderLog() {
  const el = document.getElementById('log');
  el.replaceChildren(...G.log.map(m => { const d = document.createElement('div'); d.textContent = m; return d; }));
  const last = el.lastElementChild;
  if (last) { last.classList.add('new'); setTimeout(() => last.classList.remove('new'), 400); }
}

// ---------- Bildschirme ----------
const SCREENS = {
  title: {
    emoji: E.captain, title: 'Captain Moji', btn: 'Start',
    text: 'Das Raumschiff ist schwer beschädigt! Kämpf dich Deck für Deck zum Maschinenraum durch. ' +
          `Zuerst: Finde das ${E.wrench} und repariere den ${E.generator} Schildgenerator.`,
  },
  dead: {
    emoji: '☠️', title: 'Captain gefallen', btn: 'Neuer Run',
    text: 'Permadeath – der Run beginnt wieder bei Deck 1.',
  },
  won: {
    emoji: E.generator, title: 'Schilde repariert!', btn: 'Nochmal spielen',
    text: 'Deck 1 geschafft. Die weiteren Decks sind noch im Bau – bis dahin: neuer Run?',
  },
};

function showScreen(name) {
  const s = SCREENS[name];
  document.getElementById('screen-emoji').textContent = s.emoji;
  document.getElementById('screen-title').textContent = s.title;
  document.getElementById('screen-text').textContent = s.text;
  document.getElementById('screen-btn').textContent = s.btn;
  document.getElementById('screen').classList.remove('hidden');
}

function startRun() {
  if (state === 'play') return;
  Sound.unlock();
  document.getElementById('screen').classList.add('hidden');
  document.getElementById('screen-btn').blur();
  newRun();
  state = 'play';
  renderHud();
  resize();
}

// ---------- Eingabe ----------
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'shoot', KeyF: 'shoot', KeyE: 'item', KeyQ: 'item', KeyR: 'wait',
};
let lastKeyTime = 0;

window.addEventListener('keydown', ev => {
  if (ev.code === 'KeyM') { Sound.toggle(); return; }
  if (state !== 'play') {
    if ((ev.code === 'Enter' || ev.code === 'Space') && !document.getElementById('screen').classList.contains('hidden')) {
      ev.preventDefault();
      startRun();
    }
    return;
  }
  const a = KEYMAP[ev.code];
  if (!a) return;
  ev.preventDefault();
  const now = performance.now();
  if (ev.repeat && now - lastKeyTime < 110) return;
  lastKeyTime = now;
  act(a);
});

// Touch-Knöpfe: sofort auslösen, gedrückt halten wiederholt
function bindHold(btn, action) {
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; btn.classList.remove('active'); };
  btn.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    btn.setPointerCapture?.(ev.pointerId);
    btn.classList.add('active');
    act(action);
    clearInterval(timer);
    timer = setInterval(() => act(action), 190);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, stop));
  btn.addEventListener('contextmenu', ev => ev.preventDefault());
}
document.querySelectorAll('.dbtn').forEach(b => bindHold(b, b.dataset.dir));
document.querySelectorAll('.abtn').forEach(b => {
  b.addEventListener('pointerdown', ev => { ev.preventDefault(); b.classList.add('active'); act(b.dataset.act); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => b.classList.remove('active')));
  b.addEventListener('contextmenu', ev => ev.preventDefault());
});

document.getElementById('hud-sound').addEventListener('pointerdown', ev => { ev.preventDefault(); Sound.toggle(); });
document.getElementById('screen-btn').addEventListener('click', startRun);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---------- Start ----------
renderSoundBtn();
showScreen('title');
resize();
