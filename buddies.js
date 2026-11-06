'use strict';
// ตัวละครบอกสถานะเงิน เป็น SVG + CSS ล้วน (แอนิเมชันอยู่ใน styles.css)
// ต้นไม้ใช้จำนวนใบตามงบ ตัวอื่นใช้อารมณ์ good / ok / bad จาก Calc.budgetSummary
const BUDDIES = ['tree', 'person', 'cat', 'dog'];

/* ---------- สไตล์ดินปั้น 3D: ลงสีพื้นก่อน แล้วซ้อนแสงเงาตามรูปทรง ---------- */
const INK = '#2a2230';
let uid = 0;
const SHADE_DEFS = (id) => `<defs><radialGradient id="${id}" cx=".36" cy=".26" r=".85">
  <stop offset="0" stop-color="#fff" stop-opacity=".46"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
  <stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/>
</radialGradient></defs>`;
const solid = (tag, attrs, color, shade) => `<${tag} ${attrs} style="fill:${color}"/><${tag} ${attrs} fill="url(#${shade})"/>`;
const gloss = (x, y, rx = 6, ry = 3.4) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-18 ${x} ${y})" fill="#fff" opacity=".42"/>`;

function eyes(mood, lx, rx, y) {
  if (mood === 'good') {
    return `<path class="b-line" d="M${lx - 4.5} ${y + 1}Q${lx} ${y - 5} ${lx + 4.5} ${y + 1}M${rx - 4.5} ${y + 1}Q${rx} ${y - 5} ${rx + 4.5} ${y + 1}" style="stroke:${INK}"/>`;
  }
  const pupil = (x) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${INK}"/><circle cx="${x + 1.1}" cy="${y - 1.2}" r="1.1" fill="#fff"/>`;
  return `<g class="b-eyes" style="transform-origin:50px ${y}px">${pupil(lx)}${pupil(rx)}</g>`;
}
const browsSad = (lx, rx, y) => `<path class="b-line thin" d="M${lx - 5} ${y}L${lx + 3} ${y - 3}M${rx + 5} ${y}L${rx - 3} ${y - 3}" style="stroke:${INK}"/>`;
const mouthAt = (mood, x, y) => {
  const d = { good: `M${x - 5} ${y}Q${x} ${y + 6} ${x + 5} ${y}`, ok: `M${x - 4} ${y + 1.5}H${x + 4}`, bad: `M${x - 4.5} ${y + 3}Q${x} ${y - 2} ${x + 4.5} ${y + 3}` }[mood];
  return `<path class="b-line thin" d="${d}" style="stroke:${INK}"/>`;
};
const cheeks = (a, b, y) => `<ellipse cx="${a}" cy="${y}" rx="4" ry="2.6" fill="#ff9aa6" opacity=".6"/><ellipse cx="${b}" cy="${y}" rx="4" ry="2.6" fill="#ff9aa6" opacity=".6"/>`;
const tear = (x, y) => `<path class="b-tear" d="M${x} ${y}C${x + 3} ${y + 5} ${x + 2.4} ${y + 8} ${x} ${y + 8}C${x - 2.4} ${y + 8} ${x - 3} ${y + 5} ${x} ${y}Z" fill="#6fb6f2"/>`;
// หน้าเคลิ้มตอนถูกแตะ: ซ่อนอยู่จนกว่า .buddy จะมีคลาส bliss
const bliss = (lx, rx, y, mx, my, cl, cr, cy) => `<g class="b-bliss">
  <path class="b-line" d="M${lx - 5} ${y - 1}Q${lx} ${y + 3.5} ${lx + 5} ${y - 1}M${rx - 5} ${y - 1}Q${rx} ${y + 3.5} ${rx + 5} ${y - 1}" style="stroke:${INK}"/>
  <path class="b-line thin" d="M${mx - 4} ${my}Q${mx - 2} ${my + 3} ${mx} ${my}Q${mx + 2} ${my + 3} ${mx + 4} ${my}" style="stroke:${INK}"/>
  <ellipse cx="${cl}" cy="${cy}" rx="5.5" ry="3.4" fill="#ff8f9c" opacity=".78"/><ellipse cx="${cr}" cy="${cy}" rx="5.5" ry="3.4" fill="#ff8f9c" opacity=".78"/>
</g>`;
const HEART = 'M0 2C-1-2-6-2-6 1.5C-6 5-2 7 0 9C2 7 6 5 6 1.5C6-2 1-2 0 2Z';
const hearts = (a, b) => `<g transform="translate(${a[0]} ${a[1]})"><path class="b-heart" d="${HEART}" fill="#ff7a9c"/></g><g transform="translate(${b[0]} ${b[1]}) scale(.75)"><path class="b-heart h2" d="${HEART}" fill="#ff7a9c"/></g>`;

/* ---------- ต้นไม้: ทรงเดิม เติมมิติด้วยแสงเงาที่ใบ ลำต้น และทั้งพุ่ม ---------- */
const LEAF = 'M0-5.6C3.8-3.2 3.8 2.2 0 5.6C-3.8 2.2-3.8-3.2 0-5.6Z';
const LEAF_COUNT = 72;
// จัดใบแบบเกลียวให้กระจายทั่วพุ่ม และสลับลำดับเพื่อให้ใบที่หายไปกระจายทั่วต้น
// tone: ด้านล่างขวาของพุ่มเข้ม ด้านบนซ้ายสว่าง เหมือนแสงส่องทรงกลม
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, n) => {
  const i = (n * 29) % LEAF_COUNT;
  const r = Math.sqrt((i + 0.5) / LEAF_COUNT);
  const t = i * 2.39996;
  const dx = r * Math.cos(t), dy = r * Math.sin(t);
  const light = dx * 0.5 + dy * 0.85;
  return { x: 50 + dx * 38, y: 37 + dy * 30, a: Math.round(i * 47) % 360, tone: light > 0.22 ? 0 : light > -0.3 ? 1 : 2 };
});
const leafGradient = (id, stops) => `<radialGradient id="${id}" cx=".38" cy=".3" r=".8">${stops.map(([at, mix]) => `<stop offset="${at}" style="stop-color:${mix}"/>`).join('')}</radialGradient>`;
const leafMix = (pct, other) => `color-mix(in srgb, var(--leaf) ${pct}%, ${other})`;

function treeArt(leaves) {
  const id = `shade${uid += 1}`;
  const shown = LEAVES.slice(0, Math.max(5, Math.round(LEAF_COUNT * leaves)));
  const tones = [
    leafGradient(`${id}t0`, [[0, leafMix(92, '#fff')], [0.55, leafMix(80, '#000')], [1, leafMix(60, '#000')]]),
    leafGradient(`${id}t1`, [[0, leafMix(68, '#fff')], [0.55, 'var(--leaf)'], [1, leafMix(82, '#000')]]),
    leafGradient(`${id}t2`, [[0, leafMix(36, '#fff')], [0.55, leafMix(72, '#fff')], [1, 'var(--leaf)']]),
  ].join('');
  // ชั้นมืดอยู่หลัง ชั้นสว่างอยู่หน้า แต่ละชั้นไหวไม่พร้อมกัน
  const layers = [0, 1, 2].map((tone) => `<g class="t-leaves t${tone}">${shown.filter((l) => l.tone === tone)
    .map((l) => `<path d="${LEAF}" fill="url(#${id}t${tone})" transform="translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.a})"/>`).join('')}</g>`).join('');
  const falling = [[66, 52], [38, 56], [74, 44]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><path class="fall f${i}" d="${LEAF}" fill="url(#${id}t${i})"/></g>`).join('');
  return `${SHADE_DEFS(id)}<defs>${tones}</defs><ellipse class="b-ground" cx="50" cy="96" rx="20" ry="2.6"/>
    <g class="t-all">
      <path class="t-branch" d="M50 70C42 62 36 54 28 46M50 62C58 54 64 48 72 40M50 52C47 44 45 36 44 26"/>
      ${solid('path', 'd="M43.5 96C46.5 84 47 62 48.2 44H51.8C53 62 53.5 84 56.5 96Z"', '#a9784f', id)}
      ${layers}
    </g>
    ${falling}`;
}

/* ---------- คนกับอากาศ: ตัวกลมก้อนเดียว ---------- */
const CLOUD = (x, y, fill, cls = '') => `<path class="${cls}" d="M${x} ${y}a7 7 0 0 1 7-7a9 9 0 0 1 16-3a7.5 7.5 0 0 1 11 6a5 5 0 0 1 1 10H${x + 3}a6 6 0 0 1-3-6z" fill="${fill}"/>`;
const SUN = (x, y) => {
  const rays = Array.from({ length: 8 }, (_, i) => `<path d="M${x} ${y - 13}V${y - 17.5}" transform="rotate(${i * 45} ${x} ${y})"/>`).join('');
  return `<g class="b-rays" style="transform-origin:${x}px ${y}px" stroke="#f6b73c" stroke-width="2.6" stroke-linecap="round">${rays}</g><circle cx="${x}" cy="${y}" r="10" fill="#f9c83f"/>`;
};
function personArt(mood) {
  const id = `shade${uid += 1}`;
  const sky = {
    good: SUN(82, 20),
    ok: `${SUN(80, 18)}${CLOUD(52, 22, 'color-mix(in srgb, #fff 88%, var(--accent))', 'b-drift')}`,
    bad: `${CLOUD(26, 11, '#8c94a6')}${[[10, 34], [18, 54], [90, 38], [84, 58], [32, 16], [50, 15], [70, 16]].map(([x, y], i) => `<path class="b-rain r${i % 3}" d="M${x} ${y}l-1.6 6" stroke="#6fa8e6" stroke-width="2" stroke-linecap="round"/>`).join('')}`,
  }[mood];
  const umbrella = mood === 'bad' ? `<g transform="rotate(-14 66 78)">
      <path d="M66 78V32" stroke="#5d5560" stroke-width="2.4" stroke-linecap="round"/>
      ${solid('path', 'd="M36 34Q66 8 96 34Q88.5 29 81 34Q73.5 29 66 34Q58.5 29 51 34Q43.5 29 36 34Z"', 'var(--umbrella)', id)}
    </g>` : '';
  const body = 'x="30" y="38" width="40" height="52" rx="20"';
  return `${SHADE_DEFS(id)}${sky}<ellipse class="b-ground" cx="50" cy="96" rx="20" ry="2.6"/>
    <g class="b-person"><g class="b-all ${mood === 'bad' ? 'droop' : ''}">
      <path d="M41 88V94M59 88V94" style="stroke:var(--pants)" stroke-width="5.5" stroke-linecap="round"/>
      <rect ${body} fill="#f6cfa8"/>
      <path d="M30 60C30 44 38 38 50 38C62 38 70 44 70 60C64 50 56 48 48 50C40 51 34 54 30 60Z" fill="#4a3528"/>
      <path d="M30 74H70V70V78C70 84 62 90 50 90C38 90 30 84 30 78Z" style="fill:var(--shirt)"/>
      <rect ${body} fill="url(#${id})"/>
      ${gloss(39, 44, 5, 2.6)}
      ${mood === 'good' ? cheeks(36, 64, 66) : ''}
      ${eyes(mood, 41, 59, 62)}
      ${mood === 'bad' ? browsSad(41, 59, 56) : ''}
      ${mouthAt(mood, 50, 67)}
    </g>
    ${umbrella}</g>`;
}

/* ---------- แมว ---------- */
function catArt(mood) {
  const id = `shade${uid += 1}`, clip = `clip${uid}`;
  const fur = 'var(--cat-fur)';
  const ear = 'd="M26 38L27 13L46 28Z"', ear2 = 'd="M74 38L73 13L54 28Z"';
  const tilt = mood === 'bad' ? ['rotate(-12 32 34)', 'rotate(12 68 34)'] : ['', ''];
  const head = 'cx="50" cy="50" rx="28" ry="24"';
  return `${SHADE_DEFS(id)}${mood === 'good' ? hearts([84, 24], [13, 28]) : ''}<ellipse class="b-ground" cx="50" cy="97" rx="24" ry="2.6"/>
    <path class="b-tail" d="M66 84Q88 82 83 62" fill="none" style="stroke:var(--cat-fur2)" stroke-width="7" stroke-linecap="round"/>
    <g class="b-all ${mood === 'bad' ? 'droop' : ''}">
      ${solid('ellipse', 'cx="50" cy="82" rx="21" ry="14"', fur, id)}
      <g transform="${tilt[0]}"><path ${ear} style="fill:${fur}"/><path ${ear} style="fill:var(--cat-patchA)"/><path d="M31 33L31.5 21L40 28.5Z" style="fill:var(--cat-inner)"/><path ${ear} fill="url(#${id})"/></g>
      <g transform="${tilt[1]}"><path ${ear2} style="fill:${fur}"/><path d="M69 33L68.5 21L60 28.5Z" style="fill:var(--cat-inner)"/><path ${ear2} fill="url(#${id})"/></g>
      <ellipse ${head} style="fill:${fur}"/>
      <clipPath id="${clip}"><ellipse ${head}/></clipPath>
      <g clip-path="url(#${clip})"><ellipse cx="30" cy="36" rx="17" ry="14" style="fill:var(--cat-patchA)"/><ellipse cx="74" cy="39" rx="14" ry="12" style="fill:var(--cat-patchB)"/></g>
      <ellipse ${head} fill="url(#${id})"/>
      ${gloss(39, 36)}
      <path d="M47.5 55.5H52.5L50 58.5Z" fill="#e8747c"/>
      <g class="b-face">
        ${mood === 'good' ? cheeks(31, 69, 58) : ''}
        ${eyes(mood, 38, 62, 50)}
        ${mood === 'bad' ? browsSad(38, 62, 43) : ''}
        ${mouthAt(mood, 50, 60)}
        ${mood === 'bad' ? tear(31, 55) : ''}
      </g>
      ${bliss(38, 62, 50, 50, 60, 31, 69, 58)}
    </g>`;
}

/* ---------- หมา ---------- */
function dogArt(mood) {
  const id = `shade${uid += 1}`;
  const fur = 'var(--dog-fur)', ear = 'var(--dog-fur2)';
  const tilt = mood === 'bad' ? ['rotate(-14 26 34)', 'rotate(14 74 34)'] : ['', ''];
  return `${SHADE_DEFS(id)}${mood === 'good' ? hearts([88, 22], [12, 20]) : ''}<ellipse class="b-ground" cx="50" cy="97" rx="24" ry="2.6"/>
    <path class="b-tail" d="M68 84Q86 82 83 66" fill="none" style="stroke:${ear}" stroke-width="7" stroke-linecap="round"/>
    <g class="b-all ${mood === 'bad' ? 'droop' : ''}">
      ${solid('ellipse', 'cx="50" cy="82" rx="21" ry="14"', fur, id)}
      <ellipse cx="50" cy="50" rx="27" ry="25" style="fill:${fur}"/>
      <path d="M57 32C66 32 73 40 72 52C66 54 58 50 57 42Z" style="fill:var(--dog-patchA)"/>
      <ellipse cx="50" cy="50" rx="27" ry="25" fill="url(#${id})"/>
      ${gloss(40, 35)}
      <g transform="${tilt[0]}">${solid('path', 'd="M28 30Q10 30 12 54Q22 60 28 48Z"', ear, id)}</g>
      <g transform="${tilt[1]}">${solid('path', 'd="M72 30Q90 30 88 54Q78 60 72 48Z"', ear, id)}</g>
      <ellipse cx="50" cy="56" rx="4" ry="3" fill="${INK}"/>
      <g class="b-face">
        ${mood === 'good' ? cheeks(32, 68, 58) : ''}
        ${eyes(mood, 39, 61, 48)}
        ${mood === 'bad' ? browsSad(39, 61, 41) : ''}
        ${mood === 'good' ? '<path class="b-tongue" d="M46 64.5H54V68.5A4 4 0 0 1 46 68.5Z" fill="#ff8a9d"/>' : ''}
        ${mouthAt(mood, 50, 61)}
        ${mood === 'bad' ? tear(32, 53) : ''}
      </g>
      ${bliss(39, 61, 48, 50, 61, 32, 68, 58)}
    </g>`;
}

const BUDDY_ART = { person: personArt, cat: catArt, dog: dogArt };

function renderBuddy(kind, leaves, mood) {
  const art = BUDDY_ART[kind] ? BUDDY_ART[kind](mood) : treeArt(leaves);
  return `<span class="buddy ${mood}" data-buddy="${BUDDY_ART[kind] ? kind : 'tree'}" aria-hidden="true"><svg viewBox="0 0 100 100">${art}</svg></span>`;
}

// แตะต้นไม้: ใบร่วงเพิ่มขึ้นชั่วครู่ แล้วจางหมดก่อนถึงโคนต้น
function burstLeaves(el) {
  const svg = el.querySelector('svg');
  const fill = svg.querySelector('.fall')?.getAttribute('fill');
  if (!fill) return;
  const shown = [...svg.querySelectorAll('.t-leaves path')];
  const picks = Array.from({ length: Math.min(9, shown.length) }, () => shown[Math.floor(Math.random() * shown.length)]);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.innerHTML = picks.map((p, i) => {
    const [, x, y] = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(p.getAttribute('transform')) || [];
    return `<g transform="translate(${x} ${y})"><path class="t-burst" d="${LEAF}" fill="${p.getAttribute('fill')}" style="--dx:${(Math.random() * 12 - 6).toFixed(1)}px;--dy:${(22 + Math.random() * 12).toFixed(1)}px;animation-delay:${(i * 0.07).toFixed(2)}s"/></g>`;
  }).join('');
  svg.appendChild(g);
  setTimeout(() => g.remove(), 2000);
}
