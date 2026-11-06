'use strict';
// การคำนวณล้วน ๆ (ไม่แตะหน้าจอ) ใช้ทั้งในแอปและใน tests/calc.test.js
//
// กติการอบ: คีย์รอบ "YYYY-MM" = เดือนที่เงินเดือนเข้าตอนเริ่มรอบ (เดือน X)
//   - รอบงบ Daily Log ของคีย์ X = 26 X ถึง 24 ของเดือนถัดไป
//   - บล็อก Fix cost ของรอบนั้น = เดือนถัดไปของ X (ชื่อตามเดือนที่รอบสิ้นสุด)
//     เช่น รอบ 25 ต.ค. – 24 พ.ย. 2026 = บล็อก November 2026
//   - วันที่ 25 (เงินเดือนเข้า) นับเป็นรอบใหม่แล้ว
(function (root) {
  const PAY_DAY = 25;
  const BUDGET = 6400;
  const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const CATEGORIES = ['กิน', 'ของใช้', 'เที่ยว', 'เดินทาง', 'อื่นๆ'];
  const EXPENSE = 'รายจ่าย';
  const INCOME = 'รายรับ';

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- วันที่ ---------- */
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    return m ? new Date(+m[1], m[2] - 1, +m[3]) : null;
  }
  const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const ymParts = (ym) => ({ y: +ym.slice(0, 4), m: +ym.slice(5, 7) });
  function ymAdd(ym, n) {
    const { y, m } = ymParts(ym);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
  }
  const ymDay = (ym, day) => { const { y, m } = ymParts(ym); return new Date(y, m - 1, day); };
  const dayNumber = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5;
  const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);

  const fmtDayMonth = (d) => `${d.getDate()} ${TH_MONTHS[d.getMonth()]}`;
  const fmtDate = (d) => `${fmtDayMonth(d)} ${d.getFullYear()}`;
  const fmtYm = (ym) => { const { y, m } = ymParts(ym); return `${TH_MONTHS[m - 1]} ${y}`; };
  const fmtYmLong = (ym) => { const { y, m } = ymParts(ym); return `${TH_MONTHS_LONG[m - 1]} ${y}`; };
  const fmtRange = (a, b) => (a.getFullYear() === b.getFullYear()
    ? `${fmtDayMonth(a)} – ${fmtDate(b)}` : `${fmtDate(a)} – ${fmtDate(b)}`);

  /* ---------- รอบเงินเดือน ---------- */
  const cycleKeyOf = (d) => (d.getDate() >= PAY_DAY ? ymOf(d) : ymAdd(ymOf(d), -1));
  const budgetPeriod = (key) => ({ start: ymDay(key, PAY_DAY + 1), end: ymDay(ymAdd(key, 1), PAY_DAY - 1) });
  // บล็อก Fix cost: fixYm = ชื่อบล็อกในแท็บ Fix cost
  const fixYmOf = (d) => ymAdd(cycleKeyOf(d), 1);
  const fixPeriod = (fixYm) => ({ start: ymDay(ymAdd(fixYm, -1), PAY_DAY), end: ymDay(fixYm, PAY_DAY - 1) });
  const nextPayday = (today) => ymDay(ymAdd(cycleKeyOf(today), 1), PAY_DAY);

  const MONTH_INDEX = Object.fromEntries(TH_MONTHS.map((m, i) => [m.replace(/\./g, ''), i]));
  // "26 ต.ค.–24 พ.ย." → { startDay, startMonth, endDay, endMonth } (เดือนนับจาก 0)
  function parseCycleLabel(label) {
    const m = /^\s*(\d{1,2})\s*([^\d–—-]+?)\s*[–—-]\s*(\d{1,2})\s*([^\d]+?)\s*$/.exec(String(label || ''));
    if (!m) return null;
    const startMonth = MONTH_INDEX[m[2].replace(/[.\s]/g, '')];
    const endMonth = MONTH_INDEX[m[4].replace(/[.\s]/g, '')];
    if (startMonth === undefined || endMonth === undefined) return null;
    return { startDay: +m[1], startMonth, endDay: +m[3], endMonth };
  }

  // คอลัมน์รอบเงินเดือนไม่มีปี: ใช้คอลัมน์วันที่บอกปี โดยเลือกปีที่ทำให้วันเริ่มรอบใกล้วันที่ของแถวที่สุด
  function resolveCycle(row) {
    const label = String(row.cycle || '').trim();
    const parsed = parseCycleLabel(label);
    const date = parseYmd(row.date);
    if (!parsed || !date) return { key: `x:${label}`, label, start: null, end: null };
    const y = date.getFullYear();
    let start = null;
    for (const cand of [y - 1, y, y + 1]) {
      const d = new Date(cand, parsed.startMonth, parsed.startDay);
      if (!start || Math.abs(daysBetween(d, date)) < Math.abs(daysBetween(start, date))) start = d;
    }
    const endYear = start.getFullYear() + (parsed.endMonth < parsed.startMonth ? 1 : 0);
    return { key: ymOf(start), label, start, end: new Date(endYear, parsed.endMonth, parsed.endDay) };
  }

  /* ---------- Daily Log ---------- */
  function emptyCycle(key) {
    const period = key.startsWith('x:') ? { start: null, end: null } : budgetPeriod(key);
    return { key, label: key.startsWith('x:') ? key.slice(2) : '', start: period.start, end: period.end, rows: [], expense: 0, income: 0, invalid: 0, categories: [], incomeRows: [] };
  }

  // จัดกลุ่มตามคอลัมน์รอบเงินเดือน (ไม่ใช่เดือนปฏิทิน) เรียงจากใหม่ไปเก่า รอบที่อ่านรอบไม่ได้อยู่ท้ายสุด
  function buildCycles(daily, today) {
    const map = new Map([[cycleKeyOf(today), emptyCycle(cycleKeyOf(today))]]);
    (daily || []).forEach((row) => {
      const c = resolveCycle(row);
      if (!map.has(c.key)) map.set(c.key, emptyCycle(c.key));
      const cycle = map.get(c.key);
      if (c.start) { cycle.start = c.start; cycle.end = c.end; cycle.label = c.label; }
      cycle.rows.push(row);
    });
    const cycles = [...map.values()];
    cycles.forEach((cycle) => {
      const rows = [...cycle.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const cats = new Map();
      rows.forEach((r) => {
        const valid = Number.isFinite(r.amount) && (r.type === EXPENSE || r.type === INCOME);
        if (!valid) { cycle.invalid += 1; return; }
        if (r.type === INCOME) { cycle.income += r.amount; cycle.incomeRows.push(r); return; }
        cycle.expense += r.amount;
        const name = String(r.category || '').trim() || 'ไม่ระบุหมวด';
        if (!cats.has(name)) cats.set(name, { name, total: 0, rows: [] });
        const cat = cats.get(name);
        cat.total += r.amount;
        cat.rows.push(r);
      });
      cycle.expense = round2(cycle.expense);
      cycle.income = round2(cycle.income);
      const rank = (n) => { const i = CATEGORIES.indexOf(n); return i < 0 ? CATEGORIES.length : i; };
      cycle.categories = [...cats.values()]
        .map((c) => ({ ...c, total: round2(c.total) }))
        .sort((a, b) => rank(a.name) - rank(b.name));
    });
    return cycles.sort((a, b) => {
      const ax = a.key.startsWith('x:'), bx = b.key.startsWith('x:');
      if (ax !== bx) return ax ? 1 : -1;
      return b.key.localeCompare(a.key);
    });
  }

  function budgetSummary(cycle, today) {
    const used = cycle ? cycle.expense : 0;
    const left = round2(BUDGET - used);
    const payday = nextPayday(today);
    const days = daysBetween(today, payday);
    return { budget: BUDGET, used, left, days, payday, perDay: left > 0 ? round2(left / days) : 0, pct: Math.min(100, (used / BUDGET) * 100) };
  }

  /* ---------- การผ่อน ---------- */
  // งวดของเดือนไหนนับว่าจ่ายแล้วเมื่อเลยวันครบกำหนดของเดือนนั้น (วันครบกำหนดเองยังไม่นับ)
  function installmentStatus(inst, today) {
    const first = ymParts(inst.firstMonth);
    const elapsed = (today.getFullYear() - first.y) * 12 + (today.getMonth() + 1 - first.m) + (today.getDate() > inst.dueDay ? 1 : 0);
    const paid = Math.max(0, Math.min(inst.totalMonths, elapsed));
    const left = inst.totalMonths - paid;
    const done = left === 0;
    return {
      ...inst,
      paid, left, done,
      started: paid > 0,
      fullAmount: round2(inst.monthly * inst.totalMonths),
      paidAmount: round2(inst.monthly * paid),
      leftAmount: round2(inst.monthly * left),
      pct: (paid / inst.totalMonths) * 100,
      endMonth: ymAdd(inst.firstMonth, inst.totalMonths - 1),
      nextDue: done ? null : ymDay(ymAdd(inst.firstMonth, paid), inst.dueDay),
    };
  }

  // ยอดต่อเดือนตอนนี้ = รายการที่อยู่ในบล็อก Fix cost ของรอบปัจจุบัน (เดือนงวดตรงกับชื่อบล็อก)
  // ไทม์ไลน์ = บล็อกข้างหน้าที่ยอดเปลี่ยน พร้อมยอดหลังเปลี่ยน
  function installmentSummary(list, today) {
    const items = list.map((i) => installmentStatus(i, today));
    const block = fixYmOf(today);
    const now = round2(items.filter((i) => i.firstMonth <= block && block <= i.endMonth).reduce((a, i) => a + i.monthly, 0));
    const events = new Map();
    const event = (ym) => { if (!events.has(ym)) events.set(ym, { ym, delta: 0, started: [], ended: [] }); return events.get(ym); };
    items.forEach((i) => {
      const after = ymAdd(i.endMonth, 1);
      if (i.firstMonth > block) { const e = event(i.firstMonth); e.delta += i.monthly; e.started.push(i.name); }
      if (after > block) { const e = event(after); e.delta -= i.monthly; e.ended.push(i.name); }
    });
    let running = now;
    const timeline = [...events.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((e) => {
      running = round2(running + e.delta);
      return { ...e, delta: round2(e.delta), after: running };
    });
    return { items, now, timeline, pending: items.filter((i) => i.firstMonth > block) };
  }

  const api = {
    PAY_DAY, BUDGET, TH_MONTHS, CATEGORIES, EXPENSE, INCOME,
    round2, parseYmd, ymOf, ymAdd, ymDay, daysBetween,
    fmtDayMonth, fmtDate, fmtYm, fmtYmLong, fmtRange,
    cycleKeyOf, budgetPeriod, fixYmOf, fixPeriod, nextPayday, parseCycleLabel, resolveCycle,
    buildCycles, budgetSummary, installmentStatus, installmentSummary,
  };
  root.Calc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
