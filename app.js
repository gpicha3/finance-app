'use strict';

const APP_VERSION = '2026.11.06.4';
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
const ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const ICON_ALERT = '<svg viewBox="0 0 24 24"><path d="M12 4v10M12 19v.5"/></svg>';
const TITLES = { today: 'วันนี้', cycles: 'รอบเงินเดือน', fixed: 'Fixed cost', loans: 'การผ่อน' };

const bar = (pct, extra = '', color = '') => `<div class="bar ${extra}"><i class="${color}" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;
// สีตามลำดับรายการในแท็บ Installments ไม่เปลี่ยนเมื่อบางรายการผ่อนหมด รายการที่ 5 เป็นต้นไปใช้สีกลาง
const loanColor = (items, item) => { const i = items.indexOf(item); return i >= 0 && i < 4 ? `c${i + 1}` : ''; };
const sum = (label, value, cls = '') => `<div class="sum"><span>${esc(label)}</span><b class="${cls}">${value}</b></div>`;
const pager = (id, title, sub, tag, hasPrev, hasNext) => `<div class="pager" id="${id}">
  <button class="icon-btn" data-step="-1" aria-label="ก่อนหน้า" ${hasPrev ? '' : 'disabled'}>${CHEV_L}</button>
  <div class="pager-title"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
  <button class="icon-btn" data-step="1" aria-label="ถัดไป" ${hasNext ? '' : 'disabled'}>${CHEV_R}</button>
</div><div class="pager-tag">${tag}</div>`;
const isNamed = (c) => !c.key.startsWith('x:');
const cycleTitle = (c) => (isNamed(c) ? Calc.cycleName(c.key) : (c.label || 'ไม่ระบุรอบ'));
const cycleRange = (c) => (c.start ? Calc.fmtRange(c.start, c.end) : 'อ่านช่วงวันที่ไม่ได้');
const dayLabel = (s) => { const d = Calc.parseYmd(s); return d ? Calc.fmtDate(d) : esc(s); };

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
  if (b.left < 0) return { cls: 'bad', icon: ICON_ALERT, text: `ใช้เกินงบ ${baht(-b.left)}` };
  if (b.ahead > 0) return { cls: 'warn', icon: ICON_UP, text: `ใช้เร็วกว่าแผน ${baht(b.ahead)}` };
  return { cls: 'good', icon: ICON_OK, text: b.ahead < 0 ? `ใช้ช้ากว่าแผน ${baht(-b.ahead)}` : 'ใช้ตามแผนพอดี' };
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
  const [whole, dec] = baht(b.perDay).split('.');
  const st = paceStatus(b);
  const banner = !state.setup
    ? '<div class="banner">กำลังแสดงข้อมูลตัวอย่าง <button data-open="settings">เชื่อมต่อ Google Sheet</button></div>'
    : state.syncError ? `<div class="banner bad">อัปเดตไม่สำเร็จ (${esc(state.syncError)}) กำลังแสดงข้อมูลล่าสุดที่มี</div>` : '';
  const invalid = vm.current.invalid ? `<p class="hint warn">มี ${vm.current.invalid} แถวในรอบนี้ที่อ่านยอดหรือประเภทไม่ได้ จึงไม่ถูกนับ</p>` : '';
  const blk = vm.block;
  const { items } = vm.loans;
  const active = items.filter((i) => !i.done);
  el.innerHTML = `${banner}
    <section class="panel hero">
      <div class="ring">
        ${budgetRing(b)}
        <div class="ring-in">
          <span>ใช้ได้วันนี้</span>
          <div class="num ${whole.length > 3 ? 'long' : ''}">${whole}<i>.${dec}</i></div>
          <span>อีก ${b.days} วันเงินเดือนเข้า</span>
        </div>
      </div>
      <div class="status ${st.cls}">${st.icon}<span>${esc(st.text)}</span></div>
      <div class="used-left"><span>ใช้ไป <b>${baht(b.used)}</b></span><span>${b.left < 0 ? 'เกิน' : 'เหลือ'} <b>${baht(Math.abs(b.left))}</b></span></div>
      <div class="ring-note">งบ ${baht(b.budget)} · ขีดบนวงคือแผนถึงวันนี้ ${baht(b.planned)}</div>
    </section>
    ${invalid}
    <div class="pair">
      <button class="panel tile" data-goto="fixed" data-fix="${vm.fixYm}"><span>เหลือหลัง Fixed cost</span><b class="${blk && blk.balance < 0 ? 'bad' : ''}">${blk ? baht(blk.balance) : '–'}</b></button>
      <button class="panel tile" data-goto="loans"><span>ผ่อนรอบนี้</span><b>${baht(vm.loans.now)}</b></button>
    </div>
    ${active.length ? `<button class="panel mini-grid" data-goto="loans">
      ${active.map((i) => `<span class="mini"><b>${esc(i.name)}</b><span>${i.paid}/${i.totalMonths}</span>${bar(i.pct, '', loanColor(items, i))}</span>`).join('')}
    </button>` : ''}`;
}

/* ---------- รอบเงินเดือน ---------- */
const itemRow = (r) => `<li>
  <span class="item-name">${esc(r.item) || '–'}</span><span class="item-amt">${baht(r.amount)}</span>
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
  const tag = c.key === vm.key ? 'รอบปัจจุบัน' : 'ย้อนหลัง<button data-cycle-now>กลับรอบปัจจุบัน</button>';
  el.innerHTML = `${pager('cyclePager', cycleTitle(c), cycleRange(c), tag, idx < list.length - 1, idx > 0)}
    <div class="sums">
      ${sum('รายจ่าย', baht(c.expense))}
      ${sum('รายรับ', baht(c.income))}
      ${sum('เหลือจากงบ', baht(left), left < 0 ? 'bad' : '')}
    </div>
    ${c.invalid ? `<p class="hint warn">มี ${c.invalid} แถวในรอบนี้ที่อ่านยอดหรือประเภทไม่ได้ จึงไม่ถูกนับ</p>` : ''}
    <h3 class="section-title">รายจ่ายตามหมวด</h3>
    ${c.categories.length ? c.categories.map((cat) => `<section class="panel">
      <div class="panel-head"><h2>${esc(cat.name)}</h2><b>${baht(cat.total)}</b></div>
      ${bar(c.expense > 0 ? (cat.total / c.expense) * 100 : 0)}
      <ul class="items">${cat.rows.map(itemRow).join('')}</ul>
    </section>`).join('') : '<section class="panel"><p class="empty">ไม่มีรายจ่ายในรอบนี้</p></section>'}
    <h3 class="section-title">รายรับในรอบนี้</h3>
    <section class="panel">
      ${c.incomeRows.length ? `<div class="panel-head"><h2>รวมรายรับ</h2><b>${baht(c.income)}</b></div><ul class="items">${c.incomeRows.map(itemRow).join('')}</ul>` : '<p class="empty">ไม่มีรายการรายรับใน Daily Log ของรอบนี้</p>'}
    </section>`;
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
  const tag = b.ym === vm.fixYm ? 'รอบปัจจุบัน'
    : `${b.ym > vm.fixYm ? 'เดือนอนาคต' : 'ย้อนหลัง'}<button data-fix-now>กลับรอบปัจจุบัน</button>`;
  const blanks = b.items.filter((i) => i.amount == null).length;
  const [whole, dec] = baht(Math.abs(b.balance)).split('.');
  el.innerHTML = `${pager('fixPager', Calc.fmtYmLong(b.ym), Calc.fmtRange(range.start, range.end), tag, idx > 0, idx < list.length - 1)}
    <section class="panel balance">
      <span>เงินเหลือ</span>
      <div class="big ${b.balance < 0 ? 'bad' : ''}">${b.balance < 0 ? '−' : ''}${whole}.${dec}<small>บาท</small></div>
      <div class="equation">รายรับ ${baht(b.income)} − ยอดรวม ${baht(b.total)}</div>
    </section>
    <section class="panel">
      <ul class="items">${b.items.map((i) => `<li><span class="item-name">${esc(i.name)}</span>${i.amount == null ? '<span class="item-amt none">ยังไม่ระบุ</span>' : `<span class="item-amt">${baht(i.amount)}</span>`}</li>`).join('')}</ul>
      ${blanks ? `<p class="hint">ยอดรวมนับเฉพาะรายการที่ระบุแล้ว (ยังไม่ระบุ ${blanks} รายการ)</p>` : ''}
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
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ยอดผ่อนต่อเดือนตามเวลา รายละเอียดอยู่ในรายการด้านล่าง">
    <line class="grid" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>
    <path class="area" d="${area}"/><path class="line" d="${d}"/>${dots}${labels}
  </svg></div>`;
}

function loanCard(i, color) {
  if (i.done) {
    return `<section class="panel loan">
      <div class="loan-head"><h2>${esc(i.name)}</h2><span>ครบ ${i.totalMonths} งวด</span></div>
      <div class="loan-sub">จ่ายทั้งหมด ${baht(i.fullAmount)} · ผ่อนหมด ${esc(Calc.fmtYm(i.endMonth))}</div>
    </section>`;
  }
  return `<section class="panel loan">
    <div class="loan-head"><h2>${esc(i.name)}</h2><span>${Math.round(i.pct)}%</span></div>
    <div class="loan-sub">${baht(i.monthly)} × ${i.totalMonths} งวด = ${baht(i.fullAmount)}</div>
    ${bar(i.pct, 'thick', color)}
    <div class="loan-cols">
      <div class="loan-col"><h3>ผ่อนมาแล้ว</h3><p><b>${i.paid}</b> งวด · ${i.paid} เดือน</p><small>${baht(i.paidAmount)}</small></div>
      <div class="loan-col"><h3>เหลือ</h3><p><b>${i.left}</b> งวด · อีก ${i.left} เดือน</p><small>${baht(i.leftAmount)}</small></div>
    </div>
    <div class="loan-facts">
      <div><span>งวดถัดไปตัด</span><b>${esc(Calc.fmtDate(i.nextDue))}</b></div>
      <div><span>เดือนที่ผ่อนหมด</span><b>${esc(Calc.fmtYm(i.endMonth))}</b></div>
    </div>
  </section>`;
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
  el.innerHTML = `<section class="panel balance" style="margin-top:0">
      <span>ยอดผ่อนรวมต่อเดือนตอนนี้</span>
      <div class="big">${baht(monthly)}<small>บาท</small></div>
      ${pending.length ? `<div class="equation">ยังไม่รวม ${esc(pending.map((i) => i.name).join(', '))} ที่ยังไม่ถึงรอบงวดแรก</div>` : ''}
    </section>
    <h3 class="section-title">ยอดต่อเดือนจะเปลี่ยนเมื่อไร</h3>
    <section class="panel">
      ${stepChart(Calc.installmentSteps(vm.loans, vm.now))}
      ${tl ? `<ul class="tl">${tl}</ul>` : '<p class="empty">ไม่มีการเปลี่ยนแปลงข้างหน้า</p>'}
    </section>
    <h3 class="section-title">กำลังผ่อน</h3>
    ${active.length ? active.map((i) => loanCard(i, loanColor(items, i))).join('') : '<section class="panel"><p class="empty">ไม่มีรายการที่กำลังผ่อน</p></section>'}
    ${done.length ? `<h3 class="section-title">ผ่อนหมดแล้ว</h3>${done.map((i) => loanCard(i)).join('')}` : ''}`;
}

function showTab(name) {
  state.tab = name;
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
  $('#pageSub').textContent = state.tab === 'today' && state.data ? `${Calc.cycleName(vm.key)} · ${cycleRange(vm.current)}` : '';
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
