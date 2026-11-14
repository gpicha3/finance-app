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

  const stats = [
    { label: 'เหลือรอบนี้', value: money(budget.left), unit: '฿' },
    { label: 'ถึงเงินเดือน', value: String(budget.days), unit: 'วัน' },
    { label: 'ผ่อน/เดือน', value: money(loans.now), unit: '฿' },
  ];

  const alerts = [];
  if (budget.left < 0) {
    alerts.push({ level: 'urgent', text: `ใช้เกินงบรอบนี้ ฿${money(-budget.left)}`, dueDate: iso(today), link: `${BASE}#today` });
  } else if (budget.ahead > 0) {
    alerts.push({ level: 'soon', text: `ใช้เร็วกว่าแผน ฿${money(budget.ahead)}`, dueDate: iso(today), link: `${BASE}#today` });
  }

  for (const i of loans.items) {
    if (i.done || !i.nextDue) continue;
    const days = Calc.daysBetween(today, i.nextDue);
    if (days > 14) continue;
    alerts.push({ level: levelOf(days), text: `ผ่อน ${i.name} ฿${money(i.monthly)} · ${inDays(days)}`,
      dueDate: iso(i.nextDue), link: `${BASE}#loans` });
  }
  for (const i of loans.items) {
    if (i.left === 1) alerts.push({ level: 'info', text: `${i.name} เหลืองวดสุดท้าย`, dueDate: iso(i.nextDue), link: `${BASE}#loans` });
  }
  if (budget.days <= 3) {
    alerts.push({ level: 'info', text: `เงินเดือนเข้า${inDays(budget.days)}`, dueDate: iso(budget.payday), link: `${BASE}#today` });
  }

  return {
    app, title: 'Finance', stats, alerts,
    brief: [
      `เงินเหลือรอบนี้ ฿${money(budget.left)} · เงินเดือนอีก ${budget.days} วัน`,
      budget.left > 0 ? `ใช้ได้วันละ ~฿${money(budget.perDay)}` : null,
      loans.now ? `ยอดผ่อนเดือนนี้ ฿${money(loans.now)}` : null,
    ].filter(Boolean),
  };
}
