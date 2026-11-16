'use strict';
/* Bloom Clinic — ملف المريض الإلكتروني
   الصفحات الأربع مأخوذة من ملف الإليستريتور (Bloom File.ai) وكل خانة متحطة في مكانها بالظبط.
   الإحداثيات بالـ pt من الملف الأصلي. */

const PW = 595.275, PH = 841.89;          // مقاس الصفحة (A4)
const TEST = new URLSearchParams(location.search).get('test'); // وضع تجربة: قاعدة بيانات منفصلة
const KO = PW / 591.815;                  // الغلاف الخارجي أضيق 0.6% — نوحّد المقاس

/* ====================== التخطيط (Layout) ====================== */
const MED = [
  ['med.bp', 442.1, 164.4], ['med.diabetes', 442.1, 182.0], ['med.hepc', 442.1, 199.6], ['med.pregnant', 442.1, 217.2],
  ['med.bleeding', 306.6, 164.4], ['med.heart', 306.6, 182.0], ['med.epilepsy', 306.6, 199.6],
  ['med.liver', 158.6, 164.4], ['med.kidney', 158.6, 182.0], ['med.thyroid', 158.6, 199.6], ['med.nursing', 158.6, 217.2],
];
const PLAN = [
  ['plan.scaling', 442.1, 333.5], ['plan.ortho', 442.1, 351.1],
  ['plan.filling', 306.6, 333.5], ['plan.rct', 306.6, 351.1],
  ['plan.ext', 156.7, 333.5], ['plan.surgical', 156.7, 351.1],
  ['plan.fixed', 21.1, 333.5], ['plan.removable', 21.1, 351.1],
];

const FIELDS = {
  front: [
    { k: 'fileNo', label: 'رقم الملف', x: 32.9, y: 38.8, w: 90, h: 21.6, fs: 12, c: 1, out: 1, type: 'num' },
    { k: 'name', label: 'إسم العميل', x: 82.3, y: 648.1, w: 301.1, h: 29.2, fs: 15, out: 1 },
    { k: 'mobile', label: 'الموبايل', x: 82.3, y: 686.2, w: 301.1, h: 29.1, fs: 15, out: 1, type: 'tel' },
    { k: 'fileNo', label: 'رقم الملف', x: 139.2, y: 724.2, w: 187.4, h: 29.2, fs: 15, out: 1, type: 'num' },
  ],
  info: [
    { k: 'firstVisit', label: 'تاريخ أول زيارة', x: 21.1, y: 21.9, w: 109.2, h: 19.5, fs: 10, c: 1, type: 'date' },
    { k: 'name', label: 'إسم العميل', x: 304.7, y: 54.6, w: 201.5, h: 19.5, fs: 10 },
    { k: 'address', label: 'العنوان', x: 21.3, y: 54.6, w: 201.5, h: 19.5, fs: 10 },
    { k: 'mobile', label: 'رقم الموبايل', x: 399.3, y: 79.7, w: 106.9, h: 19.5, fs: 10, type: 'tel' },
    { k: 'age', label: 'السن', x: 304.7, y: 79.7, w: 37.7, h: 19.5, fs: 10, c: 1, type: 'num' },
    { k: 'job', label: 'الوظيفة', x: 21.3, y: 79.7, w: 201.5, h: 19.5, fs: 10 },
    { k: 'medNotes', label: 'ملاحظات (التاريخ الطبي)', x: 21.4, y: 199.8, w: 133.1, h: 30, fs: 7.4, type: 'area', indent: 41, lh: 9.6 },
    { k: 'dentalNotes', label: 'ملاحظات (صحة الأسنان)', x: 21.3, y: 274.2, w: 235.2, h: 14, fs: 7.8, indent: 50 },
    { k: 'consentName', label: 'إقر انا (اسم المريض)', x: 300.5, y: 795.4, w: 232, h: 11, fs: 8, c: 1, auto: 'name' },
    { k: 'consentDay', label: 'وذلك يوم', x: 466, y: 807.6, w: 52, h: 11, fs: 7.4, c: 1, type: 'day' },
    { k: 'consentDate', label: 'الموافق', x: 378, y: 807.6, w: 58, h: 11, fs: 7.4, c: 1, type: 'date' },
  ],
};
const CHECKS = {
  info: [
    ...MED.map(([k, x, y]) => ({ k, x, y, w: 19.1, h: 15.1 })),
    { k: 'med.thinners', x: 21.1, y: 164.4, w: 19.1, h: 32.7 },
    { k: 'smoker', x: 420.7, y: 275.5, w: 19.1, h: 15.2 },
    { k: 'brush', x: 262.0, y: 275.5, w: 19.1, h: 15.2 },
    ...PLAN.map(([k, x, y]) => ({ k, x, y, w: 19.1, h: 15.1 })),
  ],
};
const SIGNATURE = { x: 21.4, y: 795.5, w: 163.2, h: 27 };

// جدول الإجراءات العلاجية: 13 سطر × عمودين (اليمين الأول)
const PROC = { y0: 405.9, rh: 29.3, rows: 13, cols: [{ t: [386.4, 192.2], d: [297.6, 88.8] }, { t: [105.4, 192.2], d: [16.7, 88.7] }] };
// جدول الحسابات (ضهر الملف): 15 سطر
const PAY = { y0: 308.8, rh: 31.22, rows: 15, x: { d: [24.6, 80.2], total: [104.8, 104.3], paid: [209.1, 104.2], rem: [313.3, 104.3], notes: [417.6, 150.2] } };

/* ---- الأسنان: [id, y, x] — x = المربع الخارجي يمين المريض (R) / رقم السنة شمال المريض (L) ---- */
const TEETH = [];
function row(arch, ids, ys, rx, lx) {
  ids.forEach((n, i) => {
    const y = ys[i];
    TEETH.push({ id: arch + 'R' + n, n, arch, side: 'R', y, box: rx[i], strip: rx[i] + 13.4, lab: rx[i] + 139.3 });
    TEETH.push({ id: arch + 'L' + n, n, arch, side: 'L', y: Array.isArray(lx[i]) ? lx[i][1] : y, lab: Array.isArray(lx[i]) ? lx[i][0] : lx[i], strip: (Array.isArray(lx[i]) ? lx[i][0] : lx[i]) + 13.4, box: (Array.isArray(lx[i]) ? lx[i][0] : lx[i]) + 139.3 });
  });
}
row('U', [1, 2, 3, 4, 5, 6, 7, 8], [64.4, 84.6, 104.8, 131.2, 159.9, 186.4, 222.3, 258.2],
  [138.1, 88.8, 60.8, 40.4, 27.4, 24.2, 16.7, 16.7], [307.7, 357.0, 385.0, 405.4, 418.3, 421.6, 429.1, 429.1]);
row('u', ['A', 'B', 'C', 'D', 'E'], [310.8, 331.7, 352.6, 373.5, 394.4],
  [116.4, 90.7, 70.3, 52.9, 36.0], [315.5, 341.1, 361.6, 379.0, 395.8]);
row('l', ['E', 'D', 'C', 'B', 'A'], [475.5, 497.5, 514.5, 530.3, 548.0],
  [46.3, 59.4, 66.7, 87.3, 114.7], [[385.6, 474.1], [368.9, 496.7], [348.2, 514.5], [334.0, 530.3], [311.0, 548.0]]);
row('L', [8, 7, 6, 5, 4, 3, 2, 1], [594.6, 638.0, 674.9, 706.1, 733.9, 758.4, 779.6, 800.7],
  [16.7, 16.7, 24.2, 27.4, 40.4, 60.8, 88.8, 140.4], [429.1, 429.1, 421.6, 418.3, 405.4, 385.0, 357.0, 307.7]);
const CROWN = {
  UR1: [262.4, 86.9, 297.5, 120.3], UL1: [294.5, 87.5, 327.4, 122.5], UR2: [242.3, 97.2, 266.3, 126.6], UL2: [324.5, 95.1, 353.8, 126.5],
  UR3: [219.4, 107, 248.9, 137.6], UL3: [341.7, 104.4, 370.8, 136.5], UR4: [206.8, 133.2, 241.5, 162.3], UL4: [349.1, 130.7, 384.3, 157],
  UR5: [198.3, 156.8, 236.4, 185.1], UL5: [358.9, 153.7, 396.1, 183.9], UR6: [187.9, 182.5, 230.7, 225.8], UL6: [365.5, 176.5, 405.3, 222.9],
  UR7: [182.6, 217.6, 227.4, 255.2], UL7: [370.1, 211.6, 413.3, 254], UR8: [178.5, 251.2, 219.8, 283.2], UL8: [376.9, 249, 417, 280.8],
  uRA: [266.6, 329.4, 290.1, 352.9], uLA: [291, 330.4, 313.6, 351.7], uRB: [247.9, 343.5, 271.4, 361.8], uLB: [311, 342.3, 340.6, 367.1],
  uRC: [224.4, 351.5, 259.9, 380.2], uLC: [327.2, 354, 347.9, 379.1], uRD: [218, 375.1, 250, 404.4], uLD: [327.6, 368.5, 363.1, 408],
  uRE: [205.7, 397.8, 243, 432.9], uLE: [340, 395.2, 378, 432.5],
  lRE: [212.9, 440.8, 247.8, 481.6], lLE: [331.4, 446.7, 364.8, 485.5], lRD: [224.9, 475.5, 254.8, 508.2], lLD: [322.9, 477.3, 350.8, 509.4],
  lRC: [242.3, 503, 262.3, 524.2], lLC: [313, 501.8, 333.2, 522.4], lRB: [259.1, 515.7, 273.4, 530.1], lLB: [299.3, 516.6, 317.5, 533.1],
  lRA: [271.5, 520.1, 291, 536.7], lLA: [287.5, 519.5, 301, 536.5],
  LR8: [173.1, 583, 216.3, 623], LL8: [379.3, 577.1, 418.7, 619.5], LR7: [181.5, 614.9, 225.1, 663.5], LL7: [373.2, 614.8, 416.5, 657.7],
  LR6: [194.1, 658.7, 237.7, 704], LL6: [358.5, 654.8, 405.1, 699.6], LR5: [207.3, 696, 240.8, 727.8], LL5: [351.9, 695.4, 393.9, 730.5],
  LR4: [217.4, 723.6, 250.4, 757], LL4: [347.1, 723, 383.9, 751.7], LR3: [233.2, 746.9, 261.5, 778.1], LL3: [337.5, 743.9, 363.6, 778.2],
  LR2: [257.5, 753.1, 281, 784.9], LL2: [320.4, 755.5, 340.9, 781.7], LR1: [277.8, 758.4, 300.5, 786.9], LL1: [295.2, 758, 320.4, 787.8],
};
const STATUS = [
  { k: 'caries', t: 'تسوس', c: '#d64545', l: 'ت' },
  { k: 'filling', t: 'حشو', c: '#2f7fd1', l: 'ح' },
  { k: 'rct', t: 'حشو عصب', c: '#8a4fc7', l: 'ع' },
  { k: 'extract', t: 'محتاج خلع', c: '#e08a1e', l: 'خ' },
  { k: 'missing', t: 'مخلوع / مفقود', c: '#7b8288', l: 'م' },
  { k: 'crown', t: 'تركيبة / طربوش', c: '#b8932a', l: 'ر' },
  { k: 'implant', t: 'زرعة', c: '#1f9a8a', l: 'ز' },
  { k: 'done', t: 'تم العلاج', c: '#3a9d4f', l: '✓' },
];
const STATUS_BY = Object.fromEntries(STATUS.map(s => [s.k, s]));
const ARCH_NAME = { U: 'علوي — دائم', L: 'سفلي — دائم', u: 'علوي — لبني', l: 'سفلي — لبني' };

/* ====================== أدوات ====================== */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, css) => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) Object.assign(e.style, css); return e; };
const px = v => v + 'px';
const pad2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; };
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const toEn = s => String(s ?? '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
const num = s => { const v = parseFloat(toEn(s).replace(/[,،\s]/g, '')); return isFinite(v) ? v : null; };
const fmt = v => (Math.round(v * 100) / 100).toLocaleString('en-US');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const getK = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const setK = (o, k, v) => { const ps = k.split('.'); let a = o; ps.slice(0, -1).forEach(p => { a = a[p] = a[p] || {}; }); a[ps.at(-1)] = v; };
const wait = ms => new Promise(r => setTimeout(r, ms));
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }

/* ====================== التخزين (IndexedDB) ====================== */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(TEST ? 'bloom-test' : 'bloom-clinic', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('patients')) db.createObjectStore('patients', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(mode) { return this.db.transaction('patients', mode).objectStore('patients'); },
  all() { return new Promise((res, rej) => { const r = this.tx('readonly').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  put(p) { return new Promise((res, rej) => { const r = this.tx('readwrite').put(p); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  get(id) { return new Promise((res, rej) => { const r = this.tx('readonly').get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  del(id) { return new Promise((res, rej) => { const r = this.tx('readwrite').delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  meta(k, v) {
    return new Promise((res, rej) => {
      const st = this.db.transaction('meta', v === undefined ? 'readonly' : 'readwrite').objectStore('meta');
      const r = v === undefined ? st.get(k) : v === null ? st.delete(k) : st.put(v, k);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
};
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

let patients = [];
function newPatient(pool = patients) {
  const max = pool.reduce((m, p) => Math.max(m, num(p.fileNo) || 0), 0); // المحذوفين محسوبين — الرقم ما يتعادش
  const now = Date.now();
  return {
    id: uid(), fileNo: String(max + 1), name: '', mobile: '', firstVisit: today(), address: '', job: '', age: '',
    med: {}, medNotes: '', smoker: false, brush: false, dentalNotes: '', plan: {},
    procs: [], pays: [], teeth: {}, consentName: '', consentDay: '', consentDate: '', signature: '',
    createdAt: now, updatedAt: now,
  };
}

/* ====================== قائمة الملفات ====================== */
async function showHome() {
  $('#file').hidden = true; $('#home').hidden = false;
  history.replaceState(null, '', location.pathname);
  patients = (await DB.all()).filter(p => !p.deleted);
  renderList();
}
function renderList() {
  const q = toEn($('#q').value.trim()).toLowerCase();
  const list = $('#list'); list.innerHTML = '';
  const rows = patients
    .filter(p => !q || [p.name, toEn(p.mobile), toEn(p.fileNo)].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  $('#count').textContent = patients.length ? `${rows.length} من ${patients.length} ملف` : '';
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${patients.length ? 'مفيش ملف بالبحث ده' : 'لسه مفيش ملفات — دوس «+ ملف جديد» عشان تبدأ'}</div>`;
    return;
  }
  for (const p of rows) {
    const b = el('button', 'card');
    const mini = el('div', 'mini'); mini.style.backgroundImage = 'url(img/front.webp)';
    mini.append(Object.assign(el('div', 'no'), { textContent: p.fileNo || '' }));
    mini.append(Object.assign(el('div', 'nm'), { textContent: p.name || '' }));
    const meta = el('div', 'meta');
    meta.innerHTML = `<b></b><span></span>`;
    meta.firstChild.textContent = p.name || 'بدون اسم';
    meta.lastChild.textContent = `ملف ${p.fileNo || '—'}${p.mobile ? ' · ' + p.mobile : ''}`;
    b.append(mini, meta);
    b.onclick = () => openFile(p);
    list.append(b);
  }
}

/* ====================== بناء الصفحات ====================== */
const ui = { p: null, mode: 'spread', s: 1, zoom: 1, view: 'cover', open: 0, flipped: false, procSheet: 0, paySheet: 0, sheetEdit: false, busy: false };

function sheetsOf(arr, per, isFilled) {
  let last = -1; arr.forEach((r, i) => { if (r && isFilled(r)) last = i; });
  return Math.max(1, Math.ceil((last + 2) / per));
}
const procFilled = r => (r.t || r.d);
const payFilled = r => (r.d || r.total || r.paid || r.notes);

function buildPage(kind, p, mode) {
  const out = kind === 'front' || kind === 'back';
  const X = v => (out ? v * KO : v);
  const page = el('div', 'page', { width: px(PW), height: px(PH) });
  const bg = el('img', 'bg'); bg.src = `img/${kind}.webp`; bg.alt = ''; bg.draggable = false; page.append(bg);
  const ro = mode === 'print' || ui.sheetEdit;

  const mkInput = (f, value, onInput, extra = {}) => {
    const isArea = f.type === 'area';
    const inp = el(isArea ? 'textarea' : 'input', 'f' + (f.c ? ' c' : '') + (f.type === 'tel' || f.type === 'num' ? ' ltr' : ''));
    if (!isArea) inp.type = 'text';
    if (f.type === 'tel') inp.inputMode = 'tel';
    if (f.type === 'num') inp.inputMode = 'decimal';
    inp.value = value ?? '';
    inp.spellcheck = false; inp.autocomplete = 'off';
    Object.assign(inp.style, { left: px(X(f.x)), top: px(f.y), width: px(X(f.w)), height: px(f.h), fontSize: px(f.fs || 10) });
    if (f.indent) inp.style[isArea ? 'textIndent' : 'paddingRight'] = px(f.indent);
    if (f.lh) inp.style.lineHeight = px(f.lh);
    if (f.ph) inp.placeholder = f.ph;
    Object.assign(inp.style, extra.style || {});
    if (ro) inp.readOnly = true;
    if (mode !== 'print') {
      if (ui.sheetEdit) inp.addEventListener('click', () => editSheet(f, inp.value, v => { inp.value = v; onInput(v); }));
      else {
        inp.addEventListener('input', () => onInput(inp.value));
        if (f.type === 'date') inp.addEventListener('dblclick', () => { if (!inp.value) { inp.value = today(); onInput(inp.value); } });
      }
    }
    inp.dataset.k = f.k;
    return inp;
  };

  // الخانات العادية
  for (const f of FIELDS[kind] || []) {
    let val = getK(p, f.k);
    if (mode === 'print' && f.auto === 'name' && !val) val = p.name;
    const inp = mkInput(f, val, v => { setField(f.k, v); });
    if (f.auto === 'name') inp.placeholder = p.name || '';
    page.append(inp);
  }
  // مربعات الاختيار
  for (const c of CHECKS[kind] || []) {
    const cb = el('div', 'cb' + (getK(p, c.k) ? ' on' : ''), { left: px(c.x), top: px(c.y), width: px(c.w), height: px(c.h) });
    cb.dataset.k = c.k;
    if (mode !== 'print') cb.onclick = () => { const v = !getK(ui.p, c.k); setK(ui.p, c.k, v); touch(c.k); cb.classList.toggle('on', v); save(); };
    page.append(cb);
  }

  if (kind === 'info') {
    // التوقيع
    const sig = el('div', 'sig', { left: px(SIGNATURE.x), top: px(SIGNATURE.y), width: px(SIGNATURE.w), height: px(SIGNATURE.h) });
    if (p.signature) { const im = el('img'); im.src = p.signature; sig.append(im); }
    if (mode !== 'print') sig.onclick = () => signatureSheet();
    page.append(sig);
    // جدول الإجراءات
    const sheet = mode === 'print' ? 0 : ui.procSheet;
    const base = sheet * 26;
    PROC.cols.forEach((col, ci) => {
      for (let r = 0; r < PROC.rows; r++) {
        const i = base + ci * 13 + r;
        const y = PROC.y0 + r * PROC.rh;
        const rec = p.procs[i] || {};
        const tf = { k: `procs.${i}.t`, label: `الإجراء العلاجي (سطر ${i + 1})`, x: col.t[0] + 2, y: y + 3, w: col.t[1] - 4, h: PROC.rh - 6, fs: 9 };
        const df = { k: `procs.${i}.d`, label: `التاريخ (سطر ${i + 1})`, x: col.d[0] + 2, y: y + 3, w: col.d[1] - 4, h: PROC.rh - 6, fs: 8.5, c: 1, type: 'date' };
        const ti = mkInput(tf, rec.t, v => setRow('procs', i, 't', v));
        const di = mkInput(df, rec.d, v => setRow('procs', i, 'd', v));
        ti.dataset.row = i; di.dataset.row = i;
        page.append(ti, di);
      }
    });
  }

  if (kind === 'back') {
    const sheet = mode === 'print' ? 0 : ui.paySheet;
    const rems = payRemains(p.pays);
    for (let r = 0; r < PAY.rows; r++) {
      const i = sheet * PAY.rows + r;
      const y = PAY.y0 + r * PAY.rh;
      const rec = p.pays[i] || {};
      const mk = (col, label, extra) => ({ k: `pays.${i}.${col}`, label: `${label} (سطر ${i + 1})`, x: PAY.x[col][0] + 2, y: y + 3, w: PAY.x[col][1] - 4, h: PAY.rh - 6, fs: 10, c: 1, ...extra });
      page.append(mkInput(mk('d', 'التاريخ', { type: 'date', fs: 9 }), rec.d, v => setRow('pays', i, 'd', v)));
      page.append(mkInput(mk('total', 'الإجمالى', { type: 'num' }), rec.total, v => setRow('pays', i, 'total', v)));
      page.append(mkInput(mk('paid', 'المدفوع', { type: 'num' }), rec.paid, v => setRow('pays', i, 'paid', v)));
      const rem = el('div', 'cell rem', { left: px(X(PAY.x.rem[0])), top: px(y), width: px(X(PAY.x.rem[1])), height: px(PAY.rh) });
      rem.dataset.rem = i; showRem(rem, rems[i]);
      page.append(rem);
      page.append(mkInput(mk('notes', 'ملاحظات', { c: 0, fs: 9 }), rec.notes, v => setRow('pays', i, 'notes', v)));
    }
  }

  if (kind === 'chart') {
    for (const t of TEETH) {
      const st = (p.teeth || {})[t.id] || {};
      const S = STATUS_BY[st.s];
      // المربع جنب السنة: ✓ لما يتحدد لها مشكلة — والسطر: اسم المشكلة + الملاحظة
      const box = el('div', 't-box' + (S ? ' on' : ''), { left: px(t.box), top: px(t.y), width: px(10.2), height: px(10.2) });
      const note = el('div', 't-note', { left: px(t.strip), top: px(t.y - 0.5), width: px(122.7), height: px(11.2) });
      const txt = !S ? (st.n || '') : !st.n ? S.t : st.n.startsWith(S.t) ? st.n : `${S.t} — ${st.n}`;
      if (txt) { const sp = el('span'); sp.textContent = txt; if (S) sp.style.setProperty('--tc', S.c); note.append(sp); }
      const lab = el('div', 't-lab', { left: px(t.lab), top: px(t.y), width: px(10.2), height: px(10.2) });
      const c = CROWN[t.id];
      const crown = el('div', 't-crown' + (st.s === 'missing' ? ' gone' : ''), { left: px(c[0] + 2), top: px(c[1] + 2), width: px(c[2] - c[0] - 4), height: px(c[3] - c[1] - 4) });
      if (S && st.s !== 'missing') crown.style.background = S.c + '66';
      const parts = [box, note, lab, crown];
      for (const e of parts) {
        e.dataset.tooth = t.id;
        if (mode === 'print') continue;
        e.onclick = () => toothSheet(t.id);
        e.onpointerenter = () => parts.forEach(x => x.classList.add('hl'));
        e.onpointerleave = () => parts.forEach(x => x.classList.remove('hl'));
      }
      page.append(crown, box, note, lab);
    }
  }
  return page;
}

function payRemains(pays) {
  const out = []; let prev = null;
  pays.forEach((r, i) => {
    if (!r || !payFilled(r)) { out[i] = null; return; }
    const tot = num(r.total), paid = num(r.paid);
    const base = tot != null ? tot : prev;
    if (base == null) { out[i] = null; return; }
    const v = base - (paid || 0);
    out[i] = v; prev = v;
  });
  return out;
}
function showRem(cell, v) { cell.textContent = v == null ? '' : fmt(v); cell.classList.toggle('neg', v != null && v < 0); }

/* ====================== الحفظ ====================== */
// وقت آخر تعديل لكل خانة — عشان المزامنة تدمج تعديلات الأجهزة من غير ما حاجة تمسح حاجة
function touch(k) { (ui.p._t = ui.p._t || {})[k] = Date.now(); }
function setField(k, v) {
  setK(ui.p, k, v); touch(k);
  if (k === 'name' || k === 'mobile' || k === 'fileNo') syncTwins(k, v);
  save();
}
function syncTwins(k, v) {
  document.querySelectorAll(`#folder .f[data-k="${k}"]`).forEach(i => { if (i !== document.activeElement) i.value = v; });
  if (k === 'name') { const c = $('#folder .f[data-k="consentName"]'); if (c) c.placeholder = v; }
  updateTitle();
}
function setRow(arr, i, col, v) {
  const a = ui.p[arr];
  while (a.length <= i) a.push({});
  a[i] = a[i] || {};
  a[i][col] = v; touch(`${arr}.${i}`);
  // تاريخ تلقائي لما يتكتب في السطر لأول مرة
  if (col !== 'd' && v && !a[i].d) {
    a[i].d = today();
    const di = $(`#folder .f[data-k="${arr}.${i}.d"]`); if (di) di.value = a[i].d;
  }
  while (a.length && !(arr === 'procs' ? procFilled : payFilled)(a.at(-1) || {})) a.pop();
  if (arr === 'pays') {
    const rems = payRemains(a);
    document.querySelectorAll('#folder [data-rem]').forEach(c => showRem(c, rems[+c.dataset.rem]));
  }
  save();
  updateCtx();
}
let saveT;
function save() {
  ui.p.updatedAt = Date.now();
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if (!ui.p) return;
    await DB.put(ui.p);
    Sync.soon();
    const s = $('#saved'); s.textContent = '✓ اتحفظ'; s.classList.add('on');
    clearTimeout(save.h); save.h = setTimeout(() => s.classList.remove('on'), 1400);
  }, 350);
}
function updateTitle() {
  $('#ttlName').textContent = ui.p.name || 'ملف جديد';
  $('#ttlNo').textContent = `ملف رقم ${ui.p.fileNo || '—'}${ui.p.mobile ? ' · ' + ui.p.mobile : ''}`;
}

/* ====================== الملف (الفولدر) ====================== */
const faces = () => ({
  front: $('#folder [data-page="front"]'), back: $('#folder [data-page="back"]'),
  chart: $('#folder [data-page="chart"]'), info: $('#folder [data-page="info"]'),
});

function renderPages(only) {
  const F = faces();
  for (const k of only || ['front', 'back', 'chart', 'info']) {
    F[k].innerHTML = '';
    const pg = buildPage(k, ui.p, 'edit');
    pg.style.transform = `scale(${ui.s})`;
    F[k].append(pg);
  }
}

async function openFile(p) {
  ui.p = p; ui.view = 'cover'; ui.open = 0; ui.flipped = false; ui.procSheet = 0; ui.paySheet = 0; ui.zoom = 1;
  $('#home').hidden = true; $('#file').hidden = false;
  history.pushState({ file: p.id }, '', '#' + p.id);
  updateTitle();
  layout(true);
  setNav();
  updateCtx();
}

function layout(rebuild) {
  const vp = $('#viewport');
  const vw = vp.clientWidth, vh = vp.clientHeight;
  const pad = vw < 600 ? 10 : 24;
  const sSpread = Math.min((vw - pad * 2) / (2 * PW), (vh - pad * 2) / PH);
  const sSingle = Math.min((vw - pad * 2) / PW, (vh - pad * 2) / PH);
  const mode = sSpread >= sSingle * 0.8 ? 'spread' : 'single';
  let s = (mode === 'spread' ? sSpread : sSingle) * ui.zoom;
  if (ui.zoom > 1) s = Math.min(Math.max(s, ((vw - pad * 2) / (mode === 'spread' ? 2 * PW : PW)) * (ui.zoom > 1.6 ? 1.6 : 1)), 3);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const sheetEdit = s < 0.62 || (coarse && s < 0.95);
  const changed = rebuild || s !== ui.s || mode !== ui.mode || sheetEdit !== ui.sheetEdit;
  ui.s = s; ui.mode = mode; ui.sheetEdit = sheetEdit;
  const W = PW * s, H = PH * s;
  const world = $('#world');
  const showW = mode === 'spread' ? 2 * W : W;
  world.style.width = px(Math.max(vw, showW + pad * 2));
  world.style.height = px(Math.max(vh, H + pad * 2));
  vp.classList.toggle('zoomed', ui.zoom > 1);
  const folder = $('#folder');
  folder.style.width = px(2 * W); folder.style.height = px(H);
  folder.style.top = px(Math.max(pad, (Math.max(vh, H + pad * 2) - H) / 2));
  if (changed) renderPages();
  if (ui.view === 'chart' && mode === 'spread') ui.view = 'info';
  $('#seg [data-go="chart"]').hidden = mode === 'spread';
  $('#seg [data-go="info"]').textContent = mode === 'spread' ? 'من جوه' : 'البيانات';
  applyGeometry(true);
}

// موضع الفولدر حسب الحالة
function folderX(p) {
  const world = $('#world'); const C = world.clientWidth / 2; const W = PW * ui.s;
  if (ui.mode === 'spread') return C - 1.5 * W + p * 0.5 * W;
  return ui.view === 'chart' ? C - 0.5 * W : C - 1.5 * W;
}
let settleT;
function unsettle() {
  const folder = $('#folder');
  clearTimeout(settleT);
  if (!folder.classList.contains('settled')) return;
  folder.classList.add('nofx'); folder.classList.remove('settled'); folder.offsetWidth; folder.classList.remove('nofx');
}
function settleLater(ms) {
  clearTimeout(settleT);
  settleT = setTimeout(() => $('#folder').classList.toggle('settled', ui.open >= 1 && !ui.flipped), ms);
}
function applyGeometry(instant) {
  const folder = $('#folder'), cover = $('#coverLeaf');
  if (!(ui.open >= 1 && !ui.flipped)) unsettle();
  // لو الغلاف ما اتحركش (مجرد تنقل بين البيانات والأسنان) يفضل مفرود على طول
  const moved = applyGeometry.lastOpen !== ui.open || applyGeometry.lastFlip !== ui.flipped;
  settleLater(instant || !moved ? 0 : 780);
  applyGeometry.lastOpen = ui.open; applyGeometry.lastFlip = ui.flipped;
  if (instant) folder.classList.add('nofx');
  const a = -180 * ui.open;
  cover.style.transform = `rotateY(${a}deg)`;
  folder.style.transform = `translateX(${folderX(ui.open)}px) rotateY(${ui.flipped ? 180 : 0}deg)`;
  shade(ui.open);
  folder.classList.toggle('is-open', ui.open > 0.5 && !ui.flipped);
  if (instant) { folder.offsetWidth; folder.classList.remove('nofx'); }
  const F = faces();
  const vis = ui.flipped ? ['back'] : ui.open >= 1 ? ['chart', 'info'] : ui.open <= 0 ? ['front'] : ['front', 'chart', 'info'];
  for (const k in F) F[k].inert = !vis.includes(k);
}
function shade(p) {
  const F = faces(); const s = Math.sin(Math.PI * p);
  F.front.style.setProperty('--shade', (p < 0.5 ? s * 0.55 : 0).toFixed(3));
  F.chart.style.setProperty('--shade', (p > 0.5 ? s * 0.45 : 0).toFixed(3));
  F.info.style.setProperty('--shade', (s * 0.5).toFixed(3));
}

async function go(view) {
  if (ui.busy || view === ui.view) return;
  ui.busy = true;
  const folder = $('#folder');
  try {
    if (view === 'back') {
      if (ui.open) { ui.view = 'info'; ui.open = 0; applyGeometry(); await wait(720); }
      ui.flipped = true; ui.view = 'back'; applyGeometry(); await wait(720);
    } else {
      if (ui.flipped) { ui.flipped = false; ui.view = 'cover'; applyGeometry(); await wait(720); }
      if (view === 'cover') { if (ui.open) { const wasChart = ui.view === 'chart'; ui.view = 'cover'; if (wasChart) { applyGeometry(); await wait(40); } ui.open = 0; applyGeometry(); await wait(760); } }
      else {
        if (!ui.open) { ui.view = 'info'; ui.open = 1; applyGeometry(); await wait(760); }
        ui.view = view; applyGeometry(); if (ui.mode === 'single') await wait(700);
      }
    }
    ui.view = view;
  } finally { ui.busy = false; }
  setNav(); updateCtx();
  folder.classList.toggle('is-open', ui.open > 0.5 && !ui.flipped);
}
function setNav() {
  const v = ui.mode === 'spread' && ui.view === 'chart' ? 'info' : ui.view;
  document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.go === v));
}

/* سحب الغلاف بالإيد — نفس إحساس فتح الملف */
(function dragCover() {
  const world = () => $('#world');
  let st = null;
  const interactive = t => t.closest('.f, .cb, .sig, .t-box, .t-note, .t-crown, .t-lab, button');
  document.addEventListener('pointerdown', e => {
    if ($('#file').hidden || ui.busy || ui.flipped || ui.zoom > 1 || !e.isPrimary) return;
    const face = e.target.closest('#folder .face');
    if (!face) return;
    const pg = face.dataset.page;
    st = { x: e.clientX, y: e.clientY, p0: ui.open, pg, moved: false, interactive: !!interactive(e.target), id: e.pointerId };
  });
  document.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) { if (Math.abs(dy) > 12) st = null; return; }
      // الغلاف يتسحب من الغلاف نفسه، أو من صفحة الأسنان لقفله
      if (ui.mode === 'single' && ui.open >= 1) { st.swipe = true; }
      else if (!(st.pg === 'front' || st.pg === 'chart' || (st.pg === 'info' && dx > 0))) { st = null; return; }
      if (!st.swipe) unsettle();
      st.moved = true; if (!st.swipe) $('#folder').classList.add('nofx');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    if (st.swipe) return;
    const span = PW * ui.s * (ui.mode === 'spread' ? 1.6 : 1.1);
    const p = Math.min(1, Math.max(0, st.p0 - dx / span));
    st.p = p;
    $('#coverLeaf').style.transform = `rotateY(${-180 * p}deg)`;
    $('#folder').style.transform = `translateX(${folderX(p)}px)`;
    shade(p);
    for (const k of ['front', 'chart', 'info']) faces()[k].inert = false;
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    $('#folder').classList.remove('nofx');
    if (!s.moved) {
      if (e.type === 'pointerup' && s.pg === 'front' && !s.interactive && !ui.open) go('info');
      return;
    }
    if (s.swipe) {
      const dx = e.clientX - s.x;
      if (dx > 40 && ui.view === 'info') go('chart');
      else if (dx < -40 && ui.view === 'chart') go('info');
      return;
    }
    const target = s.p == null ? s.p0 : (s.p > (s.p0 ? 0.75 : 0.25) ? 1 : 0);
    ui.open = target; ui.view = target ? 'info' : 'cover';
    applyGeometry(); setNav(); updateCtx();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

/* ====================== الشريط السفلي (حسب الصفحة) ====================== */
function updateCtx() {
  const ctx = $('#ctx'); ctx.innerHTML = '';
  if (!ui.p) return;
  const sheetPill = (label, cur, n, onGo) => {
    const d = el('div', 'pill');
    const prev = el('button'); prev.textContent = '›'; prev.disabled = cur <= 0; prev.onclick = () => onGo(cur - 1);
    const next = el('button'); next.textContent = '‹'; next.disabled = cur >= n - 1; next.onclick = () => onGo(cur + 1);
    const t = el('span'); t.textContent = `${label} ${cur + 1} من ${n}`;
    d.append(prev, t, next); return d;
  };
  const v = ui.view;
  if (v === 'back') {
    const n = sheetsOf(ui.p.pays, PAY.rows, payFilled);
    if (n > 1) ctx.append(sheetPill('ورقة الحسابات', ui.paySheet, n, i => { ui.paySheet = i; renderPages(['back']); updateCtx(); }));
    const rems = payRemains(ui.p.pays).filter(v => v != null);
    const paid = ui.p.pays.reduce((s, r) => s + (num(r && r.paid) || 0), 0);
    const sum = el('div', 'pill sum');
    const last = rems.length ? rems.at(-1) : null;
    sum.innerHTML = `المدفوع: <b>${fmt(paid)}</b> &nbsp;·&nbsp; الباقي: <b class="${last < 0 ? 'neg' : ''}">${last == null ? '—' : fmt(last)}</b>`;
    ctx.append(sum);
  }
  if (v === 'info' || (v === 'chart' && ui.mode === 'single')) {
    if (v === 'info') {
      const n = sheetsOf(ui.p.procs, 26, procFilled);
      if (n > 1) ctx.append(sheetPill('ورقة الإجراءات', ui.procSheet, n, i => { ui.procSheet = i; renderPages(['info']); updateCtx(); }));
    }
  }
  if ((v === 'chart' || (v === 'info' && ui.mode === 'spread'))) {
    const lg = el('div', 'legend');
    for (const s of STATUS) { const i = el('i'); i.style.background = s.c; i.textContent = s.t; lg.append(i); }
    ctx.append(lg);
  }
}

/* ====================== نوافذ الكتابة ====================== */
function openSheet(title, body, buttons) {
  const sh = $('#sheet');
  $('#sheetTitle').textContent = title;
  const b = $('#sheetBody'); b.innerHTML = ''; b.append(...[].concat(body));
  const f = $('#sheetFoot'); f.innerHTML = '';
  for (const [label, cls, fn] of buttons) {
    const bt = el('button', cls); bt.textContent = label;
    bt.onclick = async () => { if ((await fn()) !== false) closeSheet(); };
    f.append(bt);
  }
  sh.hidden = false;
  sh.onclick = e => { if (e.target === sh || e.target.closest('[data-close]')) closeSheet(); };
}
function closeSheet() { $('#sheet').hidden = true; }

function editSheet(f, value, apply) {
  const area = f.type === 'area' || /^(procs\.\d+\.t|.*Notes|pays\.\d+\.notes)$/.test(f.k);
  const inp = el(area ? 'textarea' : 'input');
  inp.value = value || '';
  if (f.type === 'tel') { inp.inputMode = 'tel'; inp.dir = 'ltr'; }
  if (f.type === 'num') { inp.inputMode = 'decimal'; inp.dir = 'ltr'; }
  const body = [Object.assign(el('label'), { textContent: f.label }), inp];
  if (f.type === 'date' || f.type === 'day') {
    const q = el('div', 'quick');
    const b = el('button'); b.textContent = f.type === 'day' ? 'النهارده' : 'تاريخ النهارده';
    b.onclick = () => { inp.value = f.type === 'day' ? DAYS[new Date().getDay()] : today(); };
    q.append(b); body.push(q);
  }
  openSheet(f.label, body, [['حفظ', 'ok', () => apply(inp.value)], ['إلغاء', 'no', () => {}]]);
  setTimeout(() => { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {} }, 60);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !area) { apply(inp.value); closeSheet(); } });
}

function toothSheet(id) {
  const t = TEETH.find(x => x.id === id);
  const cur = Object.assign({}, (ui.p.teeth || {})[id]);
  const chips = el('div', 'chips');
  const none = el('button', 'none'); none.textContent = 'بدون';
  const all = [none];
  none.onclick = () => { cur.s = ''; mark(); };
  for (const s of STATUS) {
    const b = el('button'); b.textContent = s.t; b.style.background = s.c; b.dataset.s = s.k;
    b.onclick = () => { cur.s = s.k; mark(); };
    chips.append(b); all.push(b);
  }
  chips.prepend(none);
  const note = el('input'); note.value = cur.n || ''; note.placeholder = 'مثال: سطح طاحن — جلسة أولى';
  // أي اختيار بيتسجل على الصفحة على طول (✓ جنب السنة + اسم المشكلة على السطر)
  const commit = () => {
    ui.p.teeth = ui.p.teeth || {};
    cur.n = note.value.trim();
    if (!cur.s && !cur.n) delete ui.p.teeth[id]; else ui.p.teeth[id] = { s: cur.s || '', n: cur.n };
    touch(`teeth.${id}`);
    save(); renderPages(['chart']);
  };
  const mark = () => all.forEach(b => b.classList.toggle('on', (b.dataset.s || '') === (cur.s || '')));
  all.forEach(b => b.addEventListener('click', () => { mark(); commit(); }));
  mark();
  note.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); closeSheet(); } });
  const side = t.side === 'R' ? 'يمين' : 'شمال';
  openSheet(`سنة ${t.n} — ${ARCH_NAME[t.arch]} — ${side}`,
    [Object.assign(el('label'), { textContent: 'المشكلة' }), chips, Object.assign(el('label'), { textContent: 'ملاحظة (اختياري)' }), note],
    [['تم', 'ok', commit]]);
}

function signatureSheet() {
  const c = el('canvas', 'sigpad');
  const body = [Object.assign(el('label'), { textContent: 'المريض يمضي هنا بصباعه أو بالماوس' }), c];
  let drawn = false;
  openSheet('التوقيع', body, [
    ['حفظ', 'ok', () => {
      if (!drawn) return false;
      ui.p.signature = trimCanvas(c); touch('signature'); save(); renderPages(['info']);
    }],
    ['مسح', 'no', () => { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); drawn = false; return false; }],
    ...(ui.p.signature ? [['شيل التوقيع', 'del', () => { ui.p.signature = ''; touch('signature'); save(); renderPages(['info']); }]] : []),
  ]);
  requestAnimationFrame(() => {
    const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.6; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = '#0b2033';
    let last = null;
    const pt = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    c.onpointerdown = e => { c.setPointerCapture(e.pointerId); last = pt(e); };
    c.onpointermove = e => { if (!last) return; const p = pt(e); x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); last = p; drawn = true; };
    c.onpointerup = c.onpointercancel = () => (last = null);
  });
}
function trimCanvas(c) {
  const x = c.getContext('2d'); const { width: w, height: h } = c; const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 10) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const o = document.createElement('canvas'); const m = 6;
  o.width = x1 - x0 + m * 2; o.height = y1 - y0 + m * 2;
  o.getContext('2d').drawImage(c, x0 - m, y0 - m, o.width, o.height, 0, 0, o.width, o.height);
  const k = Math.min(1, 140 / o.height, 520 / o.width);
  if (k < 1) { const z = document.createElement('canvas'); z.width = Math.round(o.width * k); z.height = Math.round(o.height * k); z.getContext('2d').drawImage(o, 0, 0, z.width, z.height); return z.toDataURL('image/png'); }
  return o.toDataURL('image/png');
}

/* ====================== طباعة / حذف / نسخ احتياطي ====================== */
function printFile() {
  const pr = $('#print'); pr.innerHTML = '';
  for (const k of ['front', 'info', 'chart', 'back']) { const pp = el('div', 'pp'); pp.append(buildPage(k, ui.p, 'print')); pr.append(pp); }
  const imgs = [...pr.querySelectorAll('img')];
  Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => window.print(), 50));
}
async function deleteFile() {
  if (!confirm(`حذف ملف «${ui.p.name || 'بدون اسم'}» نهائياً؟ مش هينفع ترجعه إلا من نسخة احتياطية.`)) return;
  clearTimeout(saveT);
  ui.p.deleted = true; touch('deleted'); ui.p.updatedAt = Date.now();
  await DB.put(ui.p); ui.p = null; toast('اتحذف الملف'); Sync.soon(); showHome();
}
async function backup() {
  const all = await DB.all();
  const blob = new Blob([JSON.stringify({ app: 'bloom-clinic', version: 1, exportedAt: new Date().toISOString(), patients: all })], { type: 'application/json' });
  const a = el('a'); a.href = URL.createObjectURL(blob);
  const d = new Date(); a.download = `Bloom-Backup-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`اتعملت نسخة فيها ${all.length} ملف`);
}
async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.patients)) throw 0;
    const cur = Object.fromEntries((await DB.all()).map(p => [p.id, p]));
    let added = 0, updated = 0;
    for (const p of data.patients) {
      if (!p || !p.id) continue;
      const old = cur[p.id];
      if (!old) { await DB.put(p); added++; } else if ((p.updatedAt || 0) > (old.updatedAt || 0)) { const m = SyncCore.merge(old, p); m._syncedAt = old._syncedAt || 0; await DB.put(m); updated++; }
    }
    toast(`اتضاف ${added} ملف واتحدث ${updated}`); Sync.soon(); showHome();
  } catch (_) { toast('الملف ده مش نسخة احتياطية صحيحة'); }
}

/* ====================== المزامنة بين الأجهزة ======================
   كل جهاز شغال على نسخته (من غير نت عادي)، وفي الخلفية:
   يبعت الملفات اللي اتعدلت عنده ← ويسحب اللي اتعدل على الأجهزة التانية ← ويدمج خانة بخانة. */
const Sync = {
  cfg: null, busy: false, again: false, state: 'off', last: 0, err: '', t: null,
  async init() {
    this.cfg = await DB.meta('sync') || null;
    this.paint();
    if (this.cfg) this.startLoop();
  },
  startLoop() {
    if (this.started) return; this.started = true;
    setInterval(() => { if (document.visibilityState === 'visible') this.run(); }, 30000);
    addEventListener('online', () => this.run());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.run(); });
    this.run();
  },
  decode(code) {
    code = String(code || '').trim();
    const m = code.match(/sync=([A-Za-z0-9_\-+/=]+)/); if (m) code = m[1];
    const j = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))));
    if (!j.u || !j.k) throw new Error('bad');
    return { url: j.u, key: j.k };
  },
  async connect(code) {
    let c;
    try { c = this.decode(code); } catch (_) { toast('كود الربط ده مش صحيح'); return false; }
    try {
      const r = await this.post({ op: 'ping' }, c);
      if (!r.ok) throw new Error(r.error || 'رفض');
    } catch (e) { toast('مش قادر يوصل للسيرفر: ' + (e.message || e)); return false; }
    this.cfg = { url: c.url, key: c.key, cursor: 0 };
    await DB.meta('sync', this.cfg);
    toast('✓ الجهاز ده اتربط بالمزامنة');
    this.startLoop(); this.run();
    return true;
  },
  async disconnect() { this.cfg = null; await DB.meta('sync', null); this.state = 'off'; this.paint(); },
  async post(body, c = this.cfg) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key: c.key }), signal: ctl.signal, redirect: 'follow' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'خطأ من السيرفر');
      return j;
    } finally { clearTimeout(to); }
  },
  soon() { if (!this.cfg) return; clearTimeout(this.t); this.t = setTimeout(() => this.run(), 2500); this.paint(); },
  async pendingList() {
    const all = await DB.all();
    if (ui.p) { const i = all.findIndex(p => p.id === ui.p.id); if (i >= 0) all[i] = ui.p; }
    return all.filter(p => (p.updatedAt || 0) > (p._syncedAt || 0));
  },
  async run() {
    if (!this.cfg) return;
    if (this.busy) { this.again = true; return; }
    if (!navigator.onLine) { this.state = 'offline'; this.paint(); return; }
    this.busy = true; this.state = 'sync'; this.paint();
    let changedOpen = false, changedList = false;
    try {
      if (ui.p) { clearTimeout(saveT); await DB.put(ui.p); }
      const queue = (await this.pendingList()).map(p => { const c = SyncCore.clone(p); delete c._syncedAt; delete c._dirty; return c; });
      let more = true;
      while (queue.length || more) {
        const push = queue.splice(0, 20);
        const res = await this.post({ op: 'sync', since: this.cfg.cursor || 0, push });
        for (const r of res.pull) {
          const ch = await this.applyRemote(r);
          if (ch === 'open') changedOpen = true;
          if (ch) changedList = true;
        }
        this.cfg.cursor = res.cursor; more = !!res.more;
        await DB.meta('sync', this.cfg);
      }
      this.state = 'ok'; this.last = Date.now(); this.err = '';
    } catch (e) {
      this.state = navigator.onLine ? 'err' : 'offline'; this.err = String(e.message || e);
    } finally { this.busy = false; }
    if (changedOpen) refreshOpen();
    if (changedList && !$('#home').hidden) { patients = (await DB.all()).filter(p => !p.deleted); renderList(); }
    this.paint();
    if (this.again) { this.again = false; this.run(); }
  },
  // يدمج نسخة جاية من السيرفر مع النسخة اللي على الجهاز
  async applyRemote(r) {
    const open = ui.p && ui.p.id === r.id;
    const local = open ? ui.p : await DB.get(r.id);
    const merged = SyncCore.merge(local, r);
    // لو الجهاز ده عنده تعديلات أحدث من اللي السيرفر شافها، تفضل مستنية تتبعت
    merged._syncedAt = local && (local.updatedAt || 0) > (r.updatedAt || 0) ? r.updatedAt : merged.updatedAt;
    const same = local && stable({ ...local, _syncedAt: 0, _dirty: 0 }) === stable({ ...merged, _syncedAt: 0, _dirty: 0 });
    if (open) { for (const k of Object.keys(ui.p)) delete ui.p[k]; Object.assign(ui.p, merged); }
    await DB.put(open ? ui.p : merged);
    if (same) return false;
    return open ? 'open' : 'list';
  },
  paint() {
    const s = this.state, n = this.cfg ? '' : '';
    const label = !this.cfg ? 'مزامنة' : s === 'sync' ? 'بيزامن…' : s === 'ok' ? 'متزامن' : s === 'offline' ? 'من غير نت' : s === 'err' ? 'مشكلة' : 'مزامنة';
    const icon = !this.cfg ? '☁' : s === 'sync' ? '⟳' : s === 'ok' ? '☁✓' : s === 'offline' ? '☁✕' : s === 'err' ? '⚠' : '☁';
    document.querySelectorAll('.sync-btn').forEach(b => {
      b.dataset.state = this.cfg ? s : 'off';
      b.innerHTML = `<i>${icon}</i><span>${label}</span>`;
      b.title = this.err || label + n;
    });
  },
};

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
function refreshOpen() {
  if (!ui.p) return;
  if (ui.p.deleted) { toast('الملف ده اتحذف من جهاز تاني'); ui.p = null; showHome(); return; }
  updateTitle();
  const F = faces(), act = document.activeElement;
  for (const k in F) {
    if (act && F[k].contains(act) && act.matches('.f')) {
      F[k].querySelectorAll('.f').forEach(i => { if (i !== act) i.value = getK(ui.p, i.dataset.k) ?? ''; });
      F[k].querySelectorAll('.cb').forEach(c => c.classList.toggle('on', !!getK(ui.p, c.dataset.k)));
      const rems = payRemains(ui.p.pays); F[k].querySelectorAll('[data-rem]').forEach(c => showRem(c, rems[+c.dataset.rem]));
    } else renderPages([k]);
  }
  updateCtx();
}

async function syncSheet() {
  const body = [];
  if (!Sync.cfg) {
    const p = el('p'); p.style.cssText = 'margin:0 0 6px;color:#455;line-height:1.7;font-size:14px';
    p.textContent = 'عشان الملفات تبقى واحدة على الموبايل والكمبيوتر، افتح «لينك الربط» على كل جهاز مرة واحدة — أو الصق الكود هنا.';
    const inp = el('textarea'); inp.placeholder = 'الصق لينك أو كود الربط'; inp.dir = 'ltr'; inp.style.minHeight = '80px';
    body.push(p, inp);
    openSheet('ربط المزامنة', body, [['اربط', 'ok', async () => (await Sync.connect(inp.value)) ? undefined : false], ['إلغاء', 'no', () => {}]]);
    return;
  }
  const pend = (await Sync.pendingList()).length;
  const st = { ok: '✓ كل الملفات متزامنة', sync: '⟳ بيزامن دلوقتي…', offline: '✕ مفيش نت — هيزامن لوحده أول ما النت يرجع', err: '⚠ حصلت مشكلة: ' + Sync.err, off: '' }[Sync.state] || '';
  const info = el('div'); info.style.cssText = 'font-size:15px;line-height:2;color:#123';
  info.innerHTML = `<div></div><div style="color:#567;font-size:13.5px"></div><div style="color:#567;font-size:13.5px"></div>`;
  info.children[0].textContent = st;
  info.children[1].textContent = Sync.last ? 'آخر مزامنة: ' + new Date(Sync.last).toLocaleTimeString('ar-EG') : 'لسه ما اتزامنش في الفتحة دي';
  info.children[2].textContent = pend ? `${pend} ملف مستني يتبعت` : 'مفيش حاجة مستنية';
  body.push(info);
  openSheet('المزامنة', body, [
    ['زامن دلوقتي', 'ok', () => { Sync.run(); }],
    ['فصل الجهاز ده', 'del', async () => { if (!confirm('فصل الجهاز ده عن المزامنة؟ الملفات اللي عليه هتفضل موجودة.')) return false; await Sync.disconnect(); toast('الجهاز اتفصل'); }],
  ]);
}

/* ====================== تشغيل ====================== */
async function boot() {
  await DB.open();
  $('#q').addEventListener('input', renderList);
  $('#btnNew').onclick = async () => {
    // نزامن الأول (لحد 4 ثواني) عشان رقم الملف الجديد ما يتكررش مع جهاز تاني
    if (Sync.cfg && navigator.onLine) { await Promise.race([Sync.run(), wait(4000)]); patients = (await DB.all()).filter(p => !p.deleted); }
    const all = await DB.all();
    const p = newPatient(all); await DB.put(p); patients.push(p); openFile(p);
  };
  $('#btnClose').onclick = () => { if (ui.p) DB.put(ui.p); ui.p = null; showHome(); };
  $('#btnPrint').onclick = printFile;
  $('#btnDelete').onclick = deleteFile;
  $('#btnZoom').onclick = () => { ui.zoom = ui.zoom > 1 ? 1 : 1.8; $('#btnZoom').textContent = ui.zoom > 1 ? '⊖' : '⊕'; layout(); };
  $('#btnBackup').onclick = backup;
  $('#btnRestore').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = e => { const f = e.target.files[0]; if (f) restore(f); e.target.value = ''; };
  document.querySelectorAll('#seg button').forEach(b => (b.onclick = () => go(b.dataset.go)));
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#file').hidden) layout(); }, 120); });
  addEventListener('popstate', () => { if (!$('#file').hidden) { if (ui.p) DB.put(ui.p); ui.p = null; showHome(); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  const w = $('#world'); w.addEventListener('scroll', () => { w.scrollLeft = 0; w.scrollTop = 0; });
  const id = location.hash.slice(1);
  await Sync.init();
  document.querySelectorAll('.sync-btn').forEach(b => (b.onclick = syncSheet));
  if (id.startsWith('sync=')) { history.replaceState(null, '', location.pathname + location.search); await Sync.connect(id.slice(5)); }
  if (TEST) return testMode();
  await showHome();
  if (id && !id.startsWith('sync=')) { const p = patients.find(x => x.id === id); if (p) openFile(p); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
async function testMode() {
  patients = await DB.all();
  if (!patients.length) {
    const p = newPatient();
    Object.assign(p, {
      name: 'محمد أحمد عبد الله', mobile: '01012345678', address: 'المنيا الجديدة - الحي الرابع', job: 'مهندس', age: '34',
      med: { bp: true, diabetes: true, thinners: true }, medNotes: 'بياخد أسبرين يومياً', smoker: true, dentalNotes: 'حساسية من البنج',
      plan: { scaling: true, filling: true, rct: true },
      procs: [{ t: 'تنظيف جير كامل', d: '01/11/2026' }, { t: 'حشو عصب ضرس 6 تحت شمال', d: '05/11/2026' }],
      pays: [{ d: '01/11/2026', total: '3000', paid: '1000', notes: 'دفعة أولى' }, { d: '05/11/2026', paid: '1500' }],
      teeth: { LL6: { s: 'rct', n: 'حشو عصب — جلسة 1' }, UR3: { s: 'caries', n: 'تسوس سطحي' }, LR8: { s: 'missing', n: '' }, uRD: { s: 'filling', n: 'حشو' }, UL1: { s: 'crown', n: 'طربوش زيركون' } },
      consentDay: 'الأحد', consentDate: '01/11/2026',
    });
    await DB.put(p); patients = [p];
  }
  if (TEST === 'home') return showHome();
  await openFile(patients[0]);
  if (TEST !== 'cover') { ui.view = TEST; ui.open = TEST === 'back' ? 0 : 1; ui.flipped = TEST === 'back'; applyGeometry(true); setNav(); updateCtx(); }
}
boot();
