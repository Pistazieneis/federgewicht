/* ==========================================================================
   FEDERGEWICHT – Oberfläche
   --------------------------------------------------------------------------
   Aufbau dieser Datei:
     1. Hilfsfunktionen und Spielzustand
     2. Shops (Listen werden EINMAL gebaut und danach nur noch aktualisiert,
        damit Klicks nicht verloren gehen, wenn sich Zahlen ändern)
     3. HUD / Texte
     4. Szene (Canvas): Sterne, Erde, Meteorit, Bots, Partikel, Effekte
     5. Hauptschleife (requestAnimationFrame) und Eingaben
   Die Spielregeln selbst stehen in core.js (globales Objekt "Core").
   ========================================================================== */
(function () {
  'use strict';
  const C = Core;
  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------ 1. Zustand & Speichern */
  let S = null;
  try { S = C.deserialize(localStorage.getItem(C.CFG.saveKey) || ''); } catch (e) { /* kein Speicher */ }
  if (!S) S = C.newState();
  let speed = 1;

  function save() { try { localStorage.setItem(C.CFG.saveKey, C.serialize(S)); } catch (e) { /* ignorieren */ } }
  setInterval(save, 10000);
  window.addEventListener('beforeunload', save);

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200);
  }
  // Text nur setzen, wenn er sich geändert hat (spart unnötige Layout-Arbeit)
  function setText(el, txt) { if (el.textContent !== txt) el.textContent = txt; }
  const rate = (r) => C.fmtMass(r) + '/s';


  /** Zwei-Klick-Bestätigung: Der erste Klick ändert nur die Beschriftung ("Wirklich?"),
      erst der zweite Klick innerhalb von 4 s führt die Aktion aus. Ersetzt confirm(),
      das in eingebetteten Browser-Seiten keinen Dialog zeigt. */
  function confirmClick(btn, action, label) {
    if (btn._armed) { clearTimeout(btn._t); btn._armed = false; btn.textContent = btn._orig; btn.classList.remove('armed'); action(); return; }
    btn._orig = btn.textContent; btn._armed = true; btn.classList.add('armed');
    btn.textContent = label;
    btn._t = setTimeout(() => { btn._armed = false; btn.classList.remove('armed'); btn.textContent = btn._orig; }, 4000);
  }

  /* ------------------------------------------------------------- 2. Shops */
  /** Baut ein Listenelement. 'buyLabel' ist der Beschriftungstext des Knopfes. */
  function makeItem(kind, id, withOwned) {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `<div class="i-main"><div class="i-name"></div><div class="i-desc"></div><div class="i-stat"></div></div>` +
      (withOwned ? `<div class="i-owned"></div>` : '') +
      `<button class="buy" data-kind="${kind}" data-id="${id}"></button>`;
    el.q = {
      name: el.querySelector('.i-name'), desc: el.querySelector('.i-desc'), stat: el.querySelector('.i-stat'),
      owned: el.querySelector('.i-owned'), buy: el.querySelector('.buy')
    };
    return el;
  }

  const botEls = C.BOTS.map((b, i) => { const e = makeItem('bot', i, true); $('list-bots').appendChild(e); return e; });

  // Upgrades nach Preis sortiert anzeigen
  const upDefs = C.UPGRADES.slice().sort((a, b) => a.cost - b.cost);
  const upEls = upDefs.map((u) => { const e = makeItem('upg', u.id, false); e.q.buy.classList.add('dm'); $('list-upg').appendChild(e); return e; });
  const upInfo = document.createElement('div'); upInfo.className = 'note'; $('list-upg').prepend(upInfo);

  const specNote = document.createElement('div'); specNote.className = 'note';
  specNote.textContent = 'Spezialausrüstung wird mit Iridium bezahlt und bleibt auch nach einem Prestige erhalten.';
  $('list-spec').appendChild(specNote);
  const specEls = C.SPECIAL.map((d) => { const e = makeItem('spec', d.id, true); e.q.buy.classList.add('ir'); $('list-spec').appendChild(e); return e; });

  // Prestige-Tab: Infobox + Shop
  $('list-pres').innerHTML = `
    <div class="pres-box" id="presBox">
      <div class="row"><span class="muted">Gesamt gewonnenes ΔM</span><b id="pTotal">–</b></div>
      <div class="row"><span class="muted">Bisher verdiente Forschung</span><b id="pEarned">–</b></div>
      <div class="row"><span class="muted">Dauerhafter Abbaubonus</span><b id="pBonus">–</b></div>
      <div class="row"><span class="muted">Forschung durch Neustart</span><b id="pGain" style="color:var(--fp)">–</b></div>
      <div class="row"><span class="muted">Nächster Punkt ab Gesamt-ΔM</span><b id="pNext">–</b></div>
      <button id="btnPrestige" class="primary">Neustart</button>
      <div class="hint" id="pHint">Setzt Bots, ΔM-Upgrades und die Meteoritenstufe zurück. Iridium, Spezialausrüstung, Forschung und ihre Upgrades bleiben.</div>
    </div>
    <div class="section-title">Forschung</div>`;
  const presLock = document.createElement('div'); presLock.className = 'note'; $('list-pres').prepend(presLock);
  const fpEls = C.FP_SHOP.map((d) => { const e = makeItem('fp', d.id, true); e.q.buy.classList.add('fp'); $('list-pres').appendChild(e); return e; });

  // Tabs umschalten
  let tab = 'bots';
  function showTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('.list').forEach((l) => l.classList.toggle('on', l.id === 'list-' + t));
  }
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });

  // Kaufmenge: 1, 10 oder Max (Infinity). Wird gemerkt.
  let buyMode = 1;
  try { const m = localStorage.getItem('federgewicht.buymode'); buyMode = m === 'max' ? Infinity : (+m === 10 ? 10 : 1); } catch (e) { /* kein Speicher */ }
  function showBuyMode() {
    document.querySelectorAll('#buyMode [data-mode]').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'max' ? Infinity : +b.dataset.mode) === buyMode));
  }
  $('buyMode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    buyMode = b.dataset.mode === 'max' ? Infinity : +b.dataset.mode;
    try { localStorage.setItem('federgewicht.buymode', b.dataset.mode); } catch (err) { /* ignorieren */ }
    showBuyMode(); updateShops();
  });
  showBuyMode();
  /** Label für Sammelkäufe: "×5 · 120 kg" bzw. nur der Preis bei Einzelkauf. */
  const bulkLabel = (r, fmt) => (r.n > 1 ? `×${r.n} · ` : '') + fmt(r.cost);

  // Kaufen: ein Listener für alle Knöpfe (Event-Delegation). Shift+Klick = bis zu 10 Käufe.
  $('lists').addEventListener('click', (e) => {
    const b = e.target.closest('button.buy'); if (!b) return;
    const { kind, id } = b.dataset, times = kind === 'upg' ? 1 : Math.min(buyMode === 1 && e.shiftKey ? 10 : buyMode, 5000);   // Shift+Klick = ×10, solange ×1 gewählt ist
    let ok = false;
    for (let k = 0; k < times; k++) {
      let r = false;
      if (kind === 'bot') r = C.buyBot(S, +id);
      else if (kind === 'upg') r = C.buyUpgrade(S, id);
      else if (kind === 'spec') r = C.buySpecial(S, id);
      else if (kind === 'fp') r = C.buyFp(S, id);
      if (!r) break; ok = true;
    }
    if (ok) { Sfx.play(kind === 'bot' ? 'buy' : 'upgrade'); updateShops(); updateHud(); }
  });

  $('btnPrestige').addEventListener('click', (e) => {
    const gain = C.prestigeGain(S);
    if (gain < 1) return;
    // Erst beim zweiten Klick wird wirklich neu gestartet
    confirmClick(e.currentTarget, () => {
      if (C.prestige(S)) { Sfx.play('prestige'); toast(`+${gain} Forschung`); showReport(); save(); updateShops(); updateHud(); }
    }, 'Sicher? Bots und Upgrades werden zurückgesetzt – nochmal klicken');
  });

  /** Aktualisiert Texte und Knopfzustände aller Shops (wird ~5x pro Sekunde aufgerufen). */
  function updateShops() {
    const shopOpen = S.phase === 'shop';

    // --- Bots
    C.BOTS.forEach((b, i) => {
      const e = botEls[i], q = e.q, cost = C.botCost(S, i);
      // Erst anzeigen, wenn der vorherige Typ vorhanden ist oder man fast genug hat
      const visible = i === 0 || S.bots[i - 1] > 0 || S.bots[i] > 0 || S.dm >= b.cost * 0.5;
      e.hidden = !visible;
      const each = (C.baseRate(withBots(S, i, 1)) - C.baseRate(S)) ;
      setText(q.name, b.name); setText(q.desc, b.desc);
      setText(q.stat, `je ${rate(each)} · gesamt ${rate(each * S.bots[i])}`);
      setText(q.owned, String(S.bots[i]));
      const bulk = C.bulkBots(S, i, buyMode);
      setText(q.buy, bulkLabel(bulk, C.fmtMass));
      q.buy.disabled = !shopOpen || bulk.n < 1;
    });

    // --- Upgrades
    let shown = 0, owned = 0;
    upDefs.forEach((u, i) => {
      const e = upEls[i], q = e.q, has = !!S.upgrades[u.id];
      if (has) owned++;
      const visible = !has && u.req(S) && shown < 12;
      if (visible) shown++;
      e.hidden = !visible;
      if (!visible) return;
      setText(q.name, u.name); setText(q.desc, u.desc); setText(q.buy, C.fmtMass(u.cost));
      q.buy.disabled = !shopOpen || S.dm < u.cost;
    });
    setText(upInfo, `${owned} von ${upDefs.length} Upgrades gekauft.`);

    // --- Spezial (Iridium)
    C.SPECIAL.forEach((d, i) => {
      const q = specEls[i].q, l = S.special[d.id] || 0, maxed = l >= d.max;
      setText(q.name, d.name); setText(q.desc, d.desc(Math.max(1, l + (maxed ? 0 : 1))) + (maxed ? '' : ' (nächste Stufe)'));
      setText(q.stat, l > 0 ? `aktuell: ${d.desc(l)}` : '');
      setText(q.owned, `${l}/${d.max}`);
      const bulk = C.bulkSpecial(S, d.id, buyMode);
      setText(q.buy, maxed ? 'MAX' : bulkLabel(bulk, (c) => c + ' Iridium'));
      q.buy.disabled = !shopOpen || maxed || bulk.n < 1;
    });

    // --- Prestige
    const unlocked = C.prestigeUnlocked(S), gain = C.prestigeGain(S);
    $('tabPres').textContent = unlocked ? 'Prestige' : 'Prestige 🔒';
    $('presBox').style.display = unlocked ? '' : 'none';
    // Solange Prestige gesperrt ist, zeigt ein Hinweis den Fortschritt (Box oben bleibt versteckt)
    presLock.hidden = unlocked;
    setText(presLock, `Prestige wird nach ${C.CFG.prestigeUnlockAfter} Meteoriten freigeschaltet (${Math.min(S.meteorsSeen, C.CFG.prestigeUnlockAfter)}/${C.CFG.prestigeUnlockAfter}).`);
    setText($('pTotal'), C.fmtMass(S.totalDm));
    setText($('pEarned'), String(S.fpEarned));
    setText($('pBonus'), '×' + C.prestigeMult(S).toFixed(2).replace('.', ','));
    setText($('pGain'), '+' + C.fmtNum(gain));
    setText($('pNext'), C.fmtMass(Math.pow(S.fpEarned + gain + 1, 2) * C.CFG.prestigeBase));
    if (!$('btnPrestige')._armed) setText($('btnPrestige'), gain >= 1 ? `Neustart (+${C.fmtNum(gain)} Forschung)` : 'Noch keine Forschung verfügbar');
    $('btnPrestige').disabled = !shopOpen || gain < 1;
    C.FP_SHOP.forEach((d, i) => {
      const e = fpEls[i], q = e.q, l = S.fpUp[d.id] || 0, maxed = l >= d.max;
      e.hidden = !unlocked && S.fpEarned === 0;
      setText(q.name, d.name);
      setText(q.desc, d.desc(maxed ? l : l + 1) + (maxed ? '' : ' (nächste Stufe)'));
      setText(q.stat, l > 0 ? `aktuell: ${d.desc(l)}` : '');
      setText(q.owned, `${l}/${d.max}`);
      const bulk = C.bulkFp(S, d.id, buyMode);
      setText(q.buy, maxed ? 'MAX' : bulkLabel(bulk, (c) => c + ' Forschung'));
      q.buy.disabled = maxed || bulk.n < 1;   // FP-Shop ist auch im Kampf nutzbar
    });
    $('lock').hidden = shopOpen || tab === 'pres';
    $('side').classList.toggle('locked', !shopOpen);
  }
  /** Kopie des Zustands mit geänderter Botzahl – nur um die Wirkung eines Bots zu berechnen. */
  function withBots(s, i, extra) { const c = Object.assign({}, s, { bots: s.bots.slice() }); c.bots[i] += extra; return c; }

  /* ----------------------------------------------------------- 3. HUD */
  // Kleine Sprüche, damit der Weltuntergang sympathisch bleibt
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const KILL_QUIPS = ['Sicher entsorgt.', 'Das war knapp.', 'Die Versicherung atmet auf.', 'Schon wieder Glück gehabt.', 'Sauber weggeräumt.', 'Der Nachbar wird nichts merken.', 'Fachgerecht zerlegt.'];
  const BOOM_QUIPS = ['Hoppla. Die Erde ist weg.', 'Das gibt Ärger mit der Hausverwaltung.', 'Nicht schlimm, wir haben ja noch eine.', 'Die Erde hat es kommen sehen.', 'Tschüss, Erde. Danke für den Fisch.', 'Kann ja mal passieren.', 'Das Meeting fällt dann wohl aus.'];

  /** Anzeigename eines Objekts, z. B. "🚲 Fahrrad" (ernste Objekte haben kein Emoji). */
  const label = (o) => (o.emoji ? o.emoji + ' ' : '') + o.name;

  function forecast(rateNow, m) {
    // Grobe Prognose: Wie viel der Masse schafft man in der Restzeit?
    const t = m.timeLeft;
    const resonance = 0.005 * (S.special.resonance || 0);
    const mined = rateNow * (t + resonance * t * t / 2);
    return Math.min(1, mined / Math.max(1e-9, m.remaining));
  }
  function forecastText(f) {
    if (f >= 1) return ['Sieht gut aus', 'good'];
    if (f >= 0.6) return [`Wird knapp (${Math.floor(f * 100)} %)`, 'mid'];
    return [`Schlechte Aussichten (${Math.floor(f * 100)} %)`, 'bad'];
  }

  let boom = null;          // läuft gerade die Erdexplosion? (siehe Szene)

  function updateHud() {
    const m = S.meteor, fight = S.phase === 'fight';
    // Während der Explosion zeigt die Szene alles allein; danach erscheint das Upgrade-Fenster
    $('hudFight').classList.toggle('on', fight);
    $('hudShop').classList.toggle('on', !fight && !boom);

    setText($('rDm'), C.fmtMass(S.dm));
    setText($('rRate'), rate(C.currentRate(S)));
    $('boxIr').hidden = !(S.iridium > 0 || S.destroyed > 0);
    setText($('rIr'), String(S.iridium));
    $('boxFp').hidden = !(S.fpEarned > 0 || C.prestigeUnlocked(S));
    setText($('rFp'), String(S.fp));
    setText($('rBonus'), 'Bonus ×' + C.prestigeMult(S).toFixed(2).replace('.', ','));
    $('tabSpec').hidden = !(S.iridium > 0 || S.destroyed > 0 || Object.keys(S.special).length > 0);

    const clsTxt = `${m.cls} · ${m.pos}/${m.classCount === Infinity ? '∞' : m.classCount}`;
    if (fight) {
      setText($('mName'), label(m)); setText($('mClass'), clsTxt);
      setText($('mRemain'), `${C.fmtMass(Math.max(0, m.remaining))} / ${C.fmtMass(m.mass)}`);
      $('barMass').style.width = Math.max(0, m.remaining / m.mass * 100) + '%';
      setText($('mRate'), rate(C.currentRate(S)));
      setText($('mRun'), `Objekt ${m.n} · ${S.run.kills} zerstört`);
      setText($('mRunGain'), '+' + C.fmtMass(S.run.gain));
      setText($('mTime'), C.fmtTime(m.timeLeft));
      const frac = Math.max(0, m.timeLeft / m.time);
      const bt = $('barTime'); bt.style.width = frac * 100 + '%';
      bt.style.background = frac < 0.25 ? 'var(--bad)' : frac < 0.5 ? 'var(--warn)' : 'var(--ok)';
      const [ft] = forecastText(forecast(C.currentRate(S), m)); setText($('mForecast'), ft);
      // Entfernung: startet bei ~384.400 km (Mondentfernung) und sinkt mit der Restzeit auf 0
      setText($('mSite'), m.site ? regionName(m.site) : '–');
      setText($('mDist'), Math.round(384400 * Math.max(0, m.timeLeft) / m.time).toLocaleString('de-DE') + ' km');
    } else {
      // Vorschau: Jeder Lauf beginnt wieder beim leichtesten Objekt
      const blast = 1 - 0.03 * (S.special.charge || 0);
      setText($('nName'), 'Nächster Lauf'); setText($('nClass'), 'Start: ' + label(m));
      setText($('nMass'), C.fmtMass(m.mass)); setText($('nTime'), C.fmtTime(m.time));
      setText($('nNeed'), rate(m.mass * blast / m.time));
      setText($('nHave'), rate(C.baseRate(S)));
      const [ft, cls] = forecastText(forecast(C.baseRate(S), Object.assign({}, m, { timeLeft: m.time, remaining: m.mass * blast })));
      const fe = $('nForecast'); setText(fe, 'Das erste Objekt: ' + ft); fe.className = 'forecast ' + cls;
    }
  }

  /** Ergebnisbericht nach einem Lauf (oben links im Upgrade-Fenster). */
  function showReport() {
    const r = S.last, box = $('report');
    box.hidden = !r;
    if (!r) return;
    const head = $('repHead');
    head.className = 'rep-head bad';
    head.textContent = S.impacts > 1 ? 'Die Erde ist explodiert (schon wieder).' : 'Die Erde ist explodiert.';
    const rows = [
      ['Schuld war', label(r)],
      ['Zerstört im Lauf', `${r.run.kills} ${r.run.kills === 1 ? 'Objekt' : 'Objekte'}`],
      ['ΔM im Lauf', '+' + C.fmtMass(r.run.gain)]
    ];
    if (r.run.iridium > 0) rows.push(['Iridium gefunden', '+' + r.run.iridium]);
    rows.push(['Rekord', r.best > 0 ? `${r.best} Objekte (bis ${r.bestName || 'Asteroid'})` : '–']);
    $('repBody').innerHTML = rows.map(([a, b]) => `<span class="muted">${a}</span><b>${b}</b>`).join('');
  }

  /** Meldung "Objekt zerstört" unten links. */
  function addFeed(res) {
    const f = $('feed'), d = document.createElement('div');
    d.innerHTML = `${label(res)} zerstört <b>+${C.fmtMass(res.gain)}</b>${res.iridium ? ' · +' + res.iridium + ' Iridium' : ''}<small>${pick(KILL_QUIPS)}</small>`;
    f.appendChild(d);
    while (f.children.length > 4) f.firstChild.remove();
    setTimeout(() => d.remove(), 5200);
  }

  /* ------------------------------------------------------ 4. Szene (Canvas) */
  const cv = $('scene'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let bgDirty = true;       // Hintergrund neu aufbauen? (nach Größenänderung)
  function resize() {
    DPR = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bgDirty = true;
  }
  new ResizeObserver(resize).observe(cv); resize();

  // Kleiner deterministischer Zufallsgenerator, damit Sterne/Gestalt eines Meteoriten gleich bleiben
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const R = rng(7);

  // Gestalt eines Gesteinsbrockens: unregelmäßiges Vieleck + Krater, aus der Nummer erzeugt
  const shapeCache = {};
  function shapeFor(seed) {
    if (shapeCache[seed]) return shapeCache[seed];
    const r = rng(seed * 977 + 13), pts = [], N = 34;
    const lump = [r() * 6.28, r() * 6.28, r() * 6.28];
    for (let i = 0; i < N; i++) {
      const a = i / N * 6.2832;
      const rad = 0.86 + 0.09 * Math.sin(a * 2 + lump[0]) + 0.06 * Math.sin(a * 3 + lump[1]) + 0.04 * Math.sin(a * 5 + lump[2]) + (r() - 0.5) * 0.05;
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    const craters = Array.from({ length: 7 }, () => { const a = r() * 6.28, d = Math.sqrt(r()) * 0.6; return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.07 + r() * 0.14 }; });
    return (shapeCache[seed] = { pts, craters });
  }

  const parts = [];      // Partikel (Funken, Staub, Trümmer)
  const rings = [];      // Druckwellen
  let flash = 0;         // Bildschirmblitz (0..1+)
  let shake = 0;         // Wackeln (Pixel)
  let clock = 0;
  let spawnT = 1;        // 0..1: Einblenden eines neuen Objekts
  let earthT = 1;        // 0..1: Erde (neu) erscheinen lassen
  let lastPos = { x: 0, y: 0, r: 20 };
  let lastSite = { lon: 0, tilt: 0.4 };   // Einschlagsregion des aktuellen Objekts (für die Explosion)
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function spawn(x, y, n, speedMax, colors, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = Math.random() * speedMax;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.8), max: life, c: colors[(Math.random() * colors.length) | 0], s: size * (0.5 + Math.random()) });
    }
  }

  /** Lage und Größe der Erde im "Totale"-Bild (komplett sichtbar am unteren Rand). Wird für die Explosion benutzt. */
  function earth() { const r = Math.min(H * 0.21, W * 0.3); return { x: W * 0.5, y: H - r * 1.15, r }; }
  /** Bildradius des Objekts. Die Kamera folgt dem Objekt, es bleibt also immer gleich groß im Bild. */
  function baseRadius() { return Math.min(H * 0.22, W * 0.2); }

  /* ---- Die Erde: echte Kontinent-Umrisse (grob, als [Längengrad, Breitengrad]) auf eine drehende Kugel projiziert ---- */
  const CONTINENTS = [
    { n: 'Nordamerika', c: '#5f8f4a', p: [[-168,66],[-150,71],[-125,72],[-95,73],[-80,68],[-62,58],[-55,50],[-67,45],[-76,38],[-81,30],[-80,25],[-90,29],[-97,26],[-97,20],[-88,16],[-83,10],[-78,8],[-86,12],[-93,16],[-105,20],[-112,28],[-118,34],[-124,42],[-125,50],[-135,58],[-150,60],[-165,62]] },   // Nordamerika
    { n: 'Südamerika', c: '#3f8040', p: [[-78,8],[-72,12],[-62,10],[-52,5],[-50,0],[-35,-6],[-39,-15],[-48,-26],[-58,-38],[-65,-42],[-68,-52],[-72,-54],[-75,-45],[-73,-30],[-70,-18],[-76,-12],[-81,-5],[-79,2]] },                                                                                    // Südamerika
    { n: 'Grönland', c: '#eef3f6', p: [[-73,78],[-55,83],[-25,83],[-20,72],[-40,62],[-50,64],[-60,70]] },                                                                                                                                                                                                    // Grönland
    { n: 'Eurasien', c: '#6c9650', p: [[-10,36],[-9,43],[-2,48],[-5,52],[5,53],[8,57],[12,55],[20,60],[25,65],[30,70],[45,68],[70,73],[100,77],[130,72],[160,70],[180,68],[180,62],[160,58],[142,53],[135,44],[125,38],[122,30],[110,20],[106,10],[100,2],[98,9],[92,20],[80,15],[77,8],[72,20],[66,25],[57,25],[50,30],[44,13],[35,28],[36,36],[28,36],[20,40],[15,38],[12,44],[3,43],[-5,36]] }, // Eurasien
    { n: 'Afrika', c: '#b8a05c', p: [[-17,21],[-10,30],[-5,36],[10,37],[20,33],[32,31],[35,28],[43,12],[51,12],[40,-5],[40,-15],[33,-26],[20,-35],[15,-28],[12,-15],[9,-1],[8,5],[-8,4],[-17,14]] },                                                                                        // Afrika
    { n: 'Australien', c: '#c98a52', p: [[114,-22],[122,-18],[131,-12],[137,-12],[142,-11],[146,-19],[153,-26],[150,-37],[140,-38],[130,-32],[115,-34]] },                                                                                                                                                      // Australien
    { n: 'Großbritannien', c: '#5f8f4a', p: [[-6,50],[2,51],[-2,58],[-6,56]] },                                                                                                                                                                                                                                     // Großbritannien
    { n: 'Japan', c: '#6c9650', p: [[130,31],[141,36],[142,44],[140,41],[132,34]] },                                                                                                                                                                                                                       // Japan
    { n: 'Indonesien', c: '#3f8040', p: [[95,5],[106,-6],[115,-8],[120,-2],[108,3]] }                                                                                                                                                                                                                          // Indonesien
  ];
  const TILT = 0.4;          // Neigung der Erdachse
  /** Punkt (Längengrad, Breitengrad) -> Position auf der Kugelscheibe. z>0 heißt: Vorderseite sichtbar. */
  function project(lon, lat, lon0, tilt) {
    const T = tilt === undefined ? TILT : tilt;
    const lo = (lon - lon0) * Math.PI / 180, la = lat * Math.PI / 180;
    const x = Math.cos(la) * Math.sin(lo), y0 = Math.sin(la), z0 = Math.cos(la) * Math.cos(lo);
    const y = y0 * Math.cos(T) - z0 * Math.sin(T), z = y0 * Math.sin(T) + z0 * Math.cos(T);
    return { x, y, z };
  }

  /* ---- Einschlagsorte: Jedes Objekt trifft eine andere, zufällige Region der Erde. ---- */
  /** Zufällige Ausrichtung der Erde: Längengrad, der am Ende oben liegt, und Achsenneigung. */
  // Der Neigungswinkel bestimmt, welche Breite oben liegt: ~+0,3 = hoher Norden, ~-1,5 = Äquator, ~-2,7 = Süden. Gleichverteilt = bunte Mischung.
  function randomSite() { return { lon: Math.random() * 360 - 180, tilt: -2.7 + Math.random() * 3.0 }; }
  /** Welcher Punkt der Erde liegt direkt unter dem Objekt (oberster Punkt der Scheibe)? Gibt Länge/Breite zurück. */
  function impactPoint(site) {
    const y = 0.96, z = Math.sqrt(1 - y * y);                    // knapp unter dem oberen Rand der Kugelscheibe
    const y0 = y * Math.cos(site.tilt) + z * Math.sin(site.tilt), z0 = -y * Math.sin(site.tilt) + z * Math.cos(site.tilt);
    let lon = site.lon + (z0 >= 0 ? 0 : 180); lon = ((lon + 540) % 360) - 180;
    return { lon, lat: Math.asin(Math.max(-1, Math.min(1, y0))) * 180 / Math.PI };
  }
  function inPoly(lon, lat, poly) {                              // Strahlverfahren: Punkt im Polygon?
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /** Name der Region unter dem Einschlag, z. B. "Afrika" oder "Pazifik". */
  function regionName(site) {
    const { lon, lat } = impactPoint(site);
    for (const k of CONTINENTS) if (inPoly(lon, lat, k.p)) return k.n === 'Eurasien' ? (lon < 60 && lat > 35 ? 'Europa' : 'Asien') : k.n;
    if (lat > 72) return 'Arktis';
    if (lat < -62) return 'Antarktis';
    return lon >= -80 && lon < 20 ? 'Atlantik' : lon >= 20 && lon < 145 ? 'Indischer Ozean' : 'Pazifik';
  }
  const cloudSeeds = Array.from({ length: 16 }, () => ({ lon: R() * 360 - 180, lat: R() * 140 - 70, w: 0.1 + R() * 0.16, sp: 0.8 + R() * 0.8 }));

  function drawEarth(e, alpha, lon0, tilt) {
    ctx.save(); ctx.globalAlpha = alpha;
    // Atmosphärenschein
    let g = ctx.createRadialGradient(e.x, e.y, e.r * 0.98, e.x, e.y, e.r * 1.12);
    g.addColorStop(0, 'rgba(120,180,255,.6)'); g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.12, 0, 6.2832); ctx.fill();
    // Ozean
    g = ctx.createRadialGradient(e.x - e.r * 0.35, e.y - e.r * 0.4, e.r * 0.1, e.x, e.y, e.r);
    g.addColorStop(0, '#3b86cf'); g.addColorStop(0.55, '#1c4f8a'); g.addColorStop(1, '#0b2442');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.fill();

    ctx.save(); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.clip();
    // Kontinente: jede Kante wird in kleine Schritte zerlegt, damit sie auf der Kugel schön rund wirken.
    // Punkte auf der Rückseite werden an den Rand geklemmt, so bleibt die Form am Horizont geschlossen.
    CONTINENTS.forEach((k) => {
      const pts = []; let front = 0;
      for (let i = 0; i < k.p.length; i++) {
        const a = k.p[i], b = k.p[(i + 1) % k.p.length];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 5));
        for (let s = 0; s < n; s++) {
          const q = project(a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n, lon0, tilt);
          if (q.z > 0) front++;
          if (q.z < 0) { const h = Math.hypot(q.x, q.y) || 1; q.x /= h; q.y /= h; }
          pts.push(q);
        }
      }
      if (!front) return;
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(e.x + q.x * e.r, e.y - q.y * e.r) : ctx.moveTo(e.x + q.x * e.r, e.y - q.y * e.r)));
      ctx.closePath(); ctx.fillStyle = k.c; ctx.fill();
      ctx.strokeStyle = 'rgba(15,35,20,.45)'; ctx.lineWidth = Math.max(1, e.r * 0.004); ctx.stroke();
    });
    // Polkappen (Nord und Süd): weiche, perspektivisch verkürzte Ellipse am jeweiligen Pol; nur sichtbar, wenn der Pol uns zugewandt ist
    [90, -90].forEach((plat) => {
      const pole = project(0, plat, 0, tilt);
      if (pole.z <= 0.02) return;
      ctx.save(); ctx.translate(e.x, e.y - pole.y * e.r); ctx.scale(1, pole.z);
      const cg = ctx.createRadialGradient(0, 0, e.r * 0.05, 0, 0, e.r * 0.3);
      cg.addColorStop(0, 'rgba(245,250,255,.95)'); cg.addColorStop(0.7, 'rgba(235,243,250,.85)'); cg.addColorStop(1, 'rgba(235,243,250,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, 6.2832); ctx.fill(); ctx.restore();
    });
    // Wolken, die langsamer/anders ziehen als die Erde
    cloudSeeds.forEach((c) => {
      const q = project(c.lon + clock * c.sp, c.lat, lon0 * 0.9, tilt);
      if (q.z <= 0.05) return;
      ctx.fillStyle = `rgba(255,255,255,${0.22 * Math.min(1, q.z * 2)})`;
      ctx.beginPath(); ctx.ellipse(e.x + q.x * e.r, e.y - q.y * e.r, e.r * c.w * (0.4 + q.z * 0.6), e.r * c.w * 0.3 * (0.4 + q.z * 0.6), -q.x * 0.5, 0, 6.2832); ctx.fill();
    });
    // Kugelschattierung: Licht von links oben, Rand dunkler (Limb-Darkening)
    g = ctx.createRadialGradient(e.x - e.r * 0.3, e.y - e.r * 0.35, e.r * 0.2, e.x, e.y, e.r * 1.02);
    g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(0.65, 'rgba(0,0,10,0)'); g.addColorStop(1, 'rgba(0,0,12,.6)');
    ctx.fillStyle = g; ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    g = ctx.createLinearGradient(e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r);
    g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,12,.55)');
    ctx.fillStyle = g; ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(160,205,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  /* ---- Hintergrund: Milchstraße und Sterne in drei Tiefenebenen (Parallaxe) und die Sonne ---- */
  const bgLayers = { far: null, mid: null };        // vorgerenderte Ebenen (werden bei Größenänderung neu gebaut)
  const PAD = 260;                                  // Überhöhe der Ebenen, damit sie beim Verschieben nie enden
  function layerCanvas() {
    const c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round((H + PAD) * DPR);
    const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); return [c, g];
  }
  const NEAR = Array.from({ length: 34 }, () => ({ x: R(), y: R(), r: R() * 1.1 + 0.9, ph: R() * 6.28, spike: R() < 0.25, tint: R() < 0.5 ? '210,225,255' : '255,232,200' }));
  function buildBackground() {
    bgDirty = false;
    const rr = rng(2026), TW = H + PAD;
    // --- ferne Ebene: Milchstraßenband aus Nebel und sehr vielen winzigen Sternen
    let [c, g] = layerCanvas(); bgLayers.far = c;
    g.save(); g.translate(W * 0.55, TW * 0.45); g.rotate(-0.55);
    const band = g.createLinearGradient(0, -H * 0.3, 0, H * 0.3);
    band.addColorStop(0, 'rgba(110,120,190,0)'); band.addColorStop(0.5, 'rgba(120,130,200,.16)'); band.addColorStop(1, 'rgba(110,120,190,0)');
    g.fillStyle = band; g.fillRect(-W * 1.2, -H * 0.3, W * 2.4, H * 0.6);
    for (let i = 0; i < 14; i++) {                  // weiche Nebelwolken im Band (rötlich und bläulich)
      const x = (rr() - 0.5) * W * 1.6, y = (rr() - 0.5) * H * 0.3, s = H * (0.12 + rr() * 0.2);
      const ng = g.createRadialGradient(x, y, 0, x, y, s);
      ng.addColorStop(0, rr() < 0.5 ? 'rgba(170,110,170,.07)' : 'rgba(100,140,210,.07)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    g.restore();
    for (let i = 0; i < 900; i++) {                 // Sterne, zu 60 % im Band zusammengedrängt
      let x = rr() * W, y = rr() * TW;
      if (rr() < 0.6) { const u = (rr() - 0.5) * W * 1.6, v = (rr() + rr() + rr() - 1.5) * H * 0.16; x = W * 0.55 + u * Math.cos(-0.55) - v * Math.sin(-0.55); y = TW * 0.45 + u * Math.sin(-0.55) + v * Math.cos(-0.55); }
      g.fillStyle = `rgba(225,232,255,${0.15 + rr() * 0.45})`; g.fillRect(x, y, 0.5 + rr() * 0.7, 0.5 + rr() * 0.7);
    }
    // --- mittlere Ebene: hellere, leicht farbige Sterne
    [c, g] = layerCanvas(); bgLayers.mid = c;
    for (let i = 0; i < 170; i++) {
      const x = rr() * W, y = rr() * TW, s = 0.6 + rr() * 0.9, warm = rr();
      g.fillStyle = warm < 0.2 ? `rgba(255,210,170,${0.5 + rr() * 0.4})` : warm < 0.4 ? `rgba(180,205,255,${0.5 + rr() * 0.4})` : `rgba(235,240,255,${0.45 + rr() * 0.45})`;
      g.beginPath(); g.arc(x, y, s, 0, 6.2832); g.fill();
    }
  }
  function drawSun(par) {
    // Die Sonne steht weit links; sie ist klein, aber hell, mit Korona, langsam drehenden Strahlen und schwachen Linsenreflexen.
    const sx = W * 0.1, sy = H * 0.42 - par * 12, pulse = 1 + 0.03 * Math.sin(clock * 1.3), R0 = H * 0.034 * pulse;
    let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.62);
    g.addColorStop(0, 'rgba(255,214,150,.30)'); g.addColorStop(0.35, 'rgba(255,170,100,.09)'); g.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - H * 0.62, sy - H * 0.62, H * 1.24, H * 1.24);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(clock * 0.03);
    for (let i = 0; i < 14; i++) {                   // lange, dünne Strahlen
      ctx.rotate(6.2832 / 14); const L = H * (0.18 + 0.1 * ((i * 7) % 5) / 5);
      const rg = ctx.createLinearGradient(0, 0, L, 0); rg.addColorStop(0, 'rgba(255,230,180,.16)'); rg.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(R0, -R0 * 0.18); ctx.lineTo(L, 0); ctx.lineTo(R0, R0 * 0.18); ctx.fill();
    }
    ctx.restore();
    g = ctx.createRadialGradient(sx, sy, R0 * 0.8, sx, sy, R0 * 3.2);
    g.addColorStop(0, 'rgba(255,240,200,.85)'); g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R0 * 3.2, 0, 6.2832); ctx.fill();
    g = ctx.createRadialGradient(sx - R0 * 0.2, sy - R0 * 0.2, 0, sx, sy, R0);
    g.addColorStop(0, '#fffdf0'); g.addColorStop(0.6, '#fff0b8'); g.addColorStop(1, '#ffd070');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R0, 0, 6.2832); ctx.fill();
    // Linsenreflexe: blasse Ringe auf der Linie von der Sonne zur Bildmitte
    [[0.25, 0.05, '255,200,140'], [0.5, 0.08, '160,200,255'], [0.78, 0.04, '255,170,200']].forEach(([k, s, col]) => {
      const fx = sx + (W * 0.5 - sx) * k * 1.6, fy = sy + (H * 0.45 - sy) * k * 1.6;
      ctx.strokeStyle = `rgba(${col},.06)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx, fy, H * s, 0, 6.2832); ctx.stroke();
    });
  }
  /** Zeichnet den gesamten Hintergrund. p = Anflugfortschritt (0..1): Ebenen rutschen unterschiedlich schnell nach oben -> Tiefe. */
  function drawBackground(p) {
    if (bgDirty || !bgLayers.far) buildBackground();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#02030a'); grad.addColorStop(1, '#070b18');
    ctx.fillStyle = grad; ctx.fillRect(-100, -100, W + 200, H + 200);
    ctx.drawImage(bgLayers.far, 0, -p * 40 - 0, W, H + PAD);
    drawSun(p);
    ctx.drawImage(bgLayers.mid, 0, -p * 110, W, H + PAD);
    // nahe Sterne: hell, funkelnd, manche mit Kreuz-Strahlen; bewegen sich am stärksten
    NEAR.forEach((s) => {
      const y = ((s.y * H - p * 230) % H + H) % H, x = s.x * W, tw = 0.65 + 0.35 * Math.sin(clock * 1.4 + s.ph);
      const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 5);
      g.addColorStop(0, `rgba(${s.tint},${0.9 * tw})`); g.addColorStop(1, `rgba(${s.tint},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s.r * 5, 0, 6.2832); ctx.fill();
      if (s.spike) { ctx.strokeStyle = `rgba(${s.tint},${0.5 * tw})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - s.r * 7, y); ctx.lineTo(x + s.r * 7, y); ctx.moveTo(x, y - s.r * 7); ctx.lineTo(x, y + s.r * 7); ctx.stroke(); }
    });
  }

  /** Feuerschweif hinter dem Objekt (entgegen der Flugrichtung) und Glühen auf der Vorderseite. */
  function drawTrail(r, ang, heat) {
    ctx.save(); ctx.rotate(ang + Math.PI);
    const len = r * (2.4 + heat * 3.2);
    const tail = ctx.createLinearGradient(0, 0, len, 0);
    tail.addColorStop(0, `rgba(255,${160 - heat * 60 | 0},60,${0.1 + 0.4 * heat})`); tail.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = tail; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(len, 0); ctx.lineTo(0, r * 0.8); ctx.fill();
    ctx.restore();
  }

  /** Gesteinsbrocken (ernste Objekte). 'spin' = Drehwinkel. */
  function drawRock(r, seed, spin, ang, heat) {
    const sh = shapeFor(seed);
    ctx.save(); ctx.rotate(spin);
    ctx.beginPath(); sh.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * r, p[1] * r) : ctx.moveTo(p[0] * r, p[1] * r))); ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, '#8d8579'); g.addColorStop(0.55, '#4b463f'); g.addColorStop(1, '#16130f');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    sh.craters.forEach((c) => {
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(c.x * r, c.y * r, c.r * r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,220,.16)'; ctx.lineWidth = Math.max(1, r * 0.015); ctx.beginPath(); ctx.arc(c.x * r - r * 0.012, c.y * r - r * 0.012, c.r * r, 3.4, 5.6); ctx.stroke();
    });
    if (heat > 0) {                                 // Hitze auf der der Erde zugewandten Seite
      ctx.rotate(-spin); ctx.rotate(ang);
      const hg = ctx.createRadialGradient(r * 0.9, 0, r * 0.1, r * 0.9, 0, r * 1.2);
      hg.addColorStop(0, `rgba(255,170,70,${0.7 * heat})`); hg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = hg; ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    }
    ctx.restore(); ctx.restore();
  }

  /** Alltagsobjekt als Emoji. Es taumelt (dreht sich) und wippt leicht, das sieht charmant aus. */
  function drawEmoji(emoji, r, spin, heat) {
    ctx.save();
    if (heat > 0) {                                 // glühende Hülle bei Annäherung an die Erde
      const hg = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5);
      hg.addColorStop(0, `rgba(255,190,90,${0.55 * heat})`); hg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 6.2832); ctx.fill();
    }
    ctx.rotate(spin);
    ctx.font = `${Math.round(r * 2)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, r * 0.06);
    ctx.restore();
  }

  /* ---- Das Fahrrad wird selbst gezeichnet (statt Emoji): gut sichtbar und mit echter Klingel.
     Koordinaten in Einheiten des Objektradius r; x nach rechts, y nach unten. ---- */
  // Angriffspunkte für die Bots. 'bell' markiert die Klingel: nur dort klingelt es.
  const BIKE_PARTS = [
    { x: 0.40, y: -0.40, bell: true },    // Klingel am Lenker
    { x: -0.62, y: 0.35 },                // Hinterrad
    { x: 0.62, y: 0.35 },                 // Vorderrad
    { x: 0.05, y: 0.08 },                 // Rahmen
    { x: -0.22, y: -0.24 },               // Sattel
    { x: 0.52, y: -0.30 }                 // Lenker
  ];
  let bellPulse = 0;                      // 1 direkt nach einem Klingeln, klingt ab (für die kleinen Schallbögen)
  function drawBike(r) {
    const S_ = r;                         // Maßstab
    const line = (x1, y1, x2, y2, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w * S_; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1 * S_, y1 * S_); ctx.lineTo(x2 * S_, y2 * S_); ctx.stroke(); };
    const wheel = (cx, cy) => {
      const wr = 0.38 * S_, sp = clock * 11;
      ctx.strokeStyle = '#eef1f5'; ctx.lineWidth = wr * 0.16; ctx.beginPath(); ctx.arc(cx * S_, cy * S_, wr, 0, 6.2832); ctx.stroke();   // heller Reifen
      ctx.strokeStyle = 'rgba(190,200,214,.9)'; ctx.lineWidth = Math.max(1, wr * 0.025);
      for (let k = 0; k < 8; k++) { const a = sp + k * 0.7854; ctx.beginPath(); ctx.moveTo(cx * S_, cy * S_); ctx.lineTo(cx * S_ + Math.cos(a) * wr, cy * S_ + Math.sin(a) * wr); ctx.stroke(); }  // drehende Speichen
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = wr * 0.06;                                                                   // Drehunschärfe: Bögen auf dem Reifen
      for (let k = 0; k < 3; k++) { const a = -sp * 1.3 + k * 2.09; ctx.beginPath(); ctx.arc(cx * S_, cy * S_, wr * 1.1, a, a + 0.7); ctx.stroke(); }
      ctx.fillStyle = '#c8d0db'; ctx.beginPath(); ctx.arc(cx * S_, cy * S_, wr * 0.1, 0, 6.2832); ctx.fill();
    };
    wheel(-0.62, 0.35); wheel(0.62, 0.35);
    const FR = '#ff5a36';                 // leuchtendes Rot-Orange für den Rahmen
    line(-0.62, 0.35, -0.22, -0.18, 0.07, FR); line(-0.22, -0.18, -0.08, 0.38, 0.07, FR);        // Hinterbau, Sitzrohr
    line(-0.62, 0.35, -0.08, 0.38, 0.06, FR); line(-0.22, -0.18, 0.38, -0.12, 0.07, FR);         // Kettenstrebe, Oberrohr
    line(-0.08, 0.38, 0.38, -0.12, 0.08, FR); line(0.38, -0.12, 0.62, 0.35, 0.06, '#ffb02e');    // Unterrohr, Gabel
    line(0.38, -0.12, 0.38, -0.34, 0.06, '#ffb02e'); line(0.30, -0.34, 0.54, -0.30, 0.06, '#ffb02e');   // Lenkerstange, Lenker
    line(-0.34, -0.22, -0.12, -0.22, 0.09, '#ffd23f');                                            // Sattel (gelb)
    line(-0.08, 0.38, -0.02, 0.52, 0.04, '#cfd6e0'); line(-0.08, 0.38, -0.14, 0.24, 0.04, '#cfd6e0');   // Pedale
    // Klingel: goldene Halbkugel mit Glanz; wackelt und sendet Schallbögen, wenn gerade geklingelt wird
    const bx = 0.40 * S_, by = -0.40 * S_, br = 0.085 * S_, wob = Math.sin(clock * 60) * 0.12 * bellPulse;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(wob);
    ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(0, 0, br, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b58a10'; ctx.fillRect(-br, 0, br * 2, br * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-br * 0.35, -br * 0.45, br * 0.22, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (bellPulse > 0.02) {               // Schallbögen ("ding") links und rechts der Klingel
      ctx.strokeStyle = `rgba(255,236,150,${bellPulse})`; ctx.lineWidth = Math.max(1.5, S_ * 0.018);
      for (let k = 1; k <= 3; k++) { const rr = br * (1.4 + k * 0.7 + (1 - bellPulse) * 1.4);
        ctx.beginPath(); ctx.arc(bx, by, rr, -2.3, -0.85); ctx.stroke(); }
    }
  }

  /** Sichel-förmiger "Wischer": in der Mitte dick, an beiden Enden spitz. Sitzt auf einem Kreis mit Radius rad
      um das Objekt, Mitte bei Winkel a, Öffnungswinkel span, Dicke thick (alles in Pixeln/Bogenmaß). */
  function crescent(rad, a, span, thick, alpha) {
    const pt = (ang, rr) => ({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
    const p0 = pt(a - span / 2, rad), p1 = pt(a + span / 2, rad), cm = pt(a, rad * Math.cos(span / 2));  // cm = Mitte der Sehne
    // Quadratische Kurve: Kontrollpunkt so wählen, dass ihre Mitte genau auf dem gewünschten Radius liegt
    const ctrl = (rr) => { const m = pt(a, rr); return { x: 2 * m.x - cm.x, y: 2 * m.y - cm.y }; };
    const co = ctrl(rad + thick / 2), ci = ctrl(rad - thick / 2);
    const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(co.x, co.y, p1.x, p1.y); ctx.quadraticCurveTo(ci.x, ci.y, p0.x, p0.y); ctx.fill();
  }
  /** Strömungslinie: dünnes, spitz zulaufendes Dreieck. Dick am Objekt, läuft nach oben (gegen die Flugrichtung) aus. */
  function streak(x, y, len, w, alpha) {
    const g = ctx.createLinearGradient(0, y, 0, y - len);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x, y - len); ctx.closePath(); ctx.fill();
  }
  /** Geschwindigkeitszeichen (wie im Comic, ganz ohne Schrift):
      - Strömungslinien seitlich und oberhalb des fallenden Objekts, deren Länge pulsiert
      - Sicheln, die an der Unterseite entstehen und an den Seiten entlang nach oben gleiten (Luft teilt sich) */
  function drawSpeedMarks(r, intensity) {
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, x = side * r * (0.8 + ((i * 0.37) % 0.7));
      const y = -r * (0.15 + ((i * 0.53) % 0.9)), pulse = 0.5 + 0.5 * Math.sin(clock * 5 + i * 1.7);
      streak(x, y, r * (0.7 + 0.9 * pulse), Math.max(2, r * 0.035), 0.55 * intensity);
    }
    // Vier kurze, kräftige Sicheln: Jede entsteht unten seitlich vom Objekt, gleitet an der Seite nach oben und blendet aus.
    for (let i = 0; i < 4; i++) {
      const ph = ((clock / 0.9) + i / 4) % 1, side = i % 2 ? 1 : -1;
      const ang = Math.PI / 2 - side * (0.5 + ph * 1.5);                              // von schräg unten (+60°) bis zur Seite oben (-30°)
      crescent(r * (1.18 + 0.1 * ph), ang, 0.55, r * 0.12, 0.85 * Math.sin(ph * Math.PI) * intensity);
    }
    ctx.restore();
  }

  /** Bots als kleine Sprites, je nach Typ anders: sie schweben dicht um das Objekt und schneiden mit Strahlen hinein. */
  const BOT_COLORS = ['#ffcf7a', '#ffa15a', '#ff5a5a', '#58b7ff', '#c283ff', '#6df5e1'];
  function drawBot(i, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#d5dde8'; ctx.strokeStyle = '#2a3342'; ctx.lineWidth = 1;
    if (i === 0) {                                              // Drohne: Körper + vier Rotoren
      ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#9fb0c8'; for (let k = 0; k < 4; k++) { const aa = k * 1.5708 + clock * 14; ctx.beginPath(); ctx.moveTo(Math.cos(aa) * s * 0.5, Math.sin(aa) * s * 0.5); ctx.lineTo(Math.cos(aa) * s, Math.sin(aa) * s); ctx.stroke(); }
    } else if (i === 1) {                                       // Schürfroboter: Kasten mit Rädern
      ctx.fillRect(-s * 0.8, -s * 0.45, s * 1.6, s * 0.9); ctx.strokeRect(-s * 0.8, -s * 0.45, s * 1.6, s * 0.9);
      ctx.fillStyle = '#39445a'; ctx.beginPath(); ctx.arc(-s * 0.5, s * 0.45, s * 0.28, 0, 6.2832); ctx.arc(s * 0.5, s * 0.45, s * 0.28, 0, 6.2832); ctx.fill();
    } else if (i === 2) {                                       // Laserplattform: Dreieck mit rotem Auge
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.7); ctx.lineTo(-s * 0.9, s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff4a4a'; ctx.beginPath(); ctx.arc(0, s * 0.15, s * 0.22, 0, 6.2832); ctx.fill();
    } else if (i === 3) {                                       // Fusionsbohrer: Sechseck, blau leuchtend
      ctx.beginPath(); for (let k = 0; k < 6; k++) ctx.lineTo(Math.cos(k * 1.0472) * s, Math.sin(k * 1.0472) * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#58b7ff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 6.2832); ctx.fill();
    } else if (i === 4) {                                       // Plasma-Flotte: Raute
      ctx.beginPath(); ctx.moveTo(0, -s * 1.1); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s * 1.1); ctx.lineTo(-s * 0.8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c283ff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 6.2832); ctx.fill();
    } else {                                                    // Antimaterie: Ring
      ctx.strokeStyle = '#6df5e1'; ctx.lineWidth = s * 0.3; ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#e8fffb'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  /** Zeichnet alle Bots (max. 18 Sprites, gewichtet nach Besitz) um das Objekt. Koordinaten relativ zur Objektmitte. */
  const mineState = { bell: false };       // wird beim Zeichnen gesetzt: arbeitet gerade ein Bot an der Klingel?
  function drawBots(r, dt, targets) {
    mineState.bell = false;
    const list = [];
    S.bots.forEach((c, i) => { const n = c > 0 ? Math.min(6, Math.max(1, Math.round(Math.sqrt(c)))) : 0; for (let k = 0; k < n; k++) list.push(i); });
    const sprites = list.slice(-18), n = sprites.length;
    const s = Math.max(5, Math.min(13, r * 0.07));
    sprites.forEach((tier, idx) => {
      let a = clock * (0.25 + (idx % 3) * 0.07) * (idx % 2 ? 1 : -1) + idx * 6.2832 / n;
      let tx = Math.cos(a) * r * 0.78, ty = Math.sin(a) * r * 0.78;        // Auftreffpunkt auf dem Objekt (Standard: Rand)
      if (targets) {
        // Gezielter Abbau an einzelnen Teilen: jeder Bot wechselt alle paar Sekunden zum nächsten Teil
        const part = targets[Math.floor(clock * 0.45 + idx * 1.37) % targets.length];
        tx = part.x; ty = part.y; if (part.bell) mineState.bell = true;
        a = Math.atan2(ty, tx) + 0.3 * Math.sin(clock + idx);              // Bot schwebt auf der Seite seines Ziels
      }
      const d = r * (1.12 + 0.05 * Math.sin(clock * 2 + idx));
      const bx = Math.cos(a) * d, by = Math.sin(a) * d;
      const col = BOT_COLORS[tier], w = 1 + tier * 0.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = col; ctx.globalAlpha *= 0.35; ctx.lineWidth = w * 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();   // Schein
      ctx.globalAlpha /= 0.35; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();                          // Strahl
      drawBot(tier, bx, by, s, a + 1.5708);
      if (Math.random() < (4 + tier) * dt) spawn(lastPos.x + tx, lastPos.y + ty, 2, 90, [col, '#ffffff', '#ffd08a'], 0.5, 2);
    });
  }

  /* ---- Erdexplosion: bewusst maßlos übertrieben ---- */
  function startBoom(res) {
    const e = earth(), P = { x: e.x, y: e.y - e.r };           // Einschlagpunkt: Oberseite der Erde
    const chunks = [];
    for (let i = 0; i < 110; i++) {
      // Bruchstück aus einem zufälligen Punkt der Erdkugel; innen glüht es wie Magma
      const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * e.r;
      const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d, k = d / e.r;
      const color = k > 0.82 ? (Math.random() < 0.5 ? '#2f6aa8' : '#5d7a48') : k > 0.5 ? '#8a5a38' : k > 0.25 ? '#e0571c' : '#ffd24a';
      const dir = Math.atan2(y - P.y, x - P.x) * 0.5 + Math.atan2(y - e.y, x - e.x) * 0.5;   // weg vom Einschlag und vom Zentrum
      const sp = (200 + Math.random() * 900) * (e.r / 200);
      const size = e.r * (0.05 + Math.random() * 0.13), n = 5 + (Math.random() * 3 | 0);
      chunks.push({ x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp - 150, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
                    color, poly: Array.from({ length: n }, (_, j) => { const aa = j / n * 6.2832, rr = size * (0.6 + Math.random() * 0.6); return [Math.cos(aa) * rr, Math.sin(aa) * rr]; }) });
    }
    boom = { t: 0, e, P, chunks, bursts: [], nextBurst: 0, quip: pick(BOOM_QUIPS), what: label(res), where: regionName(lastSite) };
    spawn(P.x, P.y, 700, 1100, ['#fff3c4', '#ffb02e', '#ff6a1a', '#7a2a10', '#d9d2c4'], 3.4, 4);
    [[0, 1.4, '255,230,170'], [0.12, 1.8, '255,140,60'], [0.3, 2.3, '255,255,255'], [0.55, 2.8, '255,90,40']].forEach(([delay, s, col], i) =>
      setTimeout(() => rings.push({ x: P.x, y: P.y, r: Math.max(W, H) * s * 0.55, life: 1.8 + i * 0.3, col, sq: 0.8 }), delay * 1000));
    flash = 1.5; shake = 80;
  }

  function drawBoom(dt) {
    const b = boom; b.t += dt; const e = b.e;
    // Feuerball
    if (b.t < 2.6) {
      const k = b.t / 2.6, rad = e.r * (0.5 + 2.2 * (1 - Math.exp(-b.t * 2.2)));
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rad);
      g.addColorStop(0, `rgba(255,255,235,${1 - k})`); g.addColorStop(0.3, `rgba(255,214,90,${0.9 * (1 - k)})`);
      g.addColorStop(0.65, `rgba(255,110,30,${0.7 * (1 - k)})`); g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, 6.2832); ctx.fill();
    }
    // Erdbrocken fliegen davon
    b.chunks.forEach((c) => {
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-0.45 * dt); c.vy *= Math.exp(-0.45 * dt); c.rot += c.vr * dt;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, (4.6 - b.t) / 1.4)); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.beginPath(); c.poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = c.color; ctx.fill(); ctx.strokeStyle = 'rgba(255,230,180,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    });
    // 💥-Emojis ploppen überall auf
    if (b.t < 1.8 && b.t >= b.nextBurst) {
      b.nextBurst = b.t + 0.07;
      b.bursts.push({ x: e.x + (Math.random() - 0.5) * W * 0.9, y: e.y - Math.random() * H * 0.75, s: 50 + Math.random() * 130, t0: b.t, rot: (Math.random() - 0.5) * 0.8 });
    }
    b.bursts.forEach((q) => {
      const k = (b.t - q.t0) / 0.8; if (k > 1) return;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.font = `${Math.round(q.s * (0.5 + k))}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💥', 0, 0); ctx.restore();
    });
    // Riesiges "BUMM!" und der Spruch dazu
    if (b.t < 4.4) {
      const a = Math.max(0, Math.min(1, (4.4 - b.t) / 0.8)), pop = 1 + Math.max(0, 0.6 - b.t) * 2.5;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.34); ctx.rotate(-0.06 + Math.sin(b.t * 30) * 0.01 * Math.max(0, 1 - b.t)); ctx.scale(pop, pop);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(Math.min(H * 0.2, W * 0.2))}px Impact, "Arial Black", sans-serif`;
      ctx.lineWidth = 12; ctx.strokeStyle = '#2a0d02'; ctx.lineJoin = 'round'; ctx.strokeText('BUMM!', 0, 0);
      ctx.fillStyle = '#ffb02e'; ctx.fillText('BUMM!', 0, 0);
      ctx.font = `600 ${Math.round(Math.max(15, H * 0.032))}px -apple-system, "Segoe UI", sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      const l1 = `${b.what} trifft ${b.where}.`;
      ctx.strokeText(l1, 0, H * 0.13); ctx.fillStyle = '#fff'; ctx.fillText(l1, 0, H * 0.13);
      ctx.strokeText(b.quip, 0, H * 0.18); ctx.fillStyle = '#ffd9a0'; ctx.fillText(b.quip, 0, H * 0.18);
      ctx.restore();
    }
    if (b.t > 4.6) { boom = null; earthT = 0; Sfx.play('reborn'); updateHud(); }
  }

  /** Zeichnet das ganze Bild. dt = echte Sekunden seit dem letzten Bild.
      Kamera: Das Objekt bleibt groß in der Bildmitte, die Erde wächst von unten heran, bis sie es trifft. */
  function render(dt) {
    clock += dt; bellPulse = Math.max(0, bellPulse - dt * 2.5); spawnT = Math.min(1, spawnT + dt / 0.6); earthT = Math.min(1, earthT + dt / 1.8);
    ctx.save();
    if (shake > 0.1) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.pow(0.05, dt); }
    drawBackground(S.phase === 'fight' && !boom ? 1 - Math.max(0, S.meteor.timeLeft) / S.meteor.time : 0);

    const m = S.meteor, fight = S.phase === 'fight';
    if (!boom) {
      const p = fight ? 1 - Math.max(0, m.timeLeft) / m.time : 0;            // 0 = fern, 1 = Einschlag
      const base = baseRadius(), ox = W * 0.5, oy = H * 0.4;
      const mass = fight ? Math.max(0, m.remaining) / m.mass : 1;
      const r = base * (0.9 + 0.1 * p) * (0.15 + 0.85 * Math.sqrt(mass));      // schrumpft sichtbar beim Abbau
      // Erde: Oberkante steigt von unten bis kurz unter das Objekt, der Radius wächst dabei stark
      const pe = Math.pow(p, 1.4), top = H * 0.9 + (oy + base * 0.62 - H * 0.9) * pe, re = H * 0.12 + (H * 1.6 - H * 0.12) * Math.pow(p, 2.2);
      const ease = 1 - Math.pow(1 - earthT, 3);
      // Jedes Objekt hat seine eigene Einschlagsregion: die Erde dreht sich gleichmäßig so, dass sie am Ende oben liegt
      if (!m.site) m.site = randomSite();
      lastSite = m.site;
      drawEarth({ x: W * 0.5, y: top + re, r: re }, ease, m.site.lon + (1 - p) * 90 + (fight ? 0 : clock * 3), m.site.tilt);
      const x = ox, y = oy + (fight ? 0 : Math.sin(clock * 0.8) * 5);
      lastPos = { x, y, r };
      const heat = fight ? Math.max(0, (p - 0.55) / 0.45) : 0;
      if (r > 1.5) {
        ctx.save(); ctx.translate(x, y); ctx.globalAlpha = fight ? spawnT : 0.6;
        // Taumeln: jedes Objekt dreht sich mit eigener Geschwindigkeit/Richtung und wippt leicht
        const spin = clock * (0.9 + (m.n % 4) * 0.35) * (m.n % 2 ? 1 : -1) + m.n;
        drawTrail(r, Math.PI / 2, heat);                                      // Feuerschweif nach oben (es fällt nach unten)
        let targets = null;
        if (m.funny) drawSpeedMarks(r, 0.6 + heat * 0.8);                     // Bewegungszeichen bei allen Alltagsobjekten
        if (m.name === 'Fahrrad') {
          // Eigene Zeichnung: dreht sich langsamer, damit man die Klingel sieht; Zielpunkte mitdrehen
          const sp = clock * 0.7, c = Math.cos(sp), s_ = Math.sin(sp);
          ctx.save(); ctx.rotate(sp);
          if (heat > 0) { const hg = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.5); hg.addColorStop(0, `rgba(255,190,90,${0.5 * heat})`); hg.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 6.2832); ctx.fill(); }
          drawBike(r); ctx.restore();
          targets = BIKE_PARTS.map((q) => ({ x: (q.x * c - q.y * s_) * r, y: (q.x * s_ + q.y * c) * r, bell: q.bell }));
        } else if (m.funny) drawEmoji(m.emoji, r, spin, heat);
        else drawRock(r, m.n * 31 + 5, spin * 0.3, Math.PI / 2, heat);
        if (fight) drawBots(r, dt, targets);
        ctx.restore();
        if (fight) {
          // Aus dem Objekt lösen sich Trümmer: je höher der Abbau (relativ zur Masse), desto mehr
          const frac = C.currentRate(S) / m.mass, perSec = Math.min(60, 4 + 600 * frac);
          if (Math.random() < perSec * dt) {
            const a = Math.random() * 6.2832;
            parts.push({ x: x + Math.cos(a) * r * 0.9, y: y + Math.sin(a) * r * 0.9, vx: Math.cos(a) * (30 + Math.random() * 90), vy: Math.sin(a) * (30 + Math.random() * 90) + 20,
                         life: 1.8, max: 1.8, c: m.funny ? pick(['#ffd08a', '#c7b79a', '#e8e0d0', '#9aa7b8']) : '#7d756a', s: 2 + Math.random() * Math.max(2, r * 0.045) });
          }
        }
      }
    } else drawBoom(dt);

    // Partikel
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; q.vy *= 0.985;
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.s, q.s);
    }
    ctx.globalAlpha = 1;
    // Druckwellen
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i]; g.t = (g.t || 0) + dt; if (g.t > g.life) { rings.splice(i, 1); continue; }
      const k = g.t / g.life;
      ctx.strokeStyle = `rgba(${g.col},${1 - k})`; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r * k, g.r * k * g.sq, 0, 0, 6.2832); ctx.stroke();
    }
    // Blitz
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,244,222,${Math.min(1, flash)})`; ctx.fillRect(-100, -100, W + 200, H + 200); flash *= Math.pow(0.02, dt); }
    ctx.restore();
  }

  /** Effekte, wenn ein Objekt zerstört wurde (der Lauf geht gleich mit dem nächsten weiter). */
  function playKill() {
    const { x, y, r } = lastPos;
    spawn(x, y, 140, 320, ['#ffd9a0', '#ff9a4a', '#8d8579', '#cfc6b8', '#ffffff'], 1.4, 2.6);
    rings.push({ x, y, r: r * 4, life: 0.8, col: '255,220,170', sq: 1 });
    flash = Math.max(flash, 0.18); spawnT = 0;
  }

  /* ------------------------------------------- 5. Hauptschleife & Eingaben */
  function doStart() {
    if (C.startMeteor(S)) { spawnT = 0; Sfx.play('start'); Sfx.humStart(); updateHud(); updateShops(); save(); }
  }
  function endFight(res) {
    if (res.destroyed) {
      playKill(); addFeed(res); Sfx.play('kill'); if (res.n === 1) { Sfx.play('bellKill'); bellPulse = 1; }   // Fahrrad: Klingel-Triller
    } else {
      startBoom(res); Sfx.humStop(); Sfx.play('boom');
      showReport(); updateShops(); save();
    }
    if (C.prestigeUnlocked(S) && S.meteorsSeen === C.CFG.prestigeUnlockAfter) toast('Prestige freigeschaltet');
    updateHud();
  }

  $('btnStart').addEventListener('click', doStart);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && S.phase === 'shop' && !boom) { e.preventDefault(); doStart(); }
  });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('btnSound').addEventListener('click', () => { Sfx.setMuted(!Sfx.isMuted()); setText($('btnSound'), Sfx.isMuted() ? 'Ton aus' : 'Ton an'); if (!Sfx.isMuted()) Sfx.play('buy'); });
  setText($('btnSound'), Sfx.isMuted() ? 'Ton aus' : 'Ton an');
  $('btnReset').addEventListener('click', (e) => {
    confirmClick(e.currentTarget, () => {
      S = C.newState(); save(); showReport(); updateShops(); updateHud(); toast('Spielstand gelöscht');
    }, 'Wirklich löschen?');
  });

  let last = performance.now(), uiTimer = 0, lastWarn = -1, zapAcc = 0, mineAcc = 0;
  function frame(now) {
    const real = Math.min(0.25, (now - last) / 1000); last = now;
    // Spiellogik in kleinen Schritten (max. 0,1 s), damit hohe Geschwindigkeit nichts überspringt
    let left = real * speed;
    while (left > 0 && S.phase === 'fight') {
      const step = Math.min(0.1, left); left -= step;
      const res = C.tick(S, step);
      if (res) { endFight(res); if (S.phase !== 'fight') break; }
    }
    if (S.phase === 'fight') {
      // Warnpiepen in den letzten 5 Sekunden und Laserzischen passend zur Botzahl
      const sec = Math.ceil(S.meteor.timeLeft);
      if (sec <= 5 && sec !== lastWarn && S.meteor.remaining > 0) { lastWarn = sec; Sfx.play('warn'); }
      if (sec > 5) lastWarn = -1;
      zapAcc += real * Math.min(4, Math.sqrt(S.bots.reduce((a, b) => a + b, 0)) * 0.5);
      if (zapAcc >= 1) { zapAcc = 0; Sfx.play('zap'); }
      // Abbaugeräusch je Objekt. Beim Fahrrad klingelt es NUR, wenn gerade ein Bot an der Klingel arbeitet;
      // an den anderen Fahrradteilen gibt es nur ein metallisches "Tink".
      const bots = S.bots.reduce((a, b) => a + b, 0);
      if (bots > 0) {
        mineAcc += real;
        const mm = S.meteor, key = mm.funny ? mm.name : 'Gestein';
        if (key === 'Fahrrad') {
          if (mineState.bell) { if (mineAcc > 0.55) { mineAcc = 0; Sfx.play('bell'); bellPulse = 1; } }
          else if (mineAcc > 0.5 + Math.random() * 0.3) { mineAcc = 0; Sfx.mine('Fahrrad:tink'); }
        } else if (mineAcc > Sfx.mineEvery(key) * (0.7 + Math.random() * 0.6) / (1 + 0.12 * Math.sqrt(bots))) { mineAcc = 0; Sfx.mine(key); }
      }
    }
    render(real);
    uiTimer += real;
    if (uiTimer > 0.2) { uiTimer = 0; updateHud(); updateShops(); }
    else if (S.phase === 'fight') updateHud();
    requestAnimationFrame(frame);
  }

  showReport(); updateShops(); updateHud();
  requestAnimationFrame(frame);

  // Zum Testen im Browser/Konsole erreichbar
  window.__game = { get state() { return S; }, Core: C, get boom() { return boom; }, get mineState() { return mineState; }, regionName, randomSite };
})();
