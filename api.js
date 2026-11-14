'use strict';
// เรียก Google Apps Script (GET ?k=TOKEN) ใช้ร่วมกันระหว่างแอป (app.js) และ Hub (summary.js)
(function (root) {
  async function apiGet(setup) {
    const q = new URLSearchParams({ k: setup.k });
    const res = await fetch(`${setup.url}?${q}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }
  root.FinanceApi = { apiGet };
})(globalThis);
