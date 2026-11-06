'use strict';
// โหลดใน <head> เพื่อใส่ธีมก่อนหน้าเว็บแสดงผล (ไม่มีจอกะพริบ)
const THEME_KEY = 'fa.theme';

function loadTheme() {
  try { return { mode: 'auto', ...JSON.parse(localStorage.getItem(THEME_KEY) || '{}') }; }
  catch { return { mode: 'auto' }; }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme.mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.mode);

  // สีแถบสถานะ/พื้นหลังของระบบให้ตรงกับธีม
  const dark = theme.mode === 'dark' || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#0b2a3f' : '#9fe3ff';
  // iOS อ่านค่านี้ตอนเปิดแอป จึงมีผลเมื่อเปิดแอปใหม่
  const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (sb) sb.content = dark ? 'black-translucent' : 'default';
}

function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch { /* storage unavailable */ }
  applyTheme(theme);
}

applyTheme(loadTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(loadTheme()));
