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

  // Kaufen: ein Listener für alle Knöpfe (Event-Delegation). Shift+Klick = bis zu 10 Käufe.
  $('lists').addEventListener('click', (e) => {
    const b = e.target.closest('button.buy'); if (!b) return;
    const { kind, id } = b.dataset, times = e.shiftKey ? 10 : 1;
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
      setText(q.buy, C.fmtMass(cost));
      q.buy.disabled = !shopOpen || S.dm < cost;
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
      setText(q.buy, maxed ? 'MAX' : d.cost[l] + ' Iridium');
      q.buy.disabled = !shopOpen || maxed || S.iridium < d.cost[l];
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
      setText(q.buy, maxed ? 'MAX' : d.cost(l) + ' Forschung');
      q.buy.disabled = maxed || S.fp < d.cost(l);   // FP-Shop ist auch im Kampf nutzbar
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
  function resize() {
    DPR = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  new ResizeObserver(resize).observe(cv); resize();

  // Kleiner deterministischer Zufallsgenerator, damit Sterne/Gestalt eines Meteoriten gleich bleiben
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const R = rng(7);
  const stars = Array.from({ length: 220 }, () => ({ x: R(), y: R() * 0.95, r: R() * 1.2 + 0.2, a: R() * 0.6 + 0.3, ph: R() * 6.28 }));
  // Kontinente als Flecken auf der Erdkugel: Winkel, Abstand vom Mittelpunkt, Größe (alles relativ zum Erdradius)
  const lands = Array.from({ length: 10 }, () => ({ a: R() * 6.28, d: R() * 0.72, r: R() * 0.2 + 0.08, rot: R() * 3 }));

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
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function spawn(x, y, n, speedMax, colors, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = Math.random() * speedMax;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.8), max: life, c: colors[(Math.random() * colors.length) | 0], s: size * (0.5 + Math.random()) });
    }
  }

  /** Lage und Größe der Erde: komplett sichtbar am unteren Rand (damit sie schön explodieren kann). */
  function earth() { const r = Math.min(H * 0.21, W * 0.3); return { x: W * 0.5, y: H - r * 1.15, r }; }
  /** Feste Bildgröße für ALLE Objekte (egal ob Fahrrad oder Asteroid), damit nichts wild herumzoomt. */
  function baseRadius() { return Math.min(H * 0.1, W * 0.13); }

  function drawEarth(e, alpha, scale) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(e.x, e.y); ctx.scale(scale, scale); ctx.translate(-e.x, -e.y);
    // Atmosphärenschein
    let g = ctx.createRadialGradient(e.x, e.y, e.r * 0.97, e.x, e.y, e.r * 1.14);
    g.addColorStop(0, 'rgba(110,170,255,.55)'); g.addColorStop(1, 'rgba(110,170,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.14, 0, 6.2832); ctx.fill();
    // Ozean
    g = ctx.createRadialGradient(e.x - e.r * 0.35, e.y - e.r * 0.4, e.r * 0.2, e.x, e.y, e.r);
    g.addColorStop(0, '#3a7bc0'); g.addColorStop(0.6, '#1a4678'); g.addColorStop(1, '#0a1c33');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.fill();
    // Landmassen und Wolken (innerhalb der Kugel zugeschnitten), drehen sich langsam
    ctx.save(); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.clip();
    const spin = clock * 0.03;
    lands.forEach((l, i) => {
      const a = l.a + spin;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(92,120,72,.85)' : 'rgba(120,108,72,.8)';
      ctx.beginPath(); ctx.ellipse(e.x + Math.cos(a) * l.d * e.r, e.y + Math.sin(a) * l.d * e.r, l.r * e.r * 1.3, l.r * e.r * 0.7, l.rot + spin, 0, 6.2832); ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    for (let i = 0; i < 6; i++) { const l = lands[i], a = l.a * 2 - spin * 1.6; ctx.beginPath(); ctx.ellipse(e.x + Math.cos(a) * 0.5 * e.r, e.y + Math.sin(a) * 0.6 * e.r, e.r * 0.3, e.r * 0.04, l.rot, 0, 6.2832); ctx.fill(); }
    // Schattenseite (Licht kommt von links oben)
    g = ctx.createLinearGradient(e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r);
    g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,12,.7)');
    ctx.fillStyle = g; ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(150,200,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawStars(t) {
    stars.forEach((s) => {
      const a = s.a * (0.75 + 0.25 * Math.sin(t * 0.8 + s.ph));
      ctx.fillStyle = `rgba(220,230,255,${a})`;
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
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

  /** Bots: kleine Lichtpunkte umkreisen das Objekt und schießen Laser darauf. */
  function drawBots(r, dt) {
    const total = S.bots.reduce((a, b) => a + b, 0);
    const n = Math.min(14, total === 0 ? 0 : Math.ceil(Math.sqrt(total) * 1.4));
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const a = clock * (0.5 + (i % 3) * 0.12) * (i % 2 ? 1 : -1) + i * 6.2832 / n;
      const d = r * (1.35 + (i % 4) * 0.12);
      const bx = Math.cos(a) * d, by = Math.sin(a) * d * 0.8;
      const tx = Math.cos(a) * r * 0.8, ty = Math.sin(a) * r * 0.8;
      ctx.strokeStyle = 'rgba(255,196,110,.6)'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#cfd8e6'; ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
      if (Math.random() < 6 * dt) spawn(lastPos.x + tx, lastPos.y + ty, 1, 60, ['#ffd08a', '#ff9a4a', '#8d8579'], 0.5, 1.6);
    }
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
    boom = { t: 0, e, P, chunks, bursts: [], nextBurst: 0, quip: pick(BOOM_QUIPS), what: label(res) };
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
      const l1 = `${b.what} trifft die Erde.`;
      ctx.strokeText(l1, 0, H * 0.13); ctx.fillStyle = '#fff'; ctx.fillText(l1, 0, H * 0.13);
      ctx.strokeText(b.quip, 0, H * 0.18); ctx.fillStyle = '#ffd9a0'; ctx.fillText(b.quip, 0, H * 0.18);
      ctx.restore();
    }
    if (b.t > 4.6) { boom = null; earthT = 0; Sfx.play('reborn'); updateHud(); }
  }

  /** Zeichnet das ganze Bild. dt = echte Sekunden seit dem letzten Bild. */
  function render(dt) {
    clock += dt; spawnT = Math.min(1, spawnT + dt / 0.6); earthT = Math.min(1, earthT + dt / 1.8);
    ctx.save();
    if (shake > 0.1) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.pow(0.05, dt); }
    ctx.fillStyle = '#04060b'; ctx.fillRect(-100, -100, W + 200, H + 200);
    drawStars(clock);
    const e = earth();
    if (!boom) {
      const ease = 1 - Math.pow(1 - earthT, 3);                 // neue Erde "poppt" sanft auf
      drawEarth(e, ease, 0.55 + 0.45 * ease);
    }

    const m = S.meteor, fight = S.phase === 'fight';
    if (!boom) {
      // Fortschritt des Anflugs 0 (fern) .. 1 (Einschlag). Bildgröße bleibt für alle Objekte gleich.
      const p = fight ? 1 - Math.max(0, m.timeLeft) / m.time : 0;
      const sx = W * 0.44, sy = H * 0.1, ex = e.x, ey = e.y - e.r - baseRadius() * 0.6;
      const x = sx + (ex - sx) * p, y = sy + (ey - sy) * p + (fight ? 0 : Math.sin(clock * 0.8) * 4);
      const mass = fight ? Math.max(0, m.remaining) / m.mass : 1;
      const r = baseRadius() * (0.7 + 0.3 * p) * (0.15 + 0.85 * Math.sqrt(mass));   // wird nur wenig größer, schrumpft aber sichtbar beim Abbau
      lastPos = { x, y, r };
      const ang = Math.atan2(e.y - y, e.x - x), heat = fight ? Math.max(0, (p - 0.6) / 0.4) : 0;
      if (r > 1.5) {
        ctx.save(); ctx.translate(x, y); ctx.globalAlpha = fight ? spawnT : 0.55;
        // Taumeln: jedes Objekt dreht sich mit eigener Geschwindigkeit/Richtung und wippt leicht
        const spin = clock * (0.9 + (m.n % 4) * 0.35) * (m.n % 2 ? 1 : -1) + m.n;
        drawTrail(r, ang, heat);
        if (m.funny) drawEmoji(m.emoji, r, spin + Math.sin(clock * 3) * 0.2, heat);
        else drawRock(r, m.n * 31 + 5, spin * 0.3, ang, heat);
        if (fight) drawBots(r, dt);
        ctx.restore();
        if (fight) {
          // Aus dem Objekt lösen sich Trümmer: je höher der Abbau (relativ zur Masse), desto mehr
          const frac = C.currentRate(S) / m.mass, perSec = Math.min(45, 3 + 500 * frac);
          if (Math.random() < perSec * dt) {
            const a = Math.random() * 6.2832;
            parts.push({ x: x + Math.cos(a) * r * 0.9, y: y + Math.sin(a) * r * 0.9, vx: Math.cos(a) * (25 + Math.random() * 60), vy: Math.sin(a) * (25 + Math.random() * 60),
                         life: 1.6, max: 1.6, c: m.funny ? pick(['#ffd08a', '#c7b79a', '#e8e0d0']) : '#7d756a', s: 2 + Math.random() * Math.max(1, r * 0.05) });
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
      playKill(); addFeed(res); Sfx.play('kill');
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

  let last = performance.now(), uiTimer = 0, lastWarn = -1, zapAcc = 0;
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
      zapAcc += real * Math.min(6, Math.sqrt(S.bots.reduce((a, b) => a + b, 0)) * 0.8);
      if (zapAcc >= 1) { zapAcc = 0; Sfx.play('zap'); }
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
  window.__game = { get state() { return S; }, Core: C, get boom() { return boom; } };
})();
