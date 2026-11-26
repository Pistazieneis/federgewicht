// Balance-Simulation: ein "Spieler" kauft im Upgrade-Fenster immer das beste
// Preis-Leistungs-Angebot, klickt nicht. Aufruf: node tools/sim.js [anzahl_meteoriten]
const C = require('../desktop/core.js');

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
    C.UPGRADES.forEach((u) => { if (!s.upgrades[u.id] && u.req(s) && !u.fx.click && !u.fx.clickRate)
      consider(u.cost, () => (s.upgrades[u.id] = true), () => delete s.upgrades[u.id], u.fx.time ? 't' + u.id : u.id); });
    if (!best || best.score === Infinity) break;
    if (best.label.startsWith('bot')) C.buyBot(s, +best.label.slice(3)); else C.buyUpgrade(s, best.label.replace(/^t/, ''));
  }
  C.SPECIAL.forEach((d) => { while (C.buySpecial(s, d.id)); });
  C.FP_SHOP.forEach((d) => { while (C.buyFp(s, d.id)); });
}

const N = +process.argv[2] || 40;
const s = C.newState();
let clock = 0;
console.log('  n | Masse       | Zeit | zerstört | Rate/s     | ΔM gesamt   | FP-Angebot | Ir');
for (let k = 0; k < N; k++) {
  shopGreedy(s);
  const n = s.meteorN, rate = C.baseRate(s);
  C.startMeteor(s);
  const m = s.meteor; let res = null;
  while (!res) { res = C.tick(s, 0.25); }
  clock += m.time - Math.max(0, m.timeLeft) ;
  console.log(String(n).padStart(3), '|', C.fmtMass(m.mass).padEnd(11), '|', String(Math.round(m.time)).padStart(4), '|',
    (res.destroyed ? 'JA  ' : (res.fraction * 100).toFixed(0).padStart(3) + '%'), '    |', C.fmtMass(rate).padEnd(10), '|',
    C.fmtMass(s.totalDm).padEnd(11), '|', String(C.prestigeGain(s)).padStart(5), '     |', s.iridium,
    ' t=' + (clock / 60).toFixed(1) + 'min');
}
