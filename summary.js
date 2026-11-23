// สรุปสำหรับ Hub (gpicha3.github.io) ตาม contract getSummary()
// ใช้สูตรจาก calc.js และตัวเรียก API จาก api.js ตัวเดียวกับแอป อ่าน setup เดิมใน localStorage (ไม่เขียนทับ key ของแอป)
import './calc.js';
import './api.js';

const Calc = globalThis.Calc;
const BASE = new URL('./', import.meta.url).pathname; // /finance-app/
const KEYS = { setup: 'fa.setup' };
const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};

const money = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('th-TH') : '–');
// มีสตางค์ = แสดง 2 ตำแหน่ง เช่น 18,069.67 · จำนวนเต็ม = 11,334
const exact = (n) => (!Number.isFinite(n) ? '–' : Number.isInteger(n) ? n.toLocaleString('en-US')
  : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const inDays = (n) => (n < 0 ? `เลยกำหนด ${-n} วัน` : n === 0 ? 'วันนี้' : n === 1 ? 'พรุ่งนี้' : `อีก ${n} วัน`);
const levelOf = (days) => (days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'info');

export const app = 'finance-app';

export async function getSummary() {
  const setup = read(KEYS.setup, null);
  if (!setup) return { app, title: 'Finance', needsSetup: true, stats: [], alerts: [] };

  const data = await globalThis.FinanceApi.apiGet(setup);
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());

  // คำนวณแบบเดียวกับ viewModel() ของแอป
  const key = Calc.cycleKeyOf(today);
  const cycles = Calc.buildCycles(data.daily || [], today);
  const current = cycles.find((c) => c.key === key);
  const budget = Calc.budgetSummary(current, today);
  const loans = Calc.installmentSummary(data.installments || [], today);
  // ยอดเตรียมวันเงินเข้า (Fix cost: ttb + บิลบัตร) แทนยอดผ่อนของวันเดียวกัน ไม่บวกซ้ำ
  const prep = Calc.paydayPrep(data.fixCost || [], data.installments || [], today);
  const prepKey = iso(prep.payday);

  const stats = [
    { label: 'เหลือรอบนี้', value: money(budget.left), unit: '฿' },
    { label: 'ถึงเงินเดือน', value: String(budget.days), unit: 'วัน' },
    { label: 'ผ่อน/เดือน', value: money(loans.now), unit: '฿' },
  ];

  const alerts = [];
  if (budget.left < 0) {
    alerts.push({ level: 'urgent', text: `ใช้เกินงบรอบนี้ ฿${money(-budget.left)}`, dueDate: iso(today), link: `${BASE}#today` });
  } else if (budget.ahead > 0) {
    // kind/amount ให้ hub ซ่อนได้ถ้ายอดไม่ถึงเกณฑ์ที่ตั้งไว้ (ค่าเริ่มต้น ฿100)
    alerts.push({ level: 'soon', kind: 'pace', amount: budget.ahead, text: `ใช้เร็วกว่าแผน ฿${money(budget.ahead)}`, dueDate: iso(today), link: `${BASE}#today` });
  }

  // งวดผ่อนที่ครบภายใน 14 วัน: วันเดียวกันรวมเป็นบรรทัดเดียว (กดดูรายการย่อยได้ใน hub)
  const byDate = new Map();
  for (const i of loans.items) {
    if (i.done || !i.nextDue) continue;
    const days = Calc.daysBetween(today, i.nextDue);
    if (days > 14) continue;
    const key = iso(i.nextDue);
    if (!byDate.has(key)) byDate.set(key, { days, due: i.nextDue, list: [] });
    byDate.get(key).list.push(i);
  }
  if (prep.days <= 14 && prep.total > 0) {
    const lines = prep.fallback
      ? [{ label: 'ผ่อน (ยังไม่มีบิลบัตรเดือนนี้)', amount: prep.total }]
      : [{ label: 'ตัด ttb', amount: prep.ttb }, { label: 'บิลบัตร', amount: prep.cc }];
    alerts.push({
      level: levelOf(prep.days), kind: 'payday', dueDate: prepKey, link: `${BASE}#fixed`,
      text: `เตรียมวันเงินเข้า ฿${exact(prep.total)} · ${inDays(prep.days)}`,
      lines, total: prep.total, note: prep.fallback ? 'ยังไม่มีบิลบัตรเดือนนี้' : undefined,
      items: lines.map((l) => ({ text: `${l.label} ฿${exact(l.amount)}`, link: `${BASE}#fixed` })),
    });
  }
  for (const [key, g] of byDate) {
    if (key === prepKey && prep.days <= 14 && prep.total > 0) continue; // รวมอยู่ในยอดเตรียมวันเงินเข้าแล้ว
    const total = g.list.reduce((s, i) => s + i.monthly, 0);
    const one = g.list.length === 1;
    alerts.push({
      level: levelOf(g.days), kind: 'installment', dueDate: key, link: `${BASE}#loans`,
      text: one ? `ผ่อน ${g.list[0].name} ฿${money(total)} · ${inDays(g.days)}` : `ผ่อน ${g.list.length} รายการ ฿${money(total)} · ${inDays(g.days)}`,
      items: one ? undefined : g.list.map((i) => ({ text: `${i.name} ฿${money(i.monthly)}`, link: `${BASE}#loans` })),
    });
  }
  for (const i of loans.items) {
    if (i.left === 1) alerts.push({ level: 'info', text: `${i.name} เหลืองวดสุดท้าย`, dueDate: iso(i.nextDue), link: `${BASE}#loans` });
  }
  if (budget.days <= 3) {
    alerts.push({ level: 'info', text: `เงินเดือนเข้า${inDays(budget.days)}`, dueDate: iso(budget.payday), link: `${BASE}#today` });
  }

  const rows = (data.daily || []).filter((r) => r.type === Calc.EXPENSE && Number.isFinite(r.amount));
  const lastLog = rows.map((r) => Calc.parseYmd(r.date)).filter(Boolean).sort((x, y) => y - x)[0] || null;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const spentOnDay = (day) => rows.reduce((sum, r) => {
    const d = Calc.parseYmd(r.date);
    return d && Calc.daysBetween(d, day) === 0 ? sum + r.amount : sum;
  }, 0);
  const period = Calc.budgetPeriod(key);

  // ข้อมูลดิบ (ตัวเลข/สถานะ) ให้ hub แต่งประโยคพูดเอง — แอปนี้ไม่ส่งประโยค
  // daysToPayday: 0 = วันนี้เงินเดือนเข้า (วันที่ 25 = วันแรกของรอบใหม่) · prevLeft = เงินค่ากินที่เหลือของรอบที่เพิ่งจบ (ติดลบ = เกินงบ)
  const prevKey = cycles.map((c) => c.key).filter((k) => !k.startsWith('x:') && k < key).sort().pop();
  const prev = cycles.find((c) => c.key === prevKey);
  const isPayday = today.getDate() === Calc.PAY_DAY;
  const save = Calc.savingsSummary(data.savings);
  const food = Calc.foodActual(current, Calc.savingsByCycle(data.savings?.rows).get(key));
  const facts = {
    left: budget.left,
    daysToPayday: isPayday ? 0 : budget.days,
    perDay: budget.days > 0 ? budget.left / budget.days : budget.left,
    over: budget.left < 0 ? -budget.left : 0,
    prevOver: !!prev && prev.expense > budget.budget,
    prevLeft: prev ? budget.budget - prev.expense : null,
    // งวดที่ครบภายใน 14 วัน วันเดียวกันรวมเป็นรายการเดียว เรียงจากใกล้สุด
    installments: [...byDate.values()].sort((x, y) => x.days - y.days)
      .map((g) => ({ days: g.days, count: g.list.length, total: g.list.reduce((s, i) => s + i.monthly, 0) })),
    lastInstallments: loans.items.filter((i) => i.left === 1 && !i.done).map((i) => i.name),
    // สำหรับ "ไม่แน่ใจ" / "แซว": วันที่ของรายการค่ากินล่าสุด · ยอดเมื่อวาน · แผนต่อวันของรอบนี้
    lastLogDate: iso(lastLog),
    yesterdaySpent: spentOnDay(yesterday),
    dailyPlan: budget.budget / (Calc.daysBetween(period.start, period.end) + 1),
    // ยอดเตรียมวันเงินเข้า: fallback = ยังไม่มีบิลบัตร ใช้ยอดผ่อนจาก Installments
    payday: { days: prep.days, date: prepKey, ttb: prep.ttb, cc: prep.cc, total: prep.total, fallback: prep.fallback },
    // เงินเก็บ (ค่าตรงจากกล่อง H:I ของแท็บเงินเก็บ) · ค่ากินจริง = Daily Log หมวด กิน + MAKE ออก หมวด กิน
    makeLeft: save?.make ?? null,
    makeOutThisCycle: save?.outThisCycle ?? null,
    stockValue: save?.stock?.value ?? null,
    stockPnl: save?.stock?.pnl ?? null,
    savingsTotal: save?.total ?? null,
    foodActual: food.total,
    foodOver: food.over,
    foodBudget: food.budget,
  };

  return {
    app, title: 'Finance', stats, alerts, facts,
    brief: [
      `เงินเหลือรอบนี้ ฿${money(budget.left)} · เงินเดือนอีก ${budget.days} วัน`,
      budget.left > 0 ? `ใช้ได้วันละ ~฿${money(budget.perDay)}` : null,
      loans.now ? `ยอดผ่อนเดือนนี้ ฿${money(loans.now)}` : null,
    ].filter(Boolean),
  };
}
