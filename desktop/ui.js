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
    if (ok) { updateShops(); updateHud(); }
  });

  $('btnPrestige').addEventListener('click', () => {
    const gain = C.prestigeGain(S);
    if (gain < 1) return;
    if (!confirm(`Neustart durchführen?\n\nDu erhältst ${gain} Forschungspunkte (dauerhaft +${Math.round(gain * C.CFG.fpBonusPerPoint * 100)} % Abbau).\nBots, ΔM-Upgrades und Meteoritenstufe werden zurückgesetzt.`)) return;
    if (C.prestige(S)) { toast(`+${gain} Forschung`); save(); updateShops(); updateHud(); }
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
    setText($('btnPrestige'), gain >= 1 ? `Neustart (+${C.fmtNum(gain)} Forschung)` : 'Noch keine Forschung verfügbar');
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
  function forecast(rateNow, m) {
    // Grobe Prognose ohne Klicks: Wie viel der Masse schafft man in der Restzeit?
    const t = m.timeLeft;
    const resonance = 0.005 * (S.special.resonance || 0);
    const mined = rateNow * (t + resonance * t * t / 2);
    return Math.min(1, mined / Math.max(1e-9, m.remaining));
  }
  function forecastText(f) {
    if (f >= 1) return ['Zerstörung wahrscheinlich', 'good'];
    if (f >= 0.6) return [`Knapp: ca. ${Math.floor(f * 100)} % abbaubar`, 'mid'];
    return [`Nicht genug: ca. ${Math.floor(f * 100)} % abbaubar`, 'bad'];
  }

  function updateHud() {
    const m = S.meteor, fight = S.phase === 'fight';
    $('hudFight').classList.toggle('on', fight);
    $('hudShop').classList.toggle('on', !fight);

    setText($('rDm'), C.fmtMass(S.dm));
    setText($('rRate'), rate(C.currentRate(S)));
    $('boxIr').hidden = !(S.iridium > 0 || S.destroyed > 0);
    setText($('rIr'), String(S.iridium));
    $('boxFp').hidden = !(S.fpEarned > 0 || C.prestigeUnlocked(S));
    setText($('rFp'), String(S.fp));
    setText($('rBonus'), 'Bonus ×' + C.prestigeMult(S).toFixed(2).replace('.', ','));
    $('tabSpec').hidden = !(S.iridium > 0 || S.destroyed > 0 || Object.keys(S.special).length > 0);

    const clsTxt = `${m.cls} · Stufe ${m.pos}/${m.classCount === Infinity ? '∞' : m.classCount}`;
    if (fight) {
      setText($('mName'), m.name); setText($('mClass'), clsTxt);
      setText($('mRemain'), `${C.fmtMass(Math.max(0, m.remaining))} / ${C.fmtMass(m.mass)}`);
      $('barMass').style.width = Math.max(0, m.remaining / m.mass * 100) + '%';
      setText($('mRate'), rate(C.currentRate(S)));
      setText($('mTime'), C.fmtTime(m.timeLeft));
      const frac = Math.max(0, m.timeLeft / m.time);
      const bt = $('barTime'); bt.style.width = frac * 100 + '%';
      bt.style.background = frac < 0.25 ? 'var(--bad)' : frac < 0.5 ? 'var(--warn)' : 'var(--ok)';
      const [ft] = forecastText(forecast(C.currentRate(S), m)); setText($('mForecast'), ft);
      setText($('mineInfo'), `+${C.fmtMass(C.clickPower(S))} pro Klick · Leertaste`);
    } else {
      setText($('nName'), m.name); setText($('nClass'), clsTxt);
      setText($('nMass'), C.fmtMass(m.mass)); setText($('nTime'), C.fmtTime(m.time));
      setText($('nNeed'), rate(m.mass * (1 - 0.03 * (S.special.charge || 0)) / m.time));
      setText($('nHave'), rate(C.baseRate(S)));
      const [ft, cls] = forecastText(forecast(C.baseRate(S), Object.assign({}, m, { timeLeft: m.time, remaining: m.mass * (1 - 0.03 * (S.special.charge || 0)) })));
      const fe = $('nForecast'); setText(fe, 'Prognose: ' + ft); fe.className = 'forecast ' + cls;
    }
  }

  /** Ergebnisbericht nach einem Meteoriten (oben links im Upgrade-Fenster). */
  function showReport() {
    const r = S.last, box = $('report');
    box.hidden = !r;
    if (!r) return;
    const head = $('repHead');
    head.className = 'rep-head ' + (r.destroyed ? 'good' : 'bad');
    head.textContent = r.destroyed ? `${r.name} vollständig zerstört` : `${r.name} ist eingeschlagen`;
    const rows = [
      ['Masse', C.fmtMass(r.mass)],
      ['Abgebaut', `${C.fmtMass(r.mined)} (${Math.floor(r.fraction * 100)} %)`],
      ['ΔM gewonnen', '+' + C.fmtMass(r.gain)]
    ];
    if (r.destroyed) rows.push(['Iridium gefunden', '+' + r.iridium]);
    else rows.push(['Folge', 'Gleich schwerer Meteorit folgt']);
    $('repBody').innerHTML = rows.map(([a, b]) => `<span class="muted">${a}</span><b>${b}</b>`).join('');
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
  const stars = Array.from({ length: 220 }, () => ({ x: R(), y: R() * 0.85, r: R() * 1.2 + 0.2, a: R() * 0.6 + 0.3, ph: R() * 6.28 }));
  const lands = Array.from({ length: 9 }, () => ({ x: R() * 2 - 1, y: R() * 0.9 - 0.2, r: R() * 0.22 + 0.06 }));

  // Gestalt des Gesteinsbrockens: unregelmäßiges Vieleck + Krater, aus der Nummer des Meteoriten erzeugt
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
  let flash = 0;         // Bildschirmblitz (0..1)
  let shake = 0;         // Wackeln (Pixel)
  let rot = 0, clock = 0;
  let lastMass = 1, meteorPos = { x: 0, y: 0, r: 20 };

  function spawn(x, y, n, speedMax, colors, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = Math.random() * speedMax;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.8), max: life, c: colors[(Math.random() * colors.length) | 0], s: size * (0.5 + Math.random()) });
    }
  }

  function earth() { return { x: W * 0.5, y: H * 1.62, r: Math.max(W * 0.62, H * 0.9) }; }

  function drawEarth() {
    const e = earth();
    // Atmosphärenschein
    let g = ctx.createRadialGradient(e.x, e.y, e.r * 0.97, e.x, e.y, e.r * 1.06);
    g.addColorStop(0, 'rgba(110,170,255,.55)'); g.addColorStop(1, 'rgba(110,170,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.06, 0, 6.2832); ctx.fill();
    // Ozean
    g = ctx.createRadialGradient(e.x - e.r * 0.3, e.y - e.r * 0.5, e.r * 0.2, e.x, e.y, e.r);
    g.addColorStop(0, '#2f6aa8'); g.addColorStop(0.6, '#173f6c'); g.addColorStop(1, '#09182c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.fill();
    // Landmassen und Wolken (innerhalb der Kugel zugeschnitten)
    ctx.save(); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.clip();
    lands.forEach((l, i) => {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(86,110,70,.75)' : 'rgba(110,100,70,.65)';
      ctx.beginPath(); ctx.ellipse(e.x + l.x * e.r * 0.9, e.y - e.r * (0.55 + l.y * 0.35), l.r * e.r * 1.2, l.r * e.r * 0.5, i, 0, 6.2832); ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 7; i++) { const l = lands[i]; ctx.beginPath(); ctx.ellipse(e.x + l.y * e.r, e.y - e.r * (0.6 + l.x * 0.25), e.r * 0.18, e.r * 0.025, l.x, 0, 6.2832); ctx.fill(); }
    // Schattenseite (Licht kommt von links oben)
    g = ctx.createLinearGradient(e.x - e.r, e.y - e.r, e.x + e.r, e.y);
    g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,.65)');
    ctx.fillStyle = g; ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    ctx.restore();
    // feine Atmosphärenkante
    ctx.strokeStyle = 'rgba(150,200,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832); ctx.stroke();
  }

  function drawStars(t) {
    stars.forEach((s) => {
      const a = s.a * (0.75 + 0.25 * Math.sin(t * 0.8 + s.ph));
      ctx.fillStyle = `rgba(220,230,255,${a})`;
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    });
  }

  /** Zeichnet den Brocken an Position (x,y) mit Radius r. 'rem' = Anteil der verbleibenden Masse. */
  function drawRock(x, y, r, seed, rem, dim, heat) {
    const sh = shapeFor(seed);
    ctx.save(); ctx.translate(x, y);
    // Staubschweif entgegen der Flugrichtung (Richtung Erde = nach unten rechts/links)
    const ang = Math.atan2(earth().y - y, earth().x - x);
    ctx.save(); ctx.rotate(ang + Math.PI);
    const tail = ctx.createLinearGradient(0, 0, r * (2.2 + heat * 3), 0);
    tail.addColorStop(0, `rgba(255,${150 - heat * 50 | 0},60,${0.05 + 0.35 * heat})`); tail.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = tail; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(r * (2.2 + heat * 3), 0); ctx.lineTo(0, r * 0.8); ctx.fill();
    ctx.restore();
    ctx.rotate(rot * (0.4 + (seed % 5) * 0.1));
    ctx.globalAlpha = dim ? 0.8 : 1;
    ctx.beginPath(); sh.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * r, p[1] * r) : ctx.moveTo(p[0] * r, p[1] * r))); ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, '#8d8579'); g.addColorStop(0.55, '#4b463f'); g.addColorStop(1, '#16130f');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    sh.craters.forEach((c) => {
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(c.x * r, c.y * r, c.r * r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,220,.16)'; ctx.lineWidth = Math.max(1, r * 0.015); ctx.beginPath(); ctx.arc(c.x * r - r * 0.012, c.y * r - r * 0.012, c.r * r, 3.4, 5.6); ctx.stroke();
    });
    // Hitze auf der der Erde zugewandten Seite
    if (heat > 0) {
      ctx.rotate(-rot * (0.4 + (seed % 5) * 0.1)); ctx.rotate(ang);
      const hg = ctx.createRadialGradient(r * 0.9, 0, r * 0.1, r * 0.9, 0, r * 1.2);
      hg.addColorStop(0, `rgba(255,170,70,${0.7 * heat})`); hg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = hg; ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    }
    ctx.restore(); ctx.restore();
  }

  /** Bots: kleine Lichtpunkte umkreisen den Brocken und schießen Laser auf ihn. */
  function drawBots(x, y, r, dt) {
    const total = S.bots.reduce((a, b) => a + b, 0);
    const n = Math.min(14, total === 0 ? 0 : Math.ceil(Math.sqrt(total) * 1.4));
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const a = clock * (0.5 + (i % 3) * 0.12) * (i % 2 ? 1 : -1) + i * 6.2832 / n;
      const d = r * (1.35 + (i % 4) * 0.12);
      const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d * 0.8;
      // Zielpunkt auf der Oberfläche
      const tx = x + Math.cos(a) * r * 0.85, ty = y + Math.sin(a) * r * 0.85;
      ctx.strokeStyle = 'rgba(255,196,110,.55)'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#cfd8e6'; ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
      if (Math.random() < 6 * dt) spawn(tx, ty, 1, 60, ['#ffd08a', '#ff9a4a', '#8d8579'], 0.5, 1.6);
    }
  }

  function render(dt) {
    clock += dt; rot += dt * 0.2;
    ctx.save();
    // Wackeln beim Einschlag
    if (shake > 0.1) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.pow(0.02, dt); }
    ctx.fillStyle = '#04060b'; ctx.fillRect(-20, -20, W + 40, H + 40);
    drawStars(clock); drawEarth();

    const m = S.meteor, fight = S.phase === 'fight';
    // Fortschritt des Anflugs 0 (fern) .. 1 (Einschlag)
    const p = fight ? 1 - Math.max(0, m.timeLeft) / m.time : 0;
    const e = earth();
    const sx = W * 0.5 + 40, sy = H * 0.3, ex = W * 0.5, ey = e.y - e.r - 10;
    const pe = Math.pow(p, 1.6);
    const mass = fight ? Math.max(0, m.remaining) / m.mass : 1;
    const baseR = 26 + (Math.min(W, H) * 0.2 - 26) * pe;   // in der Vorschau schon gut sichtbar
    const r = baseR * (0.3 + 0.7 * Math.cbrt(mass));          // schrumpft, je mehr abgebaut wurde
    const x = sx + (ex - sx) * pe, y = sy + (ey - sy) * pe + Math.sin(clock * 0.6) * (fight ? 0 : 3);
    meteorPos = { x, y, r }; lastMass = mass;
    if (r > 1.5) {
      drawRock(x, y, r, m.n * 31 + 5, mass, !fight, fight ? Math.max(0, (p - 0.55) / 0.45) : 0);
      if (fight) drawBots(x, y, r, dt);
    }
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
      const g = rings[i]; g.t += dt; if (g.t > g.life) { rings.splice(i, 1); continue; }
      const k = g.t / g.life;
      ctx.strokeStyle = `rgba(${g.col},${1 - k})`; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r * k, g.r * k * g.sq, 0, 0, 6.2832); ctx.stroke();
    }
    // Blitz
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,240,215,${flash})`; ctx.fillRect(-20, -20, W + 40, H + 40); flash *= Math.pow(0.004, dt); }
    ctx.restore();
  }

  /** Effekte für das Ende eines Meteoriten. */
  function playEnd(res) {
    const e = earth();
    if (res.destroyed) {
      // Zerstörung: Trümmerwolke am letzten Ort
      spawn(meteorPos.x, meteorPos.y, 160, 280, ['#ffd9a0', '#ff9a4a', '#8d8579', '#cfc6b8'], 1.4, 2.6);
      rings.push({ x: meteorPos.x, y: meteorPos.y, r: 140, life: 0.9, col: '255,220,170', sq: 1 });
      flash = 0.25;
    } else {
      // Einschlag: Blitz, Druckwelle auf der Erde, Staub, Wackeln
      const x = W * 0.5, y = e.y - e.r;
      spawn(x, y, 260, 380, ['#ffe0b0', '#ff8a3a', '#5a4a3a', '#d9d2c4'], 2.0, 3.2);
      rings.push({ x, y, r: Math.min(W, H) * 0.9, life: 1.6, col: '255,200,140', sq: 0.3 });
      rings.push({ x, y, r: Math.min(W, H) * 0.5, life: 1.0, col: '255,255,255', sq: 0.3 });
      flash = 0.9; shake = 18;
    }
  }

  /* ------------------------------------------- 5. Hauptschleife & Eingaben */
  function doStart() {
    if (C.startMeteor(S)) { updateHud(); updateShops(); save(); }
  }
  function doClick(ev) {
    const got = C.click(S);
    if (got > 0 && ev) {
      const r = cv.getBoundingClientRect();
      spawn((ev.clientX || 0) - r.left, (ev.clientY || 0) - r.top, 6, 120, ['#ffd08a', '#ff9a4a'], 0.5, 2);
    }
    if (S.phase !== 'fight') endFight(S.last);
  }
  function endFight(res) {
    if (!res) return;
    playEnd(res); showReport(); updateShops(); updateHud(); save();
    if (res.destroyed && S.destroyed === 1) toast('Erster Meteorit zerstört – Iridium gefunden!');
    if (C.prestigeUnlocked(S) && S.meteorsSeen === C.CFG.prestigeUnlockAfter) toast('Prestige freigeschaltet');
  }

  $('btnStart').addEventListener('click', doStart);
  $('btnMine').addEventListener('click', (e) => doClick(e));
  cv.addEventListener('mousedown', (e) => { if (S.phase === 'fight') doClick(e); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (S.phase === 'fight') doClick(null); }
    else if (e.code === 'Enter' && S.phase === 'shop') { e.preventDefault(); doStart(); }
  });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('btnReset').addEventListener('click', () => {
    if (!confirm('Spielstand wirklich komplett löschen?')) return;
    S = C.newState(); save(); showReport(); updateShops(); updateHud(); toast('Spielstand gelöscht');
  });

  let last = performance.now(), uiTimer = 0;
  function frame(now) {
    const real = Math.min(0.25, (now - last) / 1000); last = now;
    // Spiellogik in kleinen Schritten (max. 0,1 s), damit hohe Geschwindigkeit nichts überspringt
    let left = real * speed;
    while (left > 0 && S.phase === 'fight') {
      const step = Math.min(0.1, left); left -= step;
      const res = C.tick(S, step);
      if (res) { endFight(res); break; }
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
  window.__game = { get state() { return S; }, Core: C };
})();
