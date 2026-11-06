'use strict';

const APP_VERSION = '2026.11.07.15';
const KEYS = { setup: 'fa.setup', data: 'fa.data', synced: 'fa.synced', buddy: 'fa.buddy', loanChart: 'fa.loanChart' };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const baht = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');

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
    return `${Calc.thDayMonth(p.start)}–${Calc.thDayMonth(p.end)}`;
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
  loanChart: store.get(KEYS.loanChart, 'timeline'),
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
    if (!quiet) toast(t('updated'));
  } catch (err) {
    console.error(err);
    state.syncError = err.message === 'unauthorized' ? t('bad_token') : !navigator.onLine ? t('offline') : err instanceof TypeError ? t('net_failed') : err.message;
    if (!quiet) toast(state.syncError, 3500);
  } finally {
    state.loading = false;
    render();
  }
}

/* ---------- ส่วนที่ใช้ร่วมกัน ---------- */
const CHEV_D = '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const ICON_ALERT = '<svg viewBox="0 0 24 24"><path d="M12 4v10M12 19v.5"/></svg>';
const TABS = ['today', 'cycles', 'fixed', 'loans', 'settings'];

// ตัวเลขสรุปปัดเป็นบาทเต็ม ส่วนรายการใช้ยอดจริง (ไม่แสดง .00)
const plain = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–');
// หน่วยเล็กกว่าตัวเลขเล็กน้อย whole และ money คืนค่าเป็น HTML ส่วน aria-label ใช้ moneyText
const unitTag = () => `<span class="u"> ${t('currency')}</span>`;
const amount = (n) => (Number.isInteger(n) ? plain(n) : baht(n));
const whole = (n) => `${plain(n)}${unitTag()}`;
const money = (n) => `${amount(n)}${unitTag()}`;
const moneyText = (n) => `${amount(n)} ${t('currency')}`;
const unit = () => `<i class="unit"> ${t('currency')}</i>`;
const signed = (n) => `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`;
const bigNum = (n) => { const [w, d] = baht(Math.abs(n)).split('.'); return `${n < 0 ? '−' : ''}${w}<i>.${d} ${t('currency')}</i>`; };
// หลอดน้ำ: หลอดว่างไม่มีน้ำและไม่เรือง
const bar = (pct) => {
  const p = Math.max(0, Math.min(100, pct));
  if (p <= 0) return '<div class="tube"><div class="tube-in"></div></div>';
  const w = `width:${p.toFixed(1)}%`;
  return `<div class="tube"><span class="tube-glow" style="${w}"></span><div class="tube-in"><i style="${w}"></i></div></div>`;
};
// เลือกรอบด้วยการปัด จุดด้านล่างบอกตำแหน่งจากเก่าไปใหม่
const pager = (id, title, sub, back, pos, total) => {
  const from = Math.max(0, Math.min(pos - 3, total - 7));
  const dots = Array.from({ length: Math.min(7, total) }, (_, i) => `<i class="${from + i === pos ? 'on' : ''}"></i>`).join('');
  return `<div class="pager" id="${id}">
  <div class="pager-title"><b>${esc(title)}</b><small>${esc(sub)}</small></div>
  ${total > 1 ? `<div class="pager-dots" aria-hidden="true">${dots}</div>` : ''}
</div>${back ? `<div class="pager-back">${back}</div>` : ''}`;
};
const isNamed = (c) => !c.key.startsWith('x:');
const cycleTitle = (c) => (isNamed(c) ? Calc.cycleName(c.key) : (c.label || '-'));
const cycleRange = (c) => (c.start ? Calc.fmtRange(c.start, c.end) : t('range_unreadable'));
const dayLabel = (s) => { const d = Calc.parseYmd(s); return d ? Calc.fmtDate(d) : esc(s); };

const buddy = (b) => renderBuddy(state.buddy, b.leaves, b.mood);

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
  if (b.left < 0) return { cls: 'bad', icon: ICON_ALERT, text: t('over_budget', money(-b.left)) };
  if (b.ahead > 0) return { cls: 'warn', icon: ICON_UP, text: t('ahead', money(b.ahead)) };
  return { cls: 'good', icon: ICON_OK, text: b.ahead < 0 ? t('behind', money(-b.ahead)) : t('on_plan') };
}

function budgetRing(b) {
  const cls = b.left < 0 ? 'bad' : ''; // เร็วกว่าแผนบอกที่ป้ายสถานะ วงเปลี่ยนสีเมื่อเกินงบเท่านั้น
  const used = b.pct > 0 ? `<circle class="ring-fill ${cls}" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="${b.pct.toFixed(2)} 100"/>` : '';
  const tick = `<circle class="ring-tick" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="0.7 100" stroke-dashoffset="${(-(b.plannedPct - 0.35)).toFixed(2)}"/>`;
  const glow = b.pct > 0 ? `<circle class="ring-glow ${cls}" cx="60" cy="60" r="53" pathLength="100" stroke-dasharray="${b.pct.toFixed(2)} 100" filter="url(#ringSoft)"/>` : '';
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${esc(t('ring_aria', moneyText(b.used), moneyText(b.budget), moneyText(b.planned)))}"><defs><filter id="ringSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><circle class="ring-track" cx="60" cy="60" r="53"/>${glow}${used}${tick}</svg>`;
}

function renderToday(vm) {
  const el = $('#view-today');
  if (!state.data) {
    el.innerHTML = state.syncError
      ? `<div class="banner bad">${esc(t('load_failed', state.syncError))}</div>`
      : `<p class="empty-state">${t('loading')}</p>`;
    return;
  }
  const b = vm.budget;
  const over = b.spentToday > b.allowedToday;
  const st = paceStatus(b);
  const banner = !state.setup
    ? `<div class="banner">${t('demo')} <button data-tab="settings">${t('connect_sheet')}</button></div>`
    : state.syncError ? `<div class="banner bad">${esc(t('sync_failed', state.syncError))}</div>` : '';
  const invalid = vm.current.invalid ? `<p class="hint warn">${t('invalid_rows', vm.current.invalid)}</p>` : '';
  const blk = vm.block;
  el.innerHTML = `${banner}
    <section class="panel hero">
      <div class="ring">
        ${budgetRing(b)}
        ${buddy(b)}
      </div>
      <div class="today-num">
        <span>${t('today_pair')}</span>
        <div class="num ${plain(b.spentToday).length + plain(b.allowedToday).length > 7 ? 'long' : ''}" aria-label="${esc(t('today_aria', moneyText(b.spentToday), moneyText(b.allowedToday)))}"><b class="${over ? 'bad' : ''}">${plain(b.spentToday)}</b><i> / ${whole(b.allowedToday)}</i></div>
      </div>
      <div class="status ${st.cls}">${st.icon}<span>${st.text}</span></div>
      <div class="hero-foot">${t(b.left < 0 ? 'budget_over' : 'budget_left', whole(Math.abs(b.left)))}</div>
    </section>
    ${invalid}
    <div class="pair">
      <button class="panel tile" data-goto="fixed" data-fix="${vm.fixYm}"><span>${t('salary_left')}</span><b class="${blk && blk.balance < 0 ? 'bad' : ''}">${blk ? `${blk.balance < 0 ? '−' : ''}${plain(Math.abs(blk.balance))}${unit()}` : '–'}</b><small>${t('after_fixed')}</small></button>
      <button class="panel tile" data-goto="loans"><span>${t('loans_cycle')}</span><b>${plain(vm.loans.now)}${unit()}</b><small>${t('item_count', vm.loans.items.filter((i) => !i.done).length - vm.loans.pending.length)}</small></button>
    </div>`;
}

/* ---------- รอบเงินเดือน ---------- */
const itemRow = (r) => `<li>
  <span class="item-name">${esc(r.item) || '–'}</span><span class="item-amt">${money(r.amount)}</span>
  <span class="item-sub">${dayLabel(r.date)}${r.note ? ` · ${esc(r.note)}` : ''}</span>
</li>`;

function renderCycles(vm) {
  const el = $('#view-cycles');
  if (!state.data) { el.innerHTML = `<p class="empty-state">${t('no_data')}</p>`; return; }
  const list = vm.cycles;
  let idx = list.findIndex((c) => c.key === state.cycleKey);
  if (idx < 0) idx = list.findIndex((c) => c.key === vm.key);
  const c = list[idx];
  state.cycleKey = c.key;
  const left = Calc.round2(Calc.BUDGET - c.expense);
  const back = c.key === vm.key ? '' : `<button data-cycle-now>${t('back_current')}</button>`;
  el.innerHTML = `${pager('cyclePager', cycleTitle(c), cycleRange(c), back, list.length - 1 - idx, list.length)}
    <section class="panel balance">
      ${buddy(vm.budget)}
      <span>${t('left_total')}</span>
      <div class="big"><b class="${left < 0 ? 'bad' : ''}">${left < 0 ? '−' : ''}${plain(Math.abs(left))}</b><i> / ${whole(Calc.BUDGET)}</i></div>
      <div class="equation">${t('spent_v', money(c.expense))}${c.income ? ` · ${t('extra_income', whole(c.income))}` : ''}</div>
    </section>
    ${c.invalid ? `<p class="hint warn">${t('invalid_rows', c.invalid)}</p>` : ''}
    <section class="panel list">
      ${c.categories.length ? c.categories.map((cat) => `<details>
        <summary><span class="row-name">${esc(cat.name)}</span><b>${money(cat.total)}</b>${CHEV_D}${bar(c.expense > 0 ? (cat.total / c.expense) * 100 : 0)}</summary>
        <ul class="items">${cat.rows.map(itemRow).join('')}</ul>
      </details>`).join('') : `<p class="empty">${t('no_expense')}</p>`}
    </section>
    ${c.incomeRows.length ? `<section class="panel list"><details>
      <summary><span class="row-name">${t('income')}</span><b>${money(c.income)}</b>${CHEV_D}</summary>
      <ul class="items">${c.incomeRows.map(itemRow).join('')}</ul>
    </details></section>` : ''}`;
}

/* ---------- Fixed cost ---------- */
function renderFixed(vm) {
  const el = $('#view-fixed');
  const list = vm.blocks;
  if (!list.length) { el.innerHTML = `<p class="empty-state">${t('no_fix')}</p>`; return; }
  let idx = list.findIndex((b) => b.ym === state.fixYm);
  if (idx < 0) idx = list.findIndex((b) => b.ym === vm.fixYm);
  if (idx < 0) idx = list.length - 1;
  const b = list[idx];
  state.fixYm = b.ym;
  const range = Calc.fixPeriod(b.ym);
  const back = b.ym === vm.fixYm ? '' : `<button data-fix-now>${t('back_current')}</button>`;
  el.innerHTML = `${pager('fixPager', Calc.fmtYmLong(b.ym), Calc.fmtRange(range.start, range.end), back, idx, list.length)}
    <section class="panel balance">
      ${buddy(vm.budget)}
      <span>${t('money_left')}</span>
      <div class="big ${b.balance < 0 ? 'bad' : ''}">${bigNum(b.balance)}</div>
      <div class="equation">${t('in_out', whole(b.income), whole(b.total))}</div>
    </section>
    <section class="panel">
      <ul class="items">${b.items.map((i) => `<li><span class="item-name">${esc(i.name)}</span>${i.amount == null ? '<span class="item-amt none">-</span>' : `<span class="item-amt">${money(i.amount)}</span>`}</li>`).join('')}</ul>
    </section>`;
}

/* ---------- การผ่อน ---------- */
// ไทม์ไลน์: อ่านเป็นลำดับเหตุการณ์ว่าเดือนไหนยอดเปลี่ยนเท่าไร
function loanTimeline(monthly, timeline) {
  if (!timeline.length) return `<p class="empty">${t('no_changes')}</p>`;
  const what = (e) => [...e.started.map((n) => t('tl_start', n)), ...e.ended.map((n) => t('tl_end', n))].join(' · ');
  return `<ol class="events">
    <li class="now"><i></i><b>${t('now')}</b><span class="ev-amt">${money(monthly)}</span></li>
    ${timeline.map((e) => `<li><i></i><b>${esc(Calc.fmtYm(e.ym))}</b><span class="ev-amt">${signed(e.delta)}</span>
      <small>${esc(what(e))}</small><small class="ev-left">${e.after > 0 ? t('tl_left', money(e.after)) : t('debt_free')}</small></li>`).join('')}
  </ol>`;
}

// พื้นที่ซ้อน: ความสูงรวมคือยอดต่อเดือน แต่ละชั้นคือหนึ่งรายการ ใช้สีหลักไล่อ่อนลงตามลำดับ มีคำอธิบายชื่อและยอดใต้กราฟ
const STACK_SHADES = [100, 74, 54, 36, 22];
const stackColor = (i) => `color-mix(in srgb, var(--accent) ${STACK_SHADES[Math.min(i, STACK_SHADES.length - 1)]}%, var(--panel))`;

function loanStack(stack) {
  const { months, series, totals } = stack;
  if (!months.length) return `<p class="empty">${t('no_changes')}</p>`;
  const W = 340, H = 150, top = 22, base = 126;
  const max = Math.max(...totals, 1);
  const n = months.length;
  const x = (i) => (i / n) * W;
  const y = (v) => base - (v / max) * (base - top);
  const stepTop = (values) => values.map((v, i) => `${i ? 'H' : 'M'}${x(i).toFixed(1)}${i ? `V${y(v).toFixed(1)}` : ` ${y(v).toFixed(1)}`}`).join('') + `H${W}`;
  let floor = months.map(() => 0);
  const layers = series.map((s, si) => {
    const tops = floor.map((f, m) => f + s.values[m]);
    let back = `V${y(floor[n - 1]).toFixed(1)}`;
    for (let m = n - 1; m >= 0; m -= 1) {
      back += `H${x(m).toFixed(1)}`;
      if (m > 0) back += `V${y(floor[m - 1]).toFixed(1)}`;
    }
    floor = tops;
    return `<path class="layer" d="${stepTop(tops)}${back}Z" style="fill:${stackColor(si)}"/>`;
  }).join('');
  const surface = stepTop(totals);
  const legend = series.map((s, si) => `<li><i style="background:${stackColor(si)}"></i><span>${esc(s.name)}</span><b>${money(s.monthly)}</b></li>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chart_aria'))}">
    <defs><filter id="lineSoft" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <line class="grid" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
    ${layers}
    <path class="glow" d="${surface}" filter="url(#lineSoft)"/><path class="line" d="${surface}"/><path class="spark" d="${surface}" pathLength="100"/>
    <text class="val" x="1" y="${(y(totals[0]) - 7).toFixed(1)}">${plain(totals[0])}<tspan class="u"> ${t('currency')}</tspan></text>
    <text x="1" y="${H - 8}">${esc(Calc.fmtYm(months[0]))}</text>
    <text x="${W - 1}" y="${H - 8}" text-anchor="end">${esc(Calc.fmtYm(months[n - 1]))}</text>
  </svg><ul class="legend">${legend}</ul></div>`;
}

const fact = (k, v) => `<div><span>${esc(k)}</span><b>${v}</b></div>`;

function loanRow(i) {
  return `<details>
    <summary><span class="row-name">${esc(i.name)}</span><b>${i.paid}/${i.totalMonths}</b>${CHEV_D}${bar(i.pct)}<small>${t('loan_line', money(i.monthly), esc(Calc.fmtYm(i.endMonth)))}</small></summary>
    <div class="facts">
      ${fact(t('paid'), money(i.paidAmount))}
      ${fact(t('remaining'), money(i.leftAmount))}
      ${fact(t('full_amount'), money(i.fullAmount))}
      ${fact(t('next_due'), esc(Calc.fmtDate(i.nextDue)))}
    </div>
  </details>`;
}

function renderLoans(vm) {
  const el = $('#view-loans');
  const { items, now: monthly, timeline, pending } = vm.loans;
  if (!items.length) { el.innerHTML = `<p class="empty-state">${t('no_loans')}</p>`; return; }
  const active = items.filter((i) => !i.done);
  el.innerHTML = `<section class="panel balance">
      ${buddy(vm.budget)}
      <span>${t('per_month')}</span>
      <div class="big">${bigNum(monthly)}</div>
      ${pending.length ? `<div class="equation">${esc(t('not_included', pending.map((i) => i.name).join(', ')))}</div>` : ''}
    </section>
    <section class="panel list">
      ${active.length ? active.map((i) => loanRow(i)).join('') : `<p class="empty">${t('no_active')}</p>`}
    </section>
    <section class="panel loan-charts">
      <div class="segmented small" id="chartSeg">
        <i class="seg-glider" aria-hidden="true"></i>
        <button type="button" data-chart="timeline">${t('chart_timeline')}</button>
        <button type="button" data-chart="stack">${t('chart_stack')}</button>
      </div>
      ${state.loanChart === 'stack' ? loanStack(Calc.installmentStack(vm.loans, vm.now)) : loanTimeline(monthly, timeline)}
    </section>`;
  const seg = $('#chartSeg');
  markSeg(seg, state.loanChart, 'chart');
  dragSelect(seg, {
    names: () => ['timeline', 'stack'],
    preview: (name) => markSeg(seg, name, 'chart'),
    commit: pickLoanChart,
    restore: () => markSeg(seg, state.loanChart, 'chart'),
  });
}

function pickLoanChart(name) {
  state.loanChart = name;
  store.set(KEYS.loanChart, name);
  renderLoans(viewModel());
}

/* ---------- สลับหน้า ---------- */
function markTab(name) {
  $('#tabs').style.setProperty('--i', TABS.indexOf(name));
  $$('#tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

let enterTimer;
// ชิ้นส่วนเลื่อนเข้าทีละชิ้นตามทิศทาง เอาคลาสออกเพื่อไม่ให้เล่นซ้ำตอน sync
function playEnter(els, dir) {
  els.forEach((el) => {
    el.style.setProperty('--dir', dir);
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
  });
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => { $$('.enter').forEach((el) => el.classList.remove('enter')); }, 1100);
}

function showTab(name) {
  const dir = Math.sign(TABS.indexOf(name) - TABS.indexOf(state.tab));
  state.tab = name;
  markTab(name);
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  $('#scroll').scrollTop = 0;
  if (name === 'settings') initSettings();
  render();
  if (dir) playEnter([$(`#view-${name}`), $('#titles')], dir);
}

// เปลี่ยนภาษาทั้งแอป ข้อความในหน้า HTML ใช้ data-i18n ส่วนที่เหลือมาจาก render()
function applyLanguage() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#tabs').setAttribute('aria-label', t('nav_label'));
  if (state.tab === 'settings') initSettings();
  render();
}

function render() {
  const vm = viewModel();
  renderToday(vm);
  renderCycles(vm);
  renderFixed(vm);
  renderLoans(vm);
  $('#pageTitle').textContent = t(`title_${state.tab}`);
  $('#pageSub').textContent = state.tab === 'today' && state.data ? `${Calc.fmtDayMonth(vm.current.start)} – ${Calc.fmtDayMonth(vm.current.end)}` : '';
  // ป้ายนับวันเงินเข้า: น้ำในป้ายเพิ่มตามวันที่ผ่านไปของรอบ
  const pay = $('#payday');
  pay.hidden = !state.data || state.tab === 'settings';
  $('span', pay).textContent = t('payday', vm.budget.days);
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

function markSeg(seg, value, attr) {
  const buttons = $$('button', seg);
  seg.style.setProperty('--n', buttons.length);
  seg.style.setProperty('--i', Math.max(0, buttons.findIndex((b) => b.dataset[attr] === value)));
  buttons.forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
}

function renderThemeControls() {
  const theme = loadTheme();
  const locked = PALETTES[theme.palette]?.force;
  $('#themeSeg').classList.toggle('locked', !!locked);
  markSeg($('#themeSeg'), locked || theme.mode, 'themeMode');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#palettes').innerHTML = Object.entries(PALETTES).map(([id, p]) => `
    <button type="button" class="palette${id === theme.palette ? ' active' : ''}" data-palette="${id}" aria-pressed="${id === theme.palette}">
      <i style="background:${gradientOf((p[dark ? 'dark' : 'light'] || p.light || p.dark).g)}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></i>${esc(t(`pal_${id}`))}
    </button>`).join('');
}

function renderBuddyChoices() {
  $('#buddies').innerHTML = BUDDIES.map((id) => `<button type="button" class="buddy-choice${id === state.buddy ? ' active' : ''}" data-choose="${id}" aria-pressed="${id === state.buddy}">
    <i>${renderBuddy(id, 1, 'good')}</i>${esc(t(`buddy_${id}`))}
  </button>`).join('');
}

function renderConnection(editing = false) {
  const connected = !!state.setup;
  $('#connCard').hidden = !connected || editing;
  $('#connActions').hidden = !connected || editing;
  $('#setupEditor').hidden = connected && !editing;
  $('#cancelEditBtn').hidden = !connected;
  if (connected) {
    const at = new Date(state.synced);
    $('#connSynced').textContent = state.synced ? t('last_update', `${Calc.fmtDate(at)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`) : '';
  }
  $('#setupInput').value = editing && connected ? `${state.setup.url}?k=${state.setup.k}` : '';
  $('#settingsStatus').textContent = connected ? '' : t('not_connected');
  $('#settingsStatus').className = 'hint';
}

function initSettings() {
  renderThemeControls();
  markSeg($('#langSeg'), LANG, 'lang');
  renderBuddyChoices();
  renderConnection();
  $('#appVersion').textContent = APP_VERSION;
}

function pickMode(mode) {
  saveTheme({ ...loadTheme(), mode });
  renderThemeControls();
}
function pickLanguage(lang) {
  setLanguage(lang);
  applyLanguage();
}
$('#themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-mode]');
  if (b) pickMode(b.dataset.themeMode);
});
$('#langSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b) pickLanguage(b.dataset.lang);
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
    status.textContent = t('bad_setup');
    status.className = 'hint bad';
    return;
  }
  status.textContent = t('testing');
  status.className = 'hint';
  try {
    const data = await apiGet(setup);
    state.setup = setup;
    store.set(KEYS.setup, setup);
    saveData(data);
    state.cycleKey = null; state.fixYm = null;
    showTab('today');
    toast(t('connected_toast'));
  } catch (err) {
    status.textContent = err.message === 'unauthorized' ? t('bad_token') : t('connect_failed', err.message);
    status.className = 'hint bad';
  }
});

$('#clearSetupBtn').addEventListener('click', () => {
  if (!confirm(t('confirm_clear'))) return;
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
  else { await wait(600); toast(t('no_sheet')); }
  resetPull(inner);
}

/* ---------- ลากเลือก: ไฮไลท์ตามนิ้ว ปล่อยที่ตัวเลือกไหนก็เลือกตัวนั้น ใช้กับแถบเมนูและปุ่มในหน้าตั้งค่า ---------- */
function dragSelect(el, { names, preview, commit, restore }) {
  const START = 6; // ขยับเกินเท่านี้จึงนับเป็นการลาก น้อยกว่านี้เป็นการแตะปกติ
  let drag = null;
  let swallowClick = false;
  const geometry = () => {
    const r = el.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    return { left: r.left + el.clientLeft + pad, slot: (el.clientWidth - pad * 2) / names().length };
  };
  const finish = (name) => {
    el.classList.remove('dragging');
    el.style.removeProperty('--x');
    drag = null;
    if (name) commit(name); else restore();
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) < START) return;
      drag.moved = true;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch { /* ไม่รองรับก็ลากได้ */ }
    }
    const { left, slot } = geometry();
    const list = names();
    const pos = Math.max(0, Math.min(slot * (list.length - 1), e.clientX - left - slot / 2));
    el.style.setProperty('--x', `${pos}px`);
    drag.name = list[Math.round(pos / slot)];
    preview(drag.name);
  });
  el.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) { drag = null; return; }
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 300);
    finish(drag.name);
  });
  el.addEventListener('pointercancel', () => { if (drag) finish(null); });
  el.addEventListener('click', (e) => {
    if (swallowClick) { swallowClick = false; e.stopPropagation(); }
  }, true);
}

dragSelect($('#tabs'), {
  names: () => TABS,
  preview: markTab,
  commit: (name) => { if (name !== state.tab) showTab(name); else markTab(name); },
  restore: () => markTab(state.tab),
});
dragSelect($('#themeSeg'), {
  names: () => $$('#themeSeg button').map((b) => b.dataset.themeMode),
  preview: (name) => markSeg($('#themeSeg'), name, 'themeMode'),
  commit: pickMode,
  restore: renderThemeControls,
});
dragSelect($('#langSeg'), {
  names: () => $$('#langSeg button').map((b) => b.dataset.lang),
  preview: (name) => markSeg($('#langSeg'), name, 'lang'),
  commit: pickLanguage,
  restore: () => markSeg($('#langSeg'), LANG, 'lang'),
});

/* ---------- ปัดซ้ายขวาเพื่อเปลี่ยนรอบ ---------- */
function stepPeriod(kind, d) {
  const vm = viewModel();
  if (kind === 'cycles') {
    // รายการรอบเรียงใหม่ไปเก่า d = 1 คือรอบที่ใหม่กว่า
    const i = vm.cycles.findIndex((c) => c.key === state.cycleKey);
    const next = vm.cycles[i - d];
    if (!next) return false;
    state.cycleKey = next.key;
    renderCycles(vm);
  } else {
    const i = vm.blocks.findIndex((b) => b.ym === state.fixYm);
    const next = vm.blocks[i + d];
    if (!next) return false;
    state.fixYm = next.ym;
    renderFixed(vm);
  }
  return true;
}

function swipePeriods(view, kind) {
  const TRIGGER = 48;
  let s = null;
  let swallowClick = false;
  const reset = () => { view.classList.remove('swiping'); view.style.transform = ''; };
  view.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, dx: 0 };
  });
  view.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (Math.abs(dx) < 12) return;
      s.on = true;
      view.classList.add('swiping');
      try { view.setPointerCapture(e.pointerId); } catch { /* ไม่รองรับก็ปัดได้ */ }
    }
    s.dx = dx;
    view.style.transform = `translateX(${(dx * 0.35).toFixed(1)}px)`;
  });
  view.addEventListener('pointerup', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { on, dx } = s;
    s = null;
    if (!on) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 300);
    reset();
    if (Math.abs(dx) < TRIGGER) return;
    const d = dx < 0 ? 1 : -1;
    if (stepPeriod(kind, d)) playEnter([view], d);
  });
  view.addEventListener('pointercancel', () => { s = null; reset(); });
  view.addEventListener('click', (e) => {
    if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
}
swipePeriods($('#view-cycles'), 'cycles');
swipePeriods($('#view-fixed'), 'fixed');

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
    const kind = pet.dataset.buddy;
    const cls = kind === 'tree' ? 'shake' : kind === 'person' ? 'jump' : 'bliss';
    pet.classList.remove(cls);
    void pet.offsetWidth;
    pet.classList.add(cls);
    if (kind === 'tree') burstLeaves(pet);
    setTimeout(() => pet.classList.remove(cls), cls === 'bliss' ? 1700 : 800);
    return;
  }
  const chart = e.target.closest('[data-chart]');
  if (chart) { pickLoanChart(chart.dataset.chart); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) { showTab(tab.dataset.tab); return; }
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    if (goto.dataset.fix) state.fixYm = goto.dataset.fix;
    showTab(goto.dataset.goto);
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

applyLanguage();
if (state.setup) sync({ quiet: true });
