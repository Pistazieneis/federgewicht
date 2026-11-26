/* ==========================================================================
   FEDERGEWICHT – Sound
   --------------------------------------------------------------------------
   Alle Töne werden live mit der Web Audio API erzeugt (keine Audiodateien):
     * "Oszillator" = ein Ton mit Wellenform (sine, square, sawtooth ...)
     * "Rauschen"   = zufällige Samples, durch einen Filter geformt: ergibt Knall, Wind, Staub
   Browser erlauben Ton erst nach der ersten Benutzer-Aktion, daher wird der AudioContext
   erst beim ersten Klick/Tastendruck angelegt (unlock).
   Benutzung: Sfx.play('buy'), Sfx.setMuted(true) ...
   ========================================================================== */
const Sfx = (function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null, hum = null;
  let muted = false;
  try { muted = localStorage.getItem('federgewicht.mute') === '1'; } catch (e) { /* kein Speicher */ }

  /** Legt den AudioContext an (nur nach Benutzeraktion erlaubt). */
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
      // Eine Sekunde weißes Rauschen, das für alle Geräusche wiederverwendet wird
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  /** Ein Ton: Frequenz f (Hz), die gleitend zu f2 wechseln kann; Lautstärke v; Beginn nach 'delay' Sekunden. */
  function tone(f, dur, type, v, f2, delay) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(0.02, dur / 4));     // kurzer Anstieg gegen Knacksen
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  /** Rauschen durch Tiefpass, dessen Grenzfrequenz von fa nach fb wandert (Knall: hoch -> tief). */
  function noise(dur, v, fa, fb, delay, type) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(fa, t0); f.frequency.exponentialRampToValueAtTime(fb, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  /** Ein Anschlag der Fahrradklingel: mehrere unharmonische Obertöne (wie bei echtem Metall) plus
      ein winziger heller Klick vom Hämmerchen. vol = Lautstärke-Faktor. */
  function ding(delay, vol) {
    vol = vol || 1;
    [[2090, 0.9, 0.20], [2112, 0.8, 0.12], [3140, 0.6, 0.12], [4210, 0.4, 0.08], [6280, 0.2, 0.04]]
      .forEach(([f, d, v]) => tone(f, d, 'sine', v * vol, 0, delay));
    noise(0.03, 0.22 * vol, 7000, 2500, delay, 'bandpass');
  }

  /** Ein metallisches "Tink", wenn ein Bot irgendwo am Metall des Objekts arbeitet. */
  function tink() { noise(0.05, 0.16, 5200, 1800, 0, 'bandpass'); tone(1500 + Math.random() * 700, 0.07, 'triangle', 0.08, 900); }

  // Klaviertöne (Pentatonik, klingt immer schön)
  const PENTA = [262, 294, 330, 392, 440, 523, 587, 659];

  const sounds = {
    // Kaufen: zwei schnelle Pieptöne
    buy:     () => { tone(520, 0.08, 'triangle', 0.25); tone(780, 0.12, 'triangle', 0.25, 0, 0.07); },
    // Upgrade: aufsteigende Dreiklang-Tonleiter
    upgrade: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, 0, i * 0.07)); },
    // Lauf startet: ansteigender Sweep und dumpfer Schlag
    start:   () => { tone(180, 0.5, 'sawtooth', 0.12, 720); tone(70, 0.3, 'sine', 0.4, 40); },
    // Objekt zerstört: kurzes Krachen und helles "Pling"
    kill:    () => { noise(0.25, 0.5, 6000, 300); tone(880, 0.18, 'triangle', 0.3, 1320, 0.04); tone(1320, 0.25, 'sine', 0.2, 0, 0.12); },
    // Laserzischen beim Abbau (leise, wird oft gespielt)
    zap:     () => { tone(1900 + Math.random() * 600, 0.09, 'sawtooth', 0.03, 500); },
    // Warnpiepen in den letzten Sekunden
    warn:    () => { tone(1000, 0.09, 'square', 0.08); },
    // Einschlag: fallende Pfeife, dann gewaltiger Knall mit Rumpeln, Krachen und Nachbeben
    boom:    () => {
      tone(1500, 0.7, 'sine', 0.18, 120);                         // "Wiuuu" der fallenden Pfeife
      noise(3.2, 1.0, 4000, 40, 0.55);                            // Hauptknall
      tone(150, 1.9, 'sine', 1.0, 22, 0.55);                      // tiefer Druckschlag
      tone(48, 3.2, 'triangle', 0.6, 30, 0.6);                    // Rumpeln
      noise(1.2, 0.5, 9000, 800, 0.9, 'bandpass');                // krachende Trümmer
      noise(2.0, 0.35, 600, 60, 1.8);                             // Nachbeben
      [0, 0.18, 0.4].forEach((d) => tone(2200 + Math.random() * 900, 0.5, 'sine', 0.06, 700, 1.4 + d));   // klirrende Splitter
    },
    // Fahrradklingel beim Abbau an der Klingel: "ting-ting"
    bell:     () => { ding(0); ding(0.09, 0.7); },
    // Fahrrad zerstört: Klingel-Triller, der ausklingt ("tri-ri-ri-ri-ring")
    bellKill: () => { for (let i = 0; i < 8; i++) ding(i * 0.06, 1 - i * 0.09); },
    // Prestige: festlicher Akkord
    prestige: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.9, 'triangle', 0.2, 0, i * 0.09)); },
    // Neue Erde erscheint: sanftes Aufglimmen
    reborn:  () => { tone(330, 0.6, 'sine', 0.2, 660); tone(495, 0.6, 'sine', 0.15, 990, 0.1); }
  };

  /* ---- Abbaugeräusche: Jedes Objekt klingt beim Abbau anders. 'every' = typischer Abstand in Sekunden. ---- */
  const hoof = (d) => { noise(0.06, 0.35, 900, 250, d); tone(210, 0.08, 'sine', 0.2, 110, d); };
  const horn = (f1, f2, dur, v) => { tone(f1, dur, 'square', v); tone(f2, dur, 'square', v * 0.9); };
  const MINE = {
    'Fahrrad:tink':          { every: 0.5, fn: tink },
    'Sofa':                  { every: 0.6, fn: () => { tone(130, 0.14, 'sine', 0.5, 60); noise(0.12, 0.25, 500, 120);
                                                         if (Math.random() < 0.35) tone(850, 0.12, 'triangle', 0.07, 1250, 0.05); } },      // dumpfes Plumpsen + Quietscher
    'Motorrad':              { every: 0.7, fn: () => { tone(60, 0.35, 'sawtooth', 0.12, 130); tone(120, 0.3, 'sawtooth', 0.05, 240); noise(0.3, 0.07, 700, 200); } },  // Knattern
    'Klavier':               { every: 0.5, fn: () => { const f = PENTA[(Math.random() * PENTA.length) | 0]; tone(f, 0.9, 'triangle', 0.2); tone(f * 2, 0.6, 'sine', 0.06); } },
    'Pferd':                 { every: 0.8, fn: () => { hoof(0); hoof(0.14); } },                                                           // Hufgetrappel
    'Kleinwagen':            { every: 1.4, fn: () => { horn(440, 554, 0.16, 0.07); } },                                                     // Hupen
    'Elefant':               { every: 2.2, fn: () => { tone(280, 0.5, 'sawtooth', 0.12, 620); tone(560, 0.45, 'sawtooth', 0.04, 1000, 0.03); } },   // Törööö
    'Schulbus':              { every: 1.6, fn: () => { horn(220, 277, 0.3, 0.07); } },
    'Lokomotive':            { every: 0.45, fn: () => { noise(0.14, 0.3, 1400, 300); if (Math.random() < 0.1) { tone(880, 0.5, 'triangle', 0.08); tone(1175, 0.5, 'triangle', 0.06); } } }, // Tschuff
    'Blauwal':               { every: 2.8, fn: () => { tone(110, 0.8, 'sine', 0.25, 260); tone(260, 0.9, 'sine', 0.2, 130, 0.7); } },     // Walgesang
    'Jumbojet':              { every: 1.2, fn: () => { noise(0.9, 0.3, 400, 3000, 0, 'bandpass'); } },                                       // Düsenrauschen
    'Eiffelturm':            { every: 0.9, fn: () => { [440, 1180, 1900].forEach((f, i) => tone(f, 0.9 - i * 0.2, 'triangle', 0.1 - i * 0.025)); } },  // Eisenträger-"Dong"
    'Kreuzfahrtschiff':      { every: 3.0, fn: () => { horn(98, 147, 1.0, 0.09); } },                                                       // Schiffshorn
    'Empire State Building': { every: 1.3, fn: () => { tone(1318, 0.5, 'sine', 0.14); tone(988, 0.6, 'sine', 0.12, 0, 0.25); } },          // Aufzug-"Bing-Bong"
    'Cheops-Pyramide':       { every: 0.7, fn: () => { noise(0.45, 0.35, 600, 120); tone(70, 0.4, 'sine', 0.3, 40); } },                    // Steinschleifen
    'Gestein':               { every: 0.35, fn: () => { noise(0.14, 0.3, 3200, 250); tone(90, 0.1, 'sine', 0.25, 50); } }                  // Knirschen bei ernsten Objekten
  };

  /** Leises Dauerrauschen während eines Laufs (Weltraum-Hintergrund, tiefes Summen der Bots). */
  function humStart() {
    if (!ctx || hum) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1);
    s.connect(f); f.connect(g); g.connect(master); s.start();
    hum = { s, g };
  }
  function humStop() {
    if (!hum) return;
    const h = hum; hum = null;
    h.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    h.s.stop(ctx.currentTime + 0.6);
  }

  return {
    play(name) { if (!muted && unlock() && sounds[name]) sounds[name](); },
    /** Spielt das Abbaugeräusch des Objekts. key = Objektname oder 'Gestein' / 'Fahrrad:tink'. */
    mine(key) { if (!muted && unlock()) { const m = MINE[key] || MINE.Gestein; m.fn(); } },
    /** Typischer Abstand zwischen zwei Abbaugeräuschen in Sekunden. */
    mineEvery(key) { return (MINE[key] || MINE.Gestein).every; },
    humStart() { if (!muted && unlock()) humStart(); },
    humStop,
    isMuted: () => muted,
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('federgewicht.mute', m ? '1' : '0'); } catch (e) { /* ignorieren */ }
      if (master) master.gain.value = m ? 0 : 0.55;
      if (m) humStop();
    }
  };
})();
