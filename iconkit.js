// Builds exercise icons on the phone in the same style as the bundled ones: a figure (pose) plus equipment.
const IconKit = (() => {
  const HR = 8.5, TW = 14, AW = 8, LW = 10.5, GAP = 4;
  const ln = (a, b, w) => ['pl', [a, b], w];
  const pl = (pts, w) => ['pl', pts, w];
  const circ = (c, r) => ['c', c, r];
  const ring = (c, r, w) => ['ring', c, r, w];
  const rect = (x, y, w, hh, rx = 2) => ['r', x, y, w, hh, rx];
  function fig(head, sh, hip, arms, legs, front) {
    const s = [circ(head, HR), ln(sh, hip, front ? 18 : TW)];
    arms.forEach((a) => s.push(pl(front ? a : [sh, ...a], AW)));
    legs.forEach((l) => s.push(pl(front ? l : [hip, ...l], LW)));
    return s;
  }
  const db = ([x, y], vertical) => vertical
    ? [ln([x, y - 6], [x, y + 6], 3.5), rect(x - 4.5, y - 8, 9, 4.5, 1.5), rect(x - 4.5, y + 3.5, 9, 4.5, 1.5)]
    : [ln([x - 6, y], [x + 6, y], 3.5), rect(x - 8, y - 4.5, 4.5, 9, 1.5), rect(x + 3.5, y - 4.5, 4.5, 9, 1.5)];
  const kb = ([x, y]) => [circ([x, y + 3], 7), ring([x, y - 5], 4, 3)];
  const bench = (x, y, w) => [rect(x, y, w, 6, 2), ln([x + 5, y + 6], [x + 5, 94], 4), ln([x + w - 5, y + 6], [x + w - 5, 94], 4)];
  const legsFront = [[[45, 56], [43, 74], [42, 92]], [[55, 56], [57, 74], [58, 92]]];
  const POSES = {
    stand: { label: 'Standing', front: true, hands: [[22, 58], [78, 58]],
      fig: () => fig([50, 16], [50, 28], [50, 56], [[[40, 31], [28, 43], [22, 58]], [[60, 31], [72, 43], [78, 58]]], legsFront, true) },
    overhead: { label: 'Overhead', front: true, hands: [[31, 9], [69, 9]],
      fig: () => fig([50, 22], [50, 34], [50, 60], [[[40, 35], [30, 24], [31, 9]], [[60, 35], [70, 24], [69, 9]]], [[[45, 60], [43, 76], [42, 93]], [[55, 60], [57, 76], [58, 93]]], true) },
    curl: { label: 'Curl', front: true, hands: [[33, 34], [67, 34]],
      fig: () => fig([50, 16], [50, 28], [50, 56], [[[41, 30], [36, 46], [33, 34]], [[59, 30], [64, 46], [67, 34]]], legsFront, true) },
    squat: { label: 'Squat', front: true, hands: [[30, 30], [70, 30]],
      fig: () => fig([50, 22], [50, 34], [50, 60], [[[40, 35], [29, 42], [30, 30]], [[60, 35], [71, 42], [70, 30]]], [[[45, 60], [30, 72], [36, 92]], [[55, 60], [70, 72], [64, 92]]], true) },
    seated: { label: 'Seated', hands: [[73, 46]], back: [ln([28, 38], [31, 78], 6), rect(28, 76, 30, 6, 2), ln([43, 82], [43, 94], 4)],
      fig: () => fig([40, 30], [40, 42], [41, 72], [[[56, 45], [73, 46]]], [[[60, 72], [62, 92]]]) },
    lying: { label: 'Lying', hands: [[32, 26]], back: bench(12, 64, 60),
      fig: () => fig([19, 53], [30, 58], [60, 58], [[[32, 43], [32, 26]]], [[[76, 52], [80, 92]]]) },
    bent: { label: 'Bent over', hands: [[60, 68]],
      fig: () => fig([76, 38], [66, 45], [40, 56], [[[58, 56], [60, 68]]], [[[56, 74], [50, 94]]]) },
    hanging: { label: 'Hanging', front: true, hands: [[31, 8], [69, 8]], back: [ln([10, 8], [90, 8], 5)],
      fig: () => fig([50, 22], [50, 33], [50, 60], [[[40, 34], [27, 24], [31, 8]], [[60, 34], [73, 24], [69, 8]]], [[[45, 60], [43, 76], [47, 90]], [[55, 60], [57, 76], [53, 90]]], true) },
  };
  const EQUIP = {
    none: { label: 'None', make: () => ({}) },
    barbell: { label: 'Barbell', make: (p) => p.front
      ? { front: [ln([6, p.hands[0][1]], [94, p.hands[0][1]], 4), rect(4, p.hands[0][1] - 9, 7, 18, 2), rect(89, p.hands[0][1] - 9, 7, 18, 2)] }
      : { back: [circ(p.hands[0][1] > 50 ? [p.hands[0][0] + 5, p.hands[0][1] + 12] : [p.hands[0][0], p.hands[0][1] - 2], 12)] } },
    dumbbells: { label: 'Dumbbells', make: (p) => ({ front: p.hands.flatMap((hd) => db(hd, !p.front && hd[1] > 50)) }) },
    kettlebell: { label: 'Kettlebell', make: (p) => ({ front: kb(p.front ? [50, p.hands[0][1] + 4] : p.hands[0]) }) },
    machine: { label: 'Machine', make: (p) => ({ back: [ln([90, 10], [90, 94], 5), ...p.hands.map((hd) => ln(hd, [90, hd[1] < 20 ? 14 : hd[1] - 4], 4))] }) },
    cable: { label: 'Cable', make: (p) => ({ back: [rect(86, 4, 8, 90, 2), ...p.hands.slice(-1).map((hd) => ln([86, hd[1] > 50 && !p.front ? 80 : 14], hd, 2.5))] }) },
  };
  const num = (n) => +n.toFixed(2);
  function shape(s, extra = 0, color = '#000') {
    const [k] = s;
    if (k === 'pl') return `<polyline points="${s[1].map(([x, y]) => `${num(x)},${num(y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${num(s[2] + extra)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (k === 'c') return `<circle cx="${num(s[1][0])}" cy="${num(s[1][1])}" r="${num(s[2] + extra / 2)}" fill="${color}"/>`;
    if (k === 'ring') return `<circle cx="${num(s[1][0])}" cy="${num(s[1][1])}" r="${num(s[2])}" fill="none" stroke="${color}" stroke-width="${num(s[3] + extra)}"/>`;
    const [, x, y, w, hh, rx] = s, e = extra / 2;
    return `<rect x="${num(x - e)}" y="${num(y - e)}" width="${num(w + extra)}" height="${num(hh + extra)}" rx="${num(rx + e)}" fill="${color}"/>`;
  }
  function svg(pose, equip) {
    const p = POSES[pose] || POSES.stand;
    const eq = (EQUIP[equip] || EQUIP.none).make(p);
    const figs = p.fig(), front = eq.front || [], back = [...(p.back || []), ...(eq.back || [])];
    const halo = [...figs, ...front].map((s) => shape(s, GAP * 2)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><mask id="m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><rect x="-10" y="-10" width="120" height="120" fill="#fff"/>${halo}</mask><g mask="url(#m)">${back.map((s) => shape(s)).join('')}</g>${figs.map((s) => shape(s)).join('')}${front.map((s) => shape(s)).join('')}</svg>`;
  }
  const url = (pose, equip) => `data:image/svg+xml,${encodeURIComponent(svg(pose, equip)).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27')}`;
  function guess(name) {
    const n = ` ${(name || '').toLowerCase()} `;
    const pose = /pull ?-?up|chin ?-?up|hang/.test(n) ? 'hanging'
      : /bench|lying|skull|floor press|chest press(?!.*machine)/.test(n) && !/seated|machine/.test(n) ? 'lying'
      : /row|bent|deadlift|rdl|good ?morning/.test(n) && !/seated|upright/.test(n) ? 'bent'
      : /squat|lunge|leg day/.test(n) ? 'squat'
      : /overhead|shoulder press|military|ohp|jerk|snatch/.test(n) ? 'overhead'
      : /curl|upright row|shrug/.test(n) && !/leg curl/.test(n) ? 'curl'
      : /seated|machine|leg press|extension|pec deck|leg curl|chest press|pulldown|lat pull/.test(n) ? 'seated' : 'stand';
    const equip = /dumbbell|\bdb\b/.test(n) ? 'dumbbells'
      : /kettlebell|\bkb\b/.test(n) ? 'kettlebell'
      : /cable|pulldown|pushdown|face pull|crossover/.test(n) ? 'cable'
      : /machine|smith|leg press|extension|pec deck|leg curl|hack/.test(n) ? 'machine'
      : /barbell|\bbb\b|bench|deadlift|squat|ez bar|military|ohp|clean|row/.test(n) ? 'barbell' : 'none';
    return { pose, equip };
  }
  return { POSES, EQUIP, svg, url, guess };
})();
