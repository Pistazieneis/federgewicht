/* ==========================================================================
   FEDERGEWICHT – Objektgrafiken
   --------------------------------------------------------------------------
   Jedes Alltagsobjekt wird einmal als eigene Illustration auf eine Zeichenfläche (1000 x 1000
   Einheiten) gemalt und danach nur noch als Bild verwendet. Gemeinsame Regeln, damit alles
   einheitlich und eher realistisch wirkt:
     * gedeckte, natürliche Farben (keine Comic-Farben)
     * jede Fläche hat einen Verlauf (oben hell, unten dunkel), dazu Glanzlichter und Schatten
     * am Ende legt ein Gesamt-Verlauf über das fertige Bild noch Volumen darauf
   Art.get('Sofa') liefert die fertige Zeichenfläche (oder null, wenn es das Objekt nicht gibt).
   ========================================================================== */
const Art = (function () {
  'use strict';
  const S = 1000;
  const cache = {};

  /* ---- kleine Werkzeuge ---- */
  const lin = (g, x0, y0, x1, y1, stops) => { const r = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => r.addColorStop(o, c)); return r; };
  const rad = (g, x, y, r0, r1, stops) => { const r = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => r.addColorStop(o, c)); return r; };
  /** Füllt einen Pfad mit einem senkrechten Verlauf aus 'top' nach 'bot' (Farben als Hex/rgb). */
  const fillV = (g, top, bot, y0, y1) => { g.fillStyle = lin(g, 0, y0, 0, y1, [[0, top], [1, bot]]); g.fill(); };
  const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const ell = (g, x, y, rx, ry, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); };
  /** Rad mit schwarzem Reifen, silberner Felge und Nabe. */
  function wheel(g, x, y, r, spokes) {
    ell(g, x, y, r, r); g.fillStyle = '#16181b'; g.fill();
    ell(g, x, y, r * 0.66, r * 0.66); g.fillStyle = lin(g, x - r, y - r, x + r, y + r, [[0, '#d9dde2'], [0.5, '#8f959c'], [1, '#c9ced4']]); g.fill();
    ell(g, x, y, r * 0.5, r * 0.5); g.fillStyle = '#23262a'; g.fill();
    g.strokeStyle = '#aeb4bb'; g.lineWidth = r * 0.05;
    for (let k = 0; k < (spokes || 5); k++) { const a = k * 6.2832 / (spokes || 5); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); g.stroke(); }
    ell(g, x, y, r * 0.12, r * 0.12); g.fillStyle = '#c4c9cf'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = r * 0.04; ell(g, x, y, r * 0.97, r * 0.97); g.stroke();
  }
  /** Fensterreihe (dunkles Glas mit Reflex). */
  function windows(g, x, y, w, h, n, gap, col) {
    for (let i = 0; i < n; i++) { rrect(g, x + i * (w + gap), y, w, h, Math.min(w, h) * 0.18); g.fillStyle = lin(g, 0, y, 0, y + h, [[0, col || '#41576e'], [1, '#18222e']]); g.fill(); }
  }

  /* ---- die Objekte (alle in Seitenansicht nach rechts, falls nicht anders vermerkt) ---- */
  const DRAW = {
    Sofa(g) {
      // Frontansicht eines grauen Dreisitzers
      rrect(g, 130, 260, 740, 330, 70); fillV(g, '#7d8898', '#566170', 260, 590);                                 // Rückenlehne
      for (let i = 0; i < 3; i++) { rrect(g, 215 + i * 190, 330, 180, 190, 40); fillV(g, '#8a95a5', '#667282', 330, 520); }  // Rückenkissen
      rrect(g, 70, 380, 160, 320, 60); fillV(g, '#76818f', '#4d5764', 380, 700);                                   // Armlehnen
      rrect(g, 770, 380, 160, 320, 60); fillV(g, '#76818f', '#4d5764', 380, 700);
      for (let i = 0; i < 3; i++) { rrect(g, 215 + i * 190, 520, 180, 140, 36); fillV(g, '#98a3b2', '#6b7787', 520, 660); }  // Sitzkissen
      g.strokeStyle = 'rgba(20,25,35,.45)'; g.lineWidth = 4; [405, 595].forEach((x) => { g.beginPath(); g.moveTo(x, 335); g.lineTo(x, 655); g.stroke(); });
      [[120, 700], [850, 700]].forEach(([x, y]) => { poly(g, [[x, y], [x + 30, y], [x + 22, y + 70], [x + 8, y + 70]]); g.fillStyle = '#2a2018'; g.fill(); });  // Holzfüße
    },
    Motorrad(g) {
      wheel(g, 240, 650, 150, 6); wheel(g, 790, 650, 150, 6);
      g.strokeStyle = '#2b2f35'; g.lineWidth = 22; g.lineCap = 'round';
      g.beginPath(); g.moveTo(790, 650); g.lineTo(700, 400); g.stroke();                                           // Gabel
      g.beginPath(); g.moveTo(240, 650); g.lineTo(430, 520); g.stroke();                                           // Schwinge
      rrect(g, 380, 470, 270, 190, 40); fillV(g, '#4a5058', '#23272c', 470, 660);                                  // Motorblock
      g.fillStyle = '#7b8189'; for (let i = 0; i < 5; i++) g.fillRect(420 + i * 44, 490, 24, 150);                  // Kühlrippen
      poly(g, [[420, 420], [640, 400], [690, 450], [650, 500], [450, 500]]); fillV(g, '#c2382c', '#7c1f18', 400, 500);  // Tank
      rrect(g, 250, 420, 190, 55, 25); fillV(g, '#2a2d31', '#111214', 420, 475);                                   // Sitz
      ell(g, 740, 410, 52, 44); g.fillStyle = lin(g, 700, 370, 780, 450, [[0, '#f4f1e3'], [1, '#9c9a8f']]); g.fill();  // Scheinwerfer
      g.strokeStyle = '#1b1d20'; g.lineWidth = 14; g.beginPath(); g.moveTo(690, 380); g.lineTo(640, 340); g.lineTo(600, 346); g.stroke();   // Lenker
      g.strokeStyle = '#b9bec5'; g.lineWidth = 26; g.beginPath(); g.moveTo(430, 640); g.lineTo(150, 610); g.stroke();   // Auspuff
    },
    Klavier(g) {
      // Frontansicht eines Klaviers, schwarzer Lack
      rrect(g, 110, 190, 780, 380, 26); fillV(g, '#2b2d31', '#0c0d0f', 190, 570);
      rrect(g, 150, 230, 700, 150, 14); g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();                                  // Notenpult-Fläche
      rrect(g, 380, 250, 240, 90, 8); fillV(g, '#17181b', '#0a0a0b', 250, 340);
      rrect(g, 90, 560, 820, 60, 8); fillV(g, '#1c1d20', '#08080a', 560, 620);                                      // Tastenbacken
      g.fillStyle = '#efece2'; for (let i = 0; i < 28; i++) g.fillRect(110 + i * 28.2, 568, 26, 46);                // weiße Tasten
      g.fillStyle = '#0d0d0f'; for (let i = 0; i < 28; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) g.fillRect(110 + i * 28.2 + 19, 568, 16, 28);   // schwarze Tasten
      rrect(g, 120, 620, 80, 260, 14); fillV(g, '#202226', '#0a0a0b', 620, 880); rrect(g, 800, 620, 80, 260, 14); fillV(g, '#202226', '#0a0a0b', 620, 880);   // Seitenwangen
      rrect(g, 360, 800, 280, 60, 10); fillV(g, '#2b2d31', '#0c0d0f', 800, 860);
      g.strokeStyle = '#a8895a'; g.lineWidth = 10; g.beginPath(); g.moveTo(470, 640); g.lineTo(470, 780); g.moveTo(530, 640); g.lineTo(530, 780); g.stroke();   // Pedale
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 5; g.beginPath(); g.moveTo(130, 200); g.lineTo(870, 200); g.stroke();   // Lackglanz
    },
    Pferd(g) {
      const base = ['#8a5a36', '#4d2f1a'];
      g.lineCap = 'round'; g.lineJoin = 'round';
      [[300, 560, 292, 860], [380, 570, 400, 860], [650, 570, 665, 860], [730, 560, 760, 860]].forEach(([x0, y0, x1, y1], i) => {   // Beine (hintere dunkler)
        g.strokeStyle = i % 2 ? '#7a4d2c' : '#5c381e'; g.lineWidth = 46; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 12, (y0 + y1) / 2, x1, y1 - 20); g.stroke();
        g.strokeStyle = '#1d1209'; g.lineWidth = 50; g.beginPath(); g.moveTo(x1, y1 - 24); g.lineTo(x1 + 4, y1); g.stroke(); });
      ell(g, 500, 520, 250, 130); fillV(g, base[0], base[1], 400, 650);                                              // Rumpf
      poly(g, [[690, 470], [790, 280], [850, 270], [830, 360], [770, 520]]); fillV(g, '#8a5a36', '#4d2f1a', 270, 520);  // Hals
      poly(g, [[800, 280], [920, 330], [950, 400], [915, 420], [840, 370]]); fillV(g, '#8f5d38', '#4d2f1a', 280, 420);   // Kopf
      poly(g, [[800, 280], [815, 220], [840, 270]]); g.fillStyle = '#4d2f1a'; g.fill();                               // Ohr
      ell(g, 868, 335, 9, 9); g.fillStyle = '#0e0a07'; g.fill();
      g.strokeStyle = '#1c120a'; g.lineWidth = 34; g.beginPath(); g.moveTo(700, 400); g.quadraticCurveTo(740, 290, 800, 250); g.stroke();   // Mähne
      g.beginPath(); g.moveTo(262, 480); g.quadraticCurveTo(160, 560, 190, 720); g.stroke();                          // Schweif
    },
    Kleinwagen(g) {
      // Silbergraues Kompaktauto
      g.beginPath(); g.moveTo(110, 640); g.lineTo(110, 540); g.quadraticCurveTo(120, 500, 190, 490); g.lineTo(300, 470); g.quadraticCurveTo(360, 360, 470, 340);
      g.lineTo(640, 340); g.quadraticCurveTo(730, 350, 780, 470); g.lineTo(880, 500); g.quadraticCurveTo(920, 515, 920, 570); g.lineTo(920, 640); g.closePath();
      fillV(g, '#b9c2cb', '#6e7882', 340, 650);
      g.beginPath(); g.moveTo(320, 470); g.quadraticCurveTo(370, 385, 460, 370); g.lineTo(620, 370); g.lineTo(620, 470); g.closePath(); g.fillStyle = lin(g, 0, 370, 0, 470, [[0, '#4b6075'], [1, '#1c2733']]); g.fill();
      g.beginPath(); g.moveTo(645, 370); g.quadraticCurveTo(700, 378, 745, 470); g.lineTo(645, 470); g.closePath(); g.fillStyle = lin(g, 0, 370, 0, 470, [[0, '#4b6075'], [1, '#1c2733']]); g.fill();
      g.strokeStyle = 'rgba(20,25,30,.5)'; g.lineWidth = 5; g.beginPath(); g.moveTo(630, 372); g.lineTo(630, 560); g.stroke();                       // Türfuge
      rrect(g, 870, 520, 50, 36, 10); g.fillStyle = '#fff6d8'; g.fill();                                                                             // Scheinwerfer
      rrect(g, 100, 540, 26, 40, 8); g.fillStyle = '#a0332b'; g.fill();                                                                              // Rücklicht
      rrect(g, 95, 625, 835, 34, 12); g.fillStyle = '#2e343a'; g.fill();                                                                             // Stoßfänger
      wheel(g, 290, 640, 105, 5); wheel(g, 750, 640, 105, 5);
    },
    Elefant(g) {
      const c0 = '#8e8a85', c1 = '#52504d';
      [[330, 560, 320, 860], [440, 570, 450, 870], [680, 570, 690, 870], [790, 550, 800, 860]].forEach(([x0, y0, x1, y1], i) => {
        g.strokeStyle = i % 2 ? '#78746f' : '#5e5b57'; g.lineWidth = 105; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1 - 30); g.stroke(); });
      ell(g, 540, 480, 330, 200); fillV(g, c0, c1, 280, 680);                                                          // Rumpf
      ell(g, 800, 400, 150, 140); fillV(g, '#938f8a', '#5a5753', 260, 540);                                            // Kopf
      g.beginPath(); g.moveTo(860, 460); g.quadraticCurveTo(960, 560, 900, 740); g.quadraticCurveTo(880, 780, 850, 750); g.quadraticCurveTo(900, 600, 800, 520); g.closePath(); fillV(g, '#8e8a85', '#5a5753', 460, 760);   // Rüssel
      ell(g, 700, 390, 90, 150, 0.15); g.fillStyle = lin(g, 620, 250, 780, 520, [[0, '#7b7772'], [1, '#4a4845']]); g.fill();   // Ohr
      g.strokeStyle = '#ece4d0'; g.lineWidth = 26; g.beginPath(); g.moveTo(860, 470); g.quadraticCurveTo(960, 520, 970, 430); g.stroke();   // Stoßzahn
      ell(g, 850, 360, 9, 9); g.fillStyle = '#100f0e'; g.fill();
      g.strokeStyle = c1; g.lineWidth = 14; g.beginPath(); g.moveTo(220, 400); g.quadraticCurveTo(180, 520, 210, 620); g.stroke();                // Schwanz
    },
    Schulbus(g) {
      g.beginPath(); g.moveTo(60, 690); g.lineTo(60, 350); g.quadraticCurveTo(60, 320, 90, 320); g.lineTo(760, 320); g.quadraticCurveTo(830, 330, 870, 420);
      g.lineTo(940, 470); g.quadraticCurveTo(960, 480, 960, 520); g.lineTo(960, 690); g.closePath(); fillV(g, '#f0b823', '#a8780c', 320, 690);
      g.fillStyle = '#17191c'; g.fillRect(60, 520, 900, 36); g.fillRect(60, 600, 900, 18);                                                              // schwarze Streifen
      windows(g, 100, 360, 92, 110, 7, 14, '#3f5266');
      rrect(g, 780, 380, 70, 100, 8); g.fillStyle = lin(g, 0, 380, 0, 480, [[0, '#3f5266'], [1, '#1a232e']]); g.fill();                                // Frontscheibe
      rrect(g, 920, 560, 40, 24, 6); g.fillStyle = '#fff2c4'; g.fill();
      rrect(g, 40, 672, 940, 34, 12); g.fillStyle = '#26292d'; g.fill();
      wheel(g, 250, 700, 98, 6); wheel(g, 800, 700, 98, 6);
    },
    Lokomotive(g) {
      rrect(g, 330, 380, 540, 230, 110); fillV(g, '#3a3d42', '#0f1012', 380, 610);                                                                     // Kessel
      g.fillStyle = '#c8cdd3'; for (let i = 0; i < 3; i++) g.fillRect(430 + i * 150, 380, 14, 230);                                                    // Kesselbänder
      g.beginPath(); g.moveTo(780, 380); g.lineTo(790, 250); g.lineTo(850, 250); g.lineTo(860, 380); g.closePath(); fillV(g, '#2e3135', '#0b0b0c', 250, 380);   // Schornstein
      rrect(g, 770, 230, 100, 34, 10); g.fillStyle = '#1c1e21'; g.fill();
      ell(g, 560, 360, 55, 40); fillV(g, '#43474c', '#15171a', 320, 400);                                                                               // Dampfdom
      rrect(g, 90, 280, 250, 330, 14); fillV(g, '#4b2423', '#1d0e0d', 280, 610);                                                                        // Führerhaus
      rrect(g, 130, 330, 90, 110, 8); g.fillStyle = lin(g, 0, 330, 0, 440, [[0, '#5e6f7e'], [1, '#1a232c']]); g.fill();
      rrect(g, 70, 250, 290, 40, 10); fillV(g, '#2c2f33', '#0f1012', 250, 290);
      poly(g, [[860, 520], [960, 640], [860, 640]]); g.fillStyle = '#2a2c30'; g.fill();                                                                 // Schienenräumer
      rrect(g, 90, 600, 800, 40, 6); g.fillStyle = '#141517'; g.fill();
      [[430, 130], [610, 130], [770, 130]].forEach(([x, r]) => { ell(g, x, 690, r * 0.9, r * 0.9); g.fillStyle = '#1b1d20'; g.fill(); ell(g, x, 690, r * 0.62, r * 0.62); g.fillStyle = lin(g, x - 80, 600, x + 80, 780, [[0, '#a8332a'], [1, '#5e1712']]); g.fill();
        ell(g, x, 690, r * 0.12, r * 0.12); g.fillStyle = '#c8cdd3'; g.fill(); });
      ell(g, 200, 720, 70, 70); g.fillStyle = '#1b1d20'; g.fill(); ell(g, 200, 720, 44, 44); g.fillStyle = '#7c241d'; g.fill();
      g.strokeStyle = '#a6acb3'; g.lineWidth = 16; g.beginPath(); g.moveTo(430, 700); g.lineTo(770, 690); g.stroke();                                   // Kuppelstange
    },
    Blauwal(g) {
      g.beginPath(); g.moveTo(950, 520); g.quadraticCurveTo(900, 380, 640, 370); g.quadraticCurveTo(300, 360, 130, 470); g.quadraticCurveTo(60, 400, 40, 330);
      g.quadraticCurveTo(100, 450, 90, 500); g.quadraticCurveTo(60, 560, 40, 650); g.quadraticCurveTo(110, 590, 130, 560); g.quadraticCurveTo(320, 670, 650, 660); g.quadraticCurveTo(900, 650, 950, 520); g.closePath();
      g.fillStyle = lin(g, 0, 360, 0, 670, [[0, '#4f6a86'], [0.55, '#3d5370'], [1, '#2a3a50']]); g.fill();
      g.beginPath(); g.moveTo(940, 540); g.quadraticCurveTo(880, 650, 650, 660); g.quadraticCurveTo(330, 668, 150, 565); g.quadraticCurveTo(350, 590, 650, 590); g.quadraticCurveTo(870, 585, 940, 540); g.closePath();
      g.fillStyle = lin(g, 0, 570, 0, 670, [[0, '#b7c3cf'], [1, '#8696a8']]); g.fill();                                                                  // helle Bauchseite
      g.strokeStyle = 'rgba(30,45,65,.5)'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(560 + i * 22, 595); g.quadraticCurveTo(640 + i * 20, 615, 740 + i * 12, 600); g.stroke(); }   // Bauchfalten
      poly(g, [[640, 600], [560, 760], [610, 770], [720, 620]]); g.fillStyle = '#3a4f69'; g.fill();                                                       // Brustflosse
      ell(g, 860, 500, 9, 9); g.fillStyle = '#0d1219'; g.fill();
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(520, 400, 250, 18, -0.02, 0, 6.2832); g.fill();
    },
    Jumbojet(g) {
      // Draufsicht: weißer Rumpf, geschwungene Flügel, vier Triebwerke
      const W_ = (x, y) => [x, y];
      poly(g, [W_(500, 440), W_(940, 600), W_(940, 650), W_(500, 540)]); g.fillStyle = lin(g, 500, 440, 940, 640, [[0, '#e7eaee'], [1, '#aeb4bc']]); g.fill();    // rechter Flügel
      poly(g, [W_(500, 440), W_(60, 600), W_(60, 650), W_(500, 540)]); g.fillStyle = lin(g, 500, 440, 60, 640, [[0, '#dfe3e8'], [1, '#a2a9b2']]); g.fill();      // linker Flügel
      poly(g, [W_(500, 840), W_(740, 930), W_(740, 960), W_(500, 910)]); g.fillStyle = '#c9ced5'; g.fill();                                                  // Leitwerk
      poly(g, [W_(500, 840), W_(260, 930), W_(260, 960), W_(500, 910)]); g.fillStyle = '#bdc3ca'; g.fill();
      [[690, 560], [820, 600], [310, 560], [180, 600]].forEach(([x, y]) => { rrect(g, x - 26, y - 20, 52, 110, 22); fillV(g, '#9aa1aa', '#4b5058', y - 20, y + 90); ell(g, x, y - 6, 18, 10); g.fillStyle = '#20242a'; g.fill(); });
      g.beginPath(); g.moveTo(500, 80); g.quadraticCurveTo(580, 150, 580, 300); g.lineTo(580, 860); g.quadraticCurveTo(580, 940, 500, 960); g.quadraticCurveTo(420, 940, 420, 860); g.lineTo(420, 300); g.quadraticCurveTo(420, 150, 500, 80); g.closePath();
      g.fillStyle = lin(g, 420, 0, 580, 0, [[0, '#cdd2d9'], [0.45, '#f4f6f8'], [1, '#b6bcc4']]); g.fill();                                                  // Rumpf
      g.fillStyle = '#1b3a63'; g.fillRect(420, 780, 160, 40); g.fillRect(420, 836, 160, 14);                                                                   // Zierstreifen
      g.beginPath(); g.moveTo(470, 140); g.quadraticCurveTo(500, 110, 530, 140); g.lineTo(522, 190); g.lineTo(478, 190); g.closePath(); g.fillStyle = '#25384d'; g.fill();   // Cockpit
      g.fillStyle = '#6f93b8'; for (let i = 0; i < 18; i++) { g.fillRect(436, 220 + i * 30, 8, 12); g.fillRect(556, 220 + i * 30, 8, 12); }
    },
    Eiffelturm(g) {
      // Gitterturm: vier Beine, Plattformen, immer enger werdend
      g.fillStyle = '#5b4a3c';
      const leg = (x0, x1, y0, y1, w) => { poly(g, [[x0, y0], [x0 + w, y0], [x1 + w * 0.55, y1], [x1, y1]]); g.fill(); };
      const col = lin(g, 0, 50, 0, 900, [[0, '#6e5c4c'], [1, '#3d3128']]);
      g.fillStyle = col;
      poly(g, [[470, 40], [530, 40], [560, 220], [440, 220]]); g.fill();                                  // Spitze
      poly(g, [[440, 220], [560, 220], [600, 470], [400, 470]]); g.fill();                                // Mittelteil
      leg(180, 330, 900, 470, 70); leg(750, 600, 900, 470, 70);
      poly(g, [[400, 470], [600, 470], [630, 560], [370, 560]]); g.fill();
      g.fillStyle = 'rgba(10,8,6,.88)';                                                                   // Zwischenräume: durchsichtiges Gitter
      poly(g, [[470, 230], [530, 230], [548, 460], [452, 460]]); g.fill();
      poly(g, [[440, 600], [560, 600], [610, 890], [390, 890]]); g.fill();
      g.beginPath(); g.moveTo(270, 900); g.quadraticCurveTo(500, 560, 730, 900); g.lineTo(650, 900); g.quadraticCurveTo(500, 700, 350, 900); g.closePath(); g.fill();   // Bogen
      g.strokeStyle = '#8c7762'; g.lineWidth = 7;                                                         // Fachwerk-Streben
      for (let y = 240; y < 460; y += 36) { const k = (y - 220) / 250, hw = 60 + 40 * k; g.beginPath(); g.moveTo(500 - hw * 0.9, y); g.lineTo(500 + hw * 0.9, y + 36); g.moveTo(500 + hw * 0.9, y); g.lineTo(500 - hw * 0.9, y + 36); g.stroke(); }
      for (let y = 580; y < 880; y += 50) { const k = (y - 560) / 340, hw = 120 + 150 * k; g.beginPath(); g.moveTo(500 - hw, y); g.lineTo(500 + hw, y + 50); g.moveTo(500 + hw, y); g.lineTo(500 - hw, y + 50); g.stroke(); }
      g.fillStyle = '#8a7461'; [[395, 475, 210], [365, 560, 270], [440, 220, 120]].forEach(([x, y, w]) => g.fillRect(x, y - 8, w, 16));              // Plattformen
      g.strokeStyle = '#a89580'; g.lineWidth = 9; g.beginPath(); g.moveTo(500, 40); g.lineTo(500, 0); g.stroke();                                   // Antenne
    },
    Kreuzfahrtschiff(g) {
      g.beginPath(); g.moveTo(40, 640); g.lineTo(940, 640); g.lineTo(880, 770); g.lineTo(130, 770); g.closePath(); fillV(g, '#f2f4f6', '#c9ced4', 640, 770);   // Rumpf
      g.beginPath(); g.moveTo(60, 700); g.lineTo(920, 700); g.lineTo(880, 770); g.lineTo(130, 770); g.closePath(); fillV(g, '#1f3a5c', '#0f2038', 700, 770);   // Unterwasserrumpf
      g.fillStyle = '#7a1f1a'; g.fillRect(100, 770, 780, 18);                                                                                                 // Rotes Unterwasserband
      [[130, 560, 700], [190, 480, 580], [250, 410, 460]].forEach(([x, y, w], i) => { rrect(g, x, y, w, 80, 6); fillV(g, '#f7f8fa', '#cbd0d6', y, y + 80); });    // Decks
      for (let d = 0; d < 3; d++) windows(g, [150, 210, 270][d], [592, 512, 442][d], 14, 22, [48, 36, 25][d] > 20 ? [41, 31, 21][d] : 20, 4, '#31465c');
      for (let i = 0; i < 52; i++) { g.fillStyle = '#4a627a'; g.fillRect(70 + i * 16.4, 662, 8, 12); }                                                         // Fensterreihe Rumpf
      rrect(g, 560, 340, 110, 120, 10); fillV(g, '#f4f5f7', '#c5cad0', 340, 460);                                                                              // Aufbau
      g.beginPath(); g.moveTo(600, 340); g.lineTo(610, 230); g.lineTo(670, 230); g.lineTo(680, 340); g.closePath(); fillV(g, '#2a4a6e', '#142a44', 230, 340);    // Schornstein
      g.fillStyle = '#d63b2f'; g.fillRect(610, 232, 60, 26);
      g.strokeStyle = '#d8dce1'; g.lineWidth = 6; g.beginPath(); g.moveTo(920, 640); g.lineTo(780, 420); g.stroke();
    },
    'Empire State Building'(g) {
      // Gestuftes Art-Déco-Hochhaus
      const blocks = [[300, 700, 560, 900], [340, 660, 440, 560], [390, 610, 340, 440], [430, 570, 260, 340], [460, 540, 200, 260]];
      blocks.forEach(([x0, x1, y0, y1]) => { g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = lin(g, x0, 0, x1, 0, [[0, '#c9bfae'], [0.6, '#a79d8c'], [1, '#6f675b']]); g.fill(); });
      g.beginPath(); g.moveTo(475, 200); g.lineTo(500, 130); g.lineTo(525, 200); g.closePath(); g.fillStyle = '#b4aa98'; g.fill();
      g.strokeStyle = '#cfc9bb'; g.lineWidth = 8; g.beginPath(); g.moveTo(500, 140); g.lineTo(500, 20); g.stroke();                                              // Antenne
      g.fillStyle = 'rgba(25,32,44,.75)';
      blocks.forEach(([x0, x1, y0, y1]) => { for (let x = x0 + 14; x < x1 - 20; x += 22) for (let y = y0 + 14; y < y1 - 14; y += 26) g.fillRect(x, y, 10, 14); });  // Fenster
      g.fillStyle = 'rgba(255,255,255,.18)'; blocks.forEach(([x0, x1, y0, y1]) => g.fillRect(x0, y0, 5, y1 - y0));
    },
    'Cheops-Pyramide'(g) {
      // Sandstein-Pyramide mit sichtbaren Steinlagen; linke Seite hell, rechte Seite im Schatten
      poly(g, [[500, 150], [50, 800], [500, 840]]); g.fillStyle = lin(g, 50, 800, 500, 150, [[0, '#d3b27a'], [1, '#e7cd9a']]); g.fill();
      poly(g, [[500, 150], [950, 800], [500, 840]]); g.fillStyle = lin(g, 500, 840, 950, 800, [[0, '#a98655'], [1, '#6b5233']]); g.fill();
      g.strokeStyle = 'rgba(70,50,25,.35)'; g.lineWidth = 3;
      for (let k = 1; k < 18; k++) { const t = k / 18, y = 150 + t * 660, hw = t * 450; g.beginPath(); g.moveTo(500 - hw, y + t * 30 - 0); g.lineTo(500 + hw, y + t * 30 - 0); g.stroke(); }
      for (let k = 0; k < 40; k++) { const y = 200 + (k * 97) % 560, t = (y - 150) / 660, hw = t * 450, x = 500 - hw + ((k * 53) % 100) / 100 * hw * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 26); g.stroke(); }
    }
  };

  /** Liefert die fertige Zeichenfläche für ein Objekt (einmal gemalt, danach aus dem Zwischenspeicher). */
  function get(name) {
    if (!DRAW[name]) return null;
    if (cache[name]) return cache[name];
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    DRAW[name](g);
    // Gesamt-Volumen: oben leicht aufhellen, unten abdunkeln (nur dort, wo schon etwas gezeichnet ist)
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = lin(g, 0, 0, 0, S, [[0, 'rgba(255,255,255,.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,10,.35)']]);
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    return (cache[name] = c);
  }
  return { get, names: Object.keys(DRAW) };
})();
