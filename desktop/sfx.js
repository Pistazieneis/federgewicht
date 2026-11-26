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
    // Prestige: festlicher Akkord
    prestige: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.9, 'triangle', 0.2, 0, i * 0.09)); },
    // Neue Erde erscheint: sanftes Aufglimmen
    reborn:  () => { tone(330, 0.6, 'sine', 0.2, 660); tone(495, 0.6, 'sine', 0.15, 990, 0.1); }
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
