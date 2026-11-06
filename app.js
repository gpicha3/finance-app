'use strict';

const APP_VERSION = '2026.11.06.2';
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
    state.syncError = err.message === 'unauthorized' ? 'TOKEN ไม่ถูกต้อง' : !navigator.onLine ? 'ไม่มีอินเทอร์เน็ต' : err.message || 'เชื่อมต่อไม่สำเร็จ';
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
const stat = (label, value, unit = '', cls = '') => `<div class="stat"><span class="stat-label">${esc(label)}</span><span class="stat-value ${cls}">${value}</span><span class="stat-unit">${esc(unit)}</span></div>`;
const bar = (pct, cls = '', extra = '') => `<div class="bar ${extra}"><i class="${cls}" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;
const kv = (k, v, cls = '', bCls = '') => `<div class="kv ${cls}"><span>${esc(k)}</span><b class="${bCls}">${v}</b></div>`;
const pager = (id, title, sub, hasPrev, hasNext) => `<div class="pager" id="${id}">
  <button class="icon-btn" data-step="-1" aria-label="ก่อนหน้า" ${hasPrev ? '' : 'disabled'}>${CHEV_L}</button>
  <div class="pager-title"><b>${esc(title)}</b><small>${sub}</small></div>
  <button class="icon-btn" data-step="1" aria-label="ถัดไป" ${hasNext ? '' : 'disabled'}>${CHEV_R}</button>
</div>`;
const cycleTitle = (c) => (c.start ? Calc.fmtRange(c.start, c.end) : (c.label || 'ไม่ระบุรอบ'));
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

/* ---------- หน้าแรก ---------- */
function renderHome(vm) {
  const el = $('#home');
  if (!state.data) {
    el.innerHTML = state.syncError
      ? `<div class="banner bad">โหลดข้อมูลไม่สำเร็จ: ${esc(state.syncError)}</div>`
      : '<p class="empty-state">กำลังโหลดข้อมูล…</p>';
    return;
  }
  const b = Calc.budgetSummary(vm.current, vm.now);
  const [whole, dec] = baht(Math.abs(b.left)).split('.');
  const over = b.left < 0;
  const barCls = over ? 'bad' : b.pct >= 85 ? 'warn' : '';
  const banner = !state.setup
    ? '<div class="banner">กำลังแสดงข้อมูลตัวอย่าง <button data-open="settings">เชื่อมต่อ Google Sheet</button></div>'
    : state.syncError ? `<div class="banner bad">อัปเดตไม่สำเร็จ (${esc(state.syncError)}) กำลังแสดงข้อมูลล่าสุดที่มี</div>` : '';
  const hint = vm.current.invalid ? `<p class="hint warn">มี ${vm.current.invalid} แถวในรอบนี้ที่อ่านยอดหรือประเภทไม่ได้ จึงไม่ถูกนับ</p>` : '';
  el.innerHTML = `${banner}
    <section class="hero">
      <span class="hero-label">${over ? 'ใช้เกินงบ' : 'เหลือในงบรอบนี้'} (บาท)</span>
      <div class="hero-value"><span class="hero-num ${over ? 'bad' : ''}">${over ? '−' : ''}${whole}</span><span class="hero-dec">.${dec}</span></div>
      <div class="hero-status">${esc(cycleTitle(vm.current))}</div>
      ${bar(b.pct, barCls)}
    </section>
    ${hint}
    <section class="stats">
      ${stat('ใช้ไป', baht(b.used), `จากงบ ${baht(b.budget)}`)}
      ${stat('เงินเดือนเข้าอีก', `${b.days} วัน`, Calc.fmtDate(b.payday))}
      ${stat('ใช้ได้ต่อวัน', baht(b.perDay), 'บาท/วัน')}
    </section>
    ${renderHomeFixed(vm)}
    ${renderHomeLoans(vm)}`;
}

function renderHomeFixed(vm) {
  const blk = vm.block;
  const range = Calc.fixPeriod(vm.fixYm);
  const body = blk
    ? `${kv('รายรับ', baht(blk.income))}${kv('Fixed cost', baht(blk.total))}${kv('เงินเหลือ', baht(blk.balance), 'total', blk.balance < 0 ? 'bad' : '')}${blk.items.some((i) => i.amount == null) ? '<p class="hint">มีบางรายการยังไม่ระบุยอด</p>' : ''}`
    : '<p class="empty-line">ไม่มีบล็อกของเดือนนี้ในแท็บ Fix cost</p>';
  return `<button class="card" data-open-fixed="${vm.fixYm}" type="button">
    <div class="card-head"><h2>รายรับ − Fixed cost</h2><small>${esc(Calc.fmtYmLong(vm.fixYm))}</small></div>
    <div class="hint">${esc(Calc.fmtRange(range.start, range.end))}</div>
    ${body}
  </button>`;
}

function renderHomeLoans(vm) {
  const active = vm.loans.items.filter((i) => !i.done);
  const doneCount = vm.loans.items.length - active.length;
  const rows = active.map((i) => `<div class="mini">
    <div class="mini-top"><b>${esc(i.name)}</b><span>${i.paid}/${i.totalMonths} งวด</span></div>
    ${bar(i.pct, 'good')}
    <small>เหลือ ${baht(i.leftAmount)} · หมด ${esc(Calc.fmtYm(i.endMonth))}</small>
  </div>`).join('');
  return `<button class="card" data-open="loans" type="button">
    <div class="card-head"><h2>สถานะผ่อน</h2><small>${baht(vm.loans.now)} /เดือน</small></div>
    ${rows || '<p class="empty-line">ไม่มีรายการที่กำลังผ่อน</p>'}
    ${doneCount ? `<p class="hint">ผ่อนหมดแล้ว ${doneCount} รายการ</p>` : ''}
  </button>`;
}

/* ---------- รอบเงินเดือน ---------- */
const itemRow = (r) => `<li>
  <span class="item-name">${esc(r.item) || '–'}</span><span class="item-amt">${baht(r.amount)}</span>
  <span class="item-sub">${dayLabel(r.date)}${r.note ? ` · ${esc(r.note)}` : ''}</span>
</li>`;

function renderCycles(vm) {
  const el = $('#cyclesBody');
  if (!state.data) { el.innerHTML = '<p class="empty-state">ยังไม่มีข้อมูล</p>'; return; }
  const list = vm.cycles;
  let idx = list.findIndex((c) => c.key === state.cycleKey);
  if (idx < 0) idx = list.findIndex((c) => c.key === vm.key);
  const c = list[idx];
  state.cycleKey = c.key;
  const isNow = c.key === vm.key;
  const left = Calc.round2(Calc.BUDGET - c.expense);
  const sub = isNow ? '<span class="badge">รอบปัจจุบัน</span>' : `<span class="badge muted">ย้อนหลัง</span><button class="text-link" data-cycle-now>กลับรอบปัจจุบัน</button>`;
  el.innerHTML = `${pager('cyclePager', cycleTitle(c), sub, idx < list.length - 1, idx > 0)}
    <section class="stats">
      ${stat('รายจ่าย', baht(c.expense), 'บาท')}
      ${stat('รายรับ', baht(c.income), 'บาท')}
      ${stat('เหลือจากงบ', baht(left), `งบ ${baht(Calc.BUDGET)}`, left < 0 ? 'bad' : '')}
    </section>
    ${c.invalid ? `<p class="hint warn">มี ${c.invalid} แถวในรอบนี้ที่อ่านยอดหรือประเภทไม่ได้ จึงไม่ถูกนับ</p>` : ''}
    <h3 class="section-title">รายจ่ายตามหมวด</h3>
    ${c.categories.length ? c.categories.map((cat) => `<section class="card">
      <div class="card-head"><h2>${esc(cat.name)}</h2><span class="sum">${baht(cat.total)}</span></div>
      <ul class="items">${cat.rows.map(itemRow).join('')}</ul>
    </section>`).join('') : '<section class="card"><p class="empty-line">ไม่มีรายจ่ายในรอบนี้</p></section>'}
    <h3 class="section-title">รายรับในรอบนี้</h3>
    <section class="card">
      ${c.incomeRows.length ? `<div class="card-head"><h2>รวมรายรับ</h2><span class="sum">${baht(c.income)}</span></div><ul class="items">${c.incomeRows.map(itemRow).join('')}</ul>` : '<p class="empty-line">ไม่มีรายการรายรับใน Daily Log ของรอบนี้</p>'}
    </section>`;
}

/* ---------- Fixed cost ---------- */
function renderFixed(vm) {
  const el = $('#fixedBody');
  const list = vm.blocks;
  if (!list.length) { el.innerHTML = '<p class="empty-state">ไม่มีข้อมูลในแท็บ Fix cost</p>'; return; }
  let idx = list.findIndex((b) => b.ym === state.fixYm);
  if (idx < 0) idx = list.findIndex((b) => b.ym === vm.fixYm);
  if (idx < 0) idx = list.length - 1;
  const b = list[idx];
  state.fixYm = b.ym;
  const range = Calc.fixPeriod(b.ym);
  const tag = b.ym === vm.fixYm ? '<span class="badge">รอบปัจจุบัน</span>'
    : `<span class="badge muted">${b.ym > vm.fixYm ? 'เดือนอนาคต' : 'ย้อนหลัง'}</span><button class="text-link" data-fix-now>กลับรอบปัจจุบัน</button>`;
  const blanks = b.items.filter((i) => i.amount == null).length;
  el.innerHTML = `${pager('fixPager', Calc.fmtYmLong(b.ym), `${esc(Calc.fmtRange(range.start, range.end))}<br>${tag}`, idx > 0, idx < list.length - 1)}
    <section class="card">
      <ul class="items">${b.items.map((i) => `<li><span class="item-name">${esc(i.name)}</span>${i.amount == null ? '<span class="item-amt none">ยังไม่ระบุ</span>' : `<span class="item-amt">${baht(i.amount)}</span>`}</li>`).join('')}</ul>
      ${blanks ? `<p class="hint">ยอดรวมนับเฉพาะรายการที่ระบุแล้ว (ยังไม่ระบุ ${blanks} รายการ)</p>` : ''}
    </section>
    <section class="card">
      ${kv('ยอดรวม', baht(b.total))}
      ${kv('รายรับ', baht(b.income))}
      ${kv('เงินเหลือ', baht(b.balance), 'total', b.balance < 0 ? 'bad' : '')}
    </section>`;
}

/* ---------- การผ่อน ---------- */
function loanCard(i) {
  if (i.done) {
    return `<section class="card">
      <div class="loan-head"><h2>${esc(i.name)}</h2><span>100%</span></div>
      <div class="loan-sub">${baht(i.monthly)} × ${i.totalMonths} งวด · ผ่อนหมด ${esc(Calc.fmtYm(i.endMonth))}</div>
      ${bar(100, 'good', 'loan-bar')}
      ${kv('ยอดที่จ่ายทั้งหมด', baht(i.fullAmount))}
    </section>`;
  }
  return `<section class="card">
    <div class="loan-head"><h2>${esc(i.name)}</h2><span>${Math.round(i.pct)}%</span></div>
    <div class="loan-sub">${baht(i.monthly)} × ${i.totalMonths} งวด = ${baht(i.fullAmount)}</div>
    ${bar(i.pct, 'good', 'loan-bar')}
    <div class="loan-cols">
      <div class="loan-col"><h3>ผ่อนมาแล้ว</h3><p><b>${i.paid}</b> งวด · ${i.paid} เดือน</p><p>${baht(i.paidAmount)}</p></div>
      <div class="loan-col"><h3>เหลือ</h3><p><b>${i.left}</b> งวด · อีก ${i.left} เดือน</p><p>${baht(i.leftAmount)}</p></div>
    </div>
    <div class="loan-facts">
      ${kv('งวดถัดไปตัด', esc(Calc.fmtDate(i.nextDue)))}
      ${kv('เดือนที่ผ่อนหมด', esc(Calc.fmtYm(i.endMonth)))}
    </div>
  </section>`;
}

function renderLoans(vm) {
  const el = $('#loansBody');
  const { items, now: monthly, timeline, pending } = vm.loans;
  if (!items.length) { el.innerHTML = '<p class="empty-state">ไม่มีข้อมูลในแท็บ Installments</p>'; return; }
  const active = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const tl = timeline.map((e) => {
    const what = [...e.started.map((n) => `เริ่ม ${n}`), ...e.ended.map((n) => `${n} หมด`)].join(' · ');
    return `<li>
      <b>${esc(Calc.fmtYm(e.ym))}</b><span class="${e.delta > 0 ? 'up' : 'down'}">${signed(e.delta)}</span>
      <small>${esc(what)}</small><small>เหลือ ${baht(e.after)} /เดือน</small>
    </li>`;
  }).join('');
  el.innerHTML = `<section class="card">
      <div class="hint">ยอดผ่อนรวมต่อเดือนตอนนี้</div>
      <div class="big">${baht(monthly)}<small>บาท</small></div>
      ${pending.length ? `<p class="hint">ยังไม่รวม ${esc(pending.map((i) => i.name).join(', '))} ที่ยังไม่ถึงรอบงวดแรก</p>` : ''}
    </section>
    <h3 class="section-title">ยอดต่อเดือนจะเปลี่ยนเมื่อไร</h3>
    <section class="card">${tl ? `<ul class="tl">${tl}</ul>` : '<p class="empty-line">ไม่มีการเปลี่ยนแปลงข้างหน้า</p>'}</section>
    <h3 class="section-title">กำลังผ่อน</h3>
    ${active.length ? active.map(loanCard).join('') : '<section class="card"><p class="empty-line">ไม่มีรายการที่กำลังผ่อน</p></section>'}
    ${done.length ? `<h3 class="section-title">ผ่อนหมดแล้ว</h3>${done.map(loanCard).join('')}` : ''}`;
}

function renderMenu(vm) {
  $('#mCycles').textContent = state.data ? `${vm.cycles.filter((c) => !c.key.startsWith('x:')).length} รอบใน Daily Log` : '';
  $('#mFixed').textContent = vm.blocks.length ? `ถึง ${Calc.fmtYmLong(vm.blocks[vm.blocks.length - 1].ym)}` : '';
  $('#mLoans').textContent = state.data ? `${baht(vm.loans.now)} บาทต่อเดือน` : '';
}

function render() {
  const vm = viewModel();
  renderHome(vm);
  renderCycles(vm);
  renderFixed(vm);
  renderLoans(vm);
  renderMenu(vm);
}

/* ---------- หน้าย่อย ---------- */
const stack = [];
const isOpen = (id) => stack.some((s) => s.id === id);
const topSheet = () => stack[stack.length - 1] || null;

function open(id) {
  const sheet = $(`#${id}`);
  if (!sheet || isOpen(id)) return;
  sheet.scrollTop = 0;
  sheet.classList.remove('closing');
  sheet.hidden = false;
  sheet.style.zIndex = 10 + stack.length * 2;
  if (id === 'settings') initSettings();
  sheet.classList.add('opening');
  const shell = $('.shell');
  shell.style.transform = ''; shell.style.opacity = ''; delete shell.dataset.inline;
  shell.classList.remove('unpushed');
  shell.classList.add('pushed');
  stack.push(sheet);
}

function closeTop({ instant = false } = {}) {
  const sheet = stack.pop();
  if (!sheet) return;
  document.activeElement?.blur?.();
  const shell = $('.shell');
  if (instant) {
    // ปิดหลังจากปัดย้อนกลับ: animation ทำไปแล้วด้วยนิ้ว
    sheet.hidden = true;
    sheet.classList.remove('opening', 'closing');
    shell.classList.remove('pushed', 'unpushed');
    delete shell.dataset.inline;
    return;
  }
  if (shell.dataset.inline) {
    // หน้าด้านหลังถูกจัดตำแหน่งด้วย inline style (หลังปัดไม่สุด) → เลื่อนกลับด้วย transition
    shell.style.transition = 'transform .32s ease-in, opacity .32s ease-in';
    shell.style.transform = '';
    shell.style.opacity = '';
    setTimeout(() => { shell.style.transition = ''; delete shell.dataset.inline; }, 340);
  } else {
    shell.classList.remove('pushed');
    shell.classList.add('unpushed');
    setTimeout(() => shell.classList.remove('unpushed'), 330);
  }
  sheet.classList.remove('opening');
  sheet.classList.add('closing');
  const done = () => { sheet.hidden = true; sheet.classList.remove('closing'); sheet.style.transform = ''; };
  if (reduceMotion) done(); else setTimeout(done, 320);
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
  $('#swatches').innerHTML = Object.entries(ACCENTS).map(([id, a]) => `
    <button type="button" class="swatch${id === theme.accent ? ' active' : ''}" data-accent="${id}" aria-label="${a.name}"
      style="--sw-l: ${a.light}; --sw-d: ${a.dark}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>`).join('');
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
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-accent]');
  if (!b) return;
  saveTheme({ ...loadTheme(), accent: b.dataset.accent });
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

/* ---------- gesture: ดึงลงเพื่อรีเฟรช (หน้าแรก) / ปัดจากขอบซ้ายเพื่อย้อนกลับ ---------- */
const PULL_TRIGGER = 70;
let g = null;

$('#homeScroll').addEventListener('touchstart', (e) => {
  if (stack.length || e.touches.length > 1) return;
  const tc = e.touches[0];
  g = { y: tc.clientY, x: tc.clientX, mode: null, pull: 0, atTop: $('#homeScroll').scrollTop <= 0, inner: $('#homeInner') };
}, { passive: true });

$('#homeScroll').addEventListener('touchmove', (e) => {
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
  $('svg', ptrEl).style.transform = `rotate(${g.pull * 4}deg)`;
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
$('#homeScroll').addEventListener('touchend', endPull);
$('#homeScroll').addEventListener('touchcancel', endPull);

function resetPull(inner) {
  inner.style.transform = '';
  const ptrEl = $('#ptr');
  ptrEl.classList.remove('loading');
  ptrEl.style.opacity = '';
  ptrEl.style.transform = '';
  $('svg', ptrEl).style.transform = '';
}

async function refreshFromPull(inner) {
  const ptrEl = $('#ptr');
  inner.style.transform = 'translateY(56px)';
  ptrEl.style.transform = 'translateY(14px) scale(1)';
  ptrEl.style.opacity = 1;
  $('svg', ptrEl).style.transform = '';
  ptrEl.classList.add('loading');
  if (state.setup) await sync();
  else { await wait(600); toast('ยังไม่ได้เชื่อมต่อ Google Sheet'); }
  resetPull(inner);
}

// ปัดจากขอบซ้ายเพื่อย้อนกลับ (เหมือนแอป iOS)
let edge = null;
const BACK_SHIFT = 22; // หน้าด้านหลังถูกเลื่อนไปทางซ้าย 22% (ตรงกับ animation shell-back)
document.addEventListener('touchstart', (e) => {
  const sheet = topSheet();
  const tc = e.touches[0];
  if (!sheet || tc.clientX > 24) return;
  edge = { sheet, below: $('.shell'), x: tc.clientX, t: performance.now(), dx: 0, started: false };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!edge) return;
  const { sheet, below } = edge;
  if (!edge.started) {
    edge.started = true;
    sheet.classList.remove('opening');
    below.classList.remove('pushed', 'unpushed');
    for (const el of [sheet, below]) el.style.transition = 'none';
  }
  edge.dx = Math.max(0, e.touches[0].clientX - edge.x);
  const p = Math.min(1, edge.dx / innerWidth);
  sheet.style.transform = `translateX(${edge.dx}px)`;
  sheet.style.boxShadow = '-12px 0 30px rgba(0,0,0,.25)';
  below.style.transform = `translateX(${-BACK_SHIFT * (1 - p)}%)`;
  below.style.opacity = String(0.6 + 0.4 * p);
  e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => {
  if (!edge) return;
  const { sheet, below, dx, t: t0, started } = edge;
  edge = null;
  if (!started) return;
  const ease = 'cubic-bezier(.22, 1, .36, 1)';
  for (const el of [sheet, below]) el.style.transition = `transform .3s ${ease}, opacity .3s ${ease}`;
  const commit = dx > innerWidth * 0.33 || dx / Math.max(1, performance.now() - t0) > 0.5;
  if (commit) {
    sheet.style.transform = 'translateX(100%)';
    below.style.transform = 'translateX(0)';
    below.style.opacity = '1';
    setTimeout(() => {
      closeTop({ instant: true });
      for (const el of [sheet, below]) { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; el.style.boxShadow = ''; }
    }, 300);
  } else {
    // ปัดไม่สุด: เด้งกลับ หน้าด้านหลังค้างไว้ที่ตำแหน่งถูกเลื่อน (เก็บเป็น inline style)
    sheet.style.transform = '';
    below.style.transform = `translateX(-${BACK_SHIFT}%)`;
    below.style.opacity = '0.6';
    below.dataset.inline = '1';
    setTimeout(() => { sheet.style.transition = ''; sheet.style.boxShadow = ''; below.style.transition = ''; }, 320);
  }
});

/* ---------- wiring ---------- */
$('#syncBtn').addEventListener('click', () => {
  if (state.setup) sync();
  else toast('ยังไม่ได้เชื่อมต่อ Google Sheet');
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { closeTop(); return; }
  const fixedOpener = e.target.closest('[data-open-fixed]');
  if (fixedOpener) { state.fixYm = fixedOpener.dataset.openFixed; render(); open('fixed'); return; }
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
