/* ==========================================================================
   FEDERGEWICHT – Spielkern (Logik ohne Oberfläche)
   --------------------------------------------------------------------------
   Diese Datei kennt weder HTML noch Canvas. Sie enthält nur:
     * die Spieldaten (Bots, Upgrades, Prestige-Shop)
     * die Regeln (Abbau, Einschlag, Belohnung, Prestige)
   Dadurch kann man sie auch ohne Browser testen (siehe tools/sim.js).

   Begriffe:
     ΔM (deltaM)   = die zerstörte Masse. Gleichzeitig die Hauptwährung.
     Iridium       = Spezialwährung, die nur ein *vollständig zerstörter*
                     Meteorit hinterlässt. Dauerhaft, auch über Prestige.
     FP            = Forschungspunkte, die Prestige-Währung.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- Balance
     Alle Stellschrauben stehen hier oben, damit man leicht nachjustieren kann. */
  const CFG = {
    startDm: 5,              // Startkapital: 5 kg ΔM -> reicht genau für einen Bot
    baseTime: 60,            // Sekunden bis zum Einschlag (ohne Upgrades)
    botCostGrowth: 1.15,     // jeder gekaufte Bot macht den nächsten 15 % teurer
    prestigeUnlockAfter: 5,  // Prestige ab dem 5. abgehandelten Meteoriten
    prestigeBase: 1e9,       // FP = floor(sqrt(gesamtΔM / prestigeBase))
    fpBonusPerPoint: 0.30,   // jeder verdiente FP gibt +30 % Abbau (dauerhaft)
    saveKey: 'federgewicht.save.v3'
  };

  /* ---------------------------------------------------------- Objektklassen
     Die Objekte fallen nacheinander auf die Erde (Stufe 1, 2, 3 ...), aufsteigend nach Masse.
     Zuerst kommen lustige Alltagsgegenstände (explizite Liste mit Emoji), danach ernste
     Himmelskörper, die aus Start-Masse (mass), Wachstum pro Stufe (growth) und Anzahl (count)
     erzeugt werden. Zwischen den Klassen liegen große Massensprünge -> dort entsteht die
     "Wand", die man erst mit mehr Prestige-Bonus überwindet. Weitere Klassen (Planeten, Sterne,
     Galaxien ...) lassen sich unten anhängen. Die letzte Klasse läuft endlos weiter. */
  const CLASSES = [
    { name: 'Alltag', funny: true, items: [
      ['Fahrrad', '🚲', 15],        ['Sofa', '🛋️', 70],           ['Motorrad', '🏍️', 220],
      ['Klavier', '🎹', 400],       ['Pferd', '🐎', 550],          ['Kleinwagen', '🚗', 1200],
      ['Elefant', '🐘', 5000],      ['Schulbus', '🚌', 12000],     ['Lokomotive', '🚂', 8e4],
      ['Blauwal', '🐋', 1.5e5],     ['Jumbojet', '✈️', 4e5],       ['Eiffelturm', '🗼', 1e7],
      ['Kreuzfahrtschiff', '🚢', 1e8], ['Empire State Building', '🏢', 3.65e8], ['Cheops-Pyramide', '🔺', 5.9e9]
    ] },
    { name: 'Kleiner Asteroid', mass: 3e11,  growth: 1.5, count: 8 },
    { name: 'Asteroid',         mass: 2e14,  growth: 1.5, count: 8 },
    { name: 'Großer Asteroid',  mass: 1e17,  growth: 1.5, count: 8 },
    { name: 'Zwergplanet',      mass: 5e20,  growth: 1.5, count: Infinity }
  ];
  /** Liefert Name, Emoji (nur Alltag), Klasse, Position in der Klasse und Masse für die Stufe n (ab 1). */
  function levelInfo(n) {
    let left = n - 1;
    for (let c = 0; c < CLASSES.length; c++) {
      const k = CLASSES[c], count = k.items ? k.items.length : k.count;
      if (left < count || c === CLASSES.length - 1) {
        if (k.items) { const it = k.items[left]; return { cls: k.name, classIndex: c, pos: left + 1, count, mass: it[2], name: it[0], emoji: it[1], funny: true }; }
        return { cls: k.name, classIndex: c, pos: left + 1, count, mass: k.mass * Math.pow(k.growth, left), name: null, emoji: null, funny: false };
      }
      left -= count;
    }
  }

  /* ------------------------------------------------------------------- Bots
     base = Abbau in kg pro Sekunde und Bot, cost = Grundpreis in kg ΔM. */
  const BOTS = [
    { id: 'drone',   name: 'Mikro-Bohrdrohne',        base: 0.2,   cost: 5,    desc: 'Löst Gesteinsstaub mit rotierenden Bohrköpfen.' },
    { id: 'crawler', name: 'Schürfroboter',           base: 0.75,  cost: 100,  desc: 'Kettenfahrzeug, das sich in die Oberfläche gräbt.' },
    { id: 'laser',   name: 'Laser-Abbauplattform',    base: 6,     cost: 1500, desc: 'Verdampft Material mit gebündelten Hochleistungslasern.' },
    { id: 'fusion',  name: 'Fusionsbohrer',           base: 52,    cost: 25e3, desc: 'Plasmabohrer mit eigenem Fusionsreaktor.' },
    { id: 'plasma',  name: 'Plasma-Schneidflotte',    base: 450,   cost: 4e5,  desc: 'Orbitale Flotte, die Brocken heraustrennt.' },
    { id: 'anti',    name: 'Antimaterie-Kollektor',   base: 3900,  cost: 7e6,  desc: 'Wandelt Gestein direkt in Energie um.' }
  ];

  /* --------------------------------------------------------- Upgrades (ΔM)
     Einmalkäufe. Jedes Upgrade hat einen Effekt:
       { all: 2 }      alle Bots x2
       { bot: i, m: 2} nur Bot-Typ i x2
       { time: 10 }    +10 s bis zum Einschlag
     req(s) entscheidet, ob das Upgrade überhaupt angezeigt wird.            */
  const UPGRADES = [];
  const up = (u) => UPGRADES.push(u);

  // Pro Bot-Typ zwei Verstärkungen (x2 und x3), erscheinen sobald man den Bot besitzt
  BOTS.forEach((b, i) => {
    up({ id: `b${i}a`, name: `${b.name}: Hartmetallköpfe`, desc: `${b.name} arbeiten doppelt so schnell.`,
         cost: b.cost * 40,   fx: { bot: i, m: 2 }, req: (s) => s.bots[i] >= 1 });
    up({ id: `b${i}b`, name: `${b.name}: Schwarmsteuerung`, desc: `${b.name} arbeiten dreimal so schnell.`,
         cost: b.cost * 3000, fx: { bot: i, m: 3 }, req: (s) => s.bots[i] >= 10 });
  });

  // Globale Technologie (alle Bots) – bauen aufeinander auf
  [
    ['g1', 'Aktive Kühlung',          300],
    ['g2', 'KI-Schwarmkoordination', 6e3],
    ['g3', 'Quantenortung',          1.2e5],
    ['g4', 'Supraleiter-Netzwerk',   2.5e6],
    ['g5', 'Gravitations-Anker',     5e7],
    ['g6', 'Selbstreplikation',      1e9]
  ].forEach(([id, name, cost], k, arr) => up({
    id, name, desc: 'Alle Bots arbeiten doppelt so schnell.', cost, fx: { all: 2 },
    req: (s) => k === 0 || !!s.upgrades[arr[k - 1][0]]
  }));

  // Mehr Zeit bis zum Einschlag (Frühwarnsysteme)
  [
    ['t1', 'Teleskop-Array',        10, 800],
    ['t2', 'Tiefenraum-Radar',      15, 2e4],
    ['t3', 'Frühwarnnetz',          20, 5e5],
    ['t4', 'Orbitalobservatorium',  30, 1e7]
  ].forEach(([id, name, t, cost], k, arr) => up({
    id, name, desc: `Entdeckt Objekte früher: +${t} s bis zum Einschlag.`, cost, fx: { time: t },
    req: (s) => k === 0 || !!s.upgrades[arr[k - 1][0]]
  }));

  /* ---------------------------------------------- Spezial-Upgrades (Iridium)
     Mehrstufig (max). Cost = Liste der Preise je Stufe. Bleiben nach Prestige. */
  const SPECIAL = [
    { id: 'charge',  name: 'Sprengladungen', max: 5, cost: [3, 8, 20, 50, 120],
      desc: (l) => `Beim Start eines Meteoriten sprengt eine Ladung ${l * 3} % seiner Masse weg.` , perLevel: '+3 % Startsprengung' },
    { id: 'yield',   name: 'Raffination', max: 5, cost: [4, 10, 25, 60, 150],
      desc: (l) => `Gewonnenes ΔM +${l * 20} %.`, perLevel: '+20 % ΔM' },
    { id: 'prospect', name: 'Prospektion', max: 4, cost: [5, 15, 40, 100],
      desc: (l) => `Zerstörte Objekte hinterlassen +${l * 50} % Iridium.`, perLevel: '+50 % Iridium' },
    { id: 'resonance', name: 'Resonanzbohrung', max: 5, cost: [6, 14, 35, 80, 200],
      desc: (l) => `Die Abbaurate steigt im Kampf um ${l * 0.5} % pro Sekunde.`, perLevel: '+0,5 %/s Abbau' }
  ];

  /* --------------------------------------------------- Prestige-Shop (FP) */
  const FP_SHOP = [
    { id: 'reserve',  name: 'Notfallreserven', max: 10, cost: (l) => 1 + l,
      desc: (l) => `Nach jedem Neustart: Start-ΔM +${fmtMass(reserveAmount(l))}.` },
    { id: 'drones',   name: 'Vorgefertigte Drohnen', max: 10, cost: (l) => 1 + l,
      desc: (l) => `Nach jedem Neustart: ${l * 3} Mikro-Bohrdrohnen gratis.` },
    { id: 'discount', name: 'Serienfertigung', max: 10, cost: (l) => 2 + l,
      desc: (l) => `Bots kosten ${Math.round((1 - Math.pow(0.95, l)) * 100)} % weniger.` },
    { id: 'time',     name: 'Langzeit-Ortung', max: 6, cost: (l) => 2 + 2 * l,
      desc: (l) => `+${l * 5} s bis zum Einschlag.` },
    { id: 'boost',    name: 'Spitzenforschung', max: 10, cost: (l) => 3 + 2 * l,
      desc: (l) => `Alle Bots x${(Math.pow(1.25, l)).toFixed(2).replace('.', ',')}.` }
  ];
  const reserveAmount = (l) => l * l * 150;

  /* -------------------------------------------------------------- Zahlen */
  const MASS_UNITS = [['g', 1e-3], ['kg', 1], ['t', 1e3], ['kt', 1e6], ['Mt', 1e9], ['Gt', 1e12],
                      ['Tt', 1e15], ['Pt', 1e18], ['Et', 1e21], ['Zt', 1e24], ['Yt', 1e27]];

  /** Formatiert eine Masse (in kg) mit passender Einheit, z. B. 12500 -> "12,5 t". */
  function fmtMass(kg) {
    if (!isFinite(kg)) return '∞';
    if (kg <= 0) return '0 kg';
    let u = MASS_UNITS[0];
    for (const cand of MASS_UNITS) if (kg >= cand[1] * 0.9995) u = cand; // größte passende Einheit
    if (kg >= 1e30) return kg.toExponential(2).replace('.', ',').replace('e+', '·10^') + ' kg';
    const v = kg / u[1];
    const d = v < 10 ? 2 : v < 100 ? 1 : 0;
    return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ' + u[0];
  }
  /** Normale Zahl mit Tausenderpunkten bzw. K/M-Kürzel bei sehr großen Werten. */
  function fmtNum(n) {
    if (n < 1e6) return Math.floor(n).toLocaleString('de-DE');
    return n.toExponential(2).replace('.', ',').replace('e+', '·10^');
  }
  function fmtTime(sec) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return m > 0 ? `${m}:${s.toFixed(0).padStart(2, '0')} min` : `${s.toFixed(1).replace('.', ',')} s`;
  }

  /* -------------------------------------------------------------- Zustand */
  function newState() {
    const s = {
      v: 3,
      dm: CFG.startDm,            // aktuelles ΔM (ausgebbar)
      totalDm: 0,                 // insgesamt je gewonnenes ΔM  -> Grundlage fürs Prestige
      bots: BOTS.map(() => 0),    // Anzahl je Bot-Typ
      upgrades: {},               // gekaufte ΔM-Upgrades { id: true }
      special: {},                // Iridium-Upgrades   { id: stufe }
      fpUp: {},                   // FP-Upgrades        { id: stufe }
      iridium: 0,
      fp: 0,                      // ausgebbare Forschungspunkte
      fpEarned: 0,                // insgesamt verdiente FP (bestimmt den Dauerbonus)
      meteorN: 1,                 // Stufe (Objekt) des aktuellen/nächsten Meteoriten im Lauf
      run: { kills: 0, gain: 0, iridium: 0 },   // Zwischenstand des laufenden Laufs
      meteorsSeen: 0,             // abgehandelte Meteoriten insgesamt (schaltet Prestige frei)
      destroyed: 0, impacts: 0, prestiges: 0,
      bestLevel: 0,               // höchste je zerstörte Stufe (Rekord, bleibt über Prestige)
      phase: 'shop',              // 'shop' = Upgrade-Fenster (nur nach Einschlag), 'fight' = Lauf läuft
      meteor: null,
      last: null                  // Ergebnis des letzten Laufs (für die Anzeige)
    };
    s.meteor = makeMeteor(s);
    return s;
  }

  /** Erzeugt das Objekt der aktuellen Stufe s.meteorN. Ein ganzer "Lauf" besteht aus Objekten,
      die nacheinander einschlagen wollen (Stufe 1, 2, 3 ...), bis eines nicht rechtzeitig zerstört
      wird. Danach beginnt der nächste Lauf wieder bei Stufe 1, mit allem, was man gekauft hat. */
  function makeMeteor(s) {
    const n = s.meteorN, info = levelInfo(n), mass = info.mass;
    const time = timeLimit(s);
    return { n, mass, remaining: mass, time, timeLeft: time, elapsed: 0,
             name: info.name || designation(s.meteorsSeen + 1), emoji: info.emoji, funny: info.funny,
             cls: info.cls, classIndex: info.classIndex, pos: info.pos, classCount: info.count };
  }
  function designation(n) { return `NEO 2026-${String(n).padStart(3, '0')}`; }

  /* ---------------------------------------------------------- Berechnungen */
  const lvl = (s, id) => s.fpUp[id] || 0;
  const ups = (s) => UPGRADES.filter((u) => s.upgrades[u.id]);

  function prestigeMult(s) { return 1 + CFG.fpBonusPerPoint * s.fpEarned; }
  function globalMult(s) {
    let m = prestigeMult(s) * Math.pow(1.25, lvl(s, 'boost'));
    ups(s).forEach((u) => { if (u.fx.all) m *= u.fx.all; });
    return m;
  }
  function botMult(s, i) {
    let m = 1;
    ups(s).forEach((u) => { if (u.fx.bot === i) m *= u.fx.m; });
    return m;
  }
  /** Gesamter Abbau in kg/s (ohne Resonanz). */
  function baseRate(s) {
    const g = globalMult(s);
    return BOTS.reduce((sum, b, i) => sum + s.bots[i] * b.base * botMult(s, i), 0) * g;
  }
  /** Abbau inkl. Resonanzbohrung, abhängig davon wie lange der Kampf schon läuft. */
  function currentRate(s) {
    const t = s.meteor ? s.meteor.elapsed : 0;
    return baseRate(s) * (1 + 0.005 * (s.special.resonance || 0) * t);
  }
  function timeLimit(s) {
    let t = CFG.baseTime + 5 * lvl(s, 'time');
    ups(s).forEach((u) => { t += u.fx.time || 0; });
    return t;
  }
  function botCost(s, i) {
    return BOTS[i].cost * Math.pow(CFG.botCostGrowth, s.bots[i]) * Math.pow(0.95, lvl(s, 'discount'));
  }
  function dmYield(s) { return 1 + 0.2 * (s.special.yield || 0); }
  function iridiumDrop(s, n) {
    return Math.max(1, Math.round((1 + Math.floor(n / 4)) * (1 + 0.5 * (s.special.prospect || 0))));
  }

  /* ------------------------------------------------------------- Aktionen */
  /** Sprengladungen (Spezial-Upgrade) sprengen beim Erscheinen jedes Objekts einen Teil weg. */
  function arm(s) {
    s.meteor.remaining -= s.meteor.mass * 0.03 * (s.special.charge || 0);
  }
  /** Startet einen Lauf (ab Stufe 1). Der Shop schließt sich bis zum nächsten Einschlag. */
  function startMeteor(s) {
    if (s.phase !== 'shop') return false;
    s.meteorN = 1;
    s.run = { kills: 0, gain: 0, iridium: 0 };
    s.meteor = makeMeteor(s);
    arm(s);
    s.phase = 'fight';
    return true;
  }

  /** Simulationsschritt (dt in Sekunden). Gibt ggf. ein Ergebnis-Objekt zurück. */
  function tick(s, dt) {
    if (s.phase !== 'fight') return null;
    const m = s.meteor;
    m.elapsed += dt;
    m.timeLeft -= dt;
    m.remaining -= currentRate(s) * dt;
    return checkEnd(s);
  }

  /** Prüft, ob das Objekt zerstört wurde oder eingeschlagen ist, und rechnet ab.
      Zerstört  -> sofort kommt das nächste, schwerere Objekt (kein Shop dazwischen).
      Eingeschlagen -> Lauf zu Ende, Shop öffnet sich, nächster Lauf beginnt wieder bei Stufe 1. */
  function checkEnd(s) {
    const m = s.meteor;
    const dead = m.remaining <= 0;
    if (!dead && m.timeLeft > 0) return null;
    const minedMass = Math.max(0, m.mass - Math.max(0, m.remaining));   // zerstörte Masse = ΔM-Basis
    const gain = minedMass * dmYield(s);
    s.dm += gain; s.totalDm += gain; s.run.gain += gain;
    let drop = 0;
    if (dead) { s.destroyed++; s.run.kills++; drop = iridiumDrop(s, m.n); s.iridium += drop; s.run.iridium += drop; }
    else s.impacts++;
    s.meteorsSeen++;
    const res = { destroyed: dead, n: m.n, name: m.name, emoji: m.emoji, funny: m.funny, mass: m.mass, mined: minedMass, gain,
                  iridium: drop, fraction: minedMass / m.mass };
    if (dead) {
      s.bestLevel = Math.max(s.bestLevel, m.n);
      s.meteorN = m.n + 1;
      s.meteor = makeMeteor(s); arm(s);          // direkt weiter mit dem nächsten Objekt
    } else {
      // Lauf-Zusammenfassung für den Ergebnisbericht
      Object.assign(res, { run: Object.assign({}, s.run), best: s.bestLevel, bestName: levelInfo(Math.max(1, s.bestLevel)).name });
      s.last = res;
      s.phase = 'shop';
      s.meteorN = 1;
      s.meteor = makeMeteor(s);                  // Vorschau auf das erste Objekt des nächsten Laufs
    }
    return res;
  }

  /** Wie viele Bots vom Typ i kann man (bis zu 'limit' Stück) kaufen, und was kostet das zusammen?
      n = Anzahl, cost = Gesamtpreis. Bei n = 0 ist cost der Preis des nächsten Bots. */
  function bulkBots(s, i, limit) {
    let n = 0, cost = 0, next = botCost(s, i);
    const g = CFG.botCostGrowth;
    for (let k = 0; k < Math.min(limit, 5000); k++) {
      const c = botCost(s, i) * Math.pow(g, k);         // Preis des (k+1)-ten Bots
      if (cost + c > s.dm) { return n ? { n, cost } : { n: 0, cost: c }; }
      cost += c; n++; next = c;
    }
    return { n, cost: n ? cost : next };
  }
  /** Dasselbe für mehrstufige Upgrades. priceAt(level) = Preis der Stufe, have = verfügbare Währung. */
  function bulkLevels(level, max, priceAt, have, limit) {
    let n = 0, cost = 0;
    while (level + n < max && n < limit) {
      const c = priceAt(level + n);
      if (cost + c > have) break;
      cost += c; n++;
    }
    return n ? { n, cost } : { n: 0, cost: level < max ? priceAt(level) : 0 };
  }
  function bulkSpecial(s, id, limit) {
    const d = SPECIAL.find((x) => x.id === id);
    return bulkLevels(s.special[id] || 0, d.max, (l) => d.cost[l], s.iridium, limit);
  }
  function bulkFp(s, id, limit) {
    const d = FP_SHOP.find((x) => x.id === id);
    return bulkLevels(lvl(s, id), d.max, d.cost, s.fp, limit);
  }

  function buyBot(s, i) {
    if (s.phase !== 'shop') return false;
    const c = botCost(s, i);
    if (s.dm < c) return false;
    s.dm -= c; s.bots[i]++;
    return true;
  }
  function buyUpgrade(s, id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (s.phase !== 'shop' || !u || s.upgrades[id] || s.dm < u.cost) return false;
    s.dm -= u.cost; s.upgrades[id] = true;
    s.meteor = makeMeteor(s);          // Zeitupgrades sofort in der Vorschau sichtbar
    return true;
  }
  function buySpecial(s, id) {
    const d = SPECIAL.find((x) => x.id === id), l = s.special[id] || 0;
    if (s.phase !== 'shop' || !d || l >= d.max || s.iridium < d.cost[l]) return false;
    s.iridium -= d.cost[l]; s.special[id] = l + 1;
    return true;
  }
  function buyFp(s, id) {
    const d = FP_SHOP.find((x) => x.id === id), l = lvl(s, id);
    if (!d || l >= d.max || s.fp < d.cost(l)) return false;
    s.fp -= d.cost(l); s.fpUp[id] = l + 1;
    s.meteor = makeMeteor(s);
    return true;
  }

  /* -------------------------------------------------------------- Prestige */
  function prestigeUnlocked(s) { return s.meteorsSeen >= CFG.prestigeUnlockAfter; }
  /** FP, die man JETZT durch einen Neustart bekäme (abhängig vom Gesamt-ΔM). */
  function prestigeGain(s) {
    return Math.max(0, Math.floor(Math.sqrt(s.totalDm / CFG.prestigeBase)) - s.fpEarned);
  }
  /** Neustart: Bots, ΔM-Upgrades und Meteoritenzähler werden zurückgesetzt.
      Behalten werden: Gesamt-ΔM, Iridium (+Upgrades), FP (+Upgrades). */
  function prestige(s) {
    if (s.phase !== 'shop' || !prestigeUnlocked(s)) return false;
    const gain = prestigeGain(s);
    if (gain < 1) return false;
    s.fp += gain; s.fpEarned += gain; s.prestiges++;
    s.dm = CFG.startDm + reserveAmount(lvl(s, 'reserve'));
    s.bots = BOTS.map(() => 0);
    s.bots[0] = 3 * lvl(s, 'drones');
    s.upgrades = {};
    s.meteorN = 1;
    s.last = null;
    s.meteor = makeMeteor(s);
    return true;
  }

  /* ------------------------------------------------------------ Speichern */
  function serialize(s) { return JSON.stringify(s); }
  /** Lädt einen Spielstand und füllt fehlende Felder mit Standardwerten auf. */
  function deserialize(str) {
    try {
      const d = JSON.parse(str);
      if (!d || d.v !== 3) return null;
      const s = Object.assign(newState(), d);
      s.bots = BOTS.map((_, i) => d.bots[i] || 0);
      // Ein laufender Kampf wird beim Laden nicht fortgesetzt: neuer Meteorit im Upgrade-Fenster.
      if (s.phase === 'fight') { s.phase = 'shop'; }
      s.meteor = makeMeteor(s);
      return s;
    } catch (e) { return null; }
  }

  root.Core = {
    CFG, CLASSES, levelInfo, BOTS, UPGRADES, SPECIAL, FP_SHOP,
    newState, startMeteor, tick, bulkBots, bulkSpecial, bulkFp, buyBot, buyUpgrade, buySpecial, buyFp, prestige,
    botCost, baseRate, currentRate, timeLimit, prestigeUnlocked, prestigeGain, prestigeMult,
    reserveAmount, makeMeteor, serialize, deserialize, fmtMass, fmtNum, fmtTime
  };
  if (typeof module !== 'undefined') module.exports = root.Core;   // für Node-Tests
})(typeof window !== 'undefined' ? window : globalThis);
