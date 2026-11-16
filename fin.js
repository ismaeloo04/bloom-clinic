'use strict';
/* Bloom Clinic — حسابات العيادة (برا ملفات المرضى)
   كل سطر دخل = سجل لوحده، ومصروفات كل شهر = سجل، والإعدادات (دكاترة/معامل/بنود) = سجل واحد.
   كلهم بيتحفظوا على الجهاز (IndexedDB) وبيتزامنوا مع باقي الأجهزة زي ملفات المرضى. */

const EXP_DEFAULT = [['rent', 'الإيجار'], ['elec', 'الكهرباء'], ['net', 'الإنترنت'], ['assist', 'مرتبات الأسيستنت'], ['clean', 'النظافة'], ['maint', 'الإصلاحات والصيانة']];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const SETTINGS_ID = 'fin-settings';
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const dmy = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const monthName = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const r2 = v => Math.round(v * 100) / 100;
const egp = v => `⁦${fmt(r2(v || 0))}⁩ ج.م`; // الرقم LTR جوه الكلام العربي (عشان السالب يظهر -3,340 مش 3,340-)
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// حساب السطر: صافي بعد المعمل ← نصيب الدكتور بالنسبة ← الباقي للعيادة
function calcLine(l) {
  const total = num(l.total) || 0;
  const lab = l.hasLab ? (num(l.lab) || 0) : 0;
  const pct = num(l.pct) ?? 40;
  const net = r2(total - lab);
  const doc = r2(net * pct / 100);
  return { total, lab, pct, net, doc, clinic: r2(net - doc) };
}

const Fin = {
  tab: 'day', date: iso(new Date()), month: iso(new Date()).slice(0, 7),
  recs: [], set: null, editing: null, draft: null, stale: false,

  /* ---------- البيانات ---------- */
  async load() {
    this.recs = await DB.allF();
    this.set = this.recs.find(r => r.id === SETTINGS_ID) || null;
  },
  settings() {
    if (!this.set) this.set = { id: SETTINGS_ID, kind: 'fin', type: 'settings', clinicName: '', doctors: {}, labs: {}, exp: {}, _t: {}, updatedAt: 0 };
    return this.set;
  },
  listOf(map, all) {
    return Object.entries(map || {}).map(([id, x]) => ({ id, ...x }))
      .filter(x => all || !x.del).sort((a, b) => (a.at || 0) - (b.at || 0));
  },
  doctors(all) { return this.listOf(this.settings().doctors, all); },
  labs(all) { return this.listOf(this.settings().labs, all); },
  doctor(id) { return (this.settings().doctors || {})[id]; },
  labName(id) { const l = (this.settings().labs || {})[id]; return l ? l.name : ''; },
  expItems(all) {
    const ov = this.settings().exp || {};
    const def = EXP_DEFAULT.map(([id, name], i) => ({ id, name, at: i, ...(ov[id] || {}) }));
    const custom = Object.entries(ov).filter(([id]) => !EXP_DEFAULT.some(d => d[0] === id)).map(([id, x]) => ({ id, ...x }));
    return def.concat(custom.sort((a, b) => (a.at || 0) - (b.at || 0))).filter(x => all || !x.del);
  },
  lines(prefix) { return this.recs.filter(r => r.type === 'line' && !r.deleted && r.date && r.date.startsWith(prefix)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
  expRec(month) { return this.recs.find(r => r.id === 'exp-' + month); },
  async put(rec, keys) {
    const now = Date.now();
    rec.kind = 'fin'; rec._t = rec._t || {};
    for (const k of keys) rec._t[k] = now;
    rec.updatedAt = now;
    await DB.putF(rec);
    const i = this.recs.findIndex(r => r.id === rec.id);
    if (i >= 0) this.recs[i] = rec; else this.recs.push(rec);
    if (rec.id === SETTINGS_ID) this.set = rec;
    Sync.soon();
    this.flash();
  },
  flash() { const s = $('#finSaved'); if (!s) return; s.classList.add('on'); clearTimeout(this.ft); this.ft = setTimeout(() => s.classList.remove('on'), 1300); },

  /* ---------- الشاشة ---------- */
  async show() { await this.load(); this.render(); },
  async reload(fromSync) {
    if ($('#finPanel').hidden) { await this.load(); return; }
    await this.load();
    const a = document.activeElement;
    if (fromSync && a && $('#finPanel').contains(a) && a.matches('input,select,textarea')) { this.stale = true; return; } // ما نقطعش اللي بيكتب
    this.render();
  },
  render() {
    this.stale = false;
    const p = $('#finPanel');
    const tabs = [['day', 'إدخال اليوم', '✎'], ['exp', 'المصروفات', '⌂'], ['report', 'التقرير الشهري', '▤'], ['set', 'الإعدادات', '⚙']];
    p.innerHTML = `<nav class="fin-tabs">${tabs.map(([k, t, i]) => `<button data-t="${k}" class="${k === this.tab ? 'on' : ''}"><i>${i}</i><span>${t}</span></button>`).join('')}</nav>
      <div class="fin-body" id="finBody"></div><span class="fin-saved" id="finSaved">✓ اتحفظ</span>`;
    p.querySelectorAll('.fin-tabs button').forEach(b => (b.onclick = () => { this.tab = b.dataset.t; this.editing = null; this.draft = null; this.render(); }));
    if (!p.dataset.bound) {
      p.dataset.bound = 1;
      p.addEventListener('focusout', () => setTimeout(() => { if (this.stale && !p.contains(document.activeElement)) this.render(); }, 50));
    }
    const body = $('#finBody');
    ({ day: () => this.renderDay(body), exp: () => this.renderExp(body), report: () => this.renderReport(body), set: () => this.renderSet(body) })[this.tab]();
  },

  /* ================= 1) إدخال اليوم ================= */
  renderDay(body) {
    const docs = this.doctors(), labs = this.labs();
    const d = fromIso(this.date);
    const lines = this.lines(this.date);
    const ed = this.editing && this.recs.find(r => r.id === this.editing);
    body.innerHTML = `
      <section class="fcard date-card">
        <div class="date-nav">
          <button class="nav" data-step="-1" title="اليوم اللي قبله">›</button>
          <input type="date" id="fDate" value="${this.date}">
          <button class="nav" data-step="1" title="اليوم اللي بعده">‹</button>
          <button class="chip" id="fToday" ${this.date === iso(new Date()) ? 'disabled' : ''}>النهارده</button>
        </div>
        <div class="dname">${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</div>
      </section>
      ${!docs.length ? `<section class="fcard note">لسه مفيش دكاترة متسجلين. ضيف الدكاترة ونسبة كل واحد من الإعدادات الأول.<br><button class="primary" id="goSet">افتح الإعدادات</button></section>` : `
      <section class="fcard form ${ed ? 'editing' : ''}" id="lineForm">
        <h3>${ed ? '✎ تعديل سطر' : '+ سطر دخل جديد'}</h3>
        <div class="grid2">
          <label class="fl">الدكتور
            <select id="fDoc"><option value="">— اختار الدكتور —</option>${docs.map(x => `<option value="${x.id}">${esc(x.name)} (${fmt(x.pct)}%)</option>`).join('')}</select></label>
          <label class="fl">إجمالي المبلغ اللي دخل
            <span class="money"><input id="fTotal" inputmode="decimal" dir="ltr" autocomplete="off" placeholder="0"><em>ج.م</em></span></label>
        </div>
        <label class="switch"><input type="checkbox" id="fHasLab"><i></i><span>في فلوس معمل؟</span></label>
        <div class="grid2" id="labBox" hidden>
          <label class="fl">مبلغ المعمل
            <span class="money"><input id="fLab" inputmode="decimal" dir="ltr" autocomplete="off" placeholder="0"><em>ج.م</em></span></label>
          <label class="fl">المعمل
            <select id="fLabId"><option value="">— اختار المعمل —</option>${labs.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
          ${!labs.length ? '<p class="ferr show" style="grid-column:1/-1">مفيش معامل متسجلة — ضيفها من الإعدادات.</p>' : ''}
        </div>
        <div class="calc" id="fCalc"></div>
        <p class="ferr" id="fErr"></p>
        <div class="fbtns">
          <button class="primary" id="fSave">${ed ? 'حفظ التعديل' : 'إضافة السطر'}</button>
          ${ed ? '<button class="ghost2" id="fCancel">إلغاء التعديل</button>' : ''}
        </div>
      </section>`}
      <section class="fcard">
        <h3>دخل اليوم <small>${lines.length ? `${lines.length} سطر` : ''}</small></h3>
        ${lines.length ? this.linesTable(lines) : '<p class="muted">لسه مفيش سطور في اليوم ده.</p>'}
      </section>
      ${this.summaryTiles(lines, 'ملخص اليوم')}`;

    // التاريخ
    const go = v => { if (!v) return; this.date = v; this.editing = null; this.draft = null; this.render(); };
    $('#fDate').onchange = e => go(e.target.value);
    body.querySelectorAll('.date-nav .nav').forEach(b => (b.onclick = () => { const x = fromIso(this.date); x.setDate(x.getDate() + +b.dataset.step); go(iso(x)); }));
    $('#fToday').onclick = () => go(iso(new Date()));
    if (!docs.length) { $('#goSet').onclick = () => { this.tab = 'set'; this.render(); }; }
    else this.bindForm(ed);
    body.querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => { this.editing = b.dataset.edit; this.draft = null; this.render(); $('#lineForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
    body.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => this.delLine(b.dataset.del)));
  },
  bindForm(ed) {
    const f = { doc: $('#fDoc'), total: $('#fTotal'), has: $('#fHasLab'), lab: $('#fLab'), labId: $('#fLabId') };
    const src = this.draft || (ed ? { doc: ed.doctor, total: ed.total, has: !!ed.hasLab, lab: ed.lab, labId: ed.labId } : null);
    if (src) {
      f.doc.value = src.doc || ''; f.total.value = src.total || ''; f.has.checked = !!src.has; f.lab.value = src.lab || ''; f.labId.value = src.labId || '';
      if (src.doc && !f.doc.value && ed) { // دكتور اتمسح من الإعدادات بس السطر القديم بتاعه
        const o = el('option'); o.value = ed.doctor; o.textContent = ed.dn || 'دكتور محذوف'; f.doc.append(o); f.doc.value = ed.doctor;
      }
      if (src.labId && !f.labId.value && ed) { const o = el('option'); o.value = ed.labId; o.textContent = ed.ln || 'معمل محذوف'; f.labId.append(o); f.labId.value = ed.labId; }
    }
    const pctFor = docId => (ed && ed.doctor === docId && ed.pct != null ? num(ed.pct) : num((this.doctor(docId) || {}).pct) ?? 40);
    const read = () => ({ doc: f.doc.value, total: f.total.value, has: f.has.checked, lab: f.lab.value, labId: f.labId.value });
    const upd = () => {
      const v = this.draft = read();
      $('#labBox').hidden = !v.has;
      const box = $('#fCalc');
      const total = num(v.total);
      if (!v.doc || !total) { box.innerHTML = '<span class="muted">اختار الدكتور واكتب المبلغ — الحساب هيظهر هنا على طول.</span>'; return; }
      const c = calcLine({ total: v.total, hasLab: v.has, lab: v.lab, pct: pctFor(v.doc) });
      box.innerHTML = `
        <div><span>الإجمالي</span><b>${egp(c.total)}</b></div>
        ${v.has ? `<div><span>المعمل${v.labId ? ' — ' + esc(this.labName(v.labId)) : ''}</span><b>${egp(c.lab)}</b></div>
        <div><span>صافي بعد المعمل</span><b>${egp(c.net)}</b></div>` : ''}
        <div class="doc"><span>نصيب الدكتور (${fmt(c.pct)}%)</span><b>${egp(c.doc)}</b></div>
        <div class="clinic"><span>نصيب العيادة</span><b>${egp(c.clinic)}</b></div>`;
    };
    Object.values(f).forEach(x => x.addEventListener(x.tagName === 'SELECT' || x.type === 'checkbox' ? 'change' : 'input', () => { $('#fErr').classList.remove('show'); upd(); }));
    upd();
    const err = m => { const e = $('#fErr'); e.textContent = m; e.classList.add('show'); return false; };
    $('#fSave').onclick = async () => {
      const v = read();
      const total = num(v.total), lab = num(v.lab);
      if (!v.doc) return err('اختار الدكتور الأول.');
      if (!total || total <= 0) return err('اكتب إجمالي المبلغ (رقم أكبر من صفر).');
      if (v.has) {
        if (!lab || lab <= 0) return err('اكتب مبلغ المعمل، أو اقفل «في فلوس معمل؟».');
        if (lab > total) return err('مبلغ المعمل أكبر من الإجمالي — راجع الأرقام.');
        if (!v.labId) return err('اختار اسم المعمل.');
      }
      const dc = this.doctor(v.doc);
      const rec = ed ? SyncCore.clone(ed) : { id: 'L' + uid(), type: 'line', date: this.date, createdAt: Date.now() };
      Object.assign(rec, {
        date: rec.date || this.date, doctor: v.doc, dn: dc ? dc.name : (rec.dn || ''), pct: pctFor(v.doc), total: String(total),
        hasLab: !!v.has, lab: v.has ? String(lab) : '', labId: v.has ? v.labId : '', ln: v.has ? this.labName(v.labId) || rec.ln || '' : '',
      });
      await this.put(rec, ['date', 'doctor', 'dn', 'pct', 'total', 'hasLab', 'lab', 'labId', 'ln', 'createdAt']);
      toast(ed ? '✓ السطر اتعدّل' : '✓ السطر اتضاف');
      this.editing = null; this.draft = null; this.render();
      setTimeout(() => { const d = $('#fDoc'); if (d && matchMedia('(pointer:fine)').matches) d.focus(); }, 30);
    };
    const c = $('#fCancel'); if (c) c.onclick = () => { this.editing = null; this.draft = null; this.render(); };
  },
  async delLine(id) {
    const l = this.recs.find(r => r.id === id); if (!l) return;
    const c = calcLine(l);
    if (!confirm(`حذف سطر ${l.dn || 'الدكتور'} بمبلغ ${egp(c.total)} من يوم ${dmy(l.date)}؟`)) return;
    l.deleted = true; await this.put(l, ['deleted']);
    if (this.editing === id) this.editing = null;
    toast('السطر اتحذف'); this.render();
  },
  docName(l) { const d = this.doctor(l.doctor); return d ? d.name : (l.dn || '—'); },
  linesTable(lines, withDate) {
    return `<div class="tbl-wrap"><table class="ftable lines">
      <thead><tr>${withDate ? '<th>التاريخ</th>' : ''}<th>الدكتور</th><th>الإجمالي</th><th>المعمل</th><th>نصيب الدكتور</th><th>نصيب العيادة</th><th></th></tr></thead>
      <tbody>${lines.map(l => {
        const c = calcLine(l);
        return `<tr>${withDate ? `<td data-l="التاريخ">${dmy(l.date)}</td>` : ''}
          <td data-l="الدكتور"><b>${esc(this.docName(l))}</b> <small>${fmt(c.pct)}%</small></td>
          <td data-l="الإجمالي">${egp(c.total)}</td>
          <td data-l="المعمل">${c.lab ? `${egp(c.lab)} <small>${esc(this.labName(l.labId) || l.ln || '')}</small>` : '<span class="muted">—</span>'}</td>
          <td data-l="نصيب الدكتور">${egp(c.doc)}</td>
          <td data-l="نصيب العيادة"><b>${egp(c.clinic)}</b></td>
          <td class="act"><button data-edit="${l.id}" title="تعديل">✎ تعديل</button><button class="del" data-del="${l.id}" title="حذف">🗑</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  },
  sums(lines) {
    const s = { income: 0, lab: 0, doc: 0, clinic: 0 };
    for (const l of lines) { const c = calcLine(l); s.income += c.total; s.lab += c.lab; s.doc += c.doc; s.clinic += c.clinic; }
    for (const k in s) s[k] = r2(s[k]);
    return s;
  },
  summaryTiles(lines, title) {
    const s = this.sums(lines);
    return `<section class="fcard"><h3>${title}</h3><div class="tiles">
      <div><span>إجمالي الدخل</span><b>${egp(s.income)}</b></div>
      <div><span>إجمالي المعامل</span><b>${egp(s.lab)}</b></div>
      <div><span>إجمالي الدكاترة</span><b>${egp(s.doc)}</b></div>
      <div class="hi"><span>إجمالي العيادة</span><b>${egp(s.clinic)}</b></div></div></section>`;
  },

  /* ================= اختيار الشهر ================= */
  monthNav() {
    const [y, m] = this.month.split('-').map(Number);
    const years = new Set([new Date().getFullYear() + 1]);
    for (let i = y - 3; i <= y + 1; i++) years.add(i);
    this.recs.forEach(r => { const d = r.date || r.month; if (d) years.add(+d.slice(0, 4)); });
    return `<div class="month-nav">
      <button class="nav" data-mstep="-1" title="الشهر اللي قبله">›</button>
      <select id="fMonth">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select id="fYear">${[...years].sort().map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="nav" data-mstep="1" title="الشهر اللي بعده">‹</button>
    </div>`;
  },
  bindMonth() {
    const set = (y, m) => { this.month = `${y}-${pad2(m)}`; this.render(); };
    $('#fMonth').onchange = () => set($('#fYear').value, $('#fMonth').value);
    $('#fYear').onchange = () => set($('#fYear').value, $('#fMonth').value);
    document.querySelectorAll('[data-mstep]').forEach(b => (b.onclick = () => { const d = fromIso(this.month + '-01'); d.setMonth(d.getMonth() + +b.dataset.mstep); set(d.getFullYear(), d.getMonth() + 1); }));
  },

  /* ================= 2) المصروفات الشهرية ================= */
  renderExp(body) {
    const rec = this.expRec(this.month) || { v: {} };
    const vals = rec.v || {};
    const items = this.expItems(true).filter(x => !x.del || num(vals[x.id]));
    const total = items.reduce((s, x) => s + (num(vals[x.id]) || 0), 0);
    const prevD = fromIso(this.month + '-01'); prevD.setMonth(prevD.getMonth() - 1);
    const prev = this.expRec(iso(prevD).slice(0, 7));
    const canCopy = prev && Object.values(prev.v || {}).some(v => num(v)) && !Object.values(vals).some(v => num(v));
    body.innerHTML = `
      <section class="fcard">${this.monthNav()}</section>
      <section class="fcard">
        <h3>مصروفات شهر ${monthName(this.month)}</h3>
        <p class="muted">اكتب مبلغ كل بند للشهر ده — بيتحفظ لوحده.</p>
        ${canCopy ? `<button class="ghost2" id="expCopy">⧉ انسخ مبالغ ${monthName(iso(prevD).slice(0, 7))}</button>` : ''}
        <div class="exp-list">${items.map(x => `
          <div class="exp-row ${x.del ? 'gone' : ''}">
            <span class="nm">${esc(x.name)}${x.del ? ' <small>(بند محذوف)</small>' : ''}</span>
            <span class="money"><input data-exp="${x.id}" inputmode="decimal" dir="ltr" autocomplete="off" placeholder="0" value="${esc(vals[x.id] || '')}"><em>ج.م</em></span>
            ${x.del ? '' : `<button class="x" data-xdel="${x.id}" title="حذف البند">✕</button>`}
          </div>`).join('')}</div>
        <div class="exp-add"><input id="expNew" placeholder="اسم بند جديد (مثلاً: أدوات ومستهلكات)"><button class="primary" id="expAdd">+ إضافة بند</button></div>
        <div class="exp-total"><span>إجمالي المصروفات</span><b id="expTotal">${egp(total)}</b></div>
      </section>`;
    this.bindMonth();
    const save = async (id, v) => {
      const r = this.expRec(this.month) || { id: 'exp-' + this.month, type: 'exp', month: this.month, v: {} };
      r.v = r.v || {}; r.v[id] = v;
      await this.put(r, ['month', 'v.' + id]);
      const t = this.expItems(true).reduce((s, x) => s + (num(r.v[x.id]) || 0), 0);
      $('#expTotal').textContent = egp(t);
    };
    body.querySelectorAll('[data-exp]').forEach(inp => {
      let t;
      inp.addEventListener('input', () => {
        const v = inp.value.trim();
        inp.classList.toggle('bad', !!v && num(v) == null);
        clearTimeout(t); t = setTimeout(() => { if (!v || num(v) != null) save(inp.dataset.exp, v ? String(num(v)) : ''); }, 400);
      });
    });
    body.querySelectorAll('[data-xdel]').forEach(b => (b.onclick = async () => {
      const x = this.expItems().find(i => i.id === b.dataset.xdel);
      if (!confirm(`حذف بند «${x.name}» من قايمة المصروفات؟ (المبالغ اللي اتسجلت في الشهور اللي فاتت هتفضل في تقاريرها)`)) return;
      await this.setItem('exp', x.id, { ...x, del: true });
      this.render();
    }));
    const add = async () => {
      const name = $('#expNew').value.trim();
      if (!name) { $('#expNew').focus(); return; }
      if (this.expItems().some(x => x.name === name)) { toast('البند ده موجود بالفعل'); return; }
      await this.setItem('exp', 'x' + uid(), { name, at: Date.now() });
      toast('✓ البند اتضاف'); this.render();
    };
    $('#expAdd').onclick = add;
    $('#expNew').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    const cp = $('#expCopy');
    if (cp) cp.onclick = async () => {
      const r = this.expRec(this.month) || { id: 'exp-' + this.month, type: 'exp', month: this.month, v: {} };
      r.v = { ...(r.v || {}) };
      const keys = ['month'];
      for (const [k, v] of Object.entries(prev.v || {})) if (num(v)) { r.v[k] = v; keys.push('v.' + k); }
      await this.put(r, keys); toast('✓ اتنسخت مبالغ الشهر اللي فات — عدّل اللي اتغير'); this.render();
    };
  },
  async setItem(group, id, val) {
    const s = this.settings();
    s[group] = s[group] || {};
    const clean = { ...val }; delete clean.id;
    s[group][id] = clean;
    await this.put(s, [`${group}.${id}`]);
  },

  /* ================= 3) التقرير الشهري ================= */
  monthData(month) {
    const lines = this.lines(month);
    const sums = this.sums(lines);
    const labs = {}, docs = {}, days = {};
    for (const l of lines) {
      const c = calcLine(l);
      if (c.lab) {
        const k = l.labId || '?';
        const x = labs[k] = labs[k] || { name: this.labName(l.labId) || l.ln || 'بدون اسم', count: 0, sum: 0 };
        x.count++; x.sum = r2(x.sum + c.lab);
      }
      const d = docs[l.doctor] = docs[l.doctor] || { name: this.docName(l), pcts: new Set(), count: 0, income: 0, lab: 0, due: 0 };
      d.pcts.add(c.pct); d.count++; d.income = r2(d.income + c.total); d.lab = r2(d.lab + c.lab); d.due = r2(d.due + c.doc);
      const y = days[l.date] = days[l.date] || { count: 0, income: 0, lab: 0, doc: 0, clinic: 0 };
      y.count++; y.income = r2(y.income + c.total); y.lab = r2(y.lab + c.lab); y.doc = r2(y.doc + c.doc); y.clinic = r2(y.clinic + c.clinic);
    }
    const ev = (this.expRec(month) || {}).v || {};
    const exps = this.expItems(true).filter(x => !x.del || num(ev[x.id])).map(x => ({ name: x.name, v: num(ev[x.id]) || 0 }));
    const expTotal = r2(exps.reduce((s, x) => s + x.v, 0));
    return {
      month, lines, ...sums, labs: Object.values(labs).sort((a, b) => b.sum - a.sum),
      docs: Object.values(docs).sort((a, b) => b.due - a.due).map(d => ({ ...d, pct: [...d.pcts].map(fmt).join(' / ') + '%' })),
      exps, expTotal, profit: r2(sums.clinic - expTotal),
      days: Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v })),
    };
  },
  clinicName() { return (this.settings().clinicName || '').trim() || 'Bloom Dental Clinic'; },
  reportHTML(D) {
    const T = (head, rows, foot) => `<table class="ftable rep-t"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted c">مفيش بيانات</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot.map(f => `<td>${f}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    const day = d => { const x = fromIso(d); return DAYS[x.getDay()]; };
    return `
      <div class="kpis">
        <div><span>1. إجمالي الدخل</span><b>${egp(D.income)}</b></div>
        <div><span>2. إجمالي المعامل</span><b>${egp(D.lab)}</b></div>
        <div><span>4. إجمالي نصيب الدكاترة</span><b>${egp(D.doc)}</b></div>
        <div><span>5. إجمالي نصيب العيادة</span><b>${egp(D.clinic)}</b></div>
        <div><span>6. إجمالي المصروفات</span><b>${egp(D.expTotal)}</b></div>
        <div class="profit ${D.profit < 0 ? 'neg' : ''}"><span>7. صافي ربح العيادة</span><b>${egp(D.profit)}</b></div>
      </div>
      <h4>2. فلوس المعامل</h4>
      ${T(['المعمل', 'عدد الحالات', 'المبلغ'], D.labs.map(x => `<tr><td>${esc(x.name)}</td><td class="c">${x.count}</td><td>${egp(x.sum)}</td></tr>`),
        ['الإجمالي', D.labs.reduce((s, x) => s + x.count, 0), egp(D.lab)])}
      <h4>3. حساب الدكاترة</h4>
      ${T(['الدكتور', 'النسبة', 'عدد الحالات', 'إجمالي اللي دخّله', 'نصيبه المستحق'], D.docs.map(x => `<tr><td>${esc(x.name)}</td><td class="c">${x.pct}</td><td class="c">${x.count}</td><td>${egp(x.income)}</td><td><b>${egp(x.due)}</b></td></tr>`),
        ['الإجمالي', '', D.lines.length, egp(D.income), egp(D.doc)])}
      <h4>6. المصروفات</h4>
      ${T(['البند', 'المبلغ'], D.exps.map(x => `<tr><td>${esc(x.name)}</td><td>${x.v ? egp(x.v) : '<span class="muted">—</span>'}</td></tr>`), ['إجمالي المصروفات', egp(D.expTotal)])}
      <div class="net-box ${D.profit < 0 ? 'neg' : ''}">
        <div><span>نصيب العيادة</span><b>${egp(D.clinic)}</b></div><i>−</i>
        <div><span>المصروفات</span><b>${egp(D.expTotal)}</b></div><i>=</i>
        <div class="r"><span>7. صافي ربح العيادة</span><b>${egp(D.profit)}</b></div>
      </div>
      <h4>8. الدخل اليومي</h4>
      ${T(['التاريخ', 'اليوم', 'الحالات', 'الدخل', 'المعامل', 'الدكاترة', 'العيادة'],
        D.days.map(x => `<tr><td class="c">${dmy(x.date)}</td><td>${day(x.date)}</td><td class="c">${x.count}</td><td>${egp(x.income)}</td><td>${egp(x.lab)}</td><td>${egp(x.doc)}</td><td><b>${egp(x.clinic)}</b></td></tr>`),
        ['الإجمالي', '', D.lines.length, egp(D.income), egp(D.lab), egp(D.doc), egp(D.clinic)])}`;
  },
  renderReport(body) {
    const D = this.monthData(this.month);
    body.innerHTML = `
      <section class="fcard">${this.monthNav()}
        <div class="rep-btns"><button class="primary" id="repPrint">⎙ طباعة / PDF</button><button class="ghost2" id="repXls">⤓ تصدير Excel</button></div>
      </section>
      <section class="fcard report">
        <div class="rep-head"><div><b>${esc(this.clinicName())}</b><span>التقرير الشهري — ${monthName(this.month)}</span></div><small>${D.lines.length} حالة · ${D.days.length} يوم شغل</small></div>
        ${this.reportHTML(D)}
      </section>`;
    this.bindMonth();
    $('#repPrint').onclick = () => this.printReport(D);
    $('#repXls').onclick = () => this.exportXlsx(D);
  },
  printReport(D) {
    const pr = $('#print'); pr.innerHTML = '';
    const now = new Date();
    const doc = el('div', 'rep-print');
    doc.innerHTML = `<table class="rep-frame"><thead><tr><td><div class="rp-space"></div></td></tr></thead><tbody><tr><td>
      <div class="rp-head">
        <div class="rp-logo"></div>
        <div class="rp-title"><b>${esc(this.clinicName())}</b><span>فاتورة / تقرير الحسابات الشهري</span></div>
        <div class="rp-meta"><div>الشهر: <b>${monthName(D.month)}</b></div><div>تاريخ الإصدار: ${today()}</div><div>${D.lines.length} حالة · ${D.days.length} يوم شغل</div></div>
      </div>
      ${this.reportHTML(D)}
      <div class="rp-foot">${esc(this.clinicName())} — ${monthName(D.month)} · كل المبالغ بالجنيه المصري</div>
    </td></tr></tbody><tfoot><tr><td><div class="rp-space"></div></td></tr></tfoot></table>`;
    pr.append(doc);
    document.body.classList.add('printing-rep');
    const done = () => { document.body.classList.remove('printing-rep'); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 80);
    setTimeout(done, 60000);
  },

  /* ---- Excel (.xlsx حقيقي — بيتعمل على الجهاز من غير نت) ---- */
  exportXlsx(D) {
    const H = s => ({ v: s, s: 1 }), M = v => ({ v: r2(v || 0), s: 2 }), MT = v => ({ v: r2(v || 0), s: 3 }), B = s => ({ v: s, s: 4 });
    const summary = [
      [B(this.clinicName())], [B('التقرير الشهري — ' + monthName(D.month))], [],
      [H('البند'), H('المبلغ (ج.م)')],
      ['إجمالي الدخل', M(D.income)], ['إجمالي المعامل', M(D.lab)], ['إجمالي نصيب الدكاترة', M(D.doc)],
      ['إجمالي نصيب العيادة', M(D.clinic)], ['إجمالي المصروفات', M(D.expTotal)], [B('صافي ربح العيادة'), MT(D.profit)],
      [], ['عدد الحالات', D.lines.length], ['أيام الشغل', D.days.length],
    ];
    const lines = [[H('التاريخ'), H('اليوم'), H('الدكتور'), H('النسبة %'), H('الإجمالي'), H('المعمل'), H('مبلغ المعمل'), H('صافي بعد المعمل'), H('نصيب الدكتور'), H('نصيب العيادة')]];
    D.lines.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(l => {
      const c = calcLine(l);
      lines.push([dmy(l.date), DAYS[fromIso(l.date).getDay()], this.docName(l), c.pct, M(c.total), c.lab ? this.labName(l.labId) || l.ln || '' : '', M(c.lab), M(c.net), M(c.doc), M(c.clinic)]);
    });
    lines.push([B('الإجمالي'), '', '', '', MT(D.income), '', MT(D.lab), MT(D.income - D.lab), MT(D.doc), MT(D.clinic)]);
    const docs = [[H('الدكتور'), H('النسبة'), H('عدد الحالات'), H('إجمالي اللي دخّله'), H('نصيبه المستحق')], ...D.docs.map(x => [x.name, x.pct, x.count, M(x.income), M(x.due)]),
      [B('الإجمالي'), '', D.lines.length, MT(D.income), MT(D.doc)]];
    const labs = [[H('المعمل'), H('عدد الحالات'), H('المبلغ')], ...D.labs.map(x => [x.name, x.count, M(x.sum)]), [B('الإجمالي'), D.labs.reduce((s, x) => s + x.count, 0), MT(D.lab)]];
    const exps = [[H('البند'), H('المبلغ')], ...D.exps.map(x => [x.name, M(x.v)]), [B('إجمالي المصروفات'), MT(D.expTotal)], [], [B('نصيب العيادة'), M(D.clinic)], [B('صافي ربح العيادة'), MT(D.profit)]];
    const days = [[H('التاريخ'), H('اليوم'), H('الحالات'), H('الدخل'), H('المعامل'), H('الدكاترة'), H('العيادة')],
      ...D.days.map(x => [dmy(x.date), DAYS[fromIso(x.date).getDay()], x.count, M(x.income), M(x.lab), M(x.doc), M(x.clinic)]),
      [B('الإجمالي'), '', D.lines.length, MT(D.income), MT(D.lab), MT(D.doc), MT(D.clinic)]];
    const blob = xlsx([
      { name: 'الملخص', rows: summary, widths: [30, 18] },
      { name: 'سطور الدخل', rows: lines, widths: [12, 10, 22, 9, 14, 18, 13, 15, 14, 14] },
      { name: 'الدكاترة', rows: docs, widths: [24, 10, 12, 18, 18] },
      { name: 'المعامل', rows: labs, widths: [24, 12, 16] },
      { name: 'المصروفات', rows: exps, widths: [28, 16] },
      { name: 'الدخل اليومي', rows: days, widths: [12, 10, 9, 14, 14, 14, 14] },
    ]);
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `Bloom-Clinic-${D.month}.xlsx`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('✓ اتعمل ملف الإكسيل');
  },

  /* ================= 4) الإعدادات ================= */
  renderSet(body) {
    const s = this.settings();
    const docs = this.doctors(), labs = this.labs(), exps = this.expItems();
    body.innerHTML = `
      <section class="fcard">
        <h3>اسم العيادة <small>بيظهر في التقرير والفاتورة</small></h3>
        <input class="tin" id="sClinic" placeholder="Bloom Dental Clinic" value="${esc(s.clinicName || '')}">
      </section>
      <section class="fcard">
        <h3>الدكاترة <small>النسبة = نصيب الدكتور من الصافي بعد المعمل</small></h3>
        <div class="set-list">${docs.map(x => `
          <div class="set-row" data-id="${x.id}">
            <input class="tin nm" data-f="name" value="${esc(x.name)}">
            <span class="pct"><input class="tin" data-f="pct" inputmode="decimal" dir="ltr" value="${esc(x.pct)}"><em>%</em></span>
            <button class="x" data-rm="doctors" title="حذف">✕</button>
          </div>`).join('') || '<p class="muted">لسه مفيش دكاترة.</p>'}</div>
        <div class="set-add"><input class="tin nm" id="dName" placeholder="اسم الدكتور"><span class="pct"><input class="tin" id="dPct" inputmode="decimal" dir="ltr" value="40"><em>%</em></span><button class="primary" id="dAdd">+ إضافة دكتور</button></div>
        <p class="hint2">تغيير النسبة بيطبق على السطور الجديدة بس — السطور القديمة بتفضل بالنسبة اللي اتحسبت بيها.</p>
      </section>
      <section class="fcard">
        <h3>المعامل</h3>
        <div class="set-list">${labs.map(x => `
          <div class="set-row" data-id="${x.id}"><input class="tin nm" data-f="name" value="${esc(x.name)}"><button class="x" data-rm="labs" title="حذف">✕</button></div>`).join('') || '<p class="muted">لسه مفيش معامل.</p>'}</div>
        <div class="set-add"><input class="tin nm" id="lName" placeholder="اسم المعمل"><button class="primary" id="lAdd">+ إضافة معمل</button></div>
      </section>
      <section class="fcard">
        <h3>بنود المصروفات</h3>
        <div class="set-list">${exps.map(x => `
          <div class="set-row" data-id="${x.id}"><input class="tin nm" data-f="name" value="${esc(x.name)}"><button class="x" data-rm="exp" title="حذف">✕</button></div>`).join('')}</div>
        <div class="set-add"><input class="tin nm" id="eName" placeholder="اسم بند جديد"><button class="primary" id="eAdd">+ إضافة بند</button></div>
      </section>`;
    $('#sClinic').onchange = async e => { s.clinicName = e.target.value.trim(); await this.put(s, ['clinicName']); };
    // تعديل اسم / نسبة
    body.querySelectorAll('.set-list .set-row').forEach(row => {
      const group = row.querySelector('[data-rm]').dataset.rm, id = row.dataset.id;
      row.querySelectorAll('[data-f]').forEach(inp => (inp.onchange = async () => {
        const cur = group === 'exp' ? this.expItems(true).find(x => x.id === id) : { ...(s[group] || {})[id] };
        let v = inp.value.trim();
        if (inp.dataset.f === 'name' && !v) { inp.value = cur.name; return toast('الاسم ما ينفعش يبقى فاضي'); }
        if (inp.dataset.f === 'pct') {
          const n = num(v);
          if (n == null || n < 0 || n > 100) { inp.value = cur.pct; return toast('النسبة لازم تبقى رقم من 0 لـ 100'); }
          v = n;
        }
        await this.setItem(group, id, { ...cur, [inp.dataset.f]: v });
        toast('✓ اتحفظ');
      }));
    });
    body.querySelectorAll('[data-rm]').forEach(b => (b.onclick = async () => {
      const group = b.dataset.rm, id = b.closest('.set-row').dataset.id;
      const cur = group === 'exp' ? this.expItems(true).find(x => x.id === id) : { ...(s[group] || {})[id] };
      const what = { doctors: 'الدكتور', labs: 'المعمل', exp: 'البند' }[group];
      const note = group === 'exp' ? 'المبالغ اللي اتسجلت قبل كده هتفضل في تقارير شهورها.' : 'السطور القديمة اللي باسمه هتفضل موجودة في التقارير.';
      if (!confirm(`حذف ${what} «${cur.name}»؟\n${note}`)) return;
      await this.setItem(group, id, { ...cur, del: true });
      toast('اتحذف'); this.render();
    }));
    const addTo = async (group, nameEl, extra = {}) => {
      const name = $(nameEl).value.trim();
      if (!name) { $(nameEl).focus(); return toast('اكتب الاسم الأول'); }
      const list = group === 'exp' ? this.expItems() : this.listOf(s[group]);
      if (list.some(x => x.name === name)) return toast('الاسم ده موجود بالفعل');
      await this.setItem(group, (group === 'exp' ? 'x' : group[0]) + uid(), { name, at: Date.now(), ...extra });
      toast('✓ اتضاف'); this.render();
    };
    $('#dAdd').onclick = () => {
      const n = num($('#dPct').value);
      if (n == null || n < 0 || n > 100) return toast('النسبة لازم تبقى رقم من 0 لـ 100');
      addTo('doctors', '#dName', { pct: n });
    };
    $('#lAdd').onclick = () => addTo('labs', '#lName');
    $('#eAdd').onclick = () => addTo('exp', '#eName');
    [['#dName', '#dAdd'], ['#lName', '#lAdd'], ['#eName', '#eAdd']].forEach(([i, b]) => $(i).addEventListener('keydown', e => { if (e.key === 'Enter') $(b).click(); }));
  },
};

/* ====================== كاتب ملفات Excel (.xlsx) صغير ====================== */
function xlsx(sheets) {
  const enc = new TextEncoder();
  const X = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheetXml = sh => {
    const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}">${(r || []).map((c, ci) => {
      if (c === '' || c == null) return '';
      const o = typeof c === 'object' ? c : { v: c };
      const ref = col(ci) + (ri + 1), st = o.s ? ` s="${o.s}"` : '';
      return typeof o.v === 'number' && isFinite(o.v) ? `<c r="${ref}"${st}><v>${o.v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t>${X(o.v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE5EA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ].map(([n, t]) => [n, enc.encode(t)]);
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
// ZIP من غير ضغط (stored) — كفاية لملف إكسيل
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const [name, data] of files) {
    const nm = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 33, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 33, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
window.Fin = Fin;
