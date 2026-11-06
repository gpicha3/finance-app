'use strict';
// ตัวละครบอกสถานะเงิน เป็น SVG + CSS ล้วน (แอนิเมชันอยู่ใน styles.css)
// ต้นไม้ใช้จำนวนใบตามงบ ตัวอื่นใช้อารมณ์ good / ok / bad จาก Calc.moodOf
const BUDDIES = [
  ['tree', 'ต้นไม้'],
  ['person', 'คนกับอากาศ'],
  ['cat', 'แมว'],
  ['dog', 'หมา'],
];

/* ---------- ต้นไม้ ---------- */
const LEAF = 'M0-5C3.4-3 3.4 2 0 5C-3.4 2-3.4-3 0-5Z';
const LEAF_COUNT = 72;
// จัดใบแบบเกลียวให้กระจายทั่วพุ่ม และสลับลำดับเพื่อให้ใบที่หายไปกระจายทั่วต้น
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, n) => {
  const i = (n * 29) % LEAF_COUNT;
  const r = Math.sqrt((i + 0.5) / LEAF_COUNT);
  const t = i * 2.39996;
  return { x: 50 + r * 38 * Math.cos(t), y: 37 + r * 30 * Math.sin(t), a: Math.round(i * 47) % 360 };
});

function treeArt(leaves) {
  const shown = LEAVES.slice(0, Math.max(5, Math.round(LEAF_COUNT * leaves)));
  const groups = [0, 1, 2].map((g) => `<g class="t-leaves t${g}">${shown.map((l, i) => (i % 3 === g
    ? `<path class="l${(i % 4) % 3}" d="${LEAF}" transform="translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.a})"/>` : '')).join('')}</g>`).join('');
  const falling = [[66, 52], [38, 56], [74, 44]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><path class="fall f${i} l${i}" d="${LEAF}"/></g>`).join('');
  return `<ellipse class="b-ground" cx="50" cy="96" rx="20" ry="2.6"/>
    <g class="t-all">
      <path class="t-trunk" d="M50 96C50 80 49 66 50 44"/>
      <path class="t-branch" d="M50 70C42 62 36 54 28 46M50 62C58 54 64 48 72 40M50 52C47 44 45 36 44 26"/>
      ${groups}
    </g>
    ${falling}`;
}

/* ---------- ส่วนหน้าที่ใช้ร่วมกัน ---------- */
const SKIN_INK = '#2a2230';
function eyes(mood, lx, rx, y, ink = SKIN_INK, glint = '#fff') {
  if (mood === 'good') {
    return `<path class="b-line" d="M${lx - 5} ${y + 1}Q${lx} ${y - 6} ${lx + 5} ${y + 1}M${rx - 5} ${y + 1}Q${rx} ${y - 6} ${rx + 5} ${y + 1}" style="stroke:${ink}"/>`;
  }
  const r = mood === 'bad' ? 5.4 : 4.2;
  const pupil = (x) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r + 0.8}" style="fill:${ink}"/><circle cx="${x + 1.6}" cy="${y - 1.8}" r="${mood === 'bad' ? 2 : 1.3}" style="fill:${glint}"/>${mood === 'bad' ? `<circle cx="${x - 1.6}" cy="${y + 2}" r="1" style="fill:${glint}"/>` : ''}`;
  return `<g class="b-eyes" style="transform-origin:50px ${y}px">${pupil(lx)}${pupil(rx)}</g>`;
}
const browsSad = (lx, rx, y, ink = SKIN_INK) => `<path class="b-line thin" d="M${lx - 5} ${y}L${lx + 4} ${y - 4}M${rx + 5} ${y}L${rx - 4} ${y - 4}" style="stroke:${ink}"/>`;
const tear = (x, y) => `<path class="b-tear" d="M${x} ${y}C${x + 3.4} ${y + 5} ${x + 2.6} ${y + 8} ${x} ${y + 8}C${x - 2.6} ${y + 8} ${x - 3.4} ${y + 5} ${x} ${y}Z" fill="#6fb6f2"/>`;
const HEART = 'M0 2C-1-2-6-2-6 1.5C-6 5-2 7 0 9C2 7 6 5 6 1.5C6-2 1-2 0 2Z';
const hearts = (a, b) => `<g transform="translate(${a[0]} ${a[1]})"><path class="b-heart" d="${HEART}" fill="#ff7a9c"/></g><g transform="translate(${b[0]} ${b[1]}) scale(.75)"><path class="b-heart h2" d="${HEART}" fill="#ff7a9c"/></g>`;

/* ---------- คนกับอากาศ ---------- */
const CLOUD = (x, y, fill, cls = '') => `<path class="${cls}" d="M${x} ${y}a7 7 0 0 1 7-7a9 9 0 0 1 16-3a7.5 7.5 0 0 1 11 6a5 5 0 0 1 1 10H${x + 3}a6 6 0 0 1-3-6z" fill="${fill}"/>`;
const SUN = (x, y) => {
  const rays = Array.from({ length: 8 }, (_, i) => `<path d="M${x} ${y - 13}V${y - 17.5}" transform="rotate(${i * 45} ${x} ${y})"/>`).join('');
  return `<g class="b-rays" style="transform-origin:${x}px ${y}px" stroke="#f6b73c" stroke-width="2.6" stroke-linecap="round">${rays}</g><circle cx="${x}" cy="${y}" r="10" fill="#f9c83f"/>`;
};
function personArt(mood) {
  const sky = {
    good: SUN(82, 20),
    ok: `${SUN(80, 18)}${CLOUD(52, 22, 'color-mix(in srgb, #fff 88%, var(--accent))', 'b-drift')}`,
    bad: `${CLOUD(26, 11, '#8c94a6')}${[[10, 34], [18, 54], [90, 38], [84, 58], [32, 16], [50, 15], [70, 16]].map(([x, y], i) => `<path class="b-rain r${i % 3}" d="M${x} ${y}l-1.6 6" stroke="#6fa8e6" stroke-width="2" stroke-linecap="round"/>`).join('')}`,
  }[mood];
  const umbrella = mood === 'bad' ? `<g transform="rotate(-14 67 78)">
      <path d="M67 78V30" stroke="#5d5560" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M37 33Q67 5 97 33Q89.5 28 82 33Q74.5 28 67 33Q59.5 28 52 33Q44.5 28 37 33Z" style="fill:var(--umbrella)"/>
    </g>` : '';
  const arms = {
    good: '<path class="b-arm-l b-limb" d="M40 71Q28 66 25 54"/><path class="b-arm-r b-limb" d="M60 71Q72 66 75 54"/>',
    ok: '<path class="b-limb" d="M40 71Q32 76 33 85"/><path class="b-limb" d="M60 71Q68 76 67 85"/>',
    bad: '<path class="b-limb" d="M40 71Q33 77 35 86"/><path class="b-limb" d="M60 71Q66 74 67 69"/>',
  }[mood];
  const mouth = { good: 'M44 59Q50 67 56 59', ok: 'M45 60Q50 63 55 60', bad: 'M45 63Q50 58 55 63' }[mood];
  return `${sky}<ellipse class="b-ground" cx="50" cy="96" rx="18" ry="2.4"/>
    <g class="b-all ${mood === 'bad' ? 'droop' : ''}">
      <path d="M44 84V93M56 84V93" style="stroke:var(--pants)" stroke-width="5" stroke-linecap="round"/>
      <rect x="38" y="66" width="24" height="22" rx="10" style="fill:var(--shirt)"/>
      ${arms}
      <circle cx="50" cy="53" r="14" fill="#f6cfa8"/>
      <path d="M36 52C35 37 65 37 64 52C60 46 54 44 48 45C44 46 39 47 36 52Z" fill="#4a3528"/>
      ${mood === 'good' ? '<ellipse cx="40" cy="58" rx="3" ry="2" fill="#ff9d9d" opacity=".7"/><ellipse cx="60" cy="58" rx="3" ry="2" fill="#ff9d9d" opacity=".7"/>' : ''}
      ${eyes(mood === 'bad' ? 'ok' : mood, 44, 56, 53)}
      ${mood === 'bad' ? browsSad(44, 56, 48) : ''}
      <path class="b-line thin" d="${mouth}" style="stroke:${SKIN_INK}"/>
    </g>
    ${umbrella}`;
}

/* ---------- แมว ---------- */
let clipId = 0;
function catArt(mood) {
  const fur = 'var(--cat-fur)', fur2 = 'var(--cat-fur2)', ink = 'var(--cat-ink)', glint = 'var(--cat-glint)';
  const ear = mood === 'bad' ? ['rotate(-22 34 34)', 'rotate(22 66 34)'] : ['', ''];
  const mouth = { good: 'M43 61Q47 69 50 62Q53 69 57 61', ok: 'M45 62Q48 65 50 62Q52 65 55 62', bad: 'M44 67Q50 61 56 67' }[mood];
  clipId += 1;
  return `${mood === 'good' ? hearts([84, 26], [14, 30]) : ''}<ellipse class="b-ground" cx="50" cy="97" rx="24" ry="2.4"/>
    <path class="b-tail" d="M70 86Q90 84 85 64" fill="none" style="stroke:${fur2}" stroke-width="7" stroke-linecap="round"/>
    <g class="b-all ${mood === 'bad' ? 'droop' : ''}">
      <ellipse cx="50" cy="83" rx="23" ry="14" style="fill:${fur}"/>
      <ellipse cx="50" cy="86" rx="11" ry="9" style="fill:var(--cat-belly)"/>
      <g transform="${ear[0]}"><path d="M25 40L27 12L47 29Z" style="fill:${fur}"/><path d="M25 40L27 12L47 29Z" style="fill:var(--cat-patchA)"/><path d="M30 34L31 20L41 29Z" style="fill:var(--cat-inner)"/></g>
      <g transform="${ear[1]}"><path d="M75 40L73 12L53 29Z" style="fill:${fur}"/><path d="M70 34L69 20L59 29Z" style="fill:var(--cat-inner)"/></g>
      <ellipse cx="50" cy="52" rx="29" ry="24" style="fill:${fur}"/>
      <clipPath id="catHead${clipId}"><ellipse cx="50" cy="52" rx="29" ry="24"/></clipPath>
      <g clip-path="url(#catHead${clipId})"><ellipse cx="29" cy="39" rx="17" ry="15" style="fill:var(--cat-patchA)"/><ellipse cx="74" cy="42" rx="15" ry="13" style="fill:var(--cat-patchB)"/></g>
      <path class="b-line thin" d="M50 30V37M42 31L43.5 37M58 31L56.5 37" style="stroke:${fur2}"/>
      ${mood === 'good' ? '<ellipse cx="32" cy="60" rx="4.5" ry="3" fill="#ff8f8f" opacity=".6"/><ellipse cx="68" cy="60" rx="4.5" ry="3" fill="#ff8f8f" opacity=".6"/>' : ''}
      ${eyes(mood, 38, 62, 51, ink, glint)}
      ${mood === 'bad' ? browsSad(38, 62, 42, ink) : ''}
      <path d="M47 57H53L50 60.4Z" fill="#e8747c"/>
      <path class="b-line thin" d="${mouth}" style="stroke:${ink}"/>
      <path class="b-whisk" d="M26 56L13 53M26 61L13 63M74 56L87 53M74 61L87 63" style="stroke:${ink}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
      <path d="M35 73Q50 80 65 73" fill="none" class="b-collar"/>
      ${mood === 'bad' ? tear(32, 57) : ''}
    </g>`;
}

/* ---------- หมา ---------- */
function dogArt(mood) {
  const fur = 'var(--dog-fur)', ear = 'var(--dog-fur2)', ink = 'var(--dog-ink)', glint = 'var(--dog-glint)';
  const earL = mood === 'bad' ? 'M28 34Q12 42 15 70Q24 72 29 56Z' : 'M28 32Q10 30 12 56Q22 62 28 50Z';
  const earR = mood === 'bad' ? 'M72 34Q88 42 85 70Q76 72 71 56Z' : 'M72 32Q90 30 88 56Q78 62 72 50Z';
  const mouth = { good: 'M42 62Q50 72 58 62', ok: 'M44 64Q50 67 56 64', bad: 'M44 68Q50 63 56 68' }[mood];
  return `${mood === 'good' ? hearts([88, 24], [12, 22]) : ''}<ellipse class="b-ground" cx="50" cy="97" rx="24" ry="2.4"/>
    <path class="b-tail" d="M70 86Q86 84 84 68" fill="none" style="stroke:${ear}" stroke-width="7" stroke-linecap="round"/>
    <g class="b-all ${mood === 'bad' ? 'droop' : ''}">
      <ellipse cx="50" cy="83" rx="22" ry="14" style="fill:${fur}"/>
      <ellipse cx="50" cy="52" rx="27" ry="25" style="fill:${fur}"/>
      <path d="M57 34C66 34 73 42 72 54C66 56 58 52 57 44Z" style="fill:var(--dog-patchA)"/>
      <path d="M28 40C22 46 25 58 34 58C42 56 42 44 36 38Z" style="fill:var(--dog-patchB)"/>
      <path d="${earL}" style="fill:${ear}"/><path d="${earR}" style="fill:${ear}"/>
      <ellipse cx="50" cy="62" rx="14" ry="10.5" style="fill:var(--dog-belly)"/>
      ${mood === 'good' ? '<ellipse cx="33" cy="60" rx="4.5" ry="3" fill="#ff9d9d" opacity=".6"/><ellipse cx="67" cy="60" rx="4.5" ry="3" fill="#ff9d9d" opacity=".6"/>' : ''}
      ${eyes(mood, 39, 62, 49, ink, glint)}
      ${mood === 'bad' ? browsSad(39, 62, 40, ink) : ''}
      <ellipse cx="50" cy="57" rx="4.6" ry="3.4" style="fill:${ink}"/>
      ${mood === 'good' ? '<path class="b-tongue" d="M45.5 65H54.5V70.5A4.5 4.5 0 0 1 45.5 70.5Z" fill="#ff8a9d"/>' : ''}
      <path class="b-line thin" d="${mouth}" style="stroke:${ink}"/>
      <path d="M36 74Q50 81 64 74" fill="none" class="b-collar"/>
      <circle cx="50" cy="80" r="3" fill="#f6c445"/>
      ${mood === 'bad' ? tear(33, 54) : ''}
    </g>`;
}

const BUDDY_ART = { person: personArt, cat: catArt, dog: dogArt };

function renderBuddy(kind, leaves) {
  const mood = Calc.moodOf(leaves);
  const art = BUDDY_ART[kind] ? BUDDY_ART[kind](mood) : treeArt(leaves);
  return `<span class="buddy ${mood}" data-buddy aria-hidden="true"><svg viewBox="0 0 100 100">${art}</svg></span>`;
}
