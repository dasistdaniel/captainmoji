'use strict';
// Captain Moji – Ton: Soundeffekte, Musik und Schiffsgeräusche, alles per WebAudio erzeugt (keine Dateien)

const Sound = (() => {
  let ac = null, noiseBuf = null, brownBuf = null, muted = false;
  let master = null, sfxBus = null, musicBus = null, ambBus = null, echo = null;
  try { muted = localStorage.getItem('captainMoji.muted') === '1'; } catch (e) { /* egal */ }

  // ---------- Grundgerüst ----------
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ac.destination);
      sfxBus = gainTo(master, 1);
      musicBus = gainTo(master, 0.9);
      ambBus = gainTo(master, 0.9);
      // Echo für Arpeggios und Glocken
      const d = ac.createDelay(1.5), fb = ac.createGain(), wet = ac.createGain(), lp = ac.createBiquadFilter();
      d.delayTime.value = 0.42; fb.gain.value = 0.35; wet.gain.value = 0.5;
      lp.type = 'lowpass'; lp.frequency.value = 2400;
      d.connect(lp).connect(fb).connect(d);
      lp.connect(wet).connect(musicBus);
      echo = d;
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume();
    return ac;
  }

  function gainTo(dest, v) {
    const g = ac.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  function whiteNoise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // tiefes, weiches Rauschen für das Maschinenbrummen
  function brownNoise() {
    if (!brownBuf) {
      brownBuf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
      const d = brownBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return brownBuf;
  }

  // ---------- Soundeffekte ----------
  function tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.1, delay = 0 }) {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.15, vol = 0.2, freq = 2000, delay = 0 }) {
    const a = audio(); if (!a || muted) return;
    const t = a.currentTime + delay;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = whiteNoise();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(100, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const arp = (notes, type, gap, dur, vol) =>
    notes.forEach((f, i) => tone({ type, f0: f, f1: f * 0.98, dur, vol, delay: i * gap }));

  const SFX = {
    step:     () => noise({ dur: 0.05, vol: 0.06, freq: 700 }),
    bump:     () => noise({ dur: 0.07, vol: 0.12, freq: 400 }),
    shoot:    () => tone({ type: 'square', f0: 1400, f1: 160, dur: 0.18, vol: 0.07 }),
    hit:      () => { noise({ dur: 0.12, vol: 0.22, freq: 3000 }); tone({ type: 'square', f0: 240, f1: 110, dur: 0.08, vol: 0.05 }); },
    explode:  () => { noise({ dur: 0.5, vol: 0.35, freq: 1600 }); tone({ type: 'sawtooth', f0: 130, f1: 35, dur: 0.45, vol: 0.09 }); },
    hurt:     () => { tone({ type: 'sawtooth', f0: 190, f1: 55, dur: 0.24, vol: 0.13 }); noise({ dur: 0.1, vol: 0.14, freq: 1200 }); },
    miss:     () => tone({ type: 'sine', f0: 520, f1: 300, dur: 0.09, vol: 0.05 }),
    pickup:   () => arp([660, 990], 'sine', 0.07, 0.12, 0.11),
    tool:     () => arp([523, 784, 1047], 'triangle', 0.08, 0.18, 0.12),
    heal:     () => arp([523, 659, 784], 'triangle', 0.07, 0.16, 0.11),
    empty:    () => tone({ type: 'square', f0: 130, f1: 100, dur: 0.07, vol: 0.06 }),
    deny:     () => arp([220, 165], 'square', 0.09, 0.12, 0.05),
    win:      () => arp([523, 659, 784, 1047, 1319], 'triangle', 0.11, 0.3, 0.12),
    death:    () => arp([392, 330, 262, 196], 'sawtooth', 0.18, 0.32, 0.09),
    crate:    () => { noise({ dur: 0.25, vol: 0.3, freq: 900 }); tone({ type: 'triangle', f0: 160, f1: 70, dur: 0.2, vol: 0.1 }); },
    beep:     () => arp([880, 1175, 880], 'square', 0.06, 0.06, 0.04),
    alarm:    () => arp([740, 988, 740, 988], 'square', 0.1, 0.09, 0.05),
    wake:     () => tone({ type: 'sine', f0: 200, f1: 700, dur: 0.25, vol: 0.07 }),
    seal:     () => { noise({ dur: 0.35, vol: 0.18, freq: 5000 }); arp([392, 523], 'triangle', 0.12, 0.12, 0.09); },
    o2:       () => arp([392, 494, 587, 784], 'sine', 0.06, 0.18, 0.1),
    shield:   () => { tone({ type: 'sine', f0: 1600, f1: 700, dur: 0.3, vol: 0.12 }); noise({ dur: 0.1, vol: 0.1, freq: 4000 }); },
    shieldup: () => tone({ type: 'sine', f0: 500, f1: 1400, dur: 0.25, vol: 0.07 }),
    warn:     () => arp([880, 660, 880, 660], 'square', 0.12, 0.1, 0.05),
    squish:   () => { noise({ dur: 0.18, vol: 0.2, freq: 600 }); tone({ type: 'sine', f0: 300, f1: 90, dur: 0.15, vol: 0.08 }); },
    core:     () => arp([988, 1319, 1760, 2349], 'sine', 0.05, 0.16, 0.07),
    buy:      () => { arp([523, 659, 784, 1047], 'triangle', 0.06, 0.2, 0.1); noise({ dur: 0.2, vol: 0.05, freq: 6000 }); },
    unlock:   () => { tone({ type: 'square', f0: 300, f1: 200, dur: 0.05, vol: 0.08 }); arp([659, 880, 1319], 'triangle', 0.08, 0.2, 0.1); },
    screech:  () => { tone({ type: 'sawtooth', f0: 1300, f1: 380, dur: 0.45, vol: 0.07 }); tone({ type: 'square', f0: 1700, f1: 600, dur: 0.3, vol: 0.03, delay: 0.05 }); noise({ dur: 0.3, vol: 0.08, freq: 5000 }); },
    extinguish: () => { noise({ dur: 0.6, vol: 0.25, freq: 6000 }); noise({ dur: 0.3, vol: 0.1, freq: 1500, delay: 0.1 }); },
    short:    () => { noise({ dur: 0.15, vol: 0.2, freq: 8000 }); tone({ type: 'square', f0: 120, f1: 60, dur: 0.2, vol: 0.06 }); noise({ dur: 0.4, vol: 0.12, freq: 1200, delay: 0.1 }); },
    geiger:   () => { for (let i = 0; i < 3; i++) noise({ dur: 0.012, vol: 0.12, freq: 7000, delay: Math.random() * 0.25 }); },
    roar:     () => { tone({ type: 'sawtooth', f0: 110, f1: 45, dur: 1.2, vol: 0.14 }); tone({ type: 'square', f0: 165, f1: 70, dur: 1.0, vol: 0.05 }); noise({ dur: 1.0, vol: 0.18, freq: 900 }); },
    comm:     () => { noise({ dur: 0.08, vol: 0.06, freq: 3000 }); tone({ type: 'square', f0: 1800, f1: 1500, dur: 0.06, vol: 0.03, delay: 0.05 }); tone({ type: 'square', f0: 2200, f1: 2000, dur: 0.05, vol: 0.025, delay: 0.12 }); },
    warp:     () => { tone({ type: 'sawtooth', f0: 60, f1: 1400, dur: 2.6, vol: 0.07 }); tone({ type: 'sine', f0: 120, f1: 2400, dur: 2.6, vol: 0.05 }); noise({ dur: 2.8, vol: 0.12, freq: 9000 }); },
    elevator: () => { tone({ type: 'sawtooth', f0: 80, f1: 320, dur: 1.2, vol: 0.06 }); arp([523, 659, 784], 'triangle', 0.15, 0.25, 0.09); },
  };

  // ---------- Musik-Instrumente ----------
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function voice(bus, { type, freq, t, dur, vol, attack = 0.01, release = 0.2, cutoff = 8000, detune = 0, send = 0 }) {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(bus);
    if (send) { const s = ac.createGain(); s.gain.value = send; g.connect(s).connect(echo); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  // weiche Akkordfläche aus leicht verstimmten Sägezähnen
  function pad(bus, notes, t, dur, vol, cutoff) {
    for (const n of notes)
      for (const det of [-8, 8])
        voice(bus, { type: 'sawtooth', freq: midi(n), t, dur, vol, attack: dur * 0.3, release: dur * 0.4, cutoff, detune: det });
  }

  function kick(bus, t, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + 0.25);
  }

  function hat(bus, t, vol) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = whiteNoise();
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(bus);
    s.start(t); s.stop(t + 0.06);
  }

  // ---------- Stücke ----------
  // Titel: ruhiger Synthwave. Am – F – C – G, 100 BPM, Schritt = Sechzehntel
  const TITLE = {
    stepDur: 60 / 100 / 4,
    vol: 0.55,
    chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]],
    play(step, t, bus) {
      const chord = this.chords[Math.floor(step / 16) % 4], s = step % 16, bar = Math.floor(step / 16);
      if (s === 0) pad(bus, chord, t, this.stepDur * 16 + 0.3, 0.018, 1100);
      if (s % 4 === 0) voice(bus, { type: 'triangle', freq: midi(chord[0] - 24), t, dur: this.stepDur * 3, vol: 0.16, release: 0.12 });
      if (s === 14) voice(bus, { type: 'triangle', freq: midi(chord[0] - 17), t, dur: this.stepDur * 2, vol: 0.12, release: 0.1 });
      if (s % 2 === 0 && bar >= 2) {
        const tones = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24];
        const n = tones[[0, 1, 2, 3, 2, 1, 2, 3][(s / 2) % 8]];
        voice(bus, { type: 'square', freq: midi(n), t, dur: this.stepDur * 1.6, vol: 0.022, release: 0.15, cutoff: 2200, send: 0.6 });
      }
      if (bar >= 4) {
        if (s % 8 === 0) kick(bus, t, 0.22);
        if (s % 4 === 2) hat(bus, t, 0.025);
      }
    },
  };

  // Spiel: leise Ambient-Flächen, tiefer Grundton, vereinzelte Glockentöne. Schritt = Achtel bei 60 BPM
  const PENTA = [0, 3, 5, 7, 10]; // Moll-Pentatonik
  const GAME = {
    stepDur: 0.5,
    vol: 0.3,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 59, 62]],
    transpose: 0,
    play(step, t, bus) {
      const chord = this.chords[Math.floor(step / 16) % 4].map(n => n + this.transpose), s = step % 16;
      if (s === 0) {
        pad(bus, chord, t, this.stepDur * 16 + 1.5, 0.012, 650);
        voice(bus, { type: 'sine', freq: midi(chord[0] - 24), t, dur: this.stepDur * 16 + 1, vol: 0.07, attack: 2, release: 2 });
      }
      if (Math.random() < 0.16) {
        const n = 69 + this.transpose + PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.4 ? 12 : 0);
        voice(bus, { type: 'sine', freq: midi(n), t, dur: 2.2, vol: 0.03, attack: 0.005, release: 2, send: 0.7 });
      }
    },
  };

  // Boss: treibender Puls in Moll, 132 BPM
  const BOSS = {
    stepDur: 60 / 132 / 4,
    vol: 0.45,
    chords: [[45, 48, 52], [45, 48, 52], [41, 45, 48], [44, 47, 50]],
    play(step, t, bus) {
      const chord = this.chords[Math.floor(step / 16) % 4], s = step % 16;
      if (s === 0) pad(bus, chord.map(n => n + 12), t, this.stepDur * 16, 0.014, 900);
      if (s % 2 === 0) voice(bus, { type: 'sawtooth', freq: midi(chord[0] - 12), t, dur: this.stepDur * 1.5, vol: 0.07, release: 0.06, cutoff: 500 });
      if (s % 4 === 0) kick(bus, t, 0.28);
      if (s % 4 === 2) hat(bus, t, 0.03);
      if (s === 12 || s === 14) voice(bus, { type: 'square', freq: midi(chord[2] + 12), t, dur: this.stepDur, vol: 0.025, cutoff: 1800, send: 0.4 });
    },
  };

  const TRACKS = { title: TITLE, game: GAME, boss: BOSS };
  let seq = null, wanted = null;

  function startTrack(name) {
    stopTrack();
    const a = audio(); if (!a) return;
    const track = TRACKS[name];
    const bus = a.createGain();
    bus.gain.setValueAtTime(0, a.currentTime);
    bus.gain.linearRampToValueAtTime(track.vol, a.currentTime + 2.5);
    bus.connect(musicBus);
    seq = { name, track, bus, step: 0, next: a.currentTime + 0.1 };
    seq.timer = setInterval(tick, 50);
    tick();
  }

  function tick() {
    if (!seq || ac.state !== 'running') return;
    // verschlafene Zeit (z. B. Hintergrund-Tab) nicht nachholen
    if (seq.next < ac.currentTime - 0.2) seq.next = ac.currentTime + 0.05;
    while (seq.next < ac.currentTime + 0.3) {
      seq.track.play(seq.step, seq.next, seq.bus);
      seq.next += seq.track.stepDur;
      seq.step++;
    }
  }

  function stopTrack() {
    if (!seq) return;
    const { bus, timer } = seq, t = ac.currentTime;
    clearInterval(timer);
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => bus.disconnect(), 2500);
    seq = null;
  }

  // ---------- Schiffsgeräusche ----------
  let hum = null, eventTimer = 0, ambDeck = 0;

  function startAmbience() {
    if (hum) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const out = a.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + 3);
    out.connect(ambBus);
    // Maschinenbrummen: tiefes Rauschen + leise Grundschwingung, langsam pulsierend
    const src = a.createBufferSource(), lp = a.createBiquadFilter(), g = a.createGain();
    src.buffer = brownNoise(); src.loop = true;
    lp.type = 'lowpass'; lp.frequency.value = 160;
    g.gain.value = 0.1;
    src.connect(lp).connect(g).connect(out);
    const osc = a.createOscillator(), og = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    osc.type = 'sine'; osc.frequency.value = 48;
    og.gain.value = 0.025;
    lfo.frequency.value = 0.13; lg.gain.value = 0.015;
    lfo.connect(lg).connect(og.gain);
    osc.connect(og).connect(out);
    src.start(); osc.start(); lfo.start();
    hum = { out, nodes: [src, osc, lfo] };
    scheduleEvent();
  }

  function stopAmbience() {
    clearTimeout(eventTimer);
    eventTimer = 0;
    if (!hum) return;
    const { out, nodes } = hum, t = ac.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => { nodes.forEach(n => n.stop()); out.disconnect(); }, 1500);
    hum = null;
  }

  function scheduleEvent() {
    eventTimer = setTimeout(() => {
      if (!hum) return;
      if (ac.state === 'running') {
        const pool = ['creak', 'creak', 'clank', 'hiss', 'beeps', 'vent'];
        if (ambDeck === 1) pool.push('bubble', 'bubble', 'hiss');
        if (ambDeck === 2) pool.push('growl', 'growl', 'skitter');
        if (ambDeck >= 3) pool.push('crackle', 'crackle', 'geiger', 'growl');
        AMB[pool[Math.floor(Math.random() * pool.length)]]();
      }
      scheduleEvent();
    }, 4000 + Math.random() * 7000);
  }

  function ambNoise({ type, f0, f1 = f0, q = 1, dur, vol }) {
    const t = ac.currentTime;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = whiteNoise(); s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(ambBus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  function ambTone({ type, f0, f1 = f0, dur, vol, delay = 0, cutoff = 4000 }) {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(ambBus);
    const s = ac.createGain(); s.gain.value = 0.4; g.connect(s).connect(echo);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const AMB = {
    // Deck 4: knisterndes Feuer und Geigerzähler
    crackle: () => {
      const n = 6 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) {
        const t = ac.currentTime + i * (0.03 + Math.random() * 0.09);
        const s2 = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s2.buffer = whiteNoise();
        f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 2500; f.Q.value = 3;
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        s2.connect(f).connect(g).connect(ambBus);
        s2.start(t); s2.stop(t + 0.04);
      }
    },
    geiger: () => {
      const n = 4 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++)
        ambTone({ type: 'square', f0: 3000, dur: 0.01, vol: 0.01, delay: Math.random() * 0.8, cutoff: 8000 });
    },
    // Deck 3: Aliens irgendwo in den Schächten
    growl: () => {
      const f = 60 + Math.random() * 25;
      ambTone({ type: 'sawtooth', f0: f, f1: f * 0.75, dur: 1.4 + Math.random(), vol: 0.03, cutoff: 380 });
    },
    skitter: () => {
      const n = 5 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++)
        ambTone({ type: 'square', f0: 2200 + Math.random() * 900, dur: 0.02, vol: 0.006, delay: i * (0.04 + Math.random() * 0.05), cutoff: 5000 });
    },
    // Metall ächzt unter Spannung
    creak: () => {
      const base = 55 + Math.random() * 40;
      ambTone({ type: 'sawtooth', f0: base, f1: base * (0.7 + Math.random() * 0.2), dur: 0.9 + Math.random() * 0.8, vol: 0.035, cutoff: 700 });
    },
    // ferner Schlag irgendwo im Schiff
    clank: () => {
      ambTone({ type: 'triangle', f0: 170, f1: 110, dur: 0.5, vol: 0.05 });
      ambNoise({ type: 'bandpass', f0: 1400, f1: 900, q: 4, dur: 0.15, vol: 0.05 });
    },
    // Dampf zischt aus einer Leitung
    hiss: () => ambNoise({ type: 'highpass', f0: 3000, f1: 5000, dur: 1.2 + Math.random(), vol: 0.02 }),
    // Bordcomputer piepst
    beeps: () => {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++)
        ambTone({ type: 'square', f0: [1200, 1600, 900][i % 3], dur: 0.07, vol: 0.008, delay: i * 0.14, cutoff: 3000 });
    },
    // Lüftung fährt hoch und runter
    vent: () => ambNoise({ type: 'bandpass', f0: 200, f1: 900, q: 0.8, dur: 2.5, vol: 0.05 }),
    // Deck 2: Blasen in den Sauerstoff-Leitungen
    bubble: () => {
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const f = 300 + Math.random() * 300;
        ambTone({ type: 'sine', f0: f, f1: f * 1.8, dur: 0.08, vol: 0.02, delay: i * (0.07 + Math.random() * 0.1) });
      }
    },
  };

  // ---------- Steuerung von außen ----------
  function applyMusic() {
    if (!ac) return;
    const name = wanted && wanted.name;
    if (!name) { stopTrack(); stopAmbience(); return; }
    if (!seq || seq.name !== name || (name === 'game' && GAME.transpose !== wanted.transpose)) {
      GAME.transpose = wanted.transpose || 0;
      startTrack(name);
    }
    ambDeck = wanted.deck || 0;
    if (name === 'game' || name === 'boss') startAmbience(); else stopAmbience();
  }

  // Im Hintergrund-Tab pausiert der Ton
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else ac.resume().then(tick);
  });

  return {
    play(name) { try { SFX[name] && SFX[name](); } catch (e) { /* Audio ist optional */ } },
    // Browser erlauben Ton erst nach einer Nutzeraktion – dann gewünschte Musik starten
    unlock() {
      try {
        const a = audio();
        if (a) a.resume().then(() => { tick(); applyMusic(); });
      } catch (e) { /* egal */ }
    },
    // 'title', 'game' (mit Deck-Index) oder null
    music(name, deck = 0) {
      wanted = name ? { name, deck, transpose: [0, -2, -4, -5][deck] || 0 } : null;
      try { applyMusic(); } catch (e) { /* egal */ }
    },
    // Zum Testen: Zustand und Pegel (Spitze/RMS) über `ms` Millisekunden
    debug() { return { state: ac && ac.state, track: seq && seq.name, ambience: !!hum }; },
    async meter(ms = 3000) {
      if (!ac) return null;
      const an = ac.createAnalyser();
      an.fftSize = 2048;
      master.connect(an);
      const buf = new Float32Array(an.fftSize);
      let peak = 0, sum = 0, n = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        an.getFloatTimeDomainData(buf);
        for (const v of buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; n++; }
        await new Promise(r => setTimeout(r, 40));
      }
      master.disconnect(an);
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
    },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('captainMoji.muted', muted ? '1' : '0'); } catch (e) { /* egal */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.05);
      if (!muted) { this.unlock(); this.play('pickup'); }
      renderSoundBtn();
    },
  };
})();
