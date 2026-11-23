'use strict';
// เรียก Google Apps Script (GET ?k=TOKEN) ใช้ร่วมกันระหว่างแอป (app.js) และ Hub (summary.js)
(function (root) {
  // fresh = ข้ามแคช 2 นาทีของสคริปต์ (ใช้ตอนผู้ใช้ดึงรีเฟรชเอง)
  async function apiGet(setup, { fresh = false } = {}) {
    const q = new URLSearchParams({ k: setup.k });
    if (fresh) q.set('fresh', '1');
    const res = await fetch(`${setup.url}?${q}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
  root.FinanceApi = { apiGet };
})(globalThis);
