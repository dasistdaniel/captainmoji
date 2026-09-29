'use strict';
// Captain Moji – Deck 1 🛡️ Schilde, Deck 2 🫁 Lebenserhaltung

// ---------- Konstanten & Konfiguration ----------
const VIEW_W = 15, VIEW_H = 9;
const FOV_RADIUS = 7;
const MEMORY_LIGHT = 0.36; // Helligkeit bereits erkundeter, gerade nicht sichtbarer Felder
const T = { WALL: 0, FLOOR: 1, DOOR: 2, LOCKED: 3 }; // LOCKED = verschlossene Tür (🔒), braucht 💳
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const E = {
  captain: '🧑‍🚀', drone: '🤖', wall: '🟫', door: '🚪',
  wrench: '🔧', battery: '🔋', medkit: '🩹', generator: '🛡️',
  terminal: '🖥️', crate: '📦', elevator: '🛗',
  lifesupport: '🫁', o2: '🫧', leak: '💨', spore: '🦠', core: '💾',
  weapons: '🎯', alien: '👾', keycard: '💳', lock: '🔒', vest: '🦺',
  drive: '⚙️', boss: '🐙', tentacle: '🦑', fire: '🔥', extinguisher: '🧯', rad: '☢️',
};

const PLAYER_BASE = { maxHp: 10, ammo: 3, meleeDmg: 2, blasterDmg: 3, blasterRange: 6 };

// Boni der reparierten Stationen
const SHIELD_RECHARGE = 15; // Züge, bis der Schild nach einem abgefangenen Treffer wieder bereit ist
const REGEN_EVERY = 12;     // alle n Züge +1 ❤️
const ELEVATOR_MIN_ROOMS = 2; // so viele Räume liegt der Aufzug mindestens von der Station entfernt

// Deck 4: Strahlung und Feuer
const RAD_LIMIT = 4;        // so viel Dosis kostet 1 ❤️
const RAD_DECAY_EVERY = 3;  // außerhalb der Strahlung sinkt die Dosis alle n Züge um 1
const EXTINGUISHER_CHARGES = 3;

// Sauerstoff (Decks mit `oxygen`)
const O2_MAX = 100;
const O2_SUFFOCATE_EVERY = 2; // ohne O₂: alle n Züge −1 ❤️

const ENEMY_TYPES = {
  drone: { emoji: E.drone, name: 'Sicherheitsdrohne', hp: 3, dmg: 1, hit: 0.75, sight: 8, alarm: true },
  // Sporen bewegen sich nicht, greifen nur Nachbarfelder an und vermehren sich
  // Aliens schlafen nie, sind zäh und treffen hart
  alien: { emoji: E.alien, name: 'Alien', hp: 4, dmg: 2, hit: 0.65, sight: 7, alarm: true, modes: { patrol: 0.55, guard: 0.45 } },
  // Boss: bewacht den Antrieb, Tentakel reichen 2 Felder weit, schickt 🦑 los
  boss: { emoji: E.boss, name: 'Tentakelmonster', hp: 18, dmg: 2, hit: 0.6, sight: 7, boss: true, reach: 2, noDrop: true },
  tentacle: { emoji: E.tentacle, name: 'Tentakel', hp: 1, dmg: 1, hit: 0.6, sight: 8, noDrop: true },
  spore: { emoji: E.spore, name: 'Sporenkolonie', hp: 1, dmg: 1, hit: 0.6, sight: 1, static: true, spread: 0.022 },
};

// Hindernisse im Raum. Alle blockieren Bewegung und Schüsse, aber nicht die Sicht.
const PROPS = {
  crate:    { emoji: E.crate,    name: 'Kiste',       scale: 0.72, hp: 2 },
  terminal: { emoji: E.terminal, name: 'Terminal',    scale: 0.72 },
  bed:      { emoji: '🛏️',       name: 'Koje',        scale: 0.8 },
  plant:    { emoji: '🪴',       name: 'Pflanze',     scale: 0.7 },
  sprout:   { emoji: '🌱',       name: 'Setzling',    scale: 0.62 },
  o2:       { emoji: E.o2,       name: 'O₂-Station',  scale: 0.75 },
  elevator: { emoji: E.elevator, name: 'Aufzug',      scale: 0.85 },
  barrel:   { emoji: '🛢️',       name: 'Kühlmittelfass', scale: 0.72 },
  cooler:   { emoji: '🧊',       name: 'Kühlaggregat', scale: 0.68 },
  rack:     { emoji: '🗄️',       name: 'Waffenschrank', scale: 0.75 },
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
  schleuse:  { name: 'Aufzugsvorraum',      icon: E.elevator, floor: ['#1c2130', '#202536'], props: { terminal: [1, 1] } },
  hydro:     { name: 'Hydrokultur',         icon: '🌱',       floor: ['#15241a', '#18291d'], props: { sprout: [3, 6] }, scatter: true },
  lifesupp:  { name: 'Lebenserhaltung',     icon: E.lifesupport, floor: ['#122429', '#15292f'], props: {}, bolts: 0.1 },
  hangar:    { name: 'Sicherheitsposten',   icon: E.terminal, floor: ['#1e1c26', '#22202b'], props: { terminal: [1, 1], crate: [0, 1] } },
  waffen:    { name: 'Waffensysteme',       icon: E.weapons,  floor: ['#261a14', '#2b1e17'], props: {}, bolts: 0.1 },
  armory:    { name: 'Waffenkammer',        icon: E.lock,     floor: ['#2a1618', '#2f191b'], props: { rack: [2, 3] } },
  leitstand: { name: 'Leitstand',           icon: E.terminal, floor: ['#1a1d2a', '#1e2130'], props: { terminal: [1, 1] } },
  antrieb:   { name: 'Antrieb',             icon: E.drive,    floor: ['#2a1f12', '#2f2314'], props: {}, bolts: 0.14 },
  reaktor:   { name: 'Reaktorraum',         icon: E.rad,      floor: ['#15220f', '#182612'], props: { barrel: [1, 3] }, radiation: true },
  maschinen: { name: 'Maschinenhalle',      icon: '🔩',       floor: ['#1f1c18', '#23201b'], props: { crate: [1, 2], barrel: [0, 1] }, bolts: 0.15 },
  kuehlung:  { name: 'Kühlsystem',          icon: '🧊',       floor: ['#14202c', '#172431'], props: { cooler: [2, 3] } },
  nest:      { name: 'Befallener Raum',     icon: '🕸️',       floor: ['#1c1424', '#201729'], props: { crate: [0, 1] }, webs: 0.12 },
};

// Reparierbare Schiffssysteme – jedes gibt einen dauerhaften Bonus für den Run
const STATIONS = {
  generator: {
    emoji: E.generator, name: 'Schildgenerator', done: 'Schilde repariert!', bonus: 'shield',
    bonusText: `${E.generator} Bonus: Dein Schild fängt ab jetzt regelmäßig einen Treffer ab.`,
  },
  lifesupport: {
    emoji: E.lifesupport, name: 'Lebenserhaltung', done: 'Lebenserhaltung läuft wieder!', bonus: 'regen',
    bonusText: `${E.lifesupport} Bonus: Du regenerierst langsam ❤️.`,
  },
  weapons: {
    emoji: E.weapons, name: 'Waffensysteme', done: 'Waffensysteme online!', bonus: 'blaster',
    bonusText: `${E.weapons} Bonus: Dein Blaster macht +1 Schaden.`,
  },
  drive: {
    emoji: E.drive, name: 'Antrieb', done: 'Antrieb repariert!', bonus: 'drive',
    bonusText: `${E.drive} Der Antrieb läuft – das Schiff ist gerettet!`,
  },
};

// Jedes Deck ist nur eine Konfiguration.
const DECKS = [
  {
    id: 1, name: 'Schilde', icon: E.generator,
    w: 50, h: 30, maxRooms: 10,
    startTheme: 'bruecke', stationTheme: 'generator',
    themes: ['lager', 'lager', 'kontroll', 'quartier', 'technik', 'messe'],
    enemies: { drone: [5, 7] },
    // Verhalten der Drohnen: schlafend 💤, patrouillierend, bewachend
    modes: { sleep: 0.35, patrol: 0.3, guard: 0.35 },
    items: { medkit: [1, 2], battery: [2, 3] },
    crateLoot: { battery: 0.3, medkit: 0.15, core: 0.12 },
    goalItem: 'wrench', station: 'generator', goalMinRooms: 3,
    intro: 'Finde das 🔧 und bring es zum 🛡️ Schildgenerator.',
    briefing: {
      goal: 'Finde das 🔧 Werkzeug und repariere den 🛡️ Schildgenerator.',
      tips: [
        '🤖 Sicherheitsdrohnen patrouillieren. Schlafende 💤 überraschst du mit doppeltem Schaden.',
        '🔫 Blaster schießt in Blickrichtung und kostet 🔋 – Nahkampf durch Hineinlaufen.',
        '🖥️ Terminals zeigen dir die Richtung. 📦 Kisten enthalten manchmal 🔋 oder 🩹.',
        '🛗 Danach bringt dich der Aufzug zum nächsten Deck.',
      ],
      reward: '🛡️ Schild: fängt regelmäßig einen Treffer ab.',
    },
  },
  {
    id: 2, name: 'Lebenserhaltung', icon: E.lifesupport,
    w: 50, h: 30, maxRooms: 10,
    startTheme: 'schleuse', stationTheme: 'lifesupp',
    themes: ['hydro', 'hydro', 'quartier', 'technik', 'lager', 'messe', 'kontroll'],
    enemies: { drone: [3, 4], spore: [3, 4] },
    modes: { sleep: 0.3, patrol: 0.35, guard: 0.35 },
    items: { medkit: [1, 2], battery: [2, 3] },
    crateLoot: { battery: 0.3, medkit: 0.2, core: 0.12 },
    goalItem: 'wrench', station: 'lifesupport', goalMinRooms: 3,
    oxygen: { drain: 0.35, perLeak: 0.15, stations: [3, 4], leaks: [4, 6], sporeCap: 30 },
    intro: 'O₂ wird knapp! 💨 Lecks abdichten, an 🫧 tanken, 🔧 zur 🫁 bringen.',
    briefing: {
      goal: 'Finde das 🔧 Werkzeug und repariere die 🫁 Lebenserhaltung.',
      tips: [
        '🫧 Der Sauerstoff sinkt mit jedem Zug. O₂-Stationen füllen ihn einmal komplett auf.',
        '💨 Lecks lassen den Sauerstoff schneller sinken – lauf dagegen, um sie abzudichten.',
        '🦠 Sporen bewegen sich nicht, wachsen aber nach. Nicht trödeln!',
      ],
      reward: '🫁 Lebenserhaltung: Du regenerierst langsam ❤️.',
    },
  },
  {
    id: 3, name: 'Waffensysteme', icon: E.weapons,
    w: 52, h: 30, maxRooms: 11,
    startTheme: 'hangar', stationTheme: 'waffen',
    themes: ['nest', 'nest', 'lager', 'kontroll', 'quartier', 'technik', 'messe'],
    enemies: { drone: [3, 4], alien: [4, 5] },
    modes: { sleep: 0.3, patrol: 0.35, guard: 0.35 },
    items: { medkit: [1, 2], battery: [2, 3] },
    crateLoot: { battery: 0.3, medkit: 0.2, core: 0.12 },
    goalItem: 'wrench', station: 'weapons', goalMinRooms: 3,
    // Das Zielitem liegt in der verschlossenen Waffenkammer – die Keycard liegt woanders
    armory: { loot: ['vest', 'battery', 'battery', 'medkit', 'core'] },
    intro: 'Aliens an Bord! 💳 Keycard finden, 🔒 Waffenkammer öffnen, 🔧 zur 🎯 bringen.',
    briefing: {
      goal: 'Hol das 🔧 aus der 🔒 Waffenkammer und repariere die 🎯 Waffensysteme.',
      tips: [
        '👾 Aliens schlafen nie, halten 4 Treffer aus und treffen hart (−2 ❤️). Blaster auf Abstand hilft.',
        '🔒 Die Waffenkammer öffnet nur mit der 💳 Keycard – drinnen warten 🦺 Schutzweste, 🔋 und 🩹.',
        '🖥️ Terminals orten die Keycard für dich.',
      ],
      reward: '🎯 Waffensysteme: Dein Blaster macht +1 Schaden.',
    },
  },
  {
    id: 4, name: 'Maschinenraum', icon: E.drive,
    w: 52, h: 30, maxRooms: 11,
    startTheme: 'leitstand', stationTheme: 'antrieb',
    themes: ['reaktor', 'reaktor', 'maschinen', 'maschinen', 'kuehlung', 'lager', 'technik'],
    enemies: { drone: [2, 3], alien: [2, 3] },
    modes: { sleep: 0.3, patrol: 0.35, guard: 0.35 },
    items: { medkit: [2, 2], battery: [2, 3], extinguisher: [1, 2] },
    crateLoot: { battery: 0.3, medkit: 0.2, core: 0.12 },
    goalItem: 'wrench', station: 'drive', goalMinRooms: 3,
    final: true,
    boss: 'boss',
    fire: { sources: [3, 4], spread: 0.05, burn: [16, 24], cap: 50, shortEvery: [20, 30] },
    intro: 'Finale! 🔥 Feuer, ☢️ Strahlung und das 🐙 Tentakelmonster vor dem ⚙️ Antrieb.',
    briefing: {
      goal: 'Finde das 🔧 Antriebsteil, besiege das 🐙 Tentakelmonster und repariere den ⚙️ Antrieb.',
      tips: [
        '🔥 Feuer breitet sich aus und verbrennt dich (−1 ❤️). Mit 🧯 Feuerlöscher: gegen das Feuer laufen = löschen.',
        '☢️ In Reaktorräumen sammelt sich Strahlung an – zu viel kostet ❤️. Nicht trödeln!',
        '🐙 Das Tentakelmonster bewacht den Antrieb. Seine Tentakel reichen 2 Felder weit – halte Abstand und nutze den Blaster.',
      ],
      reward: '⚙️ Antrieb: Das Schiff ist gerettet!',
    },
  },
];

const ITEMS = {
  wrench:  { emoji: E.wrench,  name: 'Werkzeug' },
  battery: { emoji: E.battery, name: 'Energiezelle' },
  medkit:  { emoji: E.medkit,  name: 'Medkit' },
  core:    { emoji: E.core,    name: 'Datenkern' },
  keycard: { emoji: E.keycard, name: 'Keycard' },
  vest:    { emoji: E.vest,    name: 'Schutzweste' },
  extinguisher: { emoji: E.extinguisher, name: 'Feuerlöscher' },
};

// ---------- Meta-Progression: Datenkerne & Forschungslabor ----------
// Reparatur-Droide (Labor-Upgrade)
const DROID = { hp: 6, dmg: 1, hit: 0.85, healEvery: 15, leash: 5 };

const CORE_DROP = 0.35;    // Chance, dass eine Drohne einen 💾 fallen lässt
const CORES_PER_STATION = 3;

// Upgrades bewusst klein halten, damit das Spiel nicht zu leicht wird
const UPGRADES = [
  { id: 'hp',      icon: '❤️', name: 'Verstärkter Anzug',     costs: [4, 6, 8, 10, 12], desc: () => '+1 max. ❤️ pro Stufe' },
  { id: 'medkit',  icon: '🩹', name: 'Notfallpaket',          costs: [6, 12],           desc: () => 'Start mit einem 🩹 Medkit pro Stufe' },
  { id: 'ammo',    icon: '🔋', name: 'Größere Energiezellen', costs: [5, 8, 12],        desc: () => '+2 🔋 Startmunition pro Stufe' },
  { id: 'scanner', icon: '📡', name: 'Scanner',               costs: [8, 16],
    desc: lvl => lvl < 1 ? 'Markiert beim Betreten eines Decks Station und Aufzug' : 'Zeigt beim Betreten eines Decks den ganzen Plan' },
  { id: 'droid',   icon: '🤖', name: 'Reparatur-Droide',      costs: [30],
    desc: () => 'Begleiter: kämpft mit und repariert dich, wenn er neben dir steht' },
];

const Meta = {
  KEY: 'captainMoji.save',
  data: { cores: 0, totalCores: 0, upgrades: {}, runs: 0, bestDeck: 0, wins: 0 },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY));
      if (d) Object.assign(this.data, d, { upgrades: Object.assign({}, d.upgrades) });
    } catch (e) { /* ohne Speicher geht es auch */ }
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* egal */ }
  },
  level(id) { return this.data.upgrades[id] || 0; },
  // Kerne werden sofort gesichert – auch wenn der Tab geschlossen wird
  addCores(n) {
    this.data.cores += n;
    this.data.totalCores += n;
    this.save();
  },
  nextCost(up) { return up.costs[this.level(up.id)]; },
  canBuy(up) {
    const cost = this.nextCost(up);
    return !up.soon && cost !== undefined && this.data.cores >= cost;
  },
  buy(up) {
    if (!this.canBuy(up)) return false;
    this.data.cores -= this.nextCost(up);
    this.data.upgrades[up.id] = this.level(up.id) + 1;
    this.save();
    return true;
  },
  reset() {
    this.data = { cores: 0, totalCores: 0, upgrades: {}, runs: 0, bestDeck: 0, wins: 0 };
    this.save();
  },
};
Meta.load();

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
let state = 'title'; // title | play | travel | dead | won

function newRun(deckIndex = 0) {
  G = {
    deckIndex,
    turn: 0,
    runCores: 0,
    player: { x: 0, y: 0, hp: PLAYER_BASE.maxHp + Meta.level('hp'), maxHp: PLAYER_BASE.maxHp + Meta.level('hp'),
              ammo: PLAYER_BASE.ammo + 2 * Meta.level('ammo'), medkits: Meta.level('medkit'), hasTool: false, face: [1, 0],
              bonuses: new Set(), shieldReady: false, shieldTimer: 0, o2: O2_MAX },
    log: [],
    effects: [],
    shake: { until: 0, mag: 0 },
  };
  // Zum Testen späterer Decks: Boni der vorherigen Decks gleich mitgeben
  for (let i = 0; i < deckIndex; i++) grantBonus(STATIONS[DECKS[i].station].bonus);
  loadDeck(DECKS[G.deckIndex]);
}

function grantBonus(bonus) {
  const p = G.player;
  p.bonuses.add(bonus);
  if (bonus === 'shield') { p.shieldReady = true; p.shieldTimer = 0; }
}

// ---------- Deck-Generierung ----------
function loadDeck(cfg) {
  // Karten ohne genug weit entfernte Räume für Station und Zielitem werden neu gewürfelt
  let map;
  for (let tries = 0; tries < 30; tries++) {
    map = generateMap(cfg);
    Object.assign(G, map, { props: null, droid: null });
    const hops = roomHops(0);
    if (hops.filter(h => h >= cfg.goalMinRooms).length >= 2) break;
  }
  Object.assign(G, map, {
    cfg, enemies: [], items: new Map(), props: new Map(), deco: new Map(), leaks: new Map(), station: null, droid: null,
    fire: new Map(), ash: new Map(), rad: new Uint8Array(map.w * map.h), nextShort: 0, boss: null,
    visitedRooms: new Set([0]), sporeWarned: false,
    explored: new Uint8Array(map.w * map.h), visible: new Uint8Array(map.w * map.h),
    fade: new Float32Array(map.w * map.h), // angezeigte Helligkeit je Feld, gleitet zum Zielwert
  });

  const { rooms } = G;
  const start = rooms[0];
  const p = G.player;
  p.x = p.rx = start.cx;
  p.y = p.ry = start.cy;
  p.hasTool = false;
  p.hasKeycard = false;
  p.o2 = O2_MAX;
  p.rad = 0;
  p.extinguisher = 0;
  p.bump = null;

  // Station in den am weitesten entfernten Raum – gemessen in Räumen, bei Gleichstand in Feldern
  const dist = bfs(p.x, p.y, () => true);
  const hops = roomHops(0);
  const tileDist = i => dist[idx(rooms[i].cx, rooms[i].cy)];
  let far = 1;
  for (let i = 2; i < rooms.length; i++)
    if (hops[i] > hops[far] || (hops[i] === hops[far] && tileDist(i) > tileDist(far))) far = i;
  G.station = { x: rooms[far].cx, y: rooms[far].cy, type: cfg.station, repaired: false, room: far };

  rooms.forEach((r, i) => { r.theme = i === 0 ? cfg.startTheme : i === far ? cfg.stationTheme : pick(cfg.themes); });
  // Aufzug zum nächsten Deck – in einem eigenen Raum, mindestens `elevatorMinRooms` von der Station
  // entfernt, damit man nach der Reparatur noch einmal durchs Deck muss. Erst nach der Reparatur nutzbar.
  // Auf dem letzten Deck gibt es keinen Aufzug mehr.
  G.elevatorRoom = -1;
  G.elevator = null;
  if (!cfg.final) {
    const fromStation = roomHops(far);
    const liftRooms = rooms.map((r, i) => i).filter(i => i !== 0 && i !== far);
    const maxFromStation = Math.max(...liftRooms.map(i => fromStation[i]));
    const liftCandidates = liftRooms.filter(i => fromStation[i] >= Math.min(ELEVATOR_MIN_ROOMS, maxFromStation));
    G.elevatorRoom = pick(liftCandidates.length ? liftCandidates : [far]);
    for (const scatter of [false, true]) {
      if (tryPlaceProp(G.elevatorRoom, 'elevator', scatter, 200)) break;
    }
    G.elevator = [...G.props.values()].find(pr => pr.type === 'elevator');
  }
  // Deck 4: mindestens ein Reaktorraum
  if (cfg.fire && !rooms.some(r => r.theme === 'reaktor')) {
    const opts = rooms.map((r, i) => i).filter(i => i !== 0 && i !== far);
    rooms[pick(opts)].theme = 'reaktor';
  }
  if (cfg.oxygen) {
    // eine O₂-Station immer im Startraum, damit man sie kennenlernt
    tryPlaceProp(0, 'o2', false, 80);
    const n = rand(...cfg.oxygen.stations) - 1;
    for (let i = 0; i < n; i++) tryPlaceProp(rand(1, rooms.length - 1), 'o2', false, 80);
  }
  rooms.forEach((r, i) => placeProps(i));
  placeDeco();
  if (cfg.oxygen) placeLeaks(rand(...cfg.oxygen.leaks));

  // Zielitem weder im Start- noch im Stationsraum und mindestens `goalMinRooms` Räume vom Start entfernt
  let others = rooms.map((r, i) => i).filter(i => i !== 0 && i !== far && i !== G.elevatorRoom);
  if (!others.length) others = rooms.map((r, i) => i).filter(i => i !== 0 && i !== far);
  const maxHops = Math.max(...others.map(i => hops[i]));
  const candidates = others.filter(i => hops[i] >= Math.min(cfg.goalMinRooms, maxHops));

  // Deck 3: Zielitem in der verschlossenen Waffenkammer, Keycard in einem anderen Raum
  G.armoryRoom = cfg.armory ? setupArmory(pick(candidates.length ? candidates : others), others) : -1;
  // sehr selten passt kein Raum als Waffenkammer – dann die Karte neu würfeln
  if (cfg.armory && G.armoryRoom < 0 && (G.rerolls = (G.rerolls || 0) + 1) < 20) return loadDeck(cfg);
  G.rerolls = 0;
  if (G.armoryRoom >= 0) {
    placeItem(cfg.goalItem, G.armoryRoom);
    for (const type of cfg.armory.loot) placeItem(type, G.armoryRoom);
    const cardRooms = others.filter(i => i !== G.armoryRoom);
    const far2 = cardRooms.filter(i => hops[i] >= 2);
    placeItem('keycard', pick(far2.length ? far2 : cardRooms));
  } else {
    placeItem(cfg.goalItem, pick(candidates));
  }

  // lose Items und Gegner nie in der Waffenkammer
  const openRooms = rooms.map((r, i) => i).filter(i => i !== 0 && i !== G.armoryRoom);
  if (cfg.fire) placeItem('extinguisher', 0); // ein Feuerlöscher immer im Startraum
  for (const [type, [a, b]] of Object.entries(cfg.items)) {
    const n = rand(a, b);
    for (let i = 0; i < n; i++) placeItem(type, pick(openRooms));
  }
  for (const [type, [a, b]] of Object.entries(cfg.enemies)) {
    const n = rand(a, b);
    for (let i = 0; i < n; i++) {
      const ri = pick(openRooms);
      const pos = freeTileInRoom(ri);
      if (!pos) continue;
      const t = ENEMY_TYPES[type];
      const mode = t.static ? 'static' : rollTable(t.modes || cfg.modes) || 'guard';
      G.enemies.push(makeEnemy(type, pos.x, pos.y, mode, ri));
    }
  }
  // Boss direkt neben der Station
  if (cfg.boss) {
    const spot = Object.values(DIRS).map(([dx, dy]) => ({ x: G.station.x + dx, y: G.station.y + dy }))
      .find(q => passable(q.x, q.y) && !occupied(q.x, q.y)) || freeTileInRoom(far);
    G.boss = makeEnemy(cfg.boss, spot.x, spot.y, 'boss', far);
    G.boss.awake = false;
    G.boss.turns = 0;
    G.enemies.push(G.boss);
  }
  // Strahlung in Reaktorräumen, Feuerherde in zufälligen Räumen
  rooms.forEach((r, i) => {
    if (!ROOM_THEMES[r.theme].radiation) return;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) G.rad[idx(x, y)] = 1;
  });
  if (cfg.fire) {
    const fireRooms = rooms.map((r, i) => i).filter(i => i !== 0 && i !== far);
    const n = rand(...cfg.fire.sources);
    for (let k = 0; k < n; k++) {
      const pos = freeTileInRoom(pick(fireRooms));
      if (pos) igniteArea(pos.x, pos.y);
    }
    G.nextShort = rand(...cfg.fire.shortEvery);
  }

  Meta.data.bestDeck = Math.max(Meta.data.bestDeck, cfg.id);
  Meta.save();
  // Reparatur-Droide startet neben dem Captain – auf jedem Deck frisch repariert
  G.droid = null;
  if (Meta.level('droid')) {
    const spot = Object.values(DIRS).map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
      .find(q => passable(q.x, q.y) && !occupied(q.x, q.y)) || freeTileInRoom(0);
    if (spot) G.droid = { x: spot.x, y: spot.y, rx: spot.x, ry: spot.y, hp: DROID.hp, maxHp: DROID.hp, healTimer: 0 };
  }

  const scan = Meta.level('scanner');
  if (scan >= 2) G.explored.fill(1);
  else if (scan >= 1) { markRoomOnMap(G.station.room); if (G.elevatorRoom >= 0) markRoomOnMap(G.elevatorRoom); }

  updateFov();
  addLog(`${cfg.icon} Deck ${cfg.id}: ${cfg.name}`);
  addLog(cfg.intro);
  if (scan) addLog(`📡 Scanner: ${scan >= 2 ? 'kompletter Deckplan geladen.' : 'Station und Aufzug markiert.'}`);
  if (G.droid) addLog('🤖 Dein Reparatur-Droide ist einsatzbereit.');
}

// Waffenkammer: alle Eingänge des Raums werden zu verschlossenen Türen.
// Nur wenn der Rest des Decks dann noch erreichbar bleibt – sonst den nächsten Raum probieren.
function setupArmory(preferred, candidates) {
  const order = [preferred, ...candidates.filter(i => i !== preferred).sort(() => Math.random() - 0.5)];
  for (const ri of order) {
    const r = G.rooms[ri], openings = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const ring = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (ring && inBounds(x, y) && G.tiles[idx(x, y)] !== T.WALL) openings.push(idx(x, y));
      }
    if (!openings.length) continue;
    const before = openings.map(i => G.tiles[i]);
    openings.forEach(i => { G.tiles[i] = T.LOCKED; });
    const d = bfs(G.player.x, G.player.y, (x, y) => !isStation(x, y));
    const st = idx(G.station.x, G.station.y);
    let ok = true;
    for (let i = 0; i < d.length && ok; i++)
      if (passable(i % G.w, (i / G.w) | 0) && d[i] === -1 && i !== st && !G.props.has(i) && G.roomAt[i] !== ri) ok = false;
    // wieder öffnen: erst einrichten (Hindernisse brauchen die Erreichbarkeitsprüfung), dann verschließen
    openings.forEach((i, k) => { G.tiles[i] = before[k]; });
    if (ok) {
      G.rooms[ri].theme = 'armory';
      for (const [key] of [...G.props]) if (G.roomAt[key] === ri) G.props.delete(key);
      for (const [key] of [...G.deco]) if (G.roomAt[key] === ri) G.deco.delete(key);
      placeProps(ri);
      openings.forEach(i => { G.tiles[i] = T.LOCKED; });
      return ri;
    }
  }
  return -1;
}

function unlockArmory(x, y) {
  const p = G.player;
  if (!p.hasKeycard) {
    Sound.play('deny');
    addLog(`${E.lock} Verschlossen. Du brauchst eine ${E.keycard} Keycard.`);
    return false;
  }
  let n = 0;
  for (let i = 0; i < G.tiles.length; i++) if (G.tiles[i] === T.LOCKED) { G.tiles[i] = T.DOOR; n++; }
  p.hasKeycard = false;
  sparks(x, y, '#ffd84f', 14);
  floatText(x, y, '🔓 offen', '#ffd84f', 1100);
  Sound.play('unlock');
  addLog(`🔓 Keycard akzeptiert – die Waffenkammer ist offen!`);
  return true;
}

// ---------- Feuer ----------
function canBurn(i) {
  const x = i % G.w, y = (i / G.w) | 0;
  return G.tiles[i] !== T.WALL && G.tiles[i] !== T.LOCKED && !G.props.has(i) && !G.ash.has(i) &&
         !G.fire.has(i) && !isStation(x, y);
}

function ignite(i) {
  if (!canBurn(i)) return false;
  G.fire.set(i, rand(...G.cfg.fire.burn));
  return true;
}

// Feuerherd: Mittelpunkt plus ein paar Nachbarfelder
function igniteArea(x, y) {
  ignite(idx(x, y));
  for (const [dx, dy] of Object.values(DIRS)) if (Math.random() < 0.6 && inBounds(x + dx, y + dy)) ignite(idx(x + dx, y + dy));
}

function tickFire() {
  const cf = G.cfg.fire;
  if (!cf) return;
  // Asche kühlt ab, danach kann dort wieder etwas brennen
  for (const [i, t] of G.ash) { if (t <= 1) G.ash.delete(i); else G.ash.set(i, t - 1); }
  const fresh = [];
  for (const [i, t] of G.fire) {
    if (t <= 1) { G.fire.delete(i); G.ash.set(i, 25); continue; }
    G.fire.set(i, t - 1);
    if (G.fire.size + fresh.length >= cf.cap) continue;
    const x = i % G.w, y = (i / G.w) | 0;
    for (const [dx, dy] of Object.values(DIRS))
      if (Math.random() < cf.spread && inBounds(x + dx, y + dy)) fresh.push(idx(x + dx, y + dy));
  }
  fresh.forEach(ignite);
  // Kurzschluss: ab und zu ein neuer Brandherd
  if (--G.nextShort <= 0) {
    G.nextShort = rand(...cf.shortEvery);
    const opts = G.rooms.map((r, i) => i).filter(i => i !== 0 && i !== G.roomAt[idx(G.player.x, G.player.y)]);
    const ri = pick(opts);
    const pos = freeTileInRoom(ri);
    if (pos) {
      igniteArea(pos.x, pos.y);
      Sound.play('short');
      addLog(`⚡ Kurzschluss! Feuer im ${ROOM_THEMES[G.rooms[ri].theme].name} (${compass(G.player, pos)}).`);
    }
  }
  // Gegner und Droide im Feuer nehmen Schaden (der Boss nicht)
  for (const e of G.enemies.slice()) {
    const t = ENEMY_TYPES[e.type];
    if (t.boss || !G.fire.has(idx(e.x, e.y))) continue;
    e.hp -= 1;
    floatText(e.x, e.y, '-1', '#ff9a3d');
    if (e.hp <= 0) {
      G.enemies.splice(G.enemies.indexOf(e), 1);
      sparks(e.x, e.y, '#ff8a3d', 12);
      if (G.visible[idx(e.x, e.y)]) addLog(`🔥 ${t.emoji} ${t.name} verbrennt.`);
    }
  }
  const d = G.droid;
  if (d && d.hp > 0 && G.fire.has(idx(d.x, d.y))) attackDroid({ x: d.x, y: d.y - 1 }, { dmg: 1, hit: 1, emoji: E.fire });
}

// Mit dem Feuerlöscher gegen Feuer laufen: löscht ein 3×3-Feld
function extinguish(x, y, dx, dy) {
  const p = G.player;
  bump(p, dx, dy, 0.2);
  p.extinguisher--;
  let n = 0;
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      if (!inBounds(x + ox, y + oy)) continue;
      const i = idx(x + ox, y + oy);
      if (G.fire.delete(i)) { n++; G.ash.set(i, 25); }
    }
  sparks(x, y, '#e8f4ff', 22);
  addEffect({ type: 'foam', x, y, ms: 500 });
  Sound.play('extinguish');
  addLog(`${E.extinguisher} ${n} ${n === 1 ? 'Feuer' : 'Feuerfelder'} gelöscht. ${p.extinguisher ? `Noch ${p.extinguisher} Ladungen.` : 'Der Löscher ist leer.'}`);
  return true;
}

// Lecks sitzen in Raumwänden; man dichtet sie ab, indem man gegen sie läuft
function placeLeaks(n) {
  const spots = [];
  for (let i = 0; i < G.tiles.length; i++) {
    if (G.tiles[i] !== T.WALL) continue;
    const x = i % G.w, y = (i / G.w) | 0;
    const floors = Object.values(DIRS).filter(([dx, dy]) => {
      if (!inBounds(x + dx, y + dy)) return false;
      const ni = idx(x + dx, y + dy);
      return G.tiles[ni] === T.FLOOR && G.roomAt[ni] > 0 && !G.props.has(ni);
    });
    if (floors.length === 1) spots.push({ x, y, dir: floors[0] });
  }
  const leaks = [];
  for (let tries = 0; tries < 200 && leaks.length < n && spots.length; tries++) {
    const s = pick(spots);
    if (leaks.some(l => manhattan(l, s) < 5)) continue;
    leaks.push(s);
    G.leaks.set(idx(s.x, s.y), { x: s.x, y: s.y, dir: s.dir, active: true });
  }
}

function activeLeaks() {
  let n = 0;
  for (const l of G.leaks.values()) if (l.active) n++;
  return n;
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
    const overlaps = rooms.some(r => x - 3 < r.x + r.w && x + rw + 3 > r.x && y - 3 < r.y + r.h && y + rh + 3 > r.y);
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
  // Doppeltüren vermeiden: liegt direkt dahinter (oder ein Gangfeld weiter) schon eine Tür, wird diese zum Gang
  const doorAt = (x, y) => !isWall(x, y) && tiles[at(x, y)] === T.DOOR;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== T.DOOR) continue;
    const x = i % w, y = (i / w) | 0;
    const twin = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      doorAt(x + dx, y + dy) || (!isWall(x + dx, y + dy) && doorAt(x + 2 * dx, y + 2 * dy)));
    if (twin) tiles[i] = T.FLOOR;
  }

  return { w, h, tiles, roomAt, rooms };
}

// Hindernisse eines Raums setzen
function placeProps(ri) {
  const theme = ROOM_THEMES[G.rooms[ri].theme];
  for (const [type, [a, b]] of Object.entries(theme.props)) {
    const n = rand(a, b);
    for (let k = 0; k < n; k++) tryPlaceProp(ri, type, theme.scatter, 40);
  }
}

// Ein Hindernis in Raum `ri` setzen – nie so, dass ein Bodenfeld unerreichbar wird
function tryPlaceProp(ri, type, scatter, tries) {
  const r = G.rooms[ri];
  for (let t = 0; t < tries; t++) {
    const x = rand(r.x, r.x + r.w - 1), y = rand(r.y, r.y + r.h - 1);
    const atWall = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
    if (!scatter && !atWall) continue;
    if (occupied(x, y) || (x === r.cx && y === r.cy)) continue;
    // nicht direkt vor Eingänge stellen
    if (Object.values(DIRS).some(([dx, dy]) => passable(x + dx, y + dy) && G.roomAt[idx(x + dx, y + dy)] !== ri)) continue;
    const key = idx(x, y);
    G.props.set(key, { type, x, y, hp: PROPS[type].hp || 0 });
    if (allReachable()) return true;
    G.props.delete(key);
  }
  return false;
}

// Wie viele Räume liegen zwischen Raum `from` und jedem anderen Raum? (Graph über Gänge)
function roomHops(from) {
  const n = G.rooms.length;
  const adj = G.rooms.map(() => new Set());
  for (let ri = 0; ri < n; ri++) {
    const seen = new Uint8Array(G.w * G.h), q = [];
    const r = G.rooms[ri];
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) { seen[idx(x, y)] = 1; q.push(x, y); }
    for (let i = 0; i < q.length; i += 2) {
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = q[i] + dx, ny = q[i + 1] + dy;
        if (!passable(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (seen[ni]) continue;
        seen[ni] = 1;
        const other = G.roomAt[ni];
        if (other >= 0 && other !== ri) { adj[ri].add(other); continue; } // dort endet der Gang
        q.push(nx, ny);
      }
    }
  }
  const hops = new Array(n).fill(Infinity);
  hops[from] = 0;
  const q = [from];
  for (let i = 0; i < q.length; i++)
    for (const o of adj[q[i]]) if (hops[o] === Infinity) { hops[o] = hops[q[i]] + 1; q.push(o); }
  return hops;
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
    else if (theme && theme.webs && r < 0.05 + theme.webs) G.deco.set(i, 'web');
  }
}

function idx(x, y) { return y * G.w + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < G.w && y < G.h; }
function tileAt(x, y) { return inBounds(x, y) ? G.tiles[idx(x, y)] : T.WALL; }
function passable(x, y) { const t = tileAt(x, y); return t !== T.WALL && t !== T.LOCKED; }
function enemyAt(x, y) { return G.enemies.find(e => e.x === x && e.y === y); }
function propAt(x, y) { return inBounds(x, y) ? G.props.get(idx(x, y)) : undefined; }
function isStation(x, y) { return G.station && G.station.x === x && G.station.y === y; }
function droidAt(x, y) { return G.droid && G.droid.hp > 0 && G.droid.x === x && G.droid.y === y ? G.droid : null; }
function occupied(x, y) {
  return (G.player.x === x && G.player.y === y) || enemyAt(x, y) || droidAt(x, y) || isStation(x, y) ||
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
    if (!(x === x0 && y === y0) && !passable(x, y)) return false;
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

// Sound, Musik und Schiffsgeräusche: siehe audio.js

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
  const droid = droidAt(nx, ny);
  if (droid) {
    // Platz mit dem Droiden tauschen
    droid.x = p.x; droid.y = p.y;
    p.x = nx; p.y = ny;
    Sound.play('step');
    pickup();
    enterRoom();
    return true;
  }
  const prop = propAt(nx, ny);
  if (prop) return useProp(prop, dx, dy);
  if (isStation(nx, ny)) return useStation(dx, dy);
  if (inBounds(nx, ny) && G.fire.has(idx(nx, ny)) && p.extinguisher > 0) return extinguish(nx, ny, dx, dy);
  const leak = inBounds(nx, ny) && G.leaks.get(idx(nx, ny));
  if (leak && leak.active) return sealLeak(leak, dx, dy);
  if (tileAt(nx, ny) === T.LOCKED) { bump(p, dx, dy, 0.15); return unlockArmory(nx, ny); }
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
  if (prop.type === 'o2') return useO2Station(prop);
  if (prop.type === 'elevator') { useElevator(); return false; }
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

function sealLeak(leak, dx, dy) {
  bump(G.player, dx, dy, 0.2);
  leak.active = false;
  sparks(leak.x, leak.y, '#d8e2f5', 12);
  Sound.play('seal');
  const left = activeLeaks();
  floatText(leak.x, leak.y, 'abgedichtet', '#8ef58e');
  addLog(`${E.leak} Leck abgedichtet! ${left ? `Noch ${left} ${left === 1 ? 'Leck' : 'Lecks'} an Bord.` : 'Alle Lecks dicht!'}`);
  return true;
}

function useO2Station(prop) {
  const p = G.player;
  if (prop.used) { Sound.play('deny'); addLog(`${E.o2} Diese O₂-Station ist leer.`); return false; }
  prop.used = true;
  const gain = Math.round(O2_MAX - p.o2);
  p.o2 = O2_MAX;
  sparks(prop.x, prop.y, '#8fd8ff', 14);
  floatText(p.x, p.y, `+${gain} O₂`, '#8fd8ff');
  Sound.play('o2');
  addLog(`${E.o2} Sauerstoff aufgefüllt. Die Station ist jetzt leer.`);
  return true;
}

function useElevator() {
  const st = STATIONS[G.station.type];
  if (!G.station.repaired) {
    Sound.play('deny');
    addLog(`${E.elevator} Der Aufzug hat keinen Strom. Erst ${st.emoji} ${st.name} reparieren!`);
    return;
  }
  travelToNextDeck();
}

function markRoomOnMap(ri) {
  const r = G.rooms[ri];
  for (let y = r.y - 1; y <= r.y + r.h; y++)
    for (let x = r.x - 1; x <= r.x + r.w; x++) G.explored[idx(x, y)] = 1;
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
  const st = STATIONS[G.station.type];
  Sound.play('beep');
  addEffect({ type: 'hit', ent: { rx: prop.x, ry: prop.y }, ms: 250, color: 'rgba(79,209,255,0.5)' });
  if (G.station.repaired) {
    addLog(`${E.terminal} ${E.elevator} Aufzug: im ${compass(prop, G.elevator)}, ${distWord(prop, G.elevator)}.`);
  } else if (p.hasTool) {
    addLog(`${E.terminal} ${st.name}: im ${compass(prop, G.station)}, ${distWord(prop, G.station)}.`);
  } else {
    const card = [...G.items.values()].find(i => i.type === 'keycard');
    const tool = [...G.items.values()].find(i => i.type === G.cfg.goalItem);
    if (card) addLog(`${E.terminal} Keycard-Signal ${E.keycard}: im ${compass(prop, card)}, ${distWord(prop, card)}.`);
    if (tool) addLog(`${E.terminal} Werkzeug-Signal ${E.wrench}: im ${compass(prop, tool)}, ${distWord(prop, tool)}${
      G.armoryRoom >= 0 && G.roomAt[idx(tool.x, tool.y)] === G.armoryRoom && G.tiles.includes(T.LOCKED) ? ` – in der ${E.lock} Waffenkammer` : ''}.`);
  }
  if (G.cfg.oxygen && activeLeaks()) {
    addLog(`${E.terminal} Druckverlust: ${activeLeaks()} ${E.leak} Lecks aktiv.`);
  }
  if (!prop.used) {
    prop.used = true;
    // Schiffsplan: Der Stationsraum wird auf der Karte markiert
    markRoomOnMap(G.station.room);
    floatText(prop.x, prop.y, 'Schiffsplan geladen', '#4fd1ff', 1200);
  }
}

function pickup() {
  const p = G.player, key = idx(p.x, p.y);
  const it = G.items.get(key);
  if (!it) return;
  G.items.delete(key);
  const st = STATIONS[G.station.type];
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
  } else if (it.type === 'core') {
    collectCores(1, p);
  } else if (it.type === 'keycard') {
    p.hasKeycard = true;
    floatText(p.x, p.y, E.keycard, '#ffd84f');
    Sound.play('tool');
    addLog(`${E.keycard} Keycard gefunden! Damit öffnest du die ${E.lock} Waffenkammer.`);
  } else if (it.type === 'extinguisher') {
    p.extinguisher += EXTINGUISHER_CHARGES;
    floatText(p.x, p.y, `+${EXTINGUISHER_CHARGES} ${E.extinguisher}`, '#8fd8ff');
    Sound.play('pickup');
    addLog(`${E.extinguisher} Feuerlöscher: +${EXTINGUISHER_CHARGES} Ladungen. Lauf gegen ein Feuer, um es zu löschen.`);
  } else if (it.type === 'vest') {
    p.maxHp += 2;
    p.hp += 2;
    floatText(p.x, p.y, '+2 max ❤️', '#6dff8a');
    Sound.play('heal');
    addLog(`${E.vest} Schutzweste angelegt: +2 max. ❤️ für diesen Run.`);
  } else if (it.type === 'wrench') {
    p.hasTool = true;
    floatText(p.x, p.y, E.wrench, '#ffd84f');
    Sound.play('tool');
    addLog(`${E.wrench} Werkzeug gefunden! Ab zur Station: ${st.emoji} ${st.name}.`);
  }
}

function collectCores(n, at) {
  G.runCores += n;
  Meta.addCores(n);
  floatText(at.x, at.y, `+${n} ${E.core}`, '#c9a7ff');
  Sound.play('core');
  addLog(`${E.core} ${n === 1 ? 'Datenkern' : `${n} Datenkerne`} gesichert! (${G.runCores} in diesem Run)`);
}

function useStation(dx, dy) {
  const p = G.player;
  const st = STATIONS[G.station.type];
  bump(p, dx, dy, 0.15);
  if (G.station.repaired) { Sound.play('bump'); return false; }
  if (G.boss && G.boss.hp > 0) {
    Sound.play('deny');
    wakeBoss();
    addLog(`${E.boss} Das Tentakelmonster blockiert den ${st.name}! Besiege es zuerst.`);
    return false;
  }
  if (!p.hasTool) {
    Sound.play('deny');
    addLog(`${st.emoji} ${st.name} ist defekt. Du brauchst ein ${E.wrench}.`);
    return false;
  }
  p.hasTool = false;
  G.station.repaired = true;
  grantBonus(st.bonus);
  collectCores(CORES_PER_STATION, G.station);
  sparks(G.station.x, G.station.y, '#4fd1ff', 24);
  floatText(G.station.x, G.station.y, st.done, '#4fd1ff', 1400);
  Sound.play('win');
  addLog(`${st.emoji} ${st.done}`);
  addLog(st.bonusText);
  if (G.deckIndex + 1 < DECKS.length) {
    const next = DECKS[G.deckIndex + 1];
    addLog(`${E.elevator} Der Aufzug zu Deck ${next.id} hat wieder Strom – im ${compass(G.station, G.elevator)}, ${distWord(G.station, G.elevator)}.`);
    floatText(G.elevator.x, G.elevator.y, 'Strom!', '#4fd1ff', 1400);
    markRoomOnMap(G.elevatorRoom);
  } else {
    state = 'won';
    Meta.data.wins++;
    Meta.save();
    setTimeout(() => { showScreen('won'); Sound.music('title'); }, 1400);
  }
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
    hit = enemyAt(x, y); // der eigene Droide wird einfach durchschossen
    if (hit || prop) break;
  }
  Sound.play('shoot');
  bump(p, -dx, -dy, 0.1);
  addEffect({ type: 'laser', x0: p.x, y0: p.y, x1: x, y1: y, ms: 170 });
  if (hit) damageEnemy(hit, blasterDamage(), 'Blaster');
  else if (prop && prop.type === 'crate') damageProp(prop, blasterDamage());
  else {
    // Einschlag am Ende des Strahls
    const edge = prop ? 0 : 0.45;
    sparks(x + dx * edge, y + dy * edge, '#4fd1ff', 6);
    addLog('Pew! Daneben.');
  }
  return true;
}

function blasterDamage() {
  return PLAYER_BASE.blasterDmg + (G.player.bonuses.has('blaster') ? 1 : 0);
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
  sparks(e.x, e.y, t.static ? '#9be36b' : '#ffcf4f', 8);
  if (t.boss) { e.hp = Math.max(0, e.hp); wakeBoss(); renderBossBar(); }
  if (e.hp <= 0 && t.boss) {
    G.enemies.splice(G.enemies.indexOf(e), 1);
    for (let k = 0; k < 4; k++) setTimeout(() => sparks(e.x + (Math.random() - 0.5) * 2, e.y + (Math.random() - 0.5) * 2, pick(['#c77dff', '#ff8a3d', '#ffd84f']), 16), k * 150);
    addEffect({ type: 'boom', x: e.x, y: e.y, ms: 900 });
    shake(12, 700);
    Sound.play('explode');
    Sound.play('roar');
    Sound.music('game', G.deckIndex);
    addLog(`${E.boss} Das Tentakelmonster ist besiegt! Der Weg zum ${E.drive} Antrieb ist frei.`);
    collectCores(5, e);
    G.enemies = G.enemies.filter(m => m.type !== 'tentacle' || (sparks(m.x, m.y, '#c77dff', 8), false));
    renderBossBar();
    return;
  }
  if (e.hp <= 0) {
    G.enemies.splice(G.enemies.indexOf(e), 1);
    if (t.static) {
      sparks(e.x, e.y, '#9be36b', 14);
      Sound.play('squish');
      addLog(`${t.emoji} ${t.name} zerquetscht.`);
    } else {
      addEffect({ type: 'boom', x: e.x, y: e.y, ms: 450 });
      sparks(e.x, e.y, '#ff8a3d', 18);
      shake(4, 180);
      Sound.play('explode');
      addLog(`💥 ${t.emoji} ${t.name} zerstört!${surprised ? ' (Überraschung!)' : ''}`);
      const key = idx(e.x, e.y);
      if (!t.noDrop && Math.random() < CORE_DROP && !G.items.has(key)) G.items.set(key, { type: 'core', x: e.x, y: e.y });
    }
  } else {
    Sound.play('hit');
    addLog(`${how}: ${t.emoji} −${dmg}`);
    if (t.static || t.boss) return;
    if (e.mode === 'sleep') e.mode = 'guard';
    e.alert = ALERT_TURNS;
    if (wasCalm) raiseAlarm([e]);
  }
}

// ---------- Boss: Tentakelmonster ----------
function wakeBoss() {
  const b = G.boss;
  if (!b || b.awake || b.hp <= 0) return;
  b.awake = true;
  b.turns = 0;
  shake(8, 500);
  Sound.play('roar');
  Sound.music('boss', G.deckIndex);
  floatText(b.x, b.y, 'ROAAR!', '#c77dff', 1300);
  addLog(`${E.boss} Das Tentakelmonster erwacht!`);
  renderBossBar();
}

function bossAct(b, t, d) {
  const p = G.player;
  const inRoom = G.roomAt[idx(p.x, p.y)] === b.home;
  if (!b.awake) {
    if (inRoom || (G.visible[idx(b.x, b.y)] && d <= 5)) wakeBoss();
    return;
  }
  b.turns++;
  // regelmäßig einen Tentakel losschicken (höchstens 3 gleichzeitig)
  if (b.turns % 6 === 0 && G.enemies.filter(e => e.type === 'tentacle').length < 3) {
    const spots = freeSteps(b);
    if (spots.length) {
      const [x, y] = pick(spots);
      const m = makeEnemy('tentacle', x, y, 'guard', -1);
      m.rx = b.x; m.ry = b.y;
      m.alert = ALERT_TURNS;
      G.enemies.push(m);
      addLog(`${E.tentacle} Das Monster schickt einen Tentakel los!`);
    }
  }
  // Tentakel-Angriff auf bis zu 2 Felder
  if (d <= t.reach && lineOfSight(b.x, b.y, p.x, p.y)) {
    addEffect({ type: 'tentacle', x0: b.x, y0: b.y, x1: p.x, y1: p.y, ms: 260 });
    enemyAttack(b, t);
    return;
  }
  const dr = G.droid;
  if (dr && dr.hp > 0 && manhattan(b, dr) <= t.reach && lineOfSight(b.x, b.y, dr.x, dr.y)) {
    addEffect({ type: 'tentacle', x0: b.x, y0: b.y, x1: dr.x, y1: dr.y, ms: 260 });
    attackDroid(b, t);
    return;
  }
  // bleibt in seinem Raum, rückt aber auf den Captain vor
  const dist = bfs(p.x, p.y, () => true), cur = dist[idx(b.x, b.y)];
  const moves = Object.values(DIRS).map(([dx, dy]) => [b.x + dx, b.y + dy])
    .filter(([x, y]) => passable(x, y) && !occupied(x, y) && G.roomAt[idx(x, y)] === b.home &&
      dist[idx(x, y)] !== -1 && (cur === -1 || dist[idx(x, y)] < cur));
  if (moves.length) [b.x, b.y] = pick(moves);
}

function renderBossBar() {
  const bar = document.getElementById('bossbar');
  const b = G && G.boss;
  const show = !!(b && b.awake && b.hp > 0 && state !== 'title');
  bar.hidden = !show;
  if (show) document.getElementById('bossbar-fill').style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
}

// ---------- Reparatur-Droide ----------
function droidAct() {
  const d = G.droid, p = G.player;
  if (!d || d.hp <= 0) return;

  // Reparatur: steht er neben dem Captain, gibt es regelmäßig +1 ❤️
  d.healTimer++;
  if (d.healTimer >= DROID.healEvery && manhattan(d, p) === 1 && p.hp < p.maxHp) {
    d.healTimer = 0;
    p.hp++;
    floatText(p.x, p.y, '🔧 +1', '#6dff8a');
    sparks(p.x, p.y, '#6dff8a', 6);
    Sound.play('heal');
    addLog('🤖 Dein Droide repariert deinen Anzug: +1 ❤️');
    return;
  }

  // 1. Angreifen – schlafende Drohnen lässt er in Ruhe, damit man weiter schleichen kann
  const awake = e => e.mode !== 'sleep';
  const adjacent = G.enemies.filter(e => awake(e) && manhattan(e, d) === 1);
  if (adjacent.length) {
    const target = adjacent.reduce((a, b) => (b.hp < a.hp ? b : a));
    bump(d, target.x - d.x, target.y - d.y);
    if (Math.random() < DROID.hit) damageEnemy(target, DROID.dmg, '🤖 Droide');
    else { floatText(target.x, target.y, 'verfehlt', '#9aa6c0'); Sound.play('miss'); }
    return;
  }

  // 2. Wache Gegner in der Nähe des Captains angehen
  const targets = G.enemies.filter(e => awake(e) && G.visible[idx(e.x, e.y)] &&
    manhattan(e, p) <= DROID.leash && (e.alert > 0 || ENEMY_TYPES[e.type].static));
  if (targets.length) {
    const target = targets.reduce((a, b) => (manhattan(b, d) < manhattan(a, d) ? b : a));
    stepToward(d, target);
    return;
  }

  // 3. Dem Captain folgen
  if (manhattan(d, p) > 2) stepToward(d, p);
}

function stepToward(ent, target) {
  const dist = bfs(target.x, target.y, (x, y) => !isStation(x, y));
  const cur = dist[idx(ent.x, ent.y)];
  const moves = freeSteps(ent).filter(([x, y]) => dist[idx(x, y)] !== -1 && (cur === -1 || dist[idx(x, y)] < cur));
  if (moves.length) [ent.x, ent.y] = pick(moves);
}

function attackDroid(e, t) {
  const d = G.droid;
  bump(e, d.x - e.x, d.y - e.y);
  if (Math.random() > t.hit) { floatText(d.x, d.y, 'verfehlt', '#9aa6c0'); return; }
  d.hp -= t.dmg;
  addEffect({ type: 'hit', ent: d, ms: 160 });
  floatText(d.x, d.y, `-${t.dmg}`, '#ff9a5a');
  Sound.play('hit');
  if (d.hp <= 0) {
    d.hp = 0;
    addEffect({ type: 'boom', x: d.x, y: d.y, ms: 450 });
    sparks(d.x, d.y, '#4fd1ff', 16);
    shake(3, 160);
    Sound.play('explode');
    addLog('🤖 Dein Droide ist ausgefallen! Im nächsten Aufzug wird er repariert.');
  } else {
    addLog(`${t.emoji} greift deinen Droiden an: −${t.dmg}`);
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

    if (t.boss) { bossAct(e, t, d); continue; }

    if (t.static) {
      if (d === 1) enemyAttack(e, t);
      else if (G.droid && droidAt(G.droid.x, G.droid.y) && manhattan(e, G.droid) === 1) attackDroid(e, t);
      continue;
    }

    const sees = G.visible[idx(e.x, e.y)] && d <= t.sight;
    if (e.mode === 'sleep') {
      // Schlafende Drohnen wachen nur auf, wenn man direkt an ihnen vorbeiläuft
      if (sees && d <= WAKE_RADIUS) { e.mode = 'guard'; e.alert = ALERT_TURNS; spotted.push(e); }
      continue;
    }

    if (sees) { if (e.alert === 0) spotted.push(e); e.alert = ALERT_TURNS; }
    else if (e.alert > 0 && --e.alert === 0) floatText(e.x, e.y, '❓', '#9aa6c0');

    if (d === 1 && e.alert > 0) { enemyAttack(e, t); continue; }
    if (e.alert > 0 && G.droid && droidAt(G.droid.x, G.droid.y) && manhattan(e, G.droid) === 1) { attackDroid(e, t); continue; }

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
  spreadSpores();
}

// Sporen wachsen auf freie Nachbarfelder – je länger man trödelt, desto mehr
function spreadSpores() {
  const cap = (G.cfg.oxygen && G.cfg.oxygen.sporeCap) || 40;
  const spores = G.enemies.filter(e => ENEMY_TYPES[e.type].spread);
  let count = spores.length, grown = 0;
  for (const s of spores) {
    if (count >= cap) break;
    if (Math.random() > ENEMY_TYPES[s.type].spread) continue;
    const spots = freeSteps(s).filter(([x, y]) => !isStation(x, y));
    if (!spots.length) continue;
    const [x, y] = pick(spots);
    const n = makeEnemy(s.type, x, y, 'static', s.home);
    n.rx = s.x; n.ry = s.y; // wächst sichtbar aus der Mutterkolonie heraus
    G.enemies.push(n);
    count++; grown++;
    if (G.visible[idx(x, y)]) sparks(x, y, '#9be36b', 5);
  }
  if (grown && !G.sporeWarned && count >= 12) {
    G.sporeWarned = true;
    addLog(`${E.spore} Die Sporen breiten sich aus! Nicht trödeln.`);
  }
}

function freeSteps(e) {
  return Object.values(DIRS).map(([dx, dy]) => [e.x + dx, e.y + dy])
    .filter(([x, y]) => passable(x, y) && !occupied(x, y) && !G.fire.has(idx(x, y)));
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
      if (alerted.has(o) || o.alert > 0 || !ENEMY_TYPES[o.type].alarm || manhattan(o, e) > ALARM_RADIUS) continue;
      if (o.mode === 'sleep') o.mode = 'guard';
      o.alert = ALERT_TURNS;
      alerted.add(o);
      floatText(o.x, o.y, '❗', '#ff5a6e');
    }
  }
  const aliens = [...alerted].filter(e => e.type === 'alien').length;
  if (aliens) Sound.play('screech');
  if (alerted.size > 1) {
    if (!aliens) Sound.play('alarm');
    addLog(aliens === alerted.size ? `👾 Kreischen! ${alerted.size} Aliens jagen dich.` : `🚨 Alarm! ${alerted.size} Gegner jagen dich.`);
  } else if (aliens) {
    addLog(`${E.alien} Ein Alien hat dich entdeckt!`);
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
  if (p.shieldReady) {
    // Schild-Bonus: Treffer wird abgefangen, danach lädt der Schild neu
    p.shieldReady = false;
    p.shieldTimer = SHIELD_RECHARGE;
    addEffect({ type: 'shield', ms: 400 });
    floatText(p.x, p.y, 'geblockt', '#4fd1ff');
    Sound.play('shield');
    addLog(`${E.generator} Dein Schild fängt den Treffer von ${t.emoji} ab!`);
    return;
  }
  hurtPlayer(t.dmg);
  addLog(`${t.emoji} trifft dich: −${t.dmg} ❤️`);
}

function hurtPlayer(dmg) {
  const p = G.player;
  p.hp -= dmg;
  addEffect({ type: 'hurt', ms: 220 });
  floatText(p.x, p.y, `-${dmg}`, '#ff5a6e');
  shake(6, 220);
  Sound.play('hurt');
}

// ---------- Rundenablauf ----------
// Was nach jedem Zug mit dem Captain passiert: Boni laden, Sauerstoff verbrauchen
function tickPlayer() {
  const p = G.player;
  G.turn++;

  if (p.bonuses.has('shield') && !p.shieldReady && --p.shieldTimer <= 0) {
    p.shieldReady = true;
    floatText(p.x, p.y, `${E.generator} bereit`, '#4fd1ff');
    Sound.play('shieldup');
  }
  if (p.bonuses.has('regen') && G.turn % REGEN_EVERY === 0 && p.hp < p.maxHp) {
    p.hp++;
    floatText(p.x, p.y, '+1', '#6dff8a');
  }

  // Feuer brennt
  if (G.fire.has(idx(p.x, p.y))) {
    hurtPlayer(1);
    addLog(`${E.fire} Du verbrennst dich: −1 ❤️`);
  }
  // Strahlung sammelt sich an
  if (G.cfg.fire) {
    if (G.rad[idx(p.x, p.y)]) {
      if (!p.rad && !p.radWarned) { p.radWarned = true; addLog(`${E.rad} Strahlung! Halte dich hier nicht lange auf.`); }
      p.rad++;
      Sound.play('geiger');
      if (p.rad >= RAD_LIMIT) {
        p.rad = 0;
        hurtPlayer(1);
        addLog(`${E.rad} Strahlenbelastung: −1 ❤️`);
      }
    } else if (p.rad > 0 && G.turn % RAD_DECAY_EVERY === 0) p.rad--;
  }

  const ox = G.cfg.oxygen;
  if (!ox) return;
  const before = p.o2;
  p.o2 = Math.max(0, p.o2 - (ox.drain + ox.perLeak * activeLeaks()));
  if (before > 30 && p.o2 <= 30) { Sound.play('warn'); addLog(`${E.o2} Sauerstoff knapp! Such eine O₂-Station.`); }
  if (before > 10 && p.o2 <= 10) { Sound.play('warn'); addLog(`${E.o2} Sauerstoff fast leer!`); }
  if (p.o2 <= 0) {
    p.o2Empty = (p.o2Empty || 0) + 1;
    if (p.o2Empty % O2_SUFFOCATE_EVERY === 0) {
      hurtPlayer(1);
      addLog(`${E.o2} Kein Sauerstoff: −1 ❤️`);
    }
  } else p.o2Empty = 0;
}

function act(action) {
  if (state !== 'play') return;
  let used = false;
  if (action === 'shoot') used = playerShoot();
  else if (action === 'item') used = playerUseItem();
  else if (action === 'wait') used = true;
  else if (DIRS[action]) used = playerMove(action);

  if (state === 'play' && used) {
    droidAct();
    enemiesAct();
    tickFire();
    tickPlayer();
    updateFov();
    if (G.player.hp <= 0) {
      G.player.hp = 0;
      state = 'dead';
      addEffect({ type: 'boom', x: G.player.x, y: G.player.y, ms: 700 });
      shake(10, 400);
      Sound.play('death');
      Sound.music(null);
      addLog('☠️ Der Captain ist gefallen.');
      setTimeout(() => showScreen('dead'), 900);
    }
  }
  renderHud();
  requestRender();
}

// Mit dem Aufzug aufs nächste Deck: kurz schwarz, Deck-Titel, weiter geht's
function travelToNextDeck() {
  state = 'travel';
  Sound.play('elevator');
  const next = DECKS[G.deckIndex + 1];
  const banner = document.getElementById('banner');
  document.getElementById('banner-title').textContent = `${next.icon} Deck ${next.id}: ${next.name}`;
  banner.classList.add('show');
  setTimeout(() => {
    G.deckIndex++;
    G.effects = [];
    G.log = [];
    loadDeck(next);
    Sound.music('game', G.deckIndex);
    renderHud();
    resize();
  }, 700);
  setTimeout(() => {
    banner.classList.remove('show');
    showBriefing();
    requestRender();
  }, 2000);
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
  laser: '#4fd1ff', hit: 'rgba(255,255,255,0.55)',
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
  busy = stepFog(dt) || busy;
  for (const e of G.enemies) busy = glide(e, dt) || !!e.bump || busy;
  if (G.droid) busy = glide(G.droid, dt) || !!G.droid.bump || busy;
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
      if (G.fade[i] < 0.01) continue;
      const t = G.tiles[i];
      if (t === T.WALL) {
        if (isWallEdge(x, y)) drawEmoji(E.wall, mx(x), my(y), 0.92);
      } else {
        const ri = G.roomAt[i];
        ctx.fillStyle = t === T.DOOR || t === T.LOCKED ? COLORS.door : ri >= 0 ? ROOM_THEMES[G.rooms[ri].theme].floor[(x + y) & 1] : COLORS.corridor;
        ctx.fillRect(px(x), py(y), tile + 0.5, tile + 0.5);
        if (t === T.DOOR) drawEmoji(E.door, mx(x), my(y), 0.75);
        if (t === T.LOCKED) drawEmoji(E.lock, mx(x), my(y), 0.72);
        const deco = G.deco.get(i);
        if (deco === 'web') drawEmoji('🕸️', mx(x), my(y), 0.7, 0.35);
        if (deco === 'vent') drawVent(px(x), py(y));
        else if (deco === 'bolt') drawEmoji('🔩', px(x) + tile * 0.3, py(y) + tile * 0.7, 0.32, 0.45);
        const pr = G.props.get(i);
        if (pr) {
          let alpha = 1, scale = PROPS[pr.type].scale;
          if (pr.type === 'o2' && pr.used) alpha = 0.35;
          if (pr.type === 'elevator') {
            if (G.station.repaired) scale *= 1 + Math.sin(now / 250) * 0.06;
            else alpha = 0.45;
          }
          drawEmoji(PROPS[pr.type].emoji, mx(x), my(y), scale, alpha);
        }
        if (G.rad[i]) {
          // Strahlung: grünes Flimmern, ab und zu ein ☢️
          ctx.fillStyle = `rgba(120,255,90,${0.07 + 0.04 * Math.sin(now / 400 + x * 0.7 + y)})`;
          ctx.fillRect(px(x), py(y), tile + 0.5, tile + 0.5);
          if ((x * 7 + y * 3) % 6 === 0) drawEmoji(E.rad, mx(x), my(y), 0.4, 0.3);
        }
        if (G.ash.has(i)) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px(x), py(y), tile + 0.5, tile + 0.5);
        }
        const it = G.items.get(i);
        if (it) {
          // Items schweben leicht
          const bob = Math.sin(now / 350 + x + y) * tile * 0.04;
          drawEmoji(ITEMS[it.type].emoji, mx(x), my(y) + bob, 0.66);
        }
        if (G.fire.has(i)) {
          ctx.fillStyle = `rgba(255,110,30,${0.22 + 0.08 * Math.sin(now / 120 + i)})`;
          ctx.fillRect(px(x), py(y), tile + 0.5, tile + 0.5);
          const fl = Math.sin(now / 90 + i * 1.7);
          drawEmoji(E.fire, mx(x), my(y) - tile * 0.04 * fl, 0.72 + fl * 0.05);
        }
      }
      if (isStation(x, y)) {
        const pulse = G.station.repaired ? 1 : 0.85 + Math.sin(now / 300) * 0.05;
        drawEmoji(G.station.repaired ? '✨' : STATIONS[G.station.type].emoji, mx(x), my(y), pulse);
      }
    }

  // Lecks: Luft strömt aus der Wand in den Raum
  for (const lk of G.leaks.values()) {
    const i = idx(lk.x, lk.y);
    if (G.fade[i] < 0.01 || lk.x < x0 - 1 || lk.x > x0 + VIEW_W + 1 || lk.y < y0 - 1 || lk.y > y0 + VIEW_H + 1) continue;
    const [dx, dy] = lk.dir;
    if (!lk.active) { drawEmoji('🔩', mx(lk.x + dx * 0.3), my(lk.y + dy * 0.3), 0.36); continue; }
    // Riss in der Wand + ausströmende Luftwolken
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    ctx.beginPath();
    ctx.arc(mx(lk.x + dx * 0.42), my(lk.y + dy * 0.42), tile * 0.16, 0, Math.PI * 2);
    ctx.fill();
    drawEmoji(E.leak, mx(lk.x + dx * 0.5), my(lk.y + dy * 0.5), 0.55);
    for (let k = 0; k < 2; k++) {
      const ph = (now / 900 + k * 0.5 + lk.x * 0.13) % 1;
      drawEmoji(E.leak, mx(lk.x + dx * (0.55 + ph * 0.8)), my(lk.y + dy * (0.55 + ph * 0.8)), 0.5 + ph * 0.25, 0.9 * (1 - ph));
    }
  }

  // Gegner (nur auf sichtbaren Feldern)
  for (const e of G.enemies) {
    if (!G.visible[idx(e.x, e.y)]) continue;
    const [bx, by] = bumpOffset(e, now);
    const ex = mx(e.rx + bx), ey = my(e.ry + by);
    const asleep = e.mode === 'sleep';
    if (ENEMY_TYPES[e.type].boss) {
      // Boss: größer, lila Glühen, atmet
      const breathe = 1 + Math.sin(now / 500) * 0.05;
      ctx.fillStyle = `rgba(199,125,255,${e.awake ? 0.22 : 0.1})`;
      ctx.beginPath();
      ctx.arc(ex, ey, tile * 0.55 * breathe, 0, Math.PI * 2);
      ctx.fill();
      drawEmoji(E.boss, ex, ey, 1.05 * breathe, e.awake ? 1 : 0.8);
      if (!e.awake) drawEmoji('💤', ex + tile * 0.35, ey - tile * 0.35, 0.34, 0.8);
      continue;
    }
    if (ENEMY_TYPES[e.type].static) {
      // Sporen pulsieren statt zu schweben
      drawEmoji(ENEMY_TYPES[e.type].emoji, ex, ey, 0.7 + Math.sin(now / 400 + e.x + e.y) * 0.05);
    } else {
      const hover = asleep ? 0 : Math.sin(now / 260 + e.x * 3) * tile * 0.03;
      drawEmoji(ENEMY_TYPES[e.type].emoji, ex, ey + hover, 0.78, asleep ? 0.7 : 1);
    }
    if (ENEMY_TYPES[e.type].static) { /* keine Statusanzeige */ } else if (asleep) {
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

  // Reparatur-Droide: türkiser Leuchtring + kleines 🔧, damit man ihn von feindlichen Drohnen unterscheidet
  const dr = G.droid;
  if (dr && dr.hp > 0) {
    const [bx, by] = bumpOffset(dr, now);
    const dx = mx(dr.rx + bx), dy = my(dr.ry + by);
    const glow = 0.55 + Math.sin(now / 350) * 0.15;
    ctx.fillStyle = `rgba(79,209,255,${glow * 0.35})`;
    ctx.strokeStyle = `rgba(79,209,255,${glow + 0.2})`;
    ctx.lineWidth = Math.max(2, tile * 0.05);
    ctx.shadowColor = '#4fd1ff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(dx, dy + tile * 0.32, tile * 0.42, tile * 0.14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    drawEmoji(E.drone, dx, dy + Math.sin(now / 300) * tile * 0.03, 0.7);
    // 🔧-Plakette oben rechts
    ctx.fillStyle = '#0b2a3a';
    ctx.strokeStyle = '#4fd1ff';
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.beginPath();
    ctx.arc(dx + tile * 0.32, dy - tile * 0.26, tile * 0.17, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    drawEmoji(E.wrench, dx + tile * 0.32, dy - tile * 0.26, 0.26);
    if (dr.hp < dr.maxHp) {
      const l = dx - tile * 0.35, top = dy - tile * 0.44;
      ctx.fillStyle = '#123';
      ctx.fillRect(l, top, tile * 0.7, tile * 0.08);
      ctx.fillStyle = '#4fd1ff';
      ctx.fillRect(l, top, tile * 0.7 * dr.hp / dr.maxHp, tile * 0.08);
    }
  }

  // Captain + Blickrichtung
  if (state !== 'dead') {
    const [bx, by] = bumpOffset(p, now);
    const cx0 = mx(p.rx + bx), cy0 = my(p.ry + by);
    if (p.shieldReady) {
      ctx.strokeStyle = `rgba(79,209,255,${0.3 + Math.sin(now / 300) * 0.12})`;
      ctx.lineWidth = Math.max(1.5, tile * 0.04);
      ctx.beginPath();
      ctx.arc(cx0, cy0, tile * 0.47, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  drawFog(x0, y0, px, py);

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
    } else if (f.type === 'shield') {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = COLORS.laser;
      ctx.lineWidth = Math.max(2, tile * 0.08);
      ctx.shadowColor = COLORS.laser; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(mx(p.rx), my(p.ry), tile * (0.45 + t * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    } else if (f.type === 'tentacle') {
      // Tentakel peitscht zum Ziel
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = Math.max(3, tile * 0.14 * (1 - t * 0.5));
      ctx.lineCap = 'round';
      ctx.beginPath();
      const ax = mx(f.x0), ay = my(f.y0), bx2 = mx(f.x1), by2 = my(f.y1);
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx2) / 2 + (ay - by2) * 0.3, (ay + by2) / 2 + (bx2 - ax) * 0.3, bx2, by2);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    } else if (f.type === 'foam') {
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath();
      ctx.arc(mx(f.x), my(f.y), tile * (0.6 + t * 1.0), 0, Math.PI * 2);
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

// Nebel: Helligkeit je Feld gleitet weich zum Ziel – nichts ploppt mehr auf.
// Sichtbare Felder werden mit der Entfernung zum Captain dunkler (Lichtkegel).
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function stepFog(dt) {
  const p = G.player, k = 1 - Math.exp(-dt * 9);
  let changing = false;
  for (let y = 0; y < G.h; y++)
    for (let x = 0; x < G.w; x++) {
      const i = y * G.w + x;
      let target = 0;
      if (G.visible[i]) target = 1 - 0.55 * smoothstep(1.5, FOV_RADIUS + 2, Math.hypot(x - p.rx, y - p.ry));
      else if (G.explored[i]) target = MEMORY_LIGHT;
      const diff = target - G.fade[i];
      if (Math.abs(diff) < 0.004) G.fade[i] = target;
      else { G.fade[i] += diff * k; changing = true; }
    }
  return changing;
}

// Ein Pixel pro Feld, weich hochskaliert – ergibt fließende Übergänge statt Kästchen
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');
function drawFog(x0, y0, px, py) {
  const cols = VIEW_W + 5, rows = VIEW_H + 5, sx = x0 - 2, sy = y0 - 2;
  if (fogCanvas.width !== cols || fogCanvas.height !== rows) { fogCanvas.width = cols; fogCanvas.height = rows; }
  const img = fogCtx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = sx + c, y = sy + r;
      const light = inBounds(x, y) ? G.fade[idx(x, y)] : 0;
      img.data[(r * cols + c) * 4 + 3] = Math.round((1 - light) * 255);
    }
  fogCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, px(sx), py(sy), cols * tile, rows * tile);
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
  document.getElementById('hud-cores').textContent = `${E.core} ${G.runCores}`;
  const card = document.getElementById('hud-card');
  card.hidden = !(G.armoryRoom >= 0 && G.tiles.includes(T.LOCKED));
  card.textContent = p.hasKeycard ? `${E.keycard} ✔` : `${E.keycard} –`;
  card.classList.toggle('got', !!p.hasKeycard);
  const ext = document.getElementById('hud-ext'), rad = document.getElementById('hud-rad');
  ext.hidden = rad.hidden = !G.cfg.fire;
  if (G.cfg.fire) {
    ext.textContent = `${E.extinguisher} ${p.extinguisher}`;
    rad.textContent = `${E.rad} ${p.rad}/${RAD_LIMIT}`;
    rad.classList.toggle('hot', p.rad >= RAD_LIMIT - 1);
  }
  renderBossBar();
  const droidHud = document.getElementById('hud-droid');
  droidHud.hidden = !G.droid;
  if (G.droid) {
    droidHud.textContent = G.droid.hp > 0 ? `${E.drone} ${G.droid.hp}` : `${E.drone} ✖`;
    droidHud.classList.toggle('down', G.droid.hp <= 0);
  }
  document.getElementById('hud-deck').innerHTML = `${G.cfg.icon} <span class="long">Deck </span>${G.cfg.id}`;

  const shield = document.getElementById('hud-shield');
  shield.hidden = !p.bonuses.has('shield');
  shield.textContent = p.shieldReady ? `${E.generator} ✔` : `${E.generator} ${p.shieldTimer}`;
  shield.classList.toggle('ready', p.shieldReady);

  const ox = G.cfg.oxygen;
  const o2 = document.getElementById('hud-o2'), leaks = document.getElementById('hud-leaks');
  o2.hidden = leaks.hidden = !ox;
  if (ox) {
    const pct = Math.ceil(p.o2);
    document.getElementById('hud-o2-val').textContent = pct;
    document.getElementById('hud-o2-fill').style.width = pct + '%';
    o2.classList.toggle('low', pct <= 30);
    o2.classList.toggle('empty', pct <= 0);
    const n = activeLeaks();
    leaks.textContent = `${E.leak} ${n}`;
    leaks.classList.toggle('done', n === 0);
  }
}

function renderSoundBtn() {
  const icon = Sound.muted ? '🔇' : '🔊';
  document.getElementById('hud-sound').textContent = icon;
  document.getElementById('title-sound').textContent = icon;
}

function renderLog() {
  const el = document.getElementById('log');
  el.replaceChildren(...G.log.map(m => { const d = document.createElement('div'); d.textContent = m; return d; }));
  const last = el.lastElementChild;
  if (last) { last.classList.add('new'); setTimeout(() => last.classList.remove('new'), 400); }
}

// ---------- Bildschirme ----------
const coreSummary = () =>
  `${E.core} ${G.runCores} Datenkerne gesichert – im Labor: ${Meta.data.cores}.`;

const SCREENS = {
  dead: {
    emoji: '☠️', title: 'Captain gefallen', btn: 'Neuer Run',
    text: () => `Du bist auf Deck ${G.cfg.id} (${G.cfg.name}) gefallen. ${coreSummary()} Investiere sie im 🔬 Labor.`,
  },
  won: {
    emoji: '🚀', title: 'Das Schiff ist gerettet!', btn: 'Nochmal spielen',
    text: () => `${DECKS.map(d => d.icon).join(' ')} – alle Systeme laufen wieder. Captain Moji hat es geschafft! ${coreSummary()}`,
  },
};

function showScreen(name) {
  const s = SCREENS[name];
  document.getElementById('screen-emoji').textContent = s.emoji;
  document.getElementById('screen-title').textContent = s.title;
  document.getElementById('screen-text').textContent = typeof s.text === 'function' ? s.text() : s.text;
  document.getElementById('screen-btn').textContent = s.btn;
  document.getElementById('screen').classList.remove('hidden');
}

// Zum Testen: index.html?deck=2 startet direkt auf Deck 2 (mit den Boni der vorherigen Decks)
const START_DECK = clamp((parseInt(new URLSearchParams(location.search).get('deck'), 10) || 1) - 1, 0, DECKS.length - 1);

// ---------- Titelbildschirm ----------
const Title = (() => {
  const el = document.getElementById('title');
  const cv = document.getElementById('stars'), c = cv.getContext('2d');
  let stars = [], raf = 0, last = 0, w = 0, h = 0, sdpr = 1;

  // Missionsroute: noch nicht gebaute Decks ausgrauen
  el.querySelectorAll('.t-route span').forEach(s => s.classList.toggle('soon', +s.dataset.deck > DECKS.length));

  function size() {
    sdpr = window.devicePixelRatio || 1;
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * sdpr); cv.height = Math.round(h * sdpr);
    stars = Array.from({ length: Math.round((w * h) / 4500) }, () =>
      ({ x: Math.random() * w, y: Math.random() * h, z: Math.random() }));
  }

  // Sternenfeld zieht nach links vorbei – das Schiff fliegt
  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    c.setTransform(sdpr, 0, 0, sdpr, 0, 0);
    c.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.x -= (15 + s.z * s.z * 280) * dt;
      if (s.x < -12) { s.x = w + 4; s.y = Math.random() * h; }
      c.fillStyle = `rgba(200,225,255,${0.2 + s.z * 0.8})`;
      c.fillRect(s.x, s.y, 1 + s.z * s.z * 11, s.z > 0.75 ? 2 : 1);
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    get visible() { return !el.classList.contains('hidden'); },
    show() {
      el.classList.remove('hidden');
      size();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    hide() {
      el.classList.add('hidden');
      cancelAnimationFrame(raf);
      raf = 0; last = 0;
    },
    resize() { if (this.visible) size(); },
  };
})();

// ---------- Einsatzbesprechung ----------
function showBriefing() {
  const cfg = G.cfg, b = cfg.briefing;
  state = 'briefing';
  document.getElementById('brief-icon').textContent = cfg.icon;
  document.getElementById('brief-deck').textContent = `Deck ${cfg.id} von ${DECKS.length}`;
  document.getElementById('brief-title').textContent = cfg.name;
  document.getElementById('brief-goal').textContent = `🎯 ${b.goal}`;
  document.getElementById('brief-tips').replaceChildren(...b.tips.map(t => {
    const li = document.createElement('li'); li.textContent = t; return li;
  }));
  document.getElementById('brief-reward').textContent = `Belohnung – ${b.reward}`;
  document.getElementById('briefing').classList.remove('hidden');
}

function closeBriefing() {
  if (state !== 'briefing') return;
  document.getElementById('briefing').classList.add('hidden');
  document.getElementById('brief-go').blur();
  state = 'play';
  requestRender();
}

// ---------- Pause / Abbrechen ----------
let pausedFrom = null;
function openPause() {
  if (state !== 'play' && state !== 'briefing') return;
  pausedFrom = state;
  state = 'paused';
  document.getElementById('pause').classList.remove('hidden');
}

function closePause() {
  if (state !== 'paused') return;
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('pause-resume').blur();
  state = pausedFrom;
  requestRender();
}

function quitRun() {
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('briefing').classList.add('hidden');
  showTitle();
}

function showTitle() {
  state = 'title';
  Sound.music('title');
  document.getElementById('screen').classList.add('hidden');
  document.getElementById('lab').classList.add('hidden');
  document.getElementById('title-cores').textContent = `${E.core} ${Meta.data.cores}`;
  Title.show();
}

// ---------- Forschungslabor ----------
function showLab() {
  state = 'lab';
  Title.hide();
  document.getElementById('screen').classList.add('hidden');
  document.getElementById('lab').classList.remove('hidden');
  Sound.music('title');
  renderLab();
}

function renderLab(boughtId) {
  const d = Meta.data;
  document.getElementById('lab-cores').textContent = d.cores;
  document.getElementById('lab-stats').textContent =
    `Runs: ${d.runs} · Bestes Deck: ${d.bestDeck || '–'} · Siege: ${d.wins} · Kerne gesammelt: ${d.totalCores}`;
  document.getElementById('lab-grid').replaceChildren(...UPGRADES.map(up => {
    const lvl = Meta.level(up.id), max = up.costs.length, cost = Meta.nextCost(up);
    const card = document.createElement('div');
    card.className = 'up-card';
    card.classList.toggle('affordable', Meta.canBuy(up));
    card.classList.toggle('soon', !!up.soon);
    if (up.id === boughtId) card.classList.add('bought');

    const pips = document.createElement('div');
    pips.className = 'up-pips';
    for (let i = 0; i < max; i++) {
      const pip = document.createElement(i < lvl ? 'span' : 'i');
      pip.textContent = '●';
      pips.append(pip);
    }

    const btn = document.createElement('button');
    btn.className = 'up-buy';
    if (up.soon) { btn.textContent = 'Bald verfügbar'; btn.disabled = true; }
    else if (cost === undefined) { btn.textContent = 'Maximal'; btn.disabled = true; }
    else {
      btn.textContent = `${E.core} ${cost}`;
      btn.disabled = !Meta.canBuy(up);
      btn.addEventListener('click', () => {
        if (!Meta.buy(up)) return;
        Sound.play('buy');
        renderLab(up.id);
      });
    }

    const el = (cls, text) => { const e = document.createElement('div'); e.className = cls; e.textContent = text; return e; };
    card.append(el('up-icon', up.icon), el('up-name', up.name), el('up-desc', up.desc(lvl)), pips, btn);
    return card;
  }));
}

function startRun() {
  if (!['title', 'dead', 'won', 'lab'].includes(state)) return;
  Sound.unlock();
  Title.hide();
  document.getElementById('lab').classList.add('hidden');
  Meta.data.runs++;
  Meta.save();
  document.getElementById('screen').classList.add('hidden');
  document.getElementById('screen-btn').blur();
  newRun(START_DECK);
  Sound.music('game', G.deckIndex);
  showBriefing();
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
  if (ev.code === 'Escape') {
    if (state === 'play' || state === 'briefing') { ev.preventDefault(); openPause(); return; }
    if (state === 'paused') { ev.preventDefault(); closePause(); return; }
  }
  if (state === 'briefing') {
    if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); closeBriefing(); }
    return;
  }
  if (state === 'paused') {
    if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); closePause(); }
    return;
  }
  if (state !== 'play') {
    const screenOpen = !document.getElementById('screen').classList.contains('hidden');
    if (state === 'lab' && ev.code === 'Escape') { showTitle(); return; }
    if ((ev.code === 'Enter' || ev.code === 'Space') && (screenOpen || Title.visible || state === 'lab')) {
      ev.preventDefault();
      startRun();
    } else if (ev.code === 'Escape' && screenOpen) {
      showTitle();
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
document.getElementById('screen-menu').addEventListener('click', showTitle);
document.getElementById('screen-lab').addEventListener('click', showLab);
document.getElementById('title-lab').addEventListener('click', showLab);
document.getElementById('lab-back').addEventListener('click', showTitle);
document.getElementById('lab-start').addEventListener('click', startRun);
document.getElementById('lab-reset').addEventListener('click', () => {
  if (!confirm('Alle Datenkerne, Upgrades und Statistiken löschen?')) return;
  Meta.reset();
  renderLab();
});
document.getElementById('brief-go').addEventListener('click', closeBriefing);
document.getElementById('pause-resume').addEventListener('click', closePause);
document.getElementById('pause-quit').addEventListener('click', quitRun);
document.getElementById('hud-pause').addEventListener('pointerdown', ev => { ev.preventDefault(); openPause(); });
document.getElementById('title-start').addEventListener('click', () => { startRun(); Sound.play('elevator'); });
document.getElementById('title-sound').addEventListener('click', () => Sound.toggle());
window.addEventListener('resize', () => Title.resize());
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---------- Start ----------
// Browser erlauben Ton erst nach der ersten Nutzeraktion
window.addEventListener('pointerdown', () => Sound.unlock());
window.addEventListener('keydown', () => Sound.unlock());

renderSoundBtn();
showTitle();
resize();
