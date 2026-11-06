'use strict';

const APP_VERSION = '2026.11.07.9';
const KEYS = { setup: 'fa.setup', data: 'fa.data', synced: 'fa.synced', buddy: 'fa.buddy' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const baht = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
const signed = (n) => `${n > 0 ? '+' : '−'}${baht(Math.abs(n))}`;

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
  buddy: store.get(KEYS.buddy, 'tree'),
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
  try {
    saveData(await apiGet(state.setup));
    if (!quiet) toast('อัปเดตข้อมูลแล้ว');
  } catch (err) {
    console.error(err);
    state.syncError = err.message === 'unauthorized' ? 'TOKEN ไม่ถูกต้อง' : !navigator.onLine ? 'ไม่มีอินเทอร์เน็ต' : err instanceof TypeError ? 'เชื่อมต่อไม่สำเร็จ' : err.message;
    if (!quiet) toast(state.syncError, 3500);
  } finally {
    state.loading = false;
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
const TITLES = { today: 'วันนี้', cycles: 'รอบเงินเดือน', fixed: 'Fixed cost', loans: 'การผ่อน', settings: 'ตั้งค่า' };

// ตัวเลขสรุปปัดเป็นบาทเต็ม ส่วนรายการใช้ยอดจริง (ไม่แสดง .00)
const whole = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–');
const money = (n) => (Number.isInteger(n) ? whole(n) : baht(n));
const bigNum = (n) => { const [w, d] = baht(Math.abs(n)).split('.'); return `${n < 0 ? '−' : ''}${w}<i>.${d}</i>`; };
// หลอดน้ำ: น้ำเต็มหลอดไม่ต้องมีผิวน้ำ หลอดว่างไม่มีน้ำ
const bar = (pct) => {
  const p = Math.max(0, Math.min(100, pct));
  if (p <= 0) return '<div class="tube"><div class="tube-in"></div></div>';
  const w = `width:${p.toFixed(1)}%`;
  return `<div class="tube"><span class="tube-glow" style="${w}"></span><div class="tube-in"><i class="${p >= 100 ? 'full' : ''}" style="${w}"></i></div></div>`;
};
const pager = (id, title, sub, back, hasPrev, hasNext) => `<div class="pager" id="${id}">
  <button class="icon-btn" data-step="-1" aria-label="ก่อนหน้า" ${hasPrev ? '' : 'disabled'}>${CHEV_L}</button>
  <div class="pager-title"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
  <button class="icon-btn" data-step="1" aria-label="ถัดไป" ${hasNext ? '' : 'disabled'}>${CHEV_R}</button>
</div>${back ? `<div class="pager-back">${back}</div>` : ''}`;
const isNamed = (c) => !c.key.startsWith('x:');
const cycleTitle = (c) => (isNamed(c) ? Calc.cycleName(c.key) : (c.label || 'ไม่ระบุรอบ'));
const cycleRange = (c) => (c.start ? Calc.fmtRange(c.start, c.end) : 'อ่านช่วงวันที่ไม่ได้');
const dayLabel = (s) => { const d = Calc.parseYmd(s); return d ? Calc.fmtDate(d) : esc(s); };

const buddy = (leaves) => renderBuddy(state.buddy, leaves);

function viewModel() {
  const data = state.data;
  const now = today();
  const key = Calc.cycleKeyOf(now);
  const cycles = Calc.buildCycles(data?.daily || [], now);
  const loans = Calc.installmentSummary(data?.installments || [], now);
  const blocks = data?.fixCost || [];
  const fixYm = Calc.fixYmOf(now);
  const current = cycles.find((c) => c.key === key);
  return { now, key, fixYm, cycles, current, budget: Calc.budgetSummary(current, now), loans, blocks, block: blocks.find((b) => b.ym === fixYm) };
}

/* ---------- วันนี้ ---------- */
function paceStatus(b) {
  if (b.left < 0) return { cls: 'bad', icon: ICON_ALERT, text: `เกินงบ ${money(-b.left)}` };
  if (b.ahead > 0) return { cls: 'warn', icon: ICON_UP, text: `เร็วกว่าแผน ${money(b.ahead)}` };
  return { cls: 'good', icon: ICON_OK, text: b.ahead < 0 ? `ช้ากว่าแผน ${money(-b.ahead)}` : 'ตรงตามแผน' };
}

function budgetRing(b) {
  const cls = b.left < 0 ? 'bad' : ''; // เร็วกว่าแผนบอกที่ป้ายสถานะ วงเปลี่ยนสีเมื่อเกินงบเท่านั้น
  const used = b.pct > 0 ? `<circle class="ring-fill ${cls}" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="${b.pct.toFixed(2)} 100"/>` : '';
  const tick = `<circle class="ring-tick" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="0.7 100" stroke-dashoffset="${(-(b.plannedPct - 0.35)).toFixed(2)}"/>`;
  const glow = b.pct > 0 ? `<circle class="ring-glow ${cls}" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="${b.pct.toFixed(2)} 100" filter="url(#ringSoft)"/>` : '';
  return `<svg viewBox="0 0 120 120" role="img" aria-label="ใช้ไป ${baht(b.used)} จากงบ ${baht(b.budget)} แผนถึงวันนี้ ${baht(b.planned)}"><defs><filter id="ringSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><circle class="ring-track" cx="60" cy="60" r="53"/>${glow}${used}${tick}</svg>`;
}

function renderToday(vm) {
  const el = $('#view-today');
  if (!state.data) {
    el.innerHTML = state.syncError
      ? `<div class="banner bad">โหลดข้อมูลไม่สำเร็จ: ${esc(state.syncError)}</div>`
      : '<p class="empty-state">กำลังโหลดข้อมูล…</p>';
    return;
  }
  const b = vm.budget;
  const over = b.spentToday > b.allowedToday;
  const st = paceStatus(b);
  const banner = !state.setup
    ? '<div class="banner">ข้อมูลตัวอย่าง <button data-tab="settings">เชื่อมต่อ Google Sheet</button></div>'
    : state.syncError ? `<div class="banner bad">อัปเดตไม่สำเร็จ (${esc(state.syncError)}) แสดงข้อมูลล่าสุดที่มี</div>` : '';
  const invalid = vm.current.invalid ? `<p class="hint warn">มี ${vm.current.invalid} แถวที่อ่านไม่ได้ จึงไม่ถูกนับ</p>` : '';
  const blk = vm.block;
  el.innerHTML = `${banner}
    <section class="panel hero">
      <div class="ring">
        ${budgetRing(b)}
        ${buddy(b.leaves)}
      </div>
      <div class="today-num">
        <span>ใช้วันนี้ / ใช้ได้</span>
        <div class="num ${whole(b.spentToday).length + whole(b.allowedToday).length > 7 ? 'long' : ''}" aria-label="วันนี้ใช้ไป ${baht(b.spentToday)} จากที่ใช้ได้ ${baht(b.allowedToday)}"><b class="${over ? 'bad' : ''}">${whole(b.spentToday)}</b><i> / ${whole(b.allowedToday)}</i></div>
      </div>
      <div class="status ${st.cls}">${st.icon}<span>${esc(st.text)}</span></div>
      <div class="hero-foot">งบรอบนี้${b.left < 0 ? 'เกิน' : 'เหลือ'} ${whole(Math.abs(b.left))}</div>
    </section>
    ${invalid}
    <div class="pair">
      <button class="panel tile" data-goto="fixed" data-fix="${vm.fixYm}"><span>เงินเดือนเหลือ</span><b class="${blk && blk.balance < 0 ? 'bad' : ''}">${blk ? `${blk.balance < 0 ? '−' : ''}${whole(Math.abs(blk.balance))}` : '–'}</b><small>หัก Fixed cost แล้ว</small></button>
      <button class="panel tile" data-goto="loans"><span>ผ่อนรอบนี้</span><b>${whole(vm.loans.now)}</b><small>${vm.loans.items.filter((i) => !i.done).length - vm.loans.pending.length} รายการ</small></button>
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
      ${buddy(vm.budget.leaves)}
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
      ${buddy(vm.budget.leaves)}
      <span>เงินเหลือ</span>
      <div class="big ${b.balance < 0 ? 'bad' : ''}">${bigNum(b.balance)}</div>
      <div class="equation">รับ ${whole(b.income)} − จ่าย ${whole(b.total)}</div>
    </section>
    <section class="panel">
      <ul class="items">${b.items.map((i) => `<li><span class="item-name">${esc(i.name)}</span>${i.amount == null ? '<span class="item-amt none">ยังไม่ระบุ</span>' : `<span class="item-amt">${money(i.amount)}</span>`}</li>`).join('')}</ul>
    </section>`;
}

/* ---------- การผ่อน ---------- */
// กราฟเส้นขั้นบันได: แกนเวลาตามจริง ติดป้ายเฉพาะจุดที่ยอดเปลี่ยน รายการตัวเลขอยู่ในเดือนที่ยอดเปลี่ยน
function stepChart(steps) {
  if (steps.length < 2) return '';
  const W = 340, H = 156, top = 24, bottom = 126, left = 6, right = 334, R = 8;
  const idx = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m; };
  const t0 = idx(steps[0].ym), span = Math.max(1, idx(steps[steps.length - 1].ym) - t0);
  const max = Math.max(...steps.map((s) => s.amount), 1);
  const x = (s) => left + ((idx(s.ym) - t0) / span) * (right - left);
  const y = (a) => bottom - (a / max) * (bottom - top);
  // มุมบนของแต่ละขั้นโค้ง ส่วนมุมล่างเป็นตำแหน่งจุดพอดี
  let d = `M${x(steps[0]).toFixed(1)} ${y(steps[0].amount).toFixed(1)}`;
  steps.slice(1).forEach((s, i) => {
    const px = x(s), from = y(steps[i].amount), to = y(s.amount);
    const r = Math.min(R, Math.abs(to - from) / 2, (px - x(steps[i])) / 2);
    const sign = to >= from ? 1 : -1;
    d += `H${(px - r).toFixed(1)}Q${px.toFixed(1)} ${from.toFixed(1)} ${px.toFixed(1)} ${(from + sign * r).toFixed(1)}V${to.toFixed(1)}`;
  });
  const area = `${d}V${bottom}H${left}Z`;
  let lastX = -999;
  const labels = steps.map((s, i) => {
    const px = x(s);
    const last = i === steps.length - 1;
    const anchor = last ? 'end' : 'start';
    const showDate = last || px - lastX > 62;
    if (showDate) lastX = px;
    const vy = Math.max(12, y(s.amount) - 9);
    return `<text class="val" x="${(last ? right - 10 : px + 2).toFixed(1)}" y="${vy.toFixed(1)}" text-anchor="${anchor}">${Math.round(s.amount).toLocaleString('en-US')}</text>`
      + (showDate ? `<text x="${(last ? right : px).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(Calc.fmtYm(s.ym))}</text>` : '');
  }).join('');
  const dots = steps.map((s, i) => `<circle class="dot ${i ? '' : 'now'}" cx="${x(s).toFixed(1)}" cy="${y(s.amount).toFixed(1)}" r="${i ? 4 : 5.5}"/>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ยอดผ่อนต่อเดือนตามเวลา รายละเอียดอยู่ในรายการเดือนที่ยอดเปลี่ยน">
    <defs><linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1"><stop class="w-top" offset="0"/><stop class="w-low" offset="1"/></linearGradient><filter id="lineSoft" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <path class="area" d="${area}"/><path class="glow" d="${d}" filter="url(#lineSoft)"/><path class="line" d="${d}"/><path class="spark" d="${d}" pathLength="100"/>${dots}${labels}
  </svg></div>`;
}

const fact = (k, v) => `<div><span>${esc(k)}</span><b>${v}</b></div>`;

function loanRow(i) {
  return `<details>
    <summary><span class="row-name">${esc(i.name)}</span><b>${i.paid}/${i.totalMonths}</b>${CHEV_D}${bar(i.pct)}<small>${money(i.monthly)} ต่อเดือน · หมด ${esc(Calc.fmtYm(i.endMonth))}</small></summary>
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
  const tl = timeline.map((e) => {
    const what = [...e.started.map((n) => `เริ่ม ${n}`), ...e.ended.map((n) => `${n} หมด`)].join(' · ');
    return `<li>
      <b>${esc(Calc.fmtYm(e.ym))}</b><span class="delta">${signed(e.delta)}</span>
      <small>${esc(what)}</small><small>เหลือ ${baht(e.after)}</small>
    </li>`;
  }).join('');
  el.innerHTML = `<section class="panel balance">
      ${buddy(vm.budget.leaves)}
      <span>ผ่อนต่อเดือน</span>
      <div class="big">${bigNum(monthly)}</div>
      ${pending.length ? `<div class="equation">ยังไม่รวม ${esc(pending.map((i) => i.name).join(', '))}</div>` : ''}
    </section>
    <section class="panel list">
      ${active.length ? active.map((i) => loanRow(i)).join('') : '<p class="empty">ไม่มีรายการที่กำลังผ่อน</p>'}
    </section>
    <section class="panel list">
      ${stepChart(Calc.installmentSteps(vm.loans, vm.now))}
      ${tl ? `<details><summary><span class="row-name">เดือนที่ยอดเปลี่ยน</span>${CHEV_D}</summary><ul class="tl">${tl}</ul></details>` : '<p class="empty">ไม่มีการเปลี่ยนแปลงข้างหน้า</p>'}
    </section>`;
}

/* ---------- สลับหน้า ---------- */
function markTab(name) {
  $('#tabs').style.setProperty('--i', Object.keys(TITLES).indexOf(name));
  $$('#tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

let enterTimer;
function showTab(name) {
  const names = Object.keys(TITLES);
  const dir = Math.sign(names.indexOf(name) - names.indexOf(state.tab));
  state.tab = name;
  markTab(name);
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  $('#pageTitle').textContent = TITLES[name];
  $('#scroll').scrollTop = 0;
  if (name === 'settings') initSettings();
  render();
  if (!dir) return;
  // ชิ้นส่วนเลื่อนเข้าทีละชิ้นตามทิศทางของแท็บ เอาคลาสออกเพื่อไม่ให้เล่นซ้ำตอน sync
  const view = $(`#view-${name}`);
  [view, $('#titles')].forEach((el) => {
    el.style.setProperty('--dir', dir);
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
  });
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => { $$('.enter').forEach((el) => el.classList.remove('enter')); }, 1100);
}

function render() {
  const vm = viewModel();
  renderToday(vm);
  renderCycles(vm);
  renderFixed(vm);
  renderLoans(vm);
  $('#pageSub').textContent = state.tab === 'today' && state.data ? `${Calc.fmtDayMonth(vm.current.start)} – ${Calc.fmtDayMonth(vm.current.end)}` : '';
  // ป้ายนับวันเงินเข้า: น้ำในป้ายเพิ่มตามวันที่ผ่านไปของรอบ
  const pay = $('#payday');
  pay.hidden = !state.data || state.tab === 'settings';
  $('span', pay).textContent = `เงินเข้าอีก ${vm.budget.days} วัน`;
  $('i', pay).style.width = `${Math.max(8, vm.budget.plannedPct).toFixed(1)}%`;
}

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
  const locked = PALETTES[theme.palette]?.force;
  $('#themeSeg').classList.toggle('locked', !!locked);
  $$('#themeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.themeMode === (locked || theme.mode)));
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#palettes').innerHTML = Object.entries(PALETTES).map(([id, p]) => `
    <button type="button" class="palette${id === theme.palette ? ' active' : ''}" data-palette="${id}" aria-pressed="${id === theme.palette}">
      <i style="background:${gradientOf((p[dark ? 'dark' : 'light'] || p.light || p.dark).g)}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></i>${esc(p.name)}
    </button>`).join('');
}

function renderBuddyChoices() {
  $('#buddies').innerHTML = BUDDIES.map(([id, name]) => `<button type="button" class="buddy-choice${id === state.buddy ? ' active' : ''}" data-choose="${id}" aria-pressed="${id === state.buddy}">
    <i>${renderBuddy(id, 1)}</i>${esc(name)}
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
  renderBuddyChoices();
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
  renderBuddyChoices();
});
$('#buddies').addEventListener('click', (e) => {
  const b = e.target.closest('[data-choose]');
  if (!b) return;
  state.buddy = b.dataset.choose;
  store.set(KEYS.buddy, state.buddy);
  renderBuddyChoices();
  render();
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
    showTab('today');
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
  showTab('today');
});

/* ---------- gesture: ดึงลงเพื่อรีเฟรช ---------- */
const PULL_TRIGGER = 70;
let g = null;

$('#scroll').addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) return;
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

/* ---------- ลากแถบเมนู: ไฮไลท์ตามนิ้ว ปล่อยที่เมนูไหนก็ไปหน้านั้น ---------- */
(function initNavDrag() {
  const nav = $('#tabs');
  const names = Object.keys(TITLES);
  const START = 6; // ขยับเกินเท่านี้จึงนับเป็นการลาก น้อยกว่านี้เป็นการแตะปกติ
  let drag = null;
  let swallowClick = false;
  const geometry = () => {
    const r = nav.getBoundingClientRect();
    const inner = nav.clientWidth - 10; // padding แถบเมนูด้านละ 5px
    return { left: r.left + nav.clientLeft + 5, slot: inner / names.length };
  };
  const finish = (name) => {
    nav.classList.remove('dragging');
    nav.style.removeProperty('--x');
    drag = null;
    if (name && name !== state.tab) showTab(name); else markTab(state.tab);
  };
  nav.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    drag = { id: e.pointerId, x: e.clientX, moved: false };
  });
  nav.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) < START) return;
      drag.moved = true;
      nav.classList.add('dragging');
      try { nav.setPointerCapture(e.pointerId); } catch { /* ไม่รองรับก็ลากได้ */ }
    }
    const { left, slot } = geometry();
    const pos = Math.max(0, Math.min(slot * (names.length - 1), e.clientX - left - slot / 2));
    nav.style.setProperty('--x', `${pos}px`);
    drag.name = names[Math.round(pos / slot)];
    markTab(drag.name);
  });
  nav.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) { drag = null; return; }
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 300);
    finish(drag.name);
  });
  nav.addEventListener('pointercancel', () => { if (drag) finish(null); });
  nav.addEventListener('click', (e) => {
    if (swallowClick) { swallowClick = false; e.stopPropagation(); }
  }, true);
})();

/* ---------- wiring ---------- */
// แถบบนย่อตัวเมื่อเลื่อนลง
$('#scroll').addEventListener('scroll', (e) => {
  $('.shell').classList.toggle('scrolled', e.target.scrollTop > 12);
}, { passive: true });

// การ์ดที่กดขยาย: เลื่อนให้เห็นครบ ไม่โดนแถบเมนูบัง ถ้าสูงเกินจอให้เห็นหัวการ์ดก่อน
$('#scroll').addEventListener('toggle', (e) => {
  const el = e.target;
  if (el.tagName !== 'DETAILS' || !el.open) return;
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    const bottom = $('#tabs').getBoundingClientRect().top - 14;
    const top = $('#appBar').getBoundingClientRect().bottom + 6;
    const dy = Math.min(r.bottom - bottom, r.top - top);
    if (dy > 0) $('#scroll').scrollBy({ top: dy, behavior: 'smooth' });
  });
}, true);

document.addEventListener('click', (e) => {
  const pet = e.target.closest('[data-buddy]');
  if (pet) {
    if (pet.closest('#buddies')) return; // ในหน้าตั้งค่าแตะเพื่อเลือก ไม่ใช่เล่น
    pet.classList.remove('poke');
    void pet.offsetWidth;
    pet.classList.add('poke');
    setTimeout(() => pet.classList.remove('poke'), 700);
    return;
  }
  const tab = e.target.closest('[data-tab]');
  if (tab) { showTab(tab.dataset.tab); return; }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    if (goto.dataset.fix) state.fixYm = goto.dataset.fix;
    showTab(goto.dataset.goto);
    return;
  }
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
