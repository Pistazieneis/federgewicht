// Balance-Simulation. Ein "Spieler" kauft im Shop immer das beste Preis-Leistungs-Angebot
// und startet dann einen Lauf (Objekte fallen nacheinander, bis eines einschlägt).
// Aufruf: node tools/sim.js [anzahl_läufe]
const C = require('../desktop/core.js');

/** Kauft im Shop alles Sinnvolle: erst nach bester Abbau-pro-Kosten-Rate, dann Spezial/Forschung. */
function shopGreedy(s) {
  for (let guard = 0; guard < 500; guard++) {
    const r0 = C.baseRate(s);
    let best = null;
    const consider = (cost, apply, undo, label) => {
      if (cost > s.dm) return;
      apply(); const gain = C.baseRate(s) - r0; undo();
      const score = gain > 0 ? cost / gain : (label.startsWith('t') ? 1 : Infinity); // Zeit-Upgrades: billig, immer gut
      if (!best || score < best.score) best = { score, cost, label };
    };
    C.BOTS.forEach((b, i) => consider(C.botCost(s, i), () => s.bots[i]++, () => s.bots[i]--, 'bot' + i));
    C.UPGRADES.forEach((u) => { if (!s.upgrades[u.id] && u.req(s))
      consider(u.cost, () => (s.upgrades[u.id] = true), () => delete s.upgrades[u.id], u.fx.time ? 't' + u.id : u.id); });
    if (!best || best.score === Infinity) break;
    if (best.label.startsWith('bot')) C.buyBot(s, +best.label.slice(3)); else C.buyUpgrade(s, best.label.replace(/^t/, ''));
  }
  C.SPECIAL.forEach((d) => { while (C.buySpecial(s, d.id)); });
  C.FP_SHOP.forEach((d) => { while (C.buyFp(s, d.id)); });
}

/** Spielt einen kompletten Lauf. Gibt Sekunden und Ergebnis zurück. */
function playRun(s) {
  C.startMeteor(s);
  let secs = 0, res = null;
  while (s.phase === 'fight') { res = C.tick(s, 0.25); secs += 0.25; }
  return { secs, res };
}

module.exports = { shopGreedy, playRun };

if (require.main === module) {
  const N = +process.argv[2] || 30;
  const s = C.newState(); let clock = 0;
  console.log('Lauf | Zeit  | zerstört | letztes Objekt (Einschlag)   | Rate/s     | ΔM gesamt   | FP    | Ir');
  for (let k = 1; k <= N; k++) {
    shopGreedy(s);
    const rate = C.baseRate(s), { secs, res } = playRun(s);
    clock += secs + 8;                                   // 8 s Shopzeit pro Lauf geschätzt
    const nm = `${res.name || res.cls + ' ' + res.n} (${(res.fraction * 100).toFixed(0)} %)`;
    console.log(String(k).padStart(4), '|', ((clock / 60).toFixed(1) + 'm').padStart(6), '|', String(s.run.kills).padStart(8), '|',
      nm.padEnd(28), '|', C.fmtMass(rate).padEnd(10), '|', C.fmtMass(s.totalDm).padEnd(11), '|', String(C.prestigeGain(s)).padStart(5), '|', s.iridium);
  }
}
