'use strict';

const APP_VERSION = '2026.11.07.1';
const KEYS = { setup: 'fa.setup', data: 'fa.data', synced: 'fa.synced' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const baht = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
const signed = (n) => `${n > 0 ? '+' : '−'}${baht(Math.abs(n))}`;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

// ?today=YYYY-MM-DD ใช้ทดสอบหน้าจอของวันอื่น (ไม่มีผลถ้าไม่ใส่)
const todayOverride = Calc.parseYmd(new URLSearchParams(location.search).get('today'));
function today() {
  if (todayOverride) return todayOverride;
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/* ---------- ข้อมูลตัวอย่าง (ยังไม่ได้เชื่อม Sheet) เป็นตัวเลขสมมติทั้งหมด ---------- */
function demoData() {
  const key = Calc.cycleKeyOf(today());
  const label = (k) => {
    const p = Calc.budgetPeriod(k);
    return `${Calc.fmtDayMonth(p.start)}–${Calc.fmtDayMonth(p.end)}`;
  };
  const iso = (k, day) => {
    const d = Calc.ymDay(k, day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const prev = Calc.ymAdd(key, -1);
  const row = (k, day, category, item, amount, type = Calc.EXPENSE) => ({ date: iso(k, day), cycle: label(k), type, category, item, amount, note: '' });
  const block = (k, shopee) => ({
    ym: k, total: 21500 + (shopee || 0), income: 30000, balance: 8500 - (shopee || 0),
    items: [{ name: 'Rent', amount: 8000 }, { name: 'Utilities', amount: 1000 }, { name: 'Living', amount: 6400 }, { name: 'Phone', amount: 500 }, { name: 'Loan', amount: 5600 }, { name: 'Shopee', amount: shopee }, { name: 'Other', amount: shopee == null ? null : 0 }],
  });
  return {
    fixCost: [block(key, 320), block(Calc.ymAdd(key, 1), 410), block(Calc.ymAdd(key, 2), null)],
    daily: [
      row(key, 26, 'กิน', 'ข้าวเที่ยง', 80), row(key, 27, 'เดินทาง', 'รถไฟฟ้า', 45), row(key, 28, 'ของใช้', 'ของใช้ในบ้าน', 260),
      row(key, 28, 'อื่นๆ', 'คืนเงินเพื่อน', 300, Calc.INCOME),
      row(prev, 27, 'กิน', 'กาแฟ', 65), row(prev, 28, 'เที่ยว', 'ดูหนัง', 240),
    ],
    installments: [
      { name: 'ตัวอย่าง ก', monthly: 5600, totalMonths: 24, firstMonth: Calc.ymAdd(key, -10), dueDay: 25 },
      { name: 'ตัวอย่าง ข', monthly: 1500, totalMonths: 6, firstMonth: Calc.ymAdd(key, -2), dueDay: 25 },
      { name: 'ตัวอย่าง ค', monthly: 900, totalMonths: 3, firstMonth: Calc.ymAdd(key, -6), dueDay: 25 },
    ],
  };
}

const state = {
  setup: store.get(KEYS.setup, null),
  data: null,
  synced: store.get(KEYS.synced, null),
  loading: false,
  syncError: null,
  cycleKey: null, // รอบที่กำลังดูในหน้ารอบเงินเดือน
  fixYm: null,    // เดือนที่กำลังดูในหน้า Fixed cost
  tab: 'today',
};
state.data = state.setup ? store.get(KEYS.data, null) : demoData();

function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- API (Google Apps Script) ---------- */
async function apiGet(setup) {
  const q = new URLSearchParams({ k: setup.k });
  const res = await fetch(`${setup.url}?${q}`, { cache: 'no-store' });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function saveData(data) {
  state.data = data;
  state.synced = Date.now();
  state.syncError = null;
  store.set(KEYS.data, data);
  store.set(KEYS.synced, state.synced);
}

async function sync({ quiet = false } = {}) {
  if (!state.setup || state.loading) return;
  state.loading = true;
  $('#syncBtn').classList.add('busy');
  try {
    saveData(await apiGet(state.setup));
    if (!quiet) toast('อัปเดตข้อมูลแล้ว');
  } catch (err) {
    console.error(err);
    state.syncError = err.message === 'unauthorized' ? 'TOKEN ไม่ถูกต้อง' : !navigator.onLine ? 'ไม่มีอินเทอร์เน็ต' : err instanceof TypeError ? 'เชื่อมต่อไม่สำเร็จ' : err.message;
    if (!quiet) toast(state.syncError, 3500);
  } finally {
    state.loading = false;
    $('#syncBtn').classList.remove('busy');
    render();
  }
}

/* ---------- ส่วนที่ใช้ร่วมกัน ---------- */
const CHEV_L = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';
const CHEV_R = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
const CHEV_D = '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const ICON_ALERT = '<svg viewBox="0 0 24 24"><path d="M12 4v10M12 19v.5"/></svg>';
const TITLES = { today: 'วันนี้', cycles: 'รอบเงินเดือน', fixed: 'Fixed cost', loans: 'การผ่อน' };

// ตัวเลขสรุปปัดเป็นบาทเต็ม ส่วนรายการใช้ยอดจริง (ไม่แสดง .00)
const whole = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–');
const money = (n) => (Number.isInteger(n) ? whole(n) : baht(n));
const bigNum = (n) => { const [w, d] = baht(Math.abs(n)).split('.'); return `${n < 0 ? '−' : ''}${w}<i>.${d}</i>`; };
const bar = (pct, color = '') => `<div class="bar"><i class="${color}" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;
// สีตามลำดับรายการในแท็บ Installments ไม่เปลี่ยนเมื่อบางรายการผ่อนหมด รายการที่ 5 เป็นต้นไปใช้สีกลาง
const loanColor = (items, item) => { const i = items.indexOf(item); return i >= 0 && i < 4 ? `c${i + 1}` : ''; };
const pager = (id, title, sub, back, hasPrev, hasNext) => `<div class="pager" id="${id}">
  <button class="icon-btn" data-step="-1" aria-label="ก่อนหน้า" ${hasPrev ? '' : 'disabled'}>${CHEV_L}</button>
  <div class="pager-title"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
  <button class="icon-btn" data-step="1" aria-label="ถัดไป" ${hasNext ? '' : 'disabled'}>${CHEV_R}</button>
</div>${back ? `<div class="pager-back">${back}</div>` : ''}`;
const isNamed = (c) => !c.key.startsWith('x:');
const cycleTitle = (c) => (isNamed(c) ? Calc.cycleName(c.key) : (c.label || 'ไม่ระบุรอบ'));
const cycleRange = (c) => (c.start ? Calc.fmtRange(c.start, c.end) : 'อ่านช่วงวันที่ไม่ได้');
const dayLabel = (s) => { const d = Calc.parseYmd(s); return d ? Calc.fmtDate(d) : esc(s); };

/* ---------- ตัวการ์ตูน: หยดน้ำใส ถือของตามหน้า อารมณ์เปลี่ยนตามตัวเลข ---------- */
const MOUTHS = { happy: 'M42 66Q50 75 58 66', worried: 'M43 69Q50 65 57 69', sad: 'M42 72Q50 63 58 72' };
const PROPS = {
  today: '<circle cx="101" cy="39" r="13" fill="#f6c445" stroke="#c98f12" stroke-width="2.5"/><text x="101" y="44.5" text-anchor="middle" font-size="15" font-weight="700" fill="#8a5a00">฿</text>',
  cycles: '<rect x="88" y="26" width="27" height="27" rx="5" fill="#fff"/><path d="M88 31a5 5 0 0 1 5-5h17a5 5 0 0 1 5 5v5H88z" fill="#ef5b5b"/><path d="M95 42h4M104 42h4M95 47h4" stroke="#55606b" stroke-width="2.4" stroke-linecap="round"/>',
  fixed: '<path d="M90 24h24v30l-4-3-4 3-4-3-4 3-4-3-4 3z" fill="#fff"/><path d="M95 32h14M95 38h14M95 44h8" stroke="#55606b" stroke-width="2.2" stroke-linecap="round"/>',
  loans: '<rect x="85" y="28" width="32" height="22" rx="4" fill="#46505e" stroke="#fff" stroke-width="1.5"/><rect x="85.8" y="33" width="30.4" height="5" fill="#20262e"/><rect x="90" y="42" width="8" height="4" rx="1" fill="#f6c445"/>',
};
function mascot(page, mood = 'happy') {
  const id = `mascot-${page}`;
  return `<span class="mascot ${page} ${mood}" data-mascot aria-hidden="true"><svg viewBox="0 0 120 100">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".72"/><stop offset=".45" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <ellipse class="m-shadow" cx="50" cy="95" rx="24" ry="3.5"/>
    <g class="m-all">
      <path class="m-limb m-wave" d="M20 62Q8 58 8 45"/>
      <g class="m-prop">${PROPS[page]}</g>
      <path class="m-limb" d="M80 63Q92 60 95 52"/>
      <ellipse class="m-foot" cx="39" cy="89" rx="8" ry="4"/><ellipse class="m-foot" cx="61" cy="89" rx="8" ry="4"/>
      <path class="m-drop" d="M50 7C60 24 84 38 84 58C84 77 69 89 50 89C31 89 16 77 16 58C16 38 40 24 50 7Z"/>
      <path d="M50 7C60 24 84 38 84 58C84 77 69 89 50 89C31 89 16 77 16 58C16 38 40 24 50 7Z" fill="url(#${id})"/>
      <ellipse cx="33" cy="47" rx="5" ry="9" transform="rotate(24 33 47)" fill="#fff" opacity=".65"/>
      <ellipse cx="29" cy="65" rx="5" ry="3" fill="#ff8fa8" opacity=".55"/><ellipse cx="71" cy="65" rx="5" ry="3" fill="#ff8fa8" opacity=".55"/>
      <g class="m-eyes">
        <ellipse cx="39" cy="56" rx="6.5" ry="7.5" fill="#fff"/><ellipse cx="61" cy="56" rx="6.5" ry="7.5" fill="#fff"/>
        <ellipse cx="40" cy="57" rx="3.6" ry="4.6" fill="#16202a"/><ellipse cx="62" cy="57" rx="3.6" ry="4.6" fill="#16202a"/>
        <circle cx="41.4" cy="55" r="1.3" fill="#fff"/><circle cx="63.4" cy="55" r="1.3" fill="#fff"/>
      </g>
      <path class="m-mouth" d="${MOUTHS[mood]}"/>
    </g>
  </svg></span>`;
}

function viewModel() {
  const data = state.data;
  const now = today();
  const key = Calc.cycleKeyOf(now);
  const cycles = Calc.buildCycles(data?.daily || [], now);
  const loans = Calc.installmentSummary(data?.installments || [], now);
  const blocks = data?.fixCost || [];
  const fixYm = Calc.fixYmOf(now);
  return { now, key, fixYm, cycles, current: cycles.find((c) => c.key === key), loans, blocks, block: blocks.find((b) => b.ym === fixYm) };
}

/* ---------- วันนี้ ---------- */
function paceStatus(b) {
  if (b.left < 0) return { cls: 'bad', mood: 'sad', icon: ICON_ALERT, text: `เกินงบ ${money(-b.left)}` };
  if (b.ahead > 0) return { cls: 'warn', mood: 'worried', icon: ICON_UP, text: `เร็วกว่าแผน ${money(b.ahead)}` };
  return { cls: 'good', mood: 'happy', icon: ICON_OK, text: b.ahead < 0 ? `ช้ากว่าแผน ${money(-b.ahead)}` : 'ตรงตามแผน' };
}

function budgetRing(b) {
  const cls = b.left < 0 ? 'bad' : ''; // เร็วกว่าแผนบอกที่ป้ายสถานะ วงเปลี่ยนสีเมื่อเกินงบเท่านั้น
  const used = b.pct > 0 ? `<circle class="ring-fill ${cls}" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="${b.pct.toFixed(2)} 100"/>` : '';
  const tick = `<circle class="ring-tick" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="0.7 100" stroke-dashoffset="${(-(b.plannedPct - 0.35)).toFixed(2)}"/>`;
  return `<svg viewBox="0 0 120 120" role="img" aria-label="ใช้ไป ${baht(b.used)} จากงบ ${baht(b.budget)} แผนถึงวันนี้ ${baht(b.planned)}"><circle class="ring-track" cx="60" cy="60" r="53"/>${used}${tick}</svg>`;
}

function renderToday(vm) {
  const el = $('#view-today');
  if (!state.data) {
    el.innerHTML = state.syncError
      ? `<div class="banner bad">โหลดข้อมูลไม่สำเร็จ: ${esc(state.syncError)}</div>`
      : '<p class="empty-state">กำลังโหลดข้อมูล…</p>';
    return;
  }
  const b = Calc.budgetSummary(vm.current, vm.now);
  const st = paceStatus(b);
  const banner = !state.setup
    ? '<div class="banner">ข้อมูลตัวอย่าง <button data-open="settings">เชื่อมต่อ Google Sheet</button></div>'
    : state.syncError ? `<div class="banner bad">อัปเดตไม่สำเร็จ (${esc(state.syncError)}) แสดงข้อมูลล่าสุดที่มี</div>` : '';
  const invalid = vm.current.invalid ? `<p class="hint warn">มี ${vm.current.invalid} แถวที่อ่านไม่ได้ จึงไม่ถูกนับ</p>` : '';
  const blk = vm.block;
  el.innerHTML = `${banner}
    <section class="panel hero">
      ${mascot('today', st.mood)}
      <div class="ring">
        ${budgetRing(b)}
        <div class="ring-in">
          <span>ใช้ได้วันนี้</span>
          <div class="num ${whole(b.perDay).length > 3 ? 'long' : ''}">${bigNum(b.perDay)}</div>
        </div>
      </div>
      <div class="status ${st.cls}">${st.icon}<span>${esc(st.text)}</span></div>
      <div class="hero-foot">${b.left < 0 ? 'เกิน' : 'เหลือ'} ${whole(Math.abs(b.left))} · เงินเข้าอีก ${b.days} วัน</div>
    </section>
    ${invalid}
    <div class="pair">
      <button class="panel tile" data-goto="fixed" data-fix="${vm.fixYm}"><span>เหลือหลัง Fixed</span><b class="${blk && blk.balance < 0 ? 'bad' : ''}">${blk ? `${blk.balance < 0 ? '−' : ''}${whole(Math.abs(blk.balance))}` : '–'}</b></button>
      <button class="panel tile" data-goto="loans"><span>ผ่อนรอบนี้</span><b>${whole(vm.loans.now)}</b></button>
    </div>`;
}

/* ---------- รอบเงินเดือน ---------- */
const itemRow = (r) => `<li>
  <span class="item-name">${esc(r.item) || '–'}</span><span class="item-amt">${money(r.amount)}</span>
  <span class="item-sub">${dayLabel(r.date)}${r.note ? ` · ${esc(r.note)}` : ''}</span>
</li>`;

function renderCycles(vm) {
  const el = $('#view-cycles');
  if (!state.data) { el.innerHTML = '<p class="empty-state">ยังไม่มีข้อมูล</p>'; return; }
  const list = vm.cycles;
  let idx = list.findIndex((c) => c.key === state.cycleKey);
  if (idx < 0) idx = list.findIndex((c) => c.key === vm.key);
  const c = list[idx];
  state.cycleKey = c.key;
  const left = Calc.round2(Calc.BUDGET - c.expense);
  const back = c.key === vm.key ? '' : '<button data-cycle-now>กลับรอบปัจจุบัน</button>';
  el.innerHTML = `${pager('cyclePager', cycleTitle(c), cycleRange(c), back, idx < list.length - 1, idx > 0)}
    <section class="panel balance">
      ${mascot('cycles', left < 0 ? 'sad' : 'happy')}
      <span>ใช้ไป</span>
      <div class="big">${bigNum(c.expense)}</div>
      <div class="equation ${left < 0 ? 'bad' : ''}">${left < 0 ? 'เกินงบ' : 'เหลือจากงบ'} ${whole(Math.abs(left))}${c.income ? ` · รับเพิ่ม ${whole(c.income)}` : ''}</div>
    </section>
    ${c.invalid ? `<p class="hint warn">มี ${c.invalid} แถวที่อ่านไม่ได้ จึงไม่ถูกนับ</p>` : ''}
    <section class="panel list">
      ${c.categories.length ? c.categories.map((cat) => `<details>
        <summary><span class="row-name">${esc(cat.name)}</span><b>${money(cat.total)}</b>${CHEV_D}${bar(c.expense > 0 ? (cat.total / c.expense) * 100 : 0)}</summary>
        <ul class="items">${cat.rows.map(itemRow).join('')}</ul>
      </details>`).join('') : '<p class="empty">ไม่มีรายจ่ายในรอบนี้</p>'}
    </section>
    ${c.incomeRows.length ? `<section class="panel list"><details>
      <summary><span class="row-name">รายรับ</span><b>${money(c.income)}</b>${CHEV_D}</summary>
      <ul class="items">${c.incomeRows.map(itemRow).join('')}</ul>
    </details></section>` : ''}`;
}

/* ---------- Fixed cost ---------- */
function renderFixed(vm) {
  const el = $('#view-fixed');
  const list = vm.blocks;
  if (!list.length) { el.innerHTML = '<p class="empty-state">ไม่มีข้อมูลในแท็บ Fix cost</p>'; return; }
  let idx = list.findIndex((b) => b.ym === state.fixYm);
  if (idx < 0) idx = list.findIndex((b) => b.ym === vm.fixYm);
  if (idx < 0) idx = list.length - 1;
  const b = list[idx];
  state.fixYm = b.ym;
  const range = Calc.fixPeriod(b.ym);
  const back = b.ym === vm.fixYm ? '' : '<button data-fix-now>กลับรอบปัจจุบัน</button>';
  el.innerHTML = `${pager('fixPager', Calc.fmtYmLong(b.ym), Calc.fmtRange(range.start, range.end), back, idx > 0, idx < list.length - 1)}
    <section class="panel balance">
      ${mascot('fixed', b.balance < 0 ? 'sad' : 'happy')}
      <span>เงินเหลือ</span>
      <div class="big ${b.balance < 0 ? 'bad' : ''}">${bigNum(b.balance)}</div>
      <div class="equation">รับ ${whole(b.income)} − จ่าย ${whole(b.total)}</div>
    </section>
    <section class="panel">
      <ul class="items">${b.items.map((i) => `<li><span class="item-name">${esc(i.name)}</span>${i.amount == null ? '<span class="item-amt none">ยังไม่ระบุ</span>' : `<span class="item-amt">${money(i.amount)}</span>`}</li>`).join('')}</ul>
    </section>`;
}

/* ---------- การผ่อน ---------- */
// กราฟขั้นบันได: ชุดข้อมูลเดียว แกนเดียว ติดป้ายเฉพาะจุดที่ยอดเปลี่ยน รายการตัวเลขอยู่ใต้กราฟ
function stepChart(steps) {
  if (steps.length < 2) return '';
  const W = 340, H = 150, top = 22, bottom = 124, left = 2, right = 338;
  const idx = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m; };
  const t0 = idx(steps[0].ym), span = Math.max(1, idx(steps[steps.length - 1].ym) - t0);
  const max = Math.max(...steps.map((s) => s.amount), 1);
  const x = (s) => left + ((idx(s.ym) - t0) / span) * (right - left);
  const y = (a) => bottom - (a / max) * (bottom - top);
  let d = `M${x(steps[0]).toFixed(1)} ${y(steps[0].amount).toFixed(1)}`;
  steps.slice(1).forEach((s) => { d += `H${x(s).toFixed(1)}V${y(s.amount).toFixed(1)}`; });
  const area = `${d}V${bottom}H${left}Z`;
  const short = (a) => Math.round(a).toLocaleString('en-US');
  let lastX = -999;
  const labels = steps.map((s, i) => {
    const px = x(s);
    const last = i === steps.length - 1;
    const anchor = last ? 'end' : 'start';
    const showDate = last || px - lastX > 52;
    if (showDate) lastX = px;
    const vy = Math.max(12, y(s.amount) - 7);
    return `<text class="val" x="${(last ? right - 8 : px + 3).toFixed(1)}" y="${vy.toFixed(1)}" text-anchor="${anchor}">${short(s.amount)}</text>`
      + (showDate ? `<text x="${(last ? right : px).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(Calc.fmtYm(s.ym))}</text>` : '');
  }).join('');
  const dots = steps.map((s) => `<circle class="dot" cx="${x(s).toFixed(1)}" cy="${y(s.amount).toFixed(1)}" r="4"/>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ยอดผ่อนต่อเดือนตามเวลา รายละเอียดอยู่ในรายการเดือนที่ยอดเปลี่ยน">
    <line class="grid" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>
    <path class="area" d="${area}"/><path class="line" d="${d}"/>${dots}${labels}
  </svg></div>`;
}

const fact = (k, v) => `<div><span>${esc(k)}</span><b>${v}</b></div>`;

function loanRow(i, color) {
  return `<details>
    <summary><span class="row-name">${esc(i.name)}</span><b>${i.paid}/${i.totalMonths}</b>${CHEV_D}${bar(i.pct, color)}<small>${money(i.monthly)} ต่อเดือน · หมด ${esc(Calc.fmtYm(i.endMonth))}</small></summary>
    <div class="facts">
      ${fact('ผ่อนแล้ว', money(i.paidAmount))}
      ${fact('เหลือ', money(i.leftAmount))}
      ${fact('ยอดเต็ม', money(i.fullAmount))}
      ${fact('งวดถัดไป', esc(Calc.fmtDate(i.nextDue)))}
    </div>
  </details>`;
}

function renderLoans(vm) {
  const el = $('#view-loans');
  const { items, now: monthly, timeline, pending } = vm.loans;
  if (!items.length) { el.innerHTML = '<p class="empty-state">ไม่มีข้อมูลในแท็บ Installments</p>'; return; }
  const active = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const tl = timeline.map((e) => {
    const what = [...e.started.map((n) => `เริ่ม ${n}`), ...e.ended.map((n) => `${n} หมด`)].join(' · ');
    return `<li>
      <b>${esc(Calc.fmtYm(e.ym))}</b><span class="delta">${signed(e.delta)}</span>
      <small>${esc(what)}</small><small>เหลือ ${baht(e.after)}</small>
    </li>`;
  }).join('');
  el.innerHTML = `<section class="panel balance">
      ${mascot('loans')}
      <span>ผ่อนต่อเดือน</span>
      <div class="big">${bigNum(monthly)}</div>
      ${pending.length ? `<div class="equation">ยังไม่รวม ${esc(pending.map((i) => i.name).join(', '))}</div>` : ''}
    </section>
    <section class="panel list">
      ${active.length ? active.map((i) => loanRow(i, loanColor(items, i))).join('') : '<p class="empty">ไม่มีรายการที่กำลังผ่อน</p>'}
    </section>
    <section class="panel list">
      ${stepChart(Calc.installmentSteps(vm.loans, vm.now))}
      ${tl ? `<details><summary><span class="row-name">เดือนที่ยอดเปลี่ยน</span>${CHEV_D}</summary><ul class="tl">${tl}</ul></details>` : '<p class="empty">ไม่มีการเปลี่ยนแปลงข้างหน้า</p>'}
    </section>
    ${done.length ? `<section class="panel list"><details>
      <summary><span class="row-name">ผ่อนหมดแล้ว</span><b>${done.length}</b>${CHEV_D}</summary>
      <ul class="items">${done.map((i) => `<li><span class="item-name">${esc(i.name)}</span><span class="item-amt">${money(i.fullAmount)}</span><span class="item-sub">ครบ ${i.totalMonths} งวด · หมด ${esc(Calc.fmtYm(i.endMonth))}</span></li>`).join('')}</ul>
    </details></section>` : ''}`;
}

/* ---------- คำอธิบายแต่ละหน้า ---------- */
const HELP = {
  today: [
    ['ใช้ได้วันนี้', 'งบที่เหลือหารด้วยจำนวนวันจนถึงวันเงินเดือนเข้า ถ้าใช้วันละเท่านี้ งบจะหมดพอดี'],
    ['วงแหวน', 'ส่วนที่มีสีคือยอดที่ใช้ไปเทียบกับงบ 6,400 บาท จะเปลี่ยนเป็นสีแดงเมื่อใช้เกินงบ'],
    ['ขีดบนวงแหวน', 'แผนถึงวันนี้ คิดจากงบ × จำนวนวันที่ผ่านมารวมวันนี้ ÷ จำนวนวันทั้งรอบ ถ้าสีเลยขีดแปลว่าใช้เร็วกว่าแผน'],
    ['ป้ายเร็วหรือช้ากว่าแผน', 'ยอดที่ใช้ไปลบแผนถึงวันนี้ สีเหลืองคือเร็วกว่าแผน สีเขียวคือช้ากว่าหรือตรงแผน สีแดงคือเกินงบแล้ว'],
    ['เหลือ · เงินเข้าอีกกี่วัน', 'งบที่เหลือของรอบนี้ และจำนวนวันจนถึงวันที่ 25 ครั้งถัดไป'],
    ['เหลือหลัง Fixed', 'รายรับลบรายจ่ายประจำของรอบนี้จากแท็บ Fix cost กดเพื่อดูรายการ'],
    ['ผ่อนรอบนี้', 'ยอดผ่อนทุกรายการที่อยู่ในรอบนี้รวมกัน กดเพื่อดูรายละเอียด'],
    ['ตัวการ์ตูน', 'ยิ้มเมื่อใช้ตามแผน กังวลเมื่อใช้เร็วกว่าแผน เศร้าเมื่อเกินงบ แตะแล้วจะกระโดด'],
    ['การปัดเศษ', 'ตัวเลขสรุปปัดเป็นบาทเต็ม ส่วนรายการย่อยแสดงยอดจริง'],
  ],
  cycles: [
    ['ชื่อรอบ', 'เรียกตามเดือนที่รอบสิ้นสุด เช่น รอบ พ.ย. คือ 26 ต.ค. ถึง 24 พ.ย. ปุ่มซ้ายขวาใช้ดูรอบอื่น'],
    ['ใช้ไป', 'รายจ่ายรวมของรอบนี้จากแท็บ Daily Log โดยจัดกลุ่มตามคอลัมน์รอบเงินเดือน'],
    ['เหลือจากงบ', 'งบ 6,400 บาทลบรายจ่ายของรอบนี้'],
    ['รับเพิ่ม', 'รายการประเภทรายรับใน Daily Log ไม่รวมเงินเดือนที่อยู่ในแท็บ Fix cost แสดงเมื่อมีรายการ'],
    ['หมวด', 'ตัวเลขคือยอดรวมของหมวด แถบบอกสัดส่วนเทียบกับรายจ่ายทั้งรอบ แตะเพื่อดูรายการ วันที่ และหมายเหตุ'],
  ],
  fixed: [
    ['ชื่อเดือน', 'ตรงกับบล็อกในแท็บ Fix cost เช่น พฤศจิกายน 2026 คือ 25 ต.ค. ถึง 24 พ.ย. ปุ่มซ้ายขวาใช้ดูเดือนอื่น รวมเดือนอนาคตที่ใส่ไว้แล้ว'],
    ['เงินเหลือ', 'รายรับลบยอดรวมของเดือนนั้น'],
    ['รายการ', 'รายจ่ายประจำตามที่อยู่ในชีต'],
    ['ยังไม่ระบุ', 'ช่องในชีตยังว่าง ยอดรวมจึงยังไม่นับรายการนั้น ไม่ได้หมายความว่าเป็น 0 บาท'],
  ],
  loans: [
    ['ผ่อนต่อเดือน', 'ผลรวมงวดของทุกรายการที่อยู่ในรอบนี้ ตรงกับรายการผ่อนในบล็อก Fix cost'],
    ['แต่ละรายการ', 'ตัวเลขคือจำนวนงวดที่จ่ายแล้วจากทั้งหมด งวดนับว่าจ่ายแล้วเมื่อเลยวันที่ 25 ของเดือนนั้น แตะเพื่อดูยอดที่ผ่อนแล้ว ยอดที่เหลือ ยอดเต็ม และงวดถัดไป'],
    ['ยอดเต็ม', 'ค่างวดคูณจำนวนงวด ไม่รวมเงินดาวน์'],
    ['กราฟขั้นบันได', 'ยอดผ่อนต่อเดือนตามเวลา แต่ละขั้นคือเดือนที่ยอดเปลี่ยน'],
    ['เดือนที่ยอดเปลี่ยน', 'แตะเพื่อดูว่าเดือนไหนยอดเปลี่ยนเท่าไร เพราะรายการใด และเหลือยอดต่อเดือนเท่าไร'],
    ['ผ่อนหมดแล้ว', 'รายการที่จ่ายครบทุกงวด แตะเพื่อดูรายละเอียด'],
  ],
};

function initHelp() {
  $('#helpTitle').textContent = `${TITLES[state.tab]} คืออะไร`;
  $('#helpBody').innerHTML = HELP[state.tab].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

function showTab(name) {
  state.tab = name;
  $('#tabs').style.setProperty('--i', Object.keys(TITLES).indexOf(name));
  $$('#tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  $('#pageTitle').textContent = TITLES[name];
  $('#scroll').scrollTop = 0;
  render();
}

function render() {
  const vm = viewModel();
  renderToday(vm);
  renderCycles(vm);
  renderFixed(vm);
  renderLoans(vm);
  $('#pageSub').textContent = state.tab === 'today' && state.data ? `${Calc.fmtDayMonth(vm.current.start)} – ${Calc.fmtDayMonth(vm.current.end)}` : '';
}

/* ---------- หน้าตั้งค่า ---------- */
const stack = [];
const topSheet = () => stack[stack.length - 1] || null;

function open(id) {
  const sheet = $(`#${id}`);
  if (!sheet || stack.includes(sheet)) return;
  sheet.scrollTop = 0;
  sheet.classList.remove('closing');
  sheet.hidden = false;
  if (id === 'settings') initSettings();
  if (id === 'help') initHelp();
  sheet.classList.add('opening');
  stack.push(sheet);
}

function closeTop({ instant = false } = {}) {
  const sheet = stack.pop();
  if (!sheet) return;
  document.activeElement?.blur?.();
  sheet.classList.remove('opening');
  const done = () => { sheet.hidden = true; sheet.classList.remove('closing'); sheet.style.transform = ''; };
  if (instant || reduceMotion) { done(); return; }
  sheet.classList.add('closing');
  setTimeout(done, 260);
}
function closeSheets() { while (stack.length) closeTop(); }

/* ---------- ตั้งค่า ---------- */
function parseSetup(text) {
  const s = text.trim();
  let u;
  try { u = new URL(s); } catch { return null; }
  const k = u.searchParams.get('k');
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u.href) || !k) return null;
  return { url: `${u.origin}${u.pathname}`, k };
}

function renderThemeControls() {
  const theme = loadTheme();
  $$('#themeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.themeMode === theme.mode));
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#palettes').innerHTML = Object.entries(PALETTES).map(([id, p]) => `
    <button type="button" class="palette${id === theme.palette ? ' active' : ''}" data-palette="${id}" aria-pressed="${id === theme.palette}">
      <i style="background:${gradientOf(p[dark ? 'dark' : 'light'].g)}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></i>${esc(p.name)}
    </button>`).join('');
}

function renderConnection(editing = false) {
  const connected = !!state.setup;
  $('#connCard').hidden = !connected || editing;
  $('#connActions').hidden = !connected || editing;
  $('#setupEditor').hidden = connected && !editing;
  $('#cancelEditBtn').hidden = !connected;
  if (connected) {
    const id = state.setup.url.split('/s/')[1]?.split('/')[0] || '';
    $('#connUrl').textContent = `script.google.com/…/${id.slice(0, 6)}…${id.slice(-4)}/exec`;
    const at = new Date(state.synced);
    $('#connSynced').textContent = state.synced ? `อัปเดตล่าสุด ${Calc.fmtDate(at)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '';
  }
  $('#setupInput').value = editing && connected ? `${state.setup.url}?k=${state.setup.k}` : '';
  $('#settingsStatus').textContent = connected ? '' : 'ยังไม่ได้เชื่อมต่อ กำลังแสดงข้อมูลตัวอย่าง';
  $('#settingsStatus').className = 'hint';
}

function initSettings() {
  renderThemeControls();
  renderConnection();
  $('#appVersion').textContent = APP_VERSION;
}

$('#themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-mode]');
  if (!b) return;
  saveTheme({ ...loadTheme(), mode: b.dataset.themeMode });
  renderThemeControls();
});
$('#palettes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-palette]');
  if (!b) return;
  saveTheme({ ...loadTheme(), palette: b.dataset.palette });
  renderThemeControls();
});
$('#editLinkBtn').addEventListener('click', () => { renderConnection(true); $('#setupInput').focus(); });
$('#cancelEditBtn').addEventListener('click', () => renderConnection());

$('#saveSetupBtn').addEventListener('click', async () => {
  const setup = parseSetup($('#setupInput').value);
  const status = $('#settingsStatus');
  if (!setup) {
    status.textContent = 'รูปแบบไม่ถูกต้อง ต้องเป็นลิงก์ script.google.com ที่มี ?k=';
    status.className = 'hint bad';
    return;
  }
  status.textContent = 'กำลังทดสอบการเชื่อมต่อ…';
  status.className = 'hint';
  try {
    const data = await apiGet(setup);
    state.setup = setup;
    store.set(KEYS.setup, setup);
    saveData(data);
    state.cycleKey = null; state.fixYm = null;
    closeSheets();
    render();
    toast('เชื่อมต่อแล้ว');
  } catch (err) {
    status.textContent = err.message === 'unauthorized' ? 'TOKEN ไม่ถูกต้อง' : `เชื่อมต่อไม่สำเร็จ: ${err.message}`;
    status.className = 'hint bad';
  }
});

$('#clearSetupBtn').addEventListener('click', () => {
  if (!confirm('เลิกเชื่อมต่อและลบข้อมูลที่เก็บไว้ในเครื่องนี้? ข้อมูลใน Google Sheet จะไม่ถูกแตะ')) return;
  [KEYS.setup, KEYS.data, KEYS.synced].forEach((k) => store.del(k));
  state.setup = null; state.synced = null; state.syncError = null;
  state.data = demoData();
  state.cycleKey = null; state.fixYm = null;
  closeSheets();
  render();
});

/* ---------- gesture: ดึงลงเพื่อรีเฟรช / ปัดจากขอบซ้ายเพื่อปิดหน้าตั้งค่า ---------- */
const PULL_TRIGGER = 70;
let g = null;

$('#scroll').addEventListener('touchstart', (e) => {
  if (stack.length || e.touches.length > 1) return;
  const tc = e.touches[0];
  g = { y: tc.clientY, x: tc.clientX, mode: null, pull: 0, atTop: $('#scroll').scrollTop <= 0, inner: $('#page') };
}, { passive: true });

$('#scroll').addEventListener('touchmove', (e) => {
  if (!g) return;
  const tc = e.touches[0];
  const dx = tc.clientX - g.x, dy = tc.clientY - g.y;
  if (!g.mode) {
    if (dy > 8 && g.atTop && dy > Math.abs(dx)) { g.mode = 'pull'; g.inner.classList.add('pulling'); }
    else if (Math.abs(dy) > 8 || Math.abs(dx) > 10) g.mode = 'none';
  }
  if (g.mode !== 'pull') return;
  e.preventDefault();
  g.pull = Math.min(130, dy * 0.5);
  g.inner.style.transform = `translateY(${g.pull}px)`;
  const ptrEl = $('#ptr');
  const p = Math.min(1, g.pull / PULL_TRIGGER);
  ptrEl.style.opacity = p;
  ptrEl.style.transform = `translateY(${g.pull * 0.6 - 20}px) scale(${0.6 + p * 0.4})`;
}, { passive: false });

const endPull = () => {
  if (!g) return;
  const cur = g;
  g = null;
  if (cur.mode !== 'pull') return;
  cur.inner.classList.remove('pulling');
  if (cur.pull >= PULL_TRIGGER) refreshFromPull(cur.inner);
  else resetPull(cur.inner);
};
$('#scroll').addEventListener('touchend', endPull);
$('#scroll').addEventListener('touchcancel', endPull);

function resetPull(inner) {
  inner.style.transform = '';
  const ptrEl = $('#ptr');
  ptrEl.classList.remove('loading');
  ptrEl.style.opacity = '';
  ptrEl.style.transform = '';
}

async function refreshFromPull(inner) {
  const ptrEl = $('#ptr');
  inner.style.transform = 'translateY(56px)';
  ptrEl.style.transform = 'translateY(14px) scale(1)';
  ptrEl.style.opacity = 1;
  ptrEl.classList.add('loading');
  if (state.setup) await sync();
  else { await wait(600); toast('ยังไม่ได้เชื่อมต่อ Google Sheet'); }
  resetPull(inner);
}

// ปัดจากขอบซ้ายเพื่อปิดหน้าตั้งค่า
let edge = null;
document.addEventListener('touchstart', (e) => {
  const sheet = topSheet();
  const tc = e.touches[0];
  if (!sheet || tc.clientX > 24) return;
  edge = { sheet, x: tc.clientX, t: performance.now(), dx: 0, started: false };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!edge) return;
  const { sheet } = edge;
  if (!edge.started) {
    edge.started = true;
    sheet.classList.remove('opening');
    sheet.style.transition = 'none';
  }
  edge.dx = Math.max(0, e.touches[0].clientX - edge.x);
  sheet.style.transform = `translateX(${edge.dx}px)`;
  e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => {
  if (!edge) return;
  const { sheet, dx, t: t0, started } = edge;
  edge = null;
  if (!started) return;
  sheet.style.transition = 'transform .26s cubic-bezier(.22, 1, .36, 1)';
  const commit = dx > innerWidth * 0.33 || dx / Math.max(1, performance.now() - t0) > 0.5;
  sheet.style.transform = commit ? 'translateX(100%)' : '';
  setTimeout(() => {
    sheet.style.transition = '';
    if (commit) closeTop({ instant: true });
  }, 260);
});

/* ---------- wiring ---------- */
$('#syncBtn').addEventListener('click', () => {
  if (state.setup) sync();
  else toast('ยังไม่ได้เชื่อมต่อ Google Sheet');
});

document.addEventListener('click', (e) => {
  const buddy = e.target.closest('[data-mascot]');
  if (buddy) {
    buddy.classList.remove('jump');
    void buddy.offsetWidth;
    buddy.classList.add('jump');
    setTimeout(() => buddy.classList.remove('jump'), 700);
    return;
  }
  if (e.target.closest('[data-close]')) { closeTop(); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) { showTab(tab.dataset.tab); return; }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    if (goto.dataset.fix) state.fixYm = goto.dataset.fix;
    showTab(goto.dataset.goto);
    return;
  }
  const opener = e.target.closest('[data-open]');
  if (opener) { open(opener.dataset.open); return; }
  const step = e.target.closest('[data-step]');
  if (step) {
    const vm = viewModel();
    const d = Number(step.dataset.step);
    if (step.closest('#cyclePager')) {
      // รายการรอบเรียงใหม่ไปเก่า ปุ่มซ้าย (ก่อนหน้า) จึงเลื่อนไปทางรอบเก่า
      const i = vm.cycles.findIndex((c) => c.key === state.cycleKey);
      const next = vm.cycles[i - d];
      if (next) { state.cycleKey = next.key; renderCycles(vm); }
    } else if (step.closest('#fixPager')) {
      const i = vm.blocks.findIndex((b) => b.ym === state.fixYm);
      const next = vm.blocks[i + d];
      if (next) { state.fixYm = next.ym; renderFixed(vm); }
    }
    return;
  }
  if (e.target.closest('[data-cycle-now]')) { state.cycleKey = null; render(); return; }
  if (e.target.closest('[data-fix-now]')) { state.fixYm = null; render(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state.setup) sync({ quiet: true });
  else render(); // วันอาจเปลี่ยนระหว่างที่พับแอปไว้
});

// ปิดการซูม: บีบนิ้ว และแตะสองครั้ง
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !e.target.closest('input, textarea')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

render();
if (state.setup) sync({ quiet: true });
