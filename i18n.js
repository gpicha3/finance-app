'use strict';
// ข้อความบนหน้าจอ 2 ภาษา ข้อมูลจากชีต เช่น ชื่อหมวดและชื่อรายการ แสดงตามที่อยู่ในชีต
const STRINGS = {
  th: {
    currency: 'บาท', title_today: 'วันนี้', title_cycles: 'รอบเงินเดือน', title_fixed: 'Fixed cost', title_loans: 'การผ่อน', title_settings: 'ตั้งค่า',
    nav_label: 'เมนูหลัก', nav_today: 'วันนี้', nav_cycles: 'รอบเงิน', nav_fixed: 'Fixed', nav_loans: 'ผ่อน', nav_settings: 'ตั้งค่า',
    payday: (n) => `เงินเข้าอีก ${n} วัน`,
    demo: 'ข้อมูลตัวอย่าง', connect_sheet: 'เชื่อมต่อ Google Sheet', sync_failed: (e) => `อัปเดตไม่สำเร็จ (${e}) แสดงข้อมูลล่าสุดที่มี`,
    load_failed: (e) => `โหลดข้อมูลไม่สำเร็จ: ${e}`, loading: 'กำลังโหลดข้อมูล…', no_data: 'ยังไม่มีข้อมูล',
    invalid_rows: (n) => `มี ${n} แถวที่อ่านไม่ได้ จึงไม่ถูกนับ`,
    today_pair: 'ใช้วันนี้ / ใช้ได้', today_aria: (a, b) => `วันนี้ใช้ไป ${a} จากที่ใช้ได้ ${b}`,
    ring_aria: (a, b, c) => `ใช้ไป ${a} จากงบ ${b} แผนถึงวันนี้ ${c}`,
    over_budget: (v) => `เกินงบ ${v}`, ahead: (v) => `ใช้เกินแผน ${v}`, behind: (v) => `ใช้น้อยกว่าแผน ${v}`, on_plan: 'ตรงตามแผน',
    budget_left: (v) => `งบรอบนี้เหลือ ${v}`, budget_over: (v) => `งบรอบนี้เกิน ${v}`,
    salary_left: 'เงินเดือนเหลือ', after_fixed: 'หัก Fixed cost แล้ว', loans_cycle: 'ผ่อนรอบนี้', item_count: (n) => `${n} รายการ`,
    back_current: 'กลับรอบปัจจุบัน', range_unreadable: 'อ่านช่วงวันที่ไม่ได้',
    view_category: 'หมวด', view_daily: 'รายวัน', today_label: 'วันนี้', day_limit: (v) => `งบต่อวัน ${v}`, over_days: (a, b) => `เกิน ${a} จาก ${b} วัน`, over_by: (v) => `เกินงบต่อวัน ${v}`, no_date: 'ไม่มีวันที่', left_total: 'เหลือ / งบทั้งหมด', spent_v: (v) => `ใช้ไป ${v}`, extra_income: (v) => `รับเพิ่ม ${v}`, no_expense: 'ไม่มีรายจ่ายในรอบนี้', income: 'รายรับ',
    no_fix: 'ไม่มีข้อมูลในแท็บ Fix cost', money_left: 'เงินเหลือ', in_out: (a, b) => `รับ ${a} − จ่าย ${b}`,
    no_loans: 'ไม่มีข้อมูลในแท็บ Installments', per_month: 'ผ่อนต่อเดือน', not_included: (v) => `ยังไม่รวม ${v}`,
    loan_line: (a, b) => `${a} ต่อเดือน · หมด ${b}`, paid: 'ผ่อนแล้ว', remaining: 'เหลือ', full_amount: 'ยอดเต็ม', next_due: 'งวดถัดไป',
    no_active: 'ไม่มีรายการที่กำลังผ่อน', now: 'ตอนนี้', debt_free: 'ไม่มีหนี้แล้ว', no_changes: 'ไม่มีการเปลี่ยนแปลงข้างหน้า',
    tl_start: (n) => `เริ่ม ${n}`, tl_end: (n) => `${n} หมด`, tl_left: (v) => `ผ่อนต่อเดือนเหลือ ${v}`,
    set_mode: 'โหมด', mode_auto: 'อัตโนมัติ', mode_light: 'สว่าง', mode_dark: 'มืด', set_language: 'ภาษา', set_palette: 'สีพื้นหลัง', set_buddy: 'ตัวละคร',
    pal_sky: 'ฟ้าใส', pal_peach: 'พีช', pal_mint: 'มิ้นต์', pal_lavender: 'ลาเวนเดอร์', pal_pink: 'ชมพู', pal_gold: 'ทอง', pal_white: 'ขาว', pal_black: 'ดำ',
    buddy_tree: 'ออมสิน', buddy_person: 'พายุ', buddy_cat: 'ทองหยอด', buddy_dog: 'โชคดี', kind_tree: 'ต้นไม้', kind_person: 'คน', kind_cat: 'แมว', kind_dog: 'หมา',
    connected: 'เชื่อมต่อแล้ว', edit_setup: 'แก้ Setup code', disconnect: 'เลิกเชื่อมต่อ', setup_hint: 'วางลิงก์ Web app ตามด้วย ?k= และ TOKEN ที่ตั้งไว้ใน Apps Script',
    cancel: 'ยกเลิก', connect: 'เชื่อมต่อ', last_update: (v) => `อัปเดตล่าสุด ${v}`, not_connected: 'ยังไม่ได้เชื่อมต่อ กำลังแสดงข้อมูลตัวอย่าง',
    bad_setup: 'รูปแบบไม่ถูกต้อง ต้องเป็นลิงก์ script.google.com ที่มี ?k=', testing: 'กำลังทดสอบการเชื่อมต่อ…', bad_token: 'TOKEN ไม่ถูกต้อง',
    connect_failed: (e) => `เชื่อมต่อไม่สำเร็จ: ${e}`, connected_toast: 'เชื่อมต่อแล้ว', confirm_clear: 'เลิกเชื่อมต่อและลบข้อมูลที่เก็บไว้ในเครื่องนี้? ข้อมูลใน Google Sheet จะไม่ถูกแตะ',
    updated: 'อัปเดตข้อมูลแล้ว', offline: 'ไม่มีอินเทอร์เน็ต', net_failed: 'เชื่อมต่อไม่สำเร็จ', no_sheet: 'ยังไม่ได้เชื่อมต่อ Google Sheet',
  },
  en: {
    currency: 'baht', title_today: 'Today', title_cycles: 'Pay cycles', title_fixed: 'Fixed costs', title_loans: 'Installments', title_settings: 'Settings',
    nav_label: 'Main menu', nav_today: 'Today', nav_cycles: 'Cycles', nav_fixed: 'Fixed', nav_loans: 'Loans', nav_settings: 'Settings',
    payday: (n) => `Payday in ${n} ${n === 1 ? 'day' : 'days'}`,
    demo: 'Sample data', connect_sheet: 'Connect Google Sheet', sync_failed: (e) => `Update failed (${e}). Showing the latest data.`,
    load_failed: (e) => `Could not load data: ${e}`, loading: 'Loading…', no_data: 'No data yet',
    invalid_rows: (n) => `${n} unreadable ${n === 1 ? 'row was' : 'rows were'} not counted`,
    today_pair: 'Spent today / allowed', today_aria: (a, b) => `Spent ${a} today out of ${b} allowed`,
    ring_aria: (a, b, c) => `Spent ${a} of ${b} budget. Plan to date ${c}`,
    over_budget: (v) => `Over budget ${v}`, ahead: (v) => `Over plan ${v}`, behind: (v) => `Under plan ${v}`, on_plan: 'On plan',
    budget_left: (v) => `Cycle budget left ${v}`, budget_over: (v) => `Cycle budget over ${v}`,
    salary_left: 'Salary left', after_fixed: 'After fixed costs', loans_cycle: 'Loans this cycle', item_count: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
    back_current: 'Back to current', range_unreadable: 'Unreadable date range',
    view_category: 'Category', view_daily: 'Daily', today_label: 'Today', day_limit: (v) => `Daily budget ${v}`, over_days: (a, b) => `Over on ${a} of ${b} days`, over_by: (v) => `Over by ${v}`, no_date: 'No date', left_total: 'Left / total budget', spent_v: (v) => `Spent ${v}`, extra_income: (v) => `Extra income ${v}`, no_expense: 'No expenses this cycle', income: 'Income',
    no_fix: 'No data in the Fix cost tab', money_left: 'Money left', in_out: (a, b) => `In ${a} − out ${b}`,
    no_loans: 'No data in the Installments tab', per_month: 'Per month', not_included: (v) => `Not yet including ${v}`,
    loan_line: (a, b) => `${a} a month · ends ${b}`, paid: 'Paid', remaining: 'Remaining', full_amount: 'Full amount', next_due: 'Next payment',
    no_active: 'No active installments', now: 'Now', debt_free: 'Debt free', no_changes: 'No upcoming changes',
    tl_start: (n) => `${n} starts`, tl_end: (n) => `${n} ends`, tl_left: (v) => `Monthly total now ${v}`,
    set_mode: 'Mode', mode_auto: 'Auto', mode_light: 'Light', mode_dark: 'Dark', set_language: 'Language', set_palette: 'Background color', set_buddy: 'Character',
    pal_sky: 'Sky', pal_peach: 'Peach', pal_mint: 'Mint', pal_lavender: 'Lavender', pal_pink: 'Pink', pal_gold: 'Gold', pal_white: 'White', pal_black: 'Black',
    buddy_tree: 'Omsin', buddy_person: 'Phayu', buddy_cat: 'Thongyod', buddy_dog: 'Chokdee', kind_tree: 'Tree', kind_person: 'Person', kind_cat: 'Cat', kind_dog: 'Dog',
    connected: 'Connected', edit_setup: 'Edit Setup code', disconnect: 'Disconnect', setup_hint: 'Paste the Web app link followed by ?k= and the TOKEN set in Apps Script',
    cancel: 'Cancel', connect: 'Connect', last_update: (v) => `Last updated ${v}`, not_connected: 'Not connected. Showing sample data.',
    bad_setup: 'Invalid format. Use a script.google.com link with ?k=', testing: 'Testing the connection…', bad_token: 'Invalid TOKEN',
    connect_failed: (e) => `Connection failed: ${e}`, connected_toast: 'Connected', confirm_clear: 'Disconnect and delete the data stored on this device? Your Google Sheet will not be touched.',
    updated: 'Data updated', offline: 'No internet connection', net_failed: 'Connection failed', no_sheet: 'Google Sheet is not connected',
  },
};

const LANG_KEY = 'fa.lang';
function loadLang() {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'th'; } catch { return 'th'; }
}
let LANG = loadLang();
Calc.setLang(LANG);

function t(key, ...args) {
  const v = STRINGS[LANG][key];
  return typeof v === 'function' ? v(...args) : v;
}
function setLanguage(lang) {
  LANG = lang === 'en' ? 'en' : 'th';
  try { localStorage.setItem(LANG_KEY, LANG); } catch { /* storage unavailable */ }
  Calc.setLang(LANG);
}
