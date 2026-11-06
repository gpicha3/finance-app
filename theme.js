'use strict';
// โหลดใน <head> เพื่อใส่ธีมก่อนหน้าเว็บแสดงผล (ไม่มีจอกะพริบ)
const THEME_KEY = 'fa.theme';

// พาเลตต์ไล่สี: g = สีไล่ 3 จุดบนลงล่าง / panel = การ์ด / onA = สีตัวอักษรบนปุ่มสีหลัก
const PALETTES = {
  sky: {
    name: 'ฟ้าใส',
    light: { g: ['#9fe3ff', '#d4f5ff', '#e9fff3'], panel: '#ffffff', p2: '#e9f5fb', text: '#0d3050', muted: '#3d6480', line: '#dcecf4', track: '#e1f1fa', accent: '#0b72e0', onA: '#ffffff' },
    dark: { g: ['#0b2a3f', '#0a2030', '#0b2522'], panel: '#123246', p2: '#1b4057', text: '#eaf6fd', muted: '#a9c7d9', line: '#1f4459', track: '#1d4359', accent: '#3f94f0', onA: '#07131c' },
  },
  peach: {
    name: 'พีช',
    light: { g: ['#ffc9a8', '#ffe6d3', '#fff6e6'], panel: '#ffffff', p2: '#fdf1e8', text: '#4a1f0c', muted: '#7d4f38', line: '#f5e3d8', track: '#fbeadf', accent: '#c8410c', onA: '#ffffff' },
    dark: { g: ['#3a1f14', '#2a1710', '#2a2014'], panel: '#40261a', p2: '#553324', text: '#fdeee5', muted: '#d4b3a0', line: '#56352a', track: '#563628', accent: '#ff8a5c', onA: '#2a1208' },
  },
  mint: {
    name: 'มิ้นต์',
    light: { g: ['#a6f0cf', '#d6f9e6', '#f2ffe9'], panel: '#ffffff', p2: '#ebf8f1', text: '#0b3b2c', muted: '#3a6a58', line: '#dcefe6', track: '#e2f5ea', accent: '#08805a', onA: '#ffffff' },
    dark: { g: ['#0b3329', '#0a241d', '#13291a'], panel: '#123a2f', p2: '#1b4e3f', text: '#e6fbf2', muted: '#a5cfbf', line: '#1e4a3d', track: '#1e4a3d', accent: '#34c98f', onA: '#06241a' },
  },
  lavender: {
    name: 'ลาเวนเดอร์',
    light: { g: ['#cdbcff', '#e6dcff', '#fbeeff'], panel: '#ffffff', p2: '#f3effc', text: '#2a1a5e', muted: '#5b4d86', line: '#e7e1f5', track: '#ece6fb', accent: '#6b3fd6', onA: '#ffffff' },
    dark: { g: ['#241a4d', '#1a1438', '#2a1640'], panel: '#2c2259', p2: '#3b2f72', text: '#f0ebff', muted: '#bdb2e0', line: '#3b3070', track: '#3b3070', accent: '#a58bff', onA: '#180f3d' },
  },
  pink: {
    name: 'ชมพู',
    light: { g: ['#ffbdd6', '#ffe0ec', '#fff3e8'], panel: '#ffffff', p2: '#fdf0f5', text: '#4f1230', muted: '#7a4560', line: '#f6e1ea', track: '#fbe6ef', accent: '#d02670', onA: '#ffffff' },
    dark: { g: ['#44142c', '#2f0f20', '#34190f'], panel: '#4a1a33', p2: '#5f2545', text: '#ffeaf2', muted: '#dcb0c4', line: '#5e2844', track: '#5e2844', accent: '#ff7aae', onA: '#2f0a1c' },
  },
  gold: {
    name: 'ทอง',
    light: { g: ['#ffe08a', '#fff1c2', '#fffbe6'], panel: '#ffffff', p2: '#fbf5e2', text: '#3f2c00', muted: '#6f5a24', line: '#f3ead0', track: '#f7eed4', accent: '#a35f00', onA: '#ffffff' },
    dark: { g: ['#3a2c08', '#2a2008', '#2c2610'], panel: '#40320f', p2: '#544216', text: '#fff6dd', muted: '#d6c48d', line: '#54441a', track: '#54441a', accent: '#f0b429', onA: '#2a1f02' },
  },
};

function loadTheme() {
  try { return { mode: 'auto', palette: 'sky', ...JSON.parse(localStorage.getItem(THEME_KEY) || '{}') }; }
  catch { return { mode: 'auto', palette: 'sky' }; }
}

const gradientOf = (g) => `linear-gradient(170deg, ${g[0]} 0%, ${g[1]} 40%, ${g[2]} 100%)`;
// แสงฟุ้งสีหลักซ้อนบนพื้นไล่สี เพื่อให้กระจกมีสีให้เบลอตอนเนื้อหาเลื่อนผ่าน
const skyOf = (p, dark) => {
  const a = dark ? 22 : 30;
  return `radial-gradient(70% 38% at 92% 10%, color-mix(in srgb, ${p.accent} ${a}%, transparent), transparent 72%), `
    + `radial-gradient(80% 42% at 4% 58%, color-mix(in srgb, ${p.g[0]} ${dark ? 90 : 80}%, transparent), transparent 74%), `
    + `radial-gradient(70% 34% at 88% 96%, color-mix(in srgb, ${p.accent} ${a - 8}%, transparent), transparent 72%), ${gradientOf(p.g)}`;
};
const GLASS_LIGHT = {
  '--glass': 'rgba(255,255,255,.56)', '--glass-sheen': 'rgba(255,255,255,.42)', '--glass-edge': 'rgba(255,255,255,.78)',
  '--glass-shadow': '0 10px 30px rgba(20,30,60,.1)', '--nav-bg': 'rgba(255,255,255,.78)', '--nav-fg': '#3a3a40', '--nav-edge': 'rgba(255,255,255,.9)',
  '--nav-shadow': '0 12px 30px rgba(20,30,60,.2)',
};
const GLASS_DARK = {
  '--glass': 'rgba(6,8,12,.36)', '--glass-sheen': 'rgba(255,255,255,.05)', '--glass-edge': 'rgba(255,255,255,.17)',
  '--glass-shadow': '0 10px 30px rgba(0,0,0,.26)', '--nav-bg': 'rgba(8,8,10,.8)', '--nav-fg': '#c9c9cf', '--nav-edge': 'rgba(255,255,255,.14)',
  '--nav-shadow': '0 12px 30px rgba(0,0,0,.45)',
};

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme.mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.mode);

  const dark = theme.mode === 'dark' || (theme.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const p = (PALETTES[theme.palette] || PALETTES.sky)[dark ? 'dark' : 'light'];
  const vars = {
    '--sky': skyOf(p, dark), '--canvas': p.g[2], '--panel': p.panel, '--panel-2': p.p2, '--text': p.text, '--muted': p.muted,
    '--line': p.line, '--track': p.track, '--accent': p.accent, '--on-accent': p.onA, '--tick': p.text,
    ...(dark ? GLASS_DARK : GLASS_LIGHT),
  };
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // สีแถบสถานะ/พื้นหลังของระบบให้ตรงกับธีม
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = p.g[0];
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
