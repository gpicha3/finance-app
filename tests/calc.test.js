// รัน: node --test tests/calc.test.js
// ใช้ยอดเงินสมมติเท่านั้น ห้ามใส่ข้อมูลการเงินจริงในไฟล์นี้
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

const D = (s) => C.parseYmd(s);
const row = (date, cycle, amount, extra = {}) => ({ date, cycle, type: C.EXPENSE, category: 'กิน', item: 'x', amount, note: '', ...extra });
const inst = (firstMonth, totalMonths, monthly = 1000.5, name = 'A') => ({ name, monthly, totalMonths, firstMonth, dueDay: 25 });

test('รอบเงินเดือน: ก่อน 25 อยู่รอบเดือนก่อน / วันที่ 25 เป็นรอบใหม่', () => {
  assert.equal(C.cycleKeyOf(D('2026-11-06')), '2026-10');
  assert.equal(C.cycleKeyOf(D('2026-11-24')), '2026-10');
  assert.equal(C.cycleKeyOf(D('2026-11-25')), '2026-11');
  assert.equal(C.cycleKeyOf(D('2027-01-10')), '2026-12');
});

test('บล็อก Fix cost ชื่อตามเดือนที่รอบสิ้นสุด', () => {
  assert.equal(C.fixYmOf(D('2026-10-24')), '2026-10');
  assert.equal(C.fixYmOf(D('2026-10-25')), '2026-11');
  assert.equal(C.fixYmOf(D('2026-11-06')), '2026-11');
  assert.equal(C.fixYmOf(D('2026-11-24')), '2026-11');
  assert.equal(C.fixYmOf(D('2026-11-25')), '2026-12');
  assert.equal(C.fixYmOf(D('2026-12-30')), '2027-01');
});

test('ช่วงรอบ: Fix cost เริ่ม 25 / งบเริ่ม 26', () => {
  assert.equal(C.fmtRange(C.fixPeriod('2026-11').start, C.fixPeriod('2026-11').end), '25 ต.ค. – 24 พ.ย. 2026');
  assert.equal(C.fmtRange(C.fixPeriod('2027-01').start, C.fixPeriod('2027-01').end), '25 ธ.ค. 2026 – 24 ม.ค. 2027');
  assert.equal(C.fmtRange(C.budgetPeriod('2026-10').start, C.budgetPeriod('2026-10').end), '26 ต.ค. – 24 พ.ย. 2026');
  assert.equal(C.fmtRange(C.budgetPeriod('2026-12').start, C.budgetPeriod('2026-12').end), '26 ธ.ค. 2026 – 24 ม.ค. 2027');
});

test('อ่านข้อความรอบเงินเดือน รวมถึงขีดและช่องว่างหลายแบบ', () => {
  const want = { startDay: 26, startMonth: 9, endDay: 24, endMonth: 10 };
  assert.deepEqual(C.parseCycleLabel('26 ต.ค.–24 พ.ย.'), want);
  assert.deepEqual(C.parseCycleLabel('26 ต.ค. - 24 พ.ย.'), want);
  assert.equal(C.parseCycleLabel('รอบแรก'), null);
  assert.equal(C.parseCycleLabel(''), null);
});

test('หาปีของรอบจากคอลัมน์วันที่ รวมรอบข้ามปี และรอบชื่อซ้ำคนละปี', () => {
  assert.equal(C.resolveCycle(row('2026-11-05', '26 ต.ค.–24 พ.ย.', 1)).key, '2026-10');
  assert.equal(C.resolveCycle(row('2027-11-05', '26 ต.ค.–24 พ.ย.', 1)).key, '2027-10');
  assert.equal(C.resolveCycle(row('2027-01-10', '26 ธ.ค.–24 ม.ค.', 1)).key, '2026-12');
  assert.equal(C.resolveCycle(row('2026-12-30', '26 ธ.ค.–24 ม.ค.', 1)).key, '2026-12');
  // จดย้อนหลังด้วยวันที่ก่อนเริ่มรอบเล็กน้อย ยังอยู่รอบเดิม
  assert.equal(C.resolveCycle(row('2026-10-25', '26 ต.ค.–24 พ.ย.', 1)).key, '2026-10');
});

test('จัดกลุ่มตามคอลัมน์รอบ ไม่ใช่วันที่ และแยกหมวดตามลำดับ', () => {
  const today = D('2026-11-06');
  const cycles = C.buildCycles([
    row('2026-11-05', '26 ต.ค.–24 พ.ย.', 100.1),
    row('2026-11-05', '26 ต.ค.–24 พ.ย.', 200.2, { category: 'อื่นๆ' }),
    row('2026-11-05', '26 ต.ค.–24 พ.ย.', 5, { category: 'เดินทาง' }),
    // วันที่อยู่ในรอบ ต.ค. แต่คอลัมน์รอบเขียนว่ารอบ ก.ย. ต้องเชื่อคอลัมน์
    row('2026-10-27', '26 ก.ย.–24 ต.ค.', 7),
    row('2026-11-01', '26 ต.ค.–24 พ.ย.', 900, { type: C.INCOME, category: 'อื่นๆ' }),
  ], today);
  assert.deepEqual(cycles.map((c) => c.key), ['2026-10', '2026-09']);
  assert.equal(cycles[0].expense, 305.3);
  assert.equal(cycles[0].income, 900);
  assert.deepEqual(cycles[0].categories.map((c) => [c.name, c.total]), [['กิน', 100.1], ['เดินทาง', 5], ['อื่นๆ', 200.2]]);
  assert.equal(cycles[1].expense, 7);
});

test('แถวที่อ่านไม่ได้ไม่ถูกนับเงียบ ๆ และรอบที่ไม่รู้จักแยกไว้ท้ายสุด', () => {
  const cycles = C.buildCycles([
    row('2026-11-05', '26 ต.ค.–24 พ.ย.', null),
    row('2026-11-05', '26 ต.ค.–24 พ.ย.', 10, { type: 'โอน' }),
    row('2026-11-05', 'รอบแปลก', 10),
  ], D('2026-11-06'));
  assert.equal(cycles[0].key, '2026-10');
  assert.equal(cycles[0].invalid, 2);
  assert.equal(cycles[0].expense, 0);
  assert.equal(cycles[1].key, 'x:รอบแปลก');
});

test('รอบปัจจุบันมีเสมอแม้ยังไม่มีรายการ', () => {
  const cycles = C.buildCycles([], D('2026-11-25'));
  assert.deepEqual(cycles.map((c) => c.key), ['2026-11']);
  assert.equal(C.fmtRange(cycles[0].start, cycles[0].end), '26 พ.ย. – 24 ธ.ค. 2026');
});

test('สรุปงบ: วันถึงเงินเดือนและยอดใช้ได้ต่อวัน', () => {
  const s = C.budgetSummary({ expense: 400 }, D('2026-11-06'));
  assert.equal(s.left, 6000);
  assert.equal(s.days, 19);
  assert.equal(C.fmtDate(s.payday), '25 พ.ย. 2026');
  assert.equal(s.perDay, 315.79);
  // วันที่ 25 เป็นรอบใหม่: นับถึงเงินเดือนครั้งถัดไป
  assert.equal(C.budgetSummary({ expense: 0 }, D('2026-11-25')).days, 30);
  assert.equal(C.budgetSummary({ expense: 0 }, D('2026-11-24')).days, 1);
  const over = C.budgetSummary({ expense: 7000 }, D('2026-11-06'));
  assert.equal(over.left, -600);
  assert.equal(over.perDay, 0);
  assert.equal(over.pct, 100);
});

test('แผนการใช้งบ: ขีดแผนนับรวมวันนี้ และบอกว่าเร็วหรือช้ากว่าแผน', () => {
  const s = C.budgetSummary({ expense: 3000 }, D('2026-11-06')); // วันที่ 12 จาก 30 วัน
  assert.equal(s.planned, 2560);
  assert.equal(s.plannedPct, 40);
  assert.equal(s.ahead, 440);
  assert.equal(C.budgetSummary({ expense: 100 }, D('2026-11-06')).ahead, -2460);
  assert.equal(C.budgetSummary({ expense: 0 }, D('2026-11-24')).planned, 6400);
  // วันที่ 25 ยังไม่เริ่มรอบงบ แผนจึงเป็น 0
  assert.equal(C.budgetSummary({ expense: 0 }, D('2026-11-25')).planned, 0);
  assert.equal(C.budgetSummary({ expense: 0 }, D('2026-11-26')).planned, 220.69);
});

test('ยอดวันนี้: นับเฉพาะรายจ่ายของวันนี้ และยอดที่ใช้ได้ไม่ลดลงระหว่างวัน', () => {
  const today = D('2026-11-07');
  const label = '26 ต.ค.–24 พ.ย.';
  const before = [row('2026-11-06', label, 1000)];
  const c = (rows) => C.buildCycles(rows, today).find((x) => x.key === '2026-10');
  const morning = C.budgetSummary(c(before), today);
  assert.equal(morning.spentToday, 0);
  assert.equal(morning.days, 18);
  assert.equal(morning.allowedToday, 300);
  const evening = C.budgetSummary(c([...before, row('2026-11-07', label, 120), row('2026-11-07', label, 500, { type: C.INCOME }), row('2026-11-07', label, 'x')]), today);
  assert.equal(evening.spentToday, 120);
  assert.equal(evening.allowedToday, 300);
  assert.equal(C.budgetSummary({ expense: 7000, rows: [] }, today).allowedToday, 0);
});

test('ความเต็มของใบ: เต็มเมื่อไม่เร็วกว่าแผน และเกือบหมดเมื่อเกินงบ', () => {
  const today = D('2026-11-06'); // แผน 2,560 งบ 7 วัน = 1,493.33
  assert.equal(C.budgetSummary({ expense: 2560 }, today).leaves, 1);
  assert.equal(C.budgetSummary({ expense: 100 }, today).leaves, 1);
  const mid = C.budgetSummary({ expense: 2560 + 746.67 }, today).leaves;
  assert.ok(mid > 0.59 && mid < 0.61);
  assert.ok(Math.abs(C.budgetSummary({ expense: 5000 }, today).leaves - 0.2) < 1e-9);
  assert.equal(C.budgetSummary({ expense: 6401 }, today).leaves, 0.08);
});

test('อารมณ์ตัวละคร: ดีเมื่อไม่เร็วกว่าแผน กลางเมื่อเร็วเล็กน้อย แย่เมื่อเร็วเกินครึ่งวันของงบหรือเกินงบ', () => {
  const today = D('2026-11-06'); // แผน 2,560 งบต่อวัน 213.33 ครึ่งวัน 106.67
  const mood = (expense) => C.budgetSummary({ expense }, today).mood;
  assert.equal(mood(2000), 'good');
  assert.equal(mood(2560), 'good');
  assert.equal(mood(2600), 'ok');
  assert.equal(mood(2666), 'ok');
  assert.equal(mood(2777), 'bad');
  assert.equal(mood(6401), 'bad');
});

test('ภาษาอังกฤษ: วันที่และชื่อรอบเปลี่ยนตามภาษา แต่ข้อความรอบที่อ่านจากชีตยังเป็นไทย', () => {
  C.setLang('en');
  try {
    assert.equal(C.fmtDate(D('2026-11-25')), '25 Nov 2026');
    assert.equal(C.fmtYmLong('2026-11'), 'November 2026');
    assert.equal(C.cycleName('2026-10'), 'Nov 2026 cycle');
    assert.equal(C.thDayMonth(D('2026-10-26')), '26 ต.ค.');
  } finally {
    C.setLang('th');
  }
  assert.equal(C.fmtDate(D('2026-11-25')), '25 พ.ย. 2026');
});

test('ชื่อรอบตามบล็อก Fix cost', () => {
  assert.equal(C.cycleName('2026-10'), 'รอบ พ.ย. 2026');
  assert.equal(C.cycleName('2026-12'), 'รอบ ม.ค. 2027');
});

test('จุดของกราฟยอดผ่อนเริ่มจากยอดตอนนี้', () => {
  const today = D('2026-11-06');
  const s = C.installmentSummary([inst('2026-01', 24, 100), inst('2026-11', 4, 10)], today);
  assert.deepEqual(C.installmentSteps(s, today), [
    { ym: '2026-11', amount: 110 }, { ym: '2027-03', amount: 100 }, { ym: '2028-01', amount: 0 },
  ]);
});


test('งวดผ่อน: 48 งวดจาก 2024-11 ณ 6 พ.ย. 2026 ได้ 24 งวด', () => {
  const s = C.installmentStatus(inst('2024-11', 48), D('2026-11-06'));
  assert.equal(s.paid, 24);
  assert.equal(s.left, 24);
  assert.equal(s.pct, 50);
  assert.equal(s.endMonth, '2028-10');
  assert.equal(C.fmtDate(s.nextDue), '25 พ.ย. 2026');
  assert.equal(s.fullAmount, 48024);
  assert.equal(s.paidAmount, 24012);
});

test('งวดผ่อน: นับเมื่อเลยวันที่ 25 เท่านั้น', () => {
  const i = inst('2026-11', 10);
  assert.equal(C.installmentStatus(i, D('2026-11-24')).paid, 0);
  assert.equal(C.installmentStatus(i, D('2026-11-25')).paid, 0);
  assert.equal(C.installmentStatus(i, D('2026-11-26')).paid, 1);
  assert.equal(C.fmtDate(C.installmentStatus(i, D('2026-11-25')).nextDue), '25 พ.ย. 2026');
  assert.equal(C.fmtDate(C.installmentStatus(i, D('2026-11-26')).nextDue), '25 ธ.ค. 2026');
});

test('งวดผ่อน: ยังไม่เริ่ม และผ่อนหมดแล้ว', () => {
  const before = C.installmentStatus(inst('2027-01', 6), D('2026-11-06'));
  assert.equal(before.paid, 0);
  assert.equal(before.started, false);
  const done = C.installmentStatus(inst('2026-01', 6), D('2026-11-06'));
  assert.equal(done.paid, 6);
  assert.equal(done.done, true);
  assert.equal(done.nextDue, null);
  assert.equal(done.leftAmount, 0);
});

test('ไทม์ไลน์ยอดผ่อนต่อเดือน', () => {
  const list = [inst('2026-01', 24, 100, 'ยาว'), inst('2026-10', 3, 50, 'สั้น'), inst('2026-11', 4, 10, 'รอบนี้'), inst('2026-12', 2, 7, 'รอบหน้า'), inst('2025-01', 3, 999, 'หมดแล้ว')];
  const s = C.installmentSummary(list, D('2026-11-06')); // รอบนี้คือบล็อก 2026-11
  assert.equal(s.now, 160); // รวม "รอบนี้" แม้สถานะยัง 0 งวด ไม่รวม "รอบหน้า" และ "หมดแล้ว"
  assert.equal(s.items.find((i) => i.name === 'รอบนี้').paid, 0);
  assert.deepEqual(s.pending.map((i) => i.name), ['รอบหน้า']);
  assert.deepEqual(s.timeline.map((e) => [e.ym, e.delta, e.after]), [
    ['2026-12', 7, 167],
    ['2027-01', -50, 117],
    ['2027-02', -7, 110],
    ['2027-03', -10, 100],
    ['2028-01', -100, 0],
  ]);
  assert.deepEqual(s.timeline[0].started, ['รอบหน้า']);
  assert.deepEqual(s.timeline[1].ended, ['สั้น']);
});

test('ยอดผ่อนต่อเดือนตรงกับบล็อกตลอดรอบ และเปลี่ยนตอนขึ้นรอบใหม่วันที่ 25', () => {
  const list = [inst('2026-01', 24, 100, 'ยาว'), inst('2026-10', 2, 50, 'สั้น')]; // "สั้น" อยู่ถึงบล็อก 2026-11
  assert.equal(C.installmentSummary(list, D('2026-11-24')).now, 150);
  assert.equal(C.installmentSummary(list, D('2026-11-25')).now, 100);
  assert.equal(C.installmentSummary(list, D('2026-11-25')).timeline.some((e) => e.ended.includes('สั้น')), false);
});
