'use strict';
// ตัวละครบอกสถานะเงิน เป็น SVG + CSS ล้วน (แอนิเมชันอยู่ใน styles.css)
// ต้นไม้ใช้จำนวนใบตามงบ ตัวอื่นใช้อารมณ์ good / ok / bad จาก Calc.moodOf
const BUDDIES = [
  ['tree', 'ต้นไม้'],
  ['person', 'คนกับอากาศ'],
  ['cat', 'แมว'],
  ['dog', 'หมา'],
];

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
  const d = { good: `M${x - 5} ${y}Q${x} ${y + 6} ${x + 5} ${y}`, ok: `M${x - 4} ${y + 1}Q${x} ${y + 3} ${x + 4} ${y + 1}`, bad: `M${x - 4.5} ${y + 3}Q${x} ${y - 2} ${x + 4.5} ${y + 3}` }[mood];
  return `<path class="b-line thin" d="${d}" style="stroke:${INK}"/>`;
};
const cheeks = (a, b, y) => `<ellipse cx="${a}" cy="${y}" rx="4" ry="2.6" fill="#ff9aa6" opacity=".6"/><ellipse cx="${b}" cy="${y}" rx="4" ry="2.6" fill="#ff9aa6" opacity=".6"/>`;
const tear = (x, y) => `<path class="b-tear" d="M${x} ${y}C${x + 3} ${y + 5} ${x + 2.4} ${y + 8} ${x} ${y + 8}C${x - 2.4} ${y + 8} ${x - 3} ${y + 5} ${x} ${y}Z" fill="#6fb6f2"/>`;
const HEART = 'M0 2C-1-2-6-2-6 1.5C-6 5-2 7 0 9C2 7 6 5 6 1.5C6-2 1-2 0 2Z';
const hearts = (a, b) => `<g transform="translate(${a[0]} ${a[1]})"><path class="b-heart" d="${HEART}" fill="#ff7a9c"/></g><g transform="translate(${b[0]} ${b[1]}) scale(.75)"><path class="b-heart h2" d="${HEART}" fill="#ff7a9c"/></g>`;

/* ---------- ต้นไม้: พุ่มเป็นก้อนกลม ลำต้นมีหน้าตาตามอารมณ์ ---------- */
// เรียงตามลำดับที่เหลืออยู่นานที่สุดก่อน ก้อนเล็กที่ปลายกิ่งจึงเป็นก้อนท้าย ๆ ที่ร่วง
const PUFFS = [
  [73, 36, 10], [27, 38, 10], [50, 19, 11], [38, 15, 13], [62, 15, 13], [29, 30, 15], [71, 30, 15], [50, 28, 19],
  [17, 42, 11], [83, 42, 11], [37, 45, 13], [63, 45, 13], [50, 44, 13], [21, 23, 11], [79, 23, 11],
];
const LEAF = 'M0-5C3.4-3 3.4 2 0 5C-3.4 2-3.4-3 0-5Z';

function treeArt(mood, leaves) {
  const id = `shade${uid += 1}`;
  const count = Math.max(1, Math.round(PUFFS.length * leaves));
  const puffs = PUFFS.slice(0, count)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p[1] - b.p[1]) // ก้อนล่างอยู่หน้า
    .map(({ p: [x, y, r], i }) => `<g class="t-leaves t${i % 3}"><circle cx="${x}" cy="${y}" r="${r}" class="l${i % 3}"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id})"/></g>`)
    .join('');
  const shine = count >= 5 ? gloss(38, 11, 4.6, 2.5) : '';
  const falling = [[20, 54], [80, 52], [72, 58]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><path class="fall f${i} l${i}" d="${LEAF}"/></g>`).join('');
  return `${SHADE_DEFS(id)}<ellipse class="b-ground" cx="50" cy="96" rx="24" ry="2.8"/>
    <g class="t-all">
      <path class="t-branch" d="M46 62C38 54 32 46 26 38M54 62C62 54 68 46 74 36M50 56V22"/>
      ${solid('path', 'd="M38 62C38 54 62 54 62 62C62 76 63 86 68 94C69 96 67 97 65 97H35C33 97 31 96 32 94C37 86 38 76 38 62Z"', '#a9784f', id)}
      ${puffs}
      ${shine}
      ${mood === 'good' ? cheeks(41, 59, 80) : ''}
      ${eyes(mood, 44, 56, 75)}
      ${mood === 'bad' ? browsSad(44, 56, 69) : ''}
      ${mouthAt(mood, 50, 80)}
      ${mood === 'bad' ? tear(41, 78) : ''}
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
    <g class="b-all ${mood === 'bad' ? 'droop' : ''}">
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
    ${umbrella}`;
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
      ${mood === 'good' ? cheeks(31, 69, 58) : ''}
      ${eyes(mood, 38, 62, 50)}
      ${mood === 'bad' ? browsSad(38, 62, 43) : ''}
      <path d="M47.5 55.5H52.5L50 58.5Z" fill="#e8747c"/>
      ${mouthAt(mood, 50, 60)}
      ${mood === 'bad' ? tear(31, 55) : ''}
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
      ${mood === 'good' ? cheeks(32, 68, 58) : ''}
      ${eyes(mood, 39, 61, 48)}
      ${mood === 'bad' ? browsSad(39, 61, 41) : ''}
      <ellipse cx="50" cy="56" rx="4" ry="3" fill="${INK}"/>
      ${mood === 'good' ? '<path class="b-tongue" d="M46 64.5H54V68.5A4 4 0 0 1 46 68.5Z" fill="#ff8a9d"/>' : ''}
      ${mouthAt(mood, 50, 61)}
      ${mood === 'bad' ? tear(32, 53) : ''}
    </g>`;
}

const BUDDY_ART = { person: personArt, cat: catArt, dog: dogArt };

function renderBuddy(kind, leaves) {
  const mood = Calc.moodOf(leaves);
  const art = BUDDY_ART[kind] ? BUDDY_ART[kind](mood) : treeArt(mood, leaves);
  return `<span class="buddy ${mood}" data-buddy aria-hidden="true"><svg viewBox="0 0 100 100">${art}</svg></span>`;
}
