'use strict';
/* Bloom Clinic — حسابات العيادة (برا ملفات المرضى)
   كل سطر دخل = سجل لوحده (ومربوط بملف المريض)، وكل دفعة لاحقة = سجل، ومصروفات كل شهر = سجل،
   والإعدادات (دكاترة/معامل/بنود/رسائل) = سجل واحد. كلهم على الجهاز (IndexedDB) وبيتزامنوا زي ملفات المرضى. */

const EXP_DEFAULT = [['rent', 'الإيجار'], ['elec', 'الكهرباء'], ['net', 'الإنترنت'], ['assist', 'مرتبات الأسيستنت'], ['clean', 'النظافة'], ['maint', 'الإصلاحات والصيانة']];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const VISIT = { exam: 'كشف فقط', treat: 'علاج', follow: 'متابعة' };
const SETTINGS_ID = 'fin-settings';
const TPL_DEFAULT = {
  appt: 'أهلاً {الاسم} 👋\nبنفكّرك بميعادك في {العيادة} يوم {الموعد}.\nلو محتاج تغيّر الميعاد ابعتلنا هنا.',
  exam: 'أهلاً {الاسم} 👋\nنتمنى تكون بخير. كشفت عندنا في {العيادة} ولسه ما بدأناش العلاج — تحب نحجزلك ميعاد؟',
  away: 'أهلاً {الاسم} 👋\nوحشتنا في {العيادة}! بقالك فترة ما جيتش — تحب نحجزلك ميعاد كشف ومتابعة؟',
  debt: 'أهلاً {الاسم} 👋\nبنفكّرك إن متبقي على حسابك في {العيادة} مبلغ {المبلغ}.\nشكراً لتعاملك معانا.',
  general: 'أهلاً {الاسم} 👋\n',
};
const TPL_NAME = { appt: 'تذكير بالموعد', exam: 'كشف فقط ومعملش حاجة', away: 'مجاش من فترة', debt: 'عليه حساب', general: 'رسالة عامة' };
const FOLLOW = [
  { k: 'appt', t: 'عنده موعد قريب', i: '📅' },
  { k: 'exam', t: 'كشف فقط ومعملش حاجة', i: '🩺' },
  { k: 'away', t: 'مجاش من فترة طويلة', i: '⏳' },
  { k: 'debt', t: 'عليه حساب', i: '💰' },
];
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoToday = () => iso(new Date());
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
const dmy = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const dmyToIso = s => { const m = toEn(s || '').match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/); return m ? `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}` : ''; };
const dayLabel = s => { const d = fromIso(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const monthName = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const r2 = v => Math.round(v * 100) / 100;
const egp = v => `⁦${fmt(r2(v || 0))}⁩ ج.م`; // الرقم LTR جوه الكلام العربي (عشان السالب يظهر -3,340 مش 3,340-)
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const daysAgo = s => Math.round((fromIso(isoToday()) - fromIso(s)) / 864e5);

// حساب السطر: صافي بعد المعمل ← نصيب الدكتور بالنسبة ← الباقي للعيادة (كله على الإجمالي المتفق عليه)
// والمدفوع: لو ما اتكتبش = الإجمالي كله اتدفع، والفرق = مديونية على المريض
function calcLine(l) {
  const total = num(l.total) || 0;
  const lab = l.hasLab ? (num(l.lab) || 0) : 0;
  const pct = num(l.pct) ?? 40;
  const net = r2(total - lab);
  const doc = r2(net * pct / 100);
  const paid = l.paid == null || l.paid === '' ? total : (num(l.paid) || 0);
  return { total, lab, pct, net, doc, clinic: r2(net - doc), paid, debt: r2(total - paid) };
}

/* ---- واتساب: رقم مصري بصيغة دولية (20 بدل 0) ---- */
function waNum(m) {
  let d = toEn(m || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '20' + d.slice(1);
  else if (d.length === 10 && d.startsWith('1')) d = '20' + d;
  return d.length >= 11 ? d : '';
}
const waLink = (m, text) => `https://wa.me/${waNum(m)}?text=${encodeURIComponent(text)}`;

const Fin = {
  tab: 'day', date: isoToday(), month: isoToday().slice(0, 7),
  recs: [], set: null, patients: [], editing: null, draft: null, stale: false, _ix: null,
  acc: null, pq: '', psort: 'last', pall: false, fu: 'appt', fuRange: 'week', fuQ: '', fuSort: '', sel: new Set(),

  /* ---------- البيانات ---------- */
  async load() {
    this.recs = await DB.allF();
    this.set = this.recs.find(r => r.id === SETTINGS_ID) || null;
    this.patients = (await DB.all()).filter(p => !p.deleted);
    this._ix = null;
  },
  settings() {
    if (!this.set) this.set = { id: SETTINGS_ID, kind: 'fin', type: 'settings', clinicName: '', doctors: {}, labs: {}, exp: {}, tpl: {}, _t: {}, updatedAt: 0 };
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
  followDays() { return num(this.settings().followDays) || 90; },
  tpl(k) { return ((this.settings().tpl || {})[k]) || TPL_DEFAULT[k]; },
  expItems(all) {
    const ov = this.settings().exp || {};
    const def = EXP_DEFAULT.map(([id, name], i) => ({ id, name, at: i, ...(ov[id] || {}) }));
    const custom = Object.entries(ov).filter(([id]) => !EXP_DEFAULT.some(d => d[0] === id)).map(([id, x]) => ({ id, ...x }));
    return def.concat(custom.sort((a, b) => (a.at || 0) - (b.at || 0))).filter(x => all || !x.del);
  },
  lines(prefix) { return this.recs.filter(r => r.type === 'line' && !r.deleted && r.date && r.date.startsWith(prefix)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
  pays(prefix) { return this.recs.filter(r => r.type === 'pay' && !r.deleted && r.date && r.date.startsWith(prefix)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
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
    this._ix = null;
    Sync.soon();
    this.flash();
  },
  flash() { const s = $('#finSaved'); if (!s) return; s.classList.add('on'); clearTimeout(this.ft); this.ft = setTimeout(() => s.classList.remove('on'), 1300); },

  /* ---------- المرضى (نفس ملفات المرضى) ---------- */
  pat(id) { return this.patients.find(p => p.id === id); },
  patName(id, fallback) { const p = this.pat(id); return p ? (p.name || 'بدون اسم') : (fallback || ''); },
  index() {
    if (this._ix) return this._ix;
    const lines = {}, pays = {};
    for (const r of this.recs) {
      if (r.deleted || !r.patientId) continue;
      if (r.type === 'line') (lines[r.patientId] = lines[r.patientId] || []).push(r);
      if (r.type === 'pay') (pays[r.patientId] = pays[r.patientId] || []).push(r);
    }
    for (const k in lines) lines[k].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    for (const k in pays) pays[k].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    return (this._ix = { lines, pays, info: {} });
  },
  info(p) {
    const ix = this.index();
    if (ix.info[p.id]) return ix.info[p.id];
    const ls = ix.lines[p.id] || [], ps = ix.pays[p.id] || [];
    const fv = dmyToIso(p.firstVisit);
    let last = ls.length ? ls.at(-1).date : '';
    if (fv && (!last || fv > last)) last = fv;
    const latest = ls.at(-1);
    const next = latest && latest.nextVisit && latest.nextVisit >= isoToday() ? latest.nextVisit : '';
    const owed = ls.reduce((s, l) => s + calcLine(l).debt, 0);
    const paidLater = ps.reduce((s, x) => s + (num(x.amount) || 0), 0);
    return (ix.info[p.id] = { lines: ls, pays: ps, last, next, bal: r2(owed - paidLater), examOnly: ls.length > 0 && ls.every(l => l.visit === 'exam'), visits: ls.length });
  },
  async savePatient(p, keys) {
    const now = Date.now(); p._t = p._t || {};
    for (const k of keys) p._t[k] = now;
    p.updatedAt = now;
    await DB.put(p);
    const i = this.patients.findIndex(x => x.id === p.id); if (i >= 0) this.patients[i] = p; else this.patients.push(p);
    this._ix = null; Sync.soon();
  },
  async quickPatient(name, mobile) {
    const all = await DB.all();
    const p = newPatient(all);
    p.name = name; p.mobile = mobile; p.firstVisit = today();
    await this.savePatient(p, ['name', 'mobile', 'fileNo', 'firstVisit']);
    toast(`✓ اتعمل ملف جديد رقم ${p.fileNo} لـ ${name}`);
    return p;
  },
  openPatient(id) { this.tab = 'pat'; this.acc = id; this.render(); window.scrollTo(0, 0); $('#home').scrollTop = 0; },

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
    const tabs = [['day', 'إدخال اليوم', '✎'], ['pat', 'المرضى', '☺'], ['follow', 'محتاجين متابعة', '🔔'], ['exp', 'المصروفات', '⌂'], ['report', 'التقرير الشهري', '▤'], ['set', 'الإعدادات', '⚙']];
    p.innerHTML = `<nav class="fin-tabs">${tabs.map(([k, t, i]) => `<button data-t="${k}" class="${k === this.tab ? 'on' : ''}"><i>${i}</i><span>${t}</span></button>`).join('')}</nav>
      <div class="fin-body" id="finBody"></div><span class="fin-saved" id="finSaved">✓ اتحفظ</span>`;
    p.querySelectorAll('.fin-tabs button').forEach(b => (b.onclick = () => { this.tab = b.dataset.t; this.editing = null; this.draft = null; this.acc = null; this.render(); }));
    if (!p.dataset.bound) {
      p.dataset.bound = 1;
      p.addEventListener('focusout', () => setTimeout(() => { if (this.stale && !p.contains(document.activeElement)) this.render(); }, 50));
    }
    const body = $('#finBody');
    ({ day: () => this.renderDay(body), pat: () => (this.acc ? this.renderAccount(body) : this.renderPatients(body)), follow: () => this.renderFollow(body),
      exp: () => this.renderExp(body), report: () => this.renderReport(body), set: () => this.renderSet(body) })[this.tab]();
    body.querySelectorAll('[data-wa]').forEach(b => (b.onclick = e => { e.stopPropagation(); this.waSheet(b.dataset.wa, b.dataset.tpl || 'general'); }));
    body.querySelectorAll('[data-acc]').forEach(b => (b.onclick = () => this.openPatient(b.dataset.acc)));
  },

  /* ================= 1) إدخال اليوم ================= */
  renderDay(body) {
    const docs = this.doctors(), labs = this.labs();
    const d = fromIso(this.date);
    const lines = this.lines(this.date), pays = this.pays(this.date);
    const ed = this.editing && this.recs.find(r => r.id === this.editing);
    body.innerHTML = `
      <section class="fcard date-card">
        <div class="date-nav">
          <button class="nav" data-step="-1" title="اليوم اللي قبله">›</button>
          <input type="date" id="fDate" value="${this.date}">
          <button class="nav" data-step="1" title="اليوم اللي بعده">‹</button>
          <button class="chip" id="fToday" ${this.date === isoToday() ? 'disabled' : ''}>النهارده</button>
        </div>
        <div class="dname">${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</div>
      </section>
      ${!docs.length ? `<section class="fcard note">لسه مفيش دكاترة متسجلين. ضيف الدكاترة ونسبة كل واحد من الإعدادات الأول.<br><button class="primary" id="goSet">افتح الإعدادات</button></section>` : `
      <section class="fcard form ${ed ? 'editing' : ''}" id="lineForm">
        <h3>${ed ? '✎ تعديل سطر' : '+ سطر دخل جديد'}</h3>
        <div class="fl">المريض <div id="fPat"></div></div>
        <div class="fl">نوع الزيارة
          <div class="seg2" id="fVisit">${Object.entries(VISIT).map(([k, t]) => `<button type="button" data-v="${k}">${t}</button>`).join('')}</div></div>
        <div class="grid2">
          <label class="fl">الدكتور
            <select id="fDoc"><option value="">— اختار الدكتور —</option>${docs.map(x => `<option value="${x.id}">${esc(x.name)} (${fmt(x.pct)}%)</option>`).join('')}</select></label>
          <label class="fl">إجمالي المبلغ المتفق عليه
            <span class="money"><input id="fTotal" inputmode="decimal" dir="ltr" autocomplete="off" placeholder="0"><em>ج.م</em></span></label>
        </div>
        <div class="grid2">
          <label class="fl">المدفوع فعلاً <small class="muted">(لو اتدفع كله سيبها فاضية)</small>
            <span class="money"><input id="fPaid" inputmode="decimal" dir="ltr" autocomplete="off" placeholder="= الإجمالي"><em>ج.م</em></span></label>
          <label class="fl">موعد الزيارة الجاية <small class="muted">(اختياري)</small>
            <span class="next-row"><input type="date" id="fNext"><button type="button" class="chip" data-nx="7">أسبوع</button><button type="button" class="chip" data-nx="14">أسبوعين</button><button type="button" class="chip" data-nx="30">شهر</button></span></label>
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
      ${pays.length ? `<section class="fcard"><h3>دفعات على حسابات قديمة اتدفعت اليوم ده</h3>${this.paysTable(pays, true)}</section>` : ''}
      ${this.summaryTiles(lines, pays, 'ملخص اليوم')}`;

    const go = v => { if (!v) return; this.date = v; this.editing = null; this.draft = null; this.render(); };
    $('#fDate').onchange = e => go(e.target.value);
    body.querySelectorAll('.date-nav .nav').forEach(b => (b.onclick = () => go(addDays(this.date, +b.dataset.step))));
    $('#fToday').onclick = () => go(isoToday());
    if (!docs.length) { $('#goSet').onclick = () => { this.tab = 'set'; this.render(); }; }
    else this.bindForm(ed);
    body.querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => { this.editing = b.dataset.edit; this.draft = null; this.render(); $('#lineForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
    body.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => this.delLine(b.dataset.del)));
    body.querySelectorAll('[data-pdel]').forEach(b => (b.onclick = () => this.delPay(b.dataset.pdel)));
  },

  // اختيار المريض: بحث سريع في ملفات المرضى + «مريض جديد»
  picker(holder, cur, onPick) {
    holder.innerHTML = `<div class="pp">
      <div class="pp-sel" hidden><div><b></b><small></small></div><button type="button" class="ghost2 sm" data-pp="clear">تغيير</button></div>
      <div class="pp-find"><input type="search" placeholder="ابحث باسم المريض أو الموبايل أو رقم الملف" autocomplete="off"><button type="button" class="ghost2" data-pp="new">+ مريض جديد</button></div>
      <div class="pp-res"></div>
      <div class="pp-new" hidden>
        <input class="tin" data-pp="name" placeholder="اسم المريض">
        <input class="tin" data-pp="mobile" placeholder="رقم الموبايل (واتساب)" inputmode="tel" dir="ltr">
        <div class="fbtns"><button type="button" class="primary" data-pp="save">حفظ المريض</button><button type="button" class="ghost2" data-pp="cancel">إلغاء</button></div>
      </div></div>`;
    const q = holder.querySelector('.pp-find input'), res = holder.querySelector('.pp-res');
    const show = id => {
      const p = id && this.pat(id);
      holder.querySelector('.pp-sel').hidden = !p;
      holder.querySelector('.pp-find').hidden = !!p;
      res.innerHTML = ''; holder.querySelector('.pp-new').hidden = true;
      if (p) {
        holder.querySelector('.pp-sel b').textContent = p.name || 'بدون اسم';
        const inf = this.info(p);
        holder.querySelector('.pp-sel small').textContent = `ملف ${p.fileNo || '—'}${p.mobile ? ' · ' + p.mobile : ''}${inf.bal > 0 ? ` · عليه ${fmt(inf.bal)} ج.م` : ''}`;
      }
    };
    const search = () => {
      const s = toEn(q.value.trim()).toLowerCase();
      if (!s) { res.innerHTML = ''; return; }
      const hits = this.patients.filter(p => [p.name, toEn(p.mobile), toEn(p.fileNo)].some(v => String(v || '').toLowerCase().includes(s))).slice(0, 8);
      res.innerHTML = hits.map(p => `<button type="button" data-id="${p.id}"><b>${esc(p.name || 'بدون اسم')}</b><small>ملف ${esc(p.fileNo || '—')}${p.mobile ? ' · ' + esc(p.mobile) : ''}</small></button>`).join('')
        || `<p class="muted">مفيش مريض بالاسم ده — دوس «+ مريض جديد».</p>`;
      res.querySelectorAll('[data-id]').forEach(b => (b.onclick = () => { show(b.dataset.id); onPick(b.dataset.id); }));
    };
    q.addEventListener('input', search);
    holder.querySelector('[data-pp="clear"]').onclick = () => { onPick(''); show(''); q.value = ''; q.focus(); };
    holder.querySelector('[data-pp="new"]').onclick = () => {
      holder.querySelector('.pp-new').hidden = false; res.innerHTML = '';
      const n = holder.querySelector('[data-pp="name"]'); n.value = q.value.trim() && !/^\d+$/.test(toEn(q.value.trim())) ? q.value.trim() : '';
      holder.querySelector('[data-pp="mobile"]').value = /^\d+$/.test(toEn(q.value.trim())) ? q.value.trim() : '';
      n.focus();
    };
    holder.querySelector('[data-pp="cancel"]').onclick = () => { holder.querySelector('.pp-new').hidden = true; };
    holder.querySelector('[data-pp="save"]').onclick = async () => {
      const name = holder.querySelector('[data-pp="name"]').value.trim(), mobile = holder.querySelector('[data-pp="mobile"]').value.trim();
      if (!name) return toast('اكتب اسم المريض');
      if (mobile && !waNum(mobile)) return toast('رقم الموبايل مش صحيح');
      const p = await this.quickPatient(name, mobile);
      show(p.id); onPick(p.id);
    };
    show(cur);
  },

  bindForm(ed) {
    const f = { doc: $('#fDoc'), total: $('#fTotal'), paid: $('#fPaid'), next: $('#fNext'), has: $('#fHasLab'), lab: $('#fLab'), labId: $('#fLabId') };
    const st = this.draft || (ed ? { pat: ed.patientId || '', visit: ed.visit || '', doc: ed.doctor, total: ed.total, paid: ed.paid ?? '', next: ed.nextVisit || '', has: !!ed.hasLab, lab: ed.lab, labId: ed.labId } : { pat: '', visit: '' });
    if (ed && st.paid !== '' && num(st.paid) === num(st.total)) st.paid = '';
    f.doc.value = st.doc || ''; f.total.value = st.total || ''; f.paid.value = st.paid || ''; f.next.value = st.next || '';
    f.has.checked = !!st.has; f.lab.value = st.lab || ''; f.labId.value = st.labId || '';
    if (ed && st.doc && !f.doc.value) { const o = el('option'); o.value = ed.doctor; o.textContent = ed.dn || 'دكتور محذوف'; f.doc.append(o); f.doc.value = ed.doctor; }
    if (ed && st.labId && !f.labId.value) { const o = el('option'); o.value = ed.labId; o.textContent = ed.ln || 'معمل محذوف'; f.labId.append(o); f.labId.value = ed.labId; }
    const visitBtns = [...document.querySelectorAll('#fVisit button')];
    const markVisit = () => visitBtns.forEach(b => b.classList.toggle('on', b.dataset.v === st.visit));
    visitBtns.forEach(b => (b.onclick = () => { st.visit = b.dataset.v; markVisit(); upd(); }));
    markVisit();
    this.picker($('#fPat'), st.pat, id => { st.pat = id; upd(); });
    document.querySelectorAll('[data-nx]').forEach(b => (b.onclick = () => { f.next.value = addDays(this.date, +b.dataset.nx); upd(); }));

    const pctFor = docId => (ed && ed.doctor === docId && ed.pct != null ? num(ed.pct) : num((this.doctor(docId) || {}).pct) ?? 40);
    const read = () => Object.assign(st, { doc: f.doc.value, total: f.total.value, paid: f.paid.value, next: f.next.value, has: f.has.checked, lab: f.lab.value, labId: f.labId.value });
    const upd = () => {
      const v = this.draft = read();
      $('#labBox').hidden = !v.has;
      const box = $('#fCalc');
      const total = num(v.total);
      if (!v.doc || !total) { box.innerHTML = '<span class="muted">اختار الدكتور واكتب المبلغ — الحساب هيظهر هنا على طول.</span>'; return; }
      const c = calcLine({ total: v.total, hasLab: v.has, lab: v.lab, pct: pctFor(v.doc), paid: v.paid });
      box.innerHTML = `
        <div><span>الإجمالي المتفق عليه</span><b>${egp(c.total)}</b></div>
        ${v.has ? `<div><span>المعمل${v.labId ? ' — ' + esc(this.labName(v.labId)) : ''}</span><b>${egp(c.lab)}</b></div>
        <div><span>صافي بعد المعمل</span><b>${egp(c.net)}</b></div>` : ''}
        <div class="doc"><span>نصيب الدكتور (${fmt(c.pct)}%)</span><b>${egp(c.doc)}</b></div>
        <div class="clinic"><span>نصيب العيادة</span><b>${egp(c.clinic)}</b></div>
        <div class="paidrow"><span>المريض دفع</span><b>${egp(c.paid)}</b></div>
        ${c.debt > 0 ? `<div class="debt"><span>يتسجل مديونية على المريض</span><b>${egp(c.debt)}</b></div>` : ''}`;
    };
    Object.values(f).forEach(x => x.addEventListener(x.tagName === 'SELECT' || x.type === 'checkbox' || x.type === 'date' ? 'change' : 'input', () => { $('#fErr').classList.remove('show'); upd(); }));
    upd();
    const err = m => { const e = $('#fErr'); e.textContent = m; e.classList.add('show'); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; };
    $('#fSave').onclick = async () => {
      const v = read();
      const total = num(v.total), lab = num(v.lab), paid = v.paid.trim() === '' ? total : num(v.paid);
      if (!v.visit) return err('اختار نوع الزيارة (كشف فقط / علاج / متابعة).');
      if (!v.doc) return err('اختار الدكتور الأول.');
      if (!total || total <= 0) return err('اكتب إجمالي المبلغ (رقم أكبر من صفر).');
      if (paid == null || paid < 0) return err('المدفوع لازم يبقى رقم.');
      if (paid > total) return err('المدفوع أكبر من الإجمالي — راجع الأرقام.');
      if (paid < total && !v.pat) return err('فيه مبلغ باقي على المريض — اختار المريض عشان المديونية تتسجل عليه.');
      if (v.next && !v.pat) return err('عشان تحجز موعد الزيارة الجاية اختار المريض.');
      if (v.next && v.next < this.date) return err('موعد الزيارة الجاية قبل تاريخ اليوم ده.');
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
        patientId: v.pat || '', pn: v.pat ? this.patName(v.pat) : '', visit: v.visit, paid: String(paid), nextVisit: v.next || '',
      });
      await this.put(rec, ['date', 'doctor', 'dn', 'pct', 'total', 'hasLab', 'lab', 'labId', 'ln', 'createdAt', 'patientId', 'pn', 'visit', 'paid', 'nextVisit']);
      toast(ed ? '✓ السطر اتعدّل' : paid < total ? `✓ السطر اتضاف — واتسجل ${fmt(total - paid)} ج.م على المريض` : '✓ السطر اتضاف');
      this.editing = null; this.draft = null; this.render();
    };
    const c = $('#fCancel'); if (c) c.onclick = () => { this.editing = null; this.draft = null; this.render(); };
  },
  async delLine(id) {
    const l = this.recs.find(r => r.id === id); if (!l) return;
    const c = calcLine(l);
    if (!confirm(`حذف سطر ${l.pn ? l.pn + ' — ' : ''}${l.dn || 'الدكتور'} بمبلغ ${fmt(c.total)} ج.م من يوم ${dmy(l.date)}؟`)) return;
    l.deleted = true; await this.put(l, ['deleted']);
    if (this.editing === id) this.editing = null;
    toast('السطر اتحذف'); this.render();
  },
  async delPay(id) {
    const x = this.recs.find(r => r.id === id); if (!x) return;
    if (!confirm(`حذف دفعة ${fmt(num(x.amount))} ج.م من ${this.patName(x.patientId, x.pn)} (يوم ${dmy(x.date)})؟`)) return;
    x.deleted = true; await this.put(x, ['deleted']);
    toast('الدفعة اتحذفت'); this.render();
  },
  docName(l) { const d = this.doctor(l.doctor); return d ? d.name : (l.dn || '—'); },
  linesTable(lines, withDate, noPatient) {
    return `<div class="tbl-wrap"><table class="ftable lines">
      <thead><tr>${withDate ? '<th>التاريخ</th>' : ''}${noPatient ? '' : '<th>المريض</th>'}<th>الزيارة</th><th>الدكتور</th><th>الإجمالي</th><th>المدفوع</th><th>المعمل</th><th>نصيب الدكتور</th><th>نصيب العيادة</th><th></th></tr></thead>
      <tbody>${lines.map(l => {
        const c = calcLine(l);
        return `<tr>${withDate ? `<td data-l="التاريخ">${dmy(l.date)}</td>` : ''}
          ${noPatient ? '' : `<td data-l="المريض">${l.patientId ? `<button class="lnk" data-acc="${l.patientId}">${esc(this.patName(l.patientId, l.pn))}</button>` : '<span class="muted">—</span>'}</td>`}
          <td data-l="الزيارة">${l.visit ? `<span class="vtag ${l.visit}">${VISIT[l.visit]}</span>` : '<span class="muted">—</span>'}${l.nextVisit ? `<small class="nx">📅 ${dmy(l.nextVisit)}</small>` : ''}</td>
          <td data-l="الدكتور"><b>${esc(this.docName(l))}</b> <small>${fmt(c.pct)}%</small></td>
          <td data-l="الإجمالي">${egp(c.total)}</td>
          <td data-l="المدفوع">${egp(c.paid)}${c.debt > 0 ? `<small class="owe">باقي ${egp(c.debt)}</small>` : ''}</td>
          <td data-l="المعمل">${c.lab ? `${egp(c.lab)} <small>${esc(this.labName(l.labId) || l.ln || '')}</small>` : '<span class="muted">—</span>'}</td>
          <td data-l="نصيب الدكتور">${egp(c.doc)}</td>
          <td data-l="نصيب العيادة"><b>${egp(c.clinic)}</b></td>
          <td class="act"><button data-edit="${l.id}" title="تعديل">✎ تعديل</button><button class="del" data-del="${l.id}" title="حذف">🗑</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  },
  paysTable(pays, withPatient) {
    return `<div class="tbl-wrap"><table class="ftable lines pays">
      <thead><tr><th>التاريخ</th>${withPatient ? '<th>المريض</th>' : ''}<th>المبلغ</th><th>ملاحظة</th><th></th></tr></thead>
      <tbody>${pays.map(x => `<tr><td data-l="التاريخ">${dmy(x.date)}</td>
        ${withPatient ? `<td data-l="المريض"><button class="lnk" data-acc="${x.patientId}">${esc(this.patName(x.patientId, x.pn))}</button></td>` : ''}
        <td data-l="المبلغ"><b>${egp(num(x.amount))}</b></td><td data-l="ملاحظة">${esc(x.note || '') || '<span class="muted">—</span>'}</td>
        <td class="act"><button class="del" data-pdel="${x.id}" title="حذف الدفعة">🗑</button></td></tr>`).join('')}</tbody></table></div>`;
  },
  sums(lines, pays = []) {
    const s = { income: 0, lab: 0, doc: 0, clinic: 0, paid: 0, debt: 0, later: 0 };
    for (const l of lines) { const c = calcLine(l); s.income += c.total; s.lab += c.lab; s.doc += c.doc; s.clinic += c.clinic; s.paid += c.paid; s.debt += c.debt; }
    for (const p of pays) s.later += num(p.amount) || 0;
    for (const k in s) s[k] = r2(s[k]);
    s.collected = r2(s.paid + s.later);
    return s;
  },
  summaryTiles(lines, pays, title) {
    const s = this.sums(lines, pays);
    return `<section class="fcard"><h3>${title}</h3><div class="tiles">
      <div><span>إجمالي الدخل</span><b>${egp(s.income)}</b></div>
      <div><span>إجمالي المعامل</span><b>${egp(s.lab)}</b></div>
      <div><span>إجمالي الدكاترة</span><b>${egp(s.doc)}</b></div>
      <div class="hi"><span>إجمالي العيادة</span><b>${egp(s.clinic)}</b></div>
      <div class="cash"><span>المحصّل فعلاً (كاش)</span><b>${egp(s.collected)}</b>${s.later ? `<small>منهم ${egp(s.later)} دفعات قديمة</small>` : ''}</div>
      <div class="${s.debt ? 'owe' : ''}"><span>مديونيات جديدة</span><b>${egp(s.debt)}</b></div></div></section>`;
  },

  /* ================= 6) المرضى ================= */
  renderPatients(body) {
    const q = toEn(this.pq.trim()).toLowerCase();
    let rows = this.patients.filter(p => !q || [p.name, toEn(p.mobile), toEn(p.fileNo)].some(v => String(v || '').toLowerCase().includes(q)));
    const S = { last: (a, b) => (this.info(b).last || '').localeCompare(this.info(a).last || ''), name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ar'), bal: (a, b) => this.info(b).bal - this.info(a).bal, no: (a, b) => (num(b.fileNo) || 0) - (num(a.fileNo) || 0) };
    rows.sort(S[this.psort] || S.last);
    const total = rows.length; if (!this.pall) rows = rows.slice(0, 60);
    const debtSum = this.patients.reduce((s, p) => s + Math.max(0, this.info(p).bal), 0);
    body.innerHTML = `
      <section class="fcard">
        <div class="ptools">
          <input type="search" id="pQ" class="tin" placeholder="ابحث بالاسم أو الموبايل أو رقم الملف" value="${esc(this.pq)}">
          <select id="pSort" class="tin sm"><option value="last">آخر زيارة</option><option value="name">الاسم</option><option value="bal">المتبقي عليه</option><option value="no">رقم الملف</option></select>
          <button class="primary" id="pNew">+ مريض جديد</button>
        </div>
        <div class="pp-new" id="pNewBox" hidden>
          <input class="tin" id="pnName" placeholder="اسم المريض"><input class="tin" id="pnMob" placeholder="رقم الموبايل (واتساب)" inputmode="tel" dir="ltr">
          <div class="fbtns"><button class="primary" id="pnSave">حفظ وافتح حسابه</button><button class="ghost2" id="pnCancel">إلغاء</button></div>
        </div>
        <p class="muted">${this.patients.length} مريض${debtSum ? ` · إجمالي المديونيات: <b class="owe-t">${egp(debtSum)}</b>` : ''}</p>
      </section>
      <section class="fcard">${this.patRows(rows, 'general')}
        ${total > rows.length ? `<button class="ghost2 wide" id="pAll">اعرض الكل (${total})</button>` : ''}</section>
      ${this.selBar()}`;
    const qi = $('#pQ');
    qi.oninput = () => { this.pq = qi.value; const pos = qi.selectionStart; this.render(); const n = $('#pQ'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} };
    $('#pSort').value = this.psort; $('#pSort').onchange = e => { this.psort = e.target.value; this.render(); };
    $('#pNew').onclick = () => { $('#pNewBox').hidden = false; $('#pnName').focus(); };
    $('#pnCancel').onclick = () => { $('#pNewBox').hidden = true; };
    $('#pnSave').onclick = async () => {
      const name = $('#pnName').value.trim(), mob = $('#pnMob').value.trim();
      if (!name) return toast('اكتب اسم المريض');
      if (mob && !waNum(mob)) return toast('رقم الموبايل مش صحيح');
      const p = await this.quickPatient(name, mob); this.openPatient(p.id);
    };
    const all = $('#pAll'); if (all) all.onclick = () => { this.pall = true; this.render(); };
    this.bindSel(body);
  },
  // صفوف مرضى (قايمة المرضى + قوائم المتابعة)
  patRows(rows, tplKey, extra) {
    if (!rows.length) return '<p class="muted c">مفيش مرضى هنا.</p>';
    return `<div class="plist">${rows.map(p => {
      const inf = this.info(p), x = extra ? extra(p, inf) : '';
      return `<div class="prow">
        <label class="pck"><input type="checkbox" data-sel="${p.id}" ${this.sel.has(p.id) ? 'checked' : ''}><i></i></label>
        <button class="pmain" data-acc="${p.id}">
          <b>${esc(p.name || 'بدون اسم')}</b>
          <small>ملف ${esc(p.fileNo || '—')}${p.mobile ? ` · <span dir="ltr">${esc(p.mobile)}</span>` : ''}</small>
        </button>
        <div class="pmeta">
          <span>آخر زيارة: <b>${inf.last ? dmy(inf.last) : '—'}</b>${inf.last ? ` <small>(${this.ago(inf.last)})</small>` : ''}</span>
          ${x}${inf.bal > 0 && !(extra && tplKey === 'debt') ? `<span class="owe">عليه ${egp(inf.bal)}</span>` : ''}
        </div>
        ${p.mobile ? `<button class="wa" data-wa="${p.id}" data-tpl="${tplKey}" title="ابعت واتساب">${WA_ICON}<span>واتساب</span></button>` : '<span class="nowa" title="مفيش رقم">—</span>'}
      </div>`;
    }).join('')}</div>`;
  },
  ago(s) { const n = daysAgo(s); return n <= 0 ? (n === 0 ? 'النهارده' : 'بعد ' + -n + ' يوم') : n === 1 ? 'امبارح' : n < 30 ? `من ${n} يوم` : n < 365 ? `من ${Math.round(n / 30)} شهر` : `من ${(n / 365).toFixed(1)} سنة`; },
  selBar() {
    return `<div class="selbar" ${this.sel.size ? '' : 'hidden'}><span>مختار <b>${this.sel.size}</b> مريض</span>
      <button class="primary" id="selSend">${WA_ICON} رسالة للمختارين</button><button class="ghost2" id="selClear">إلغاء الاختيار</button></div>`;
  },
  bindSel(body) {
    body.querySelectorAll('[data-sel]').forEach(c => (c.onchange = () => {
      if (c.checked) this.sel.add(c.dataset.sel); else this.sel.delete(c.dataset.sel);
      const bar = body.querySelector('.selbar'); if (bar) { bar.hidden = !this.sel.size; bar.querySelector('b').textContent = this.sel.size; }
    }));
    const s = $('#selSend'); if (s) s.onclick = () => this.bulkSheet('sel');
    const c = $('#selClear'); if (c) c.onclick = () => { this.sel.clear(); this.render(); };
  },

  /* ---- حساب مريض: زياراته + دفعاته + المتبقي ---- */
  renderAccount(body) {
    const p = this.pat(this.acc);
    if (!p) { this.acc = null; return this.renderPatients(body); }
    const inf = this.info(p);
    body.innerHTML = `
      <button class="ghost2 back" id="accBack">→ كل المرضى</button>
      <section class="fcard acc-head">
        <div class="acc-id">
          <b>${esc(p.name || 'بدون اسم')}</b>
          <small>ملف رقم ${esc(p.fileNo || '—')} · أول زيارة: ${esc(p.firstVisit || '—')}</small>
          <div class="acc-btns">
            ${p.mobile ? `<button class="wa" data-wa="${p.id}" data-tpl="${inf.bal > 0 ? 'debt' : 'general'}">${WA_ICON}<span dir="ltr">${esc(p.mobile)}</span></button>` : ''}
            <button class="ghost2 sm" id="accFile">📂 افتح ملف المريض</button>
          </div>
        </div>
        <div class="acc-bal ${inf.bal > 0 ? 'owe' : ''}"><span>المتبقي عليه</span><b>${egp(inf.bal)}</b>${inf.next ? `<small>📅 الموعد الجاي: ${dayLabel(inf.next)}</small>` : ''}</div>
      </section>
      <section class="fcard grid2 acc-edit">
        <label class="fl">الاسم<input class="tin" id="aName" value="${esc(p.name || '')}"></label>
        <label class="fl">رقم الموبايل (واتساب)<input class="tin" id="aMob" inputmode="tel" dir="ltr" value="${esc(p.mobile || '')}"></label>
        <label class="fl" style="grid-column:1/-1">ملاحظات<textarea class="tin" id="aNotes" rows="2" placeholder="أي ملاحظة عن المريض أو حسابه">${esc(p.accNotes || '')}</textarea></label>
      </section>
      <section class="fcard">
        <h3>سجل الزيارات <small>${inf.visits} زيارة</small></h3>
        ${inf.lines.length ? this.linesTable(inf.lines.slice().reverse(), true, true) : '<p class="muted">لسه مفيش زيارات متسجلة في الحسابات.</p>'}
      </section>
      <section class="fcard">
        <h3>دفعات على الحساب</h3>
        ${inf.pays.length ? this.paysTable(inf.pays.slice().reverse()) : '<p class="muted">مفيش دفعات لاحقة.</p>'}
        ${inf.bal > 0 ? `<div class="pay-add">
          <label class="fl">مبلغ الدفعة<span class="money"><input id="payAmt" inputmode="decimal" dir="ltr" placeholder="${fmt(inf.bal)}"><em>ج.م</em></span></label>
          <label class="fl">اتدفعت يوم<input type="date" class="tin" id="payDate" value="${isoToday()}"></label>
          <label class="fl">ملاحظة<input class="tin" id="payNote" placeholder="اختياري"></label>
          <button class="primary" id="payAdd">+ تسجيل دفعة</button>
        </div><p class="hint2">الدفعة بتتحسب في «المحصّل» بتاع اليوم اللي اتدفعت فيه.</p>` : '<p class="hint2">✓ الحساب خالص.</p>'}
      </section>`;
    $('#accBack').onclick = () => { this.acc = null; this.render(); };
    $('#accFile').onclick = async () => { const fresh = await DB.get(p.id); showApp('files'); openFile(fresh || p); };
    const saveF = (id, key, check) => ($(id).onchange = async e => {
      const v = e.target.value.trim();
      if (check && !check(v)) { e.target.value = p[key] || ''; return; }
      p[key] = v; await this.savePatient(p, [key]); toast('✓ اتحفظ');
    });
    saveF('#aName', 'name', v => (v ? true : (toast('الاسم ما ينفعش يبقى فاضي'), false)));
    saveF('#aMob', 'mobile', v => (!v || waNum(v) ? true : (toast('رقم الموبايل مش صحيح'), false)));
    saveF('#aNotes', 'accNotes');
    body.querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => { const l = this.recs.find(r => r.id === b.dataset.edit); this.tab = 'day'; this.date = l.date; this.editing = l.id; this.draft = null; this.acc = null; this.render(); setTimeout(() => $('#lineForm').scrollIntoView({ block: 'center' }), 50); }));
    body.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => this.delLine(b.dataset.del)));
    body.querySelectorAll('[data-pdel]').forEach(b => (b.onclick = () => this.delPay(b.dataset.pdel)));
    const add = $('#payAdd');
    if (add) add.onclick = async () => {
      const amt = num($('#payAmt').value), date = $('#payDate').value || isoToday();
      if (!amt || amt <= 0) return toast('اكتب مبلغ الدفعة');
      if (amt > inf.bal + 0.001) return toast(`المبلغ أكبر من المتبقي (${fmt(inf.bal)} ج.م)`);
      await this.put({ id: 'P' + uid(), type: 'pay', date, patientId: p.id, pn: p.name || '', amount: String(amt), note: $('#payNote').value.trim(), createdAt: Date.now() }, ['date', 'patientId', 'pn', 'amount', 'note', 'createdAt']);
      toast(`✓ اتسجلت دفعة ${fmt(amt)} ج.م`); this.render();
    };
  },

  /* ================= 7) محتاجين متابعة ================= */
  followList(k) {
    const T = isoToday(), N = this.followDays();
    const rng = { today: T, tomorrow: addDays(T, 1), week: addDays(T, 7), all: '9999' };
    return this.patients.filter(p => {
      const i = this.info(p);
      if (k === 'appt') return i.next && (this.fuRange === 'tomorrow' ? i.next === rng.tomorrow : i.next <= rng[this.fuRange]);
      if (k === 'exam') return i.examOnly;
      if (k === 'away') return i.last && daysAgo(i.last) > N && !i.next;
      if (k === 'debt') return i.bal > 0;
      return false;
    });
  },
  renderFollow(body) {
    const counts = {};
    const keepRange = this.fuRange; this.fuRange = 'all';
    for (const f of FOLLOW) counts[f.k] = this.followList(f.k).length;
    this.fuRange = keepRange;
    const k = this.fu;
    let rows = this.followList(k);
    const q = toEn(this.fuQ.trim()).toLowerCase();
    if (q) rows = rows.filter(p => [p.name, toEn(p.mobile), toEn(p.fileNo)].some(v => String(v || '').toLowerCase().includes(q)));
    const defSort = { appt: 'next', exam: 'last', away: 'oldest', debt: 'bal' }[k];
    const sort = this.fuSort || defSort;
    const S = { next: (a, b) => this.info(a).next.localeCompare(this.info(b).next), last: (a, b) => (this.info(b).last || '').localeCompare(this.info(a).last || ''),
      oldest: (a, b) => (this.info(a).last || '').localeCompare(this.info(b).last || ''), bal: (a, b) => this.info(b).bal - this.info(a).bal, name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ar') };
    rows.sort(S[sort] || S.last);
    const debtTotal = k === 'debt' ? rows.reduce((s, p) => s + this.info(p).bal, 0) : 0;
    const extra = {
      appt: (p, i) => `<span class="nxt">📅 ${dayLabel(i.next)} <small>(${i.next === isoToday() ? 'النهارده' : i.next === addDays(isoToday(), 1) ? 'بكرة' : this.ago(i.next)})</small></span>`,
      exam: (p, i) => `<span class="muted">${i.visits} كشف</span>`,
      away: () => '',
      debt: (p, i) => `<span class="owe big">${egp(i.bal)}</span>`,
    }[k];
    const sorts = { appt: [['next', 'أقرب موعد'], ['name', 'الاسم']], exam: [['last', 'أحدث كشف'], ['oldest', 'أقدم كشف'], ['name', 'الاسم']],
      away: [['oldest', 'الأطول غياب'], ['last', 'الأقرب'], ['name', 'الاسم']], debt: [['bal', 'الأكبر مبلغ'], ['last', 'آخر زيارة'], ['name', 'الاسم']] }[k];
    body.innerHTML = `
      <div class="fu-cards">${FOLLOW.map(f => `<button data-fu="${f.k}" class="${f.k === k ? 'on' : ''}"><i>${f.i}</i><span>${f.t}</span><b>${counts[f.k]}</b></button>`).join('')}</div>
      <section class="fcard">
        <div class="ptools">
          <input type="search" id="fuQ" class="tin" placeholder="فلتر بالاسم أو الرقم" value="${esc(this.fuQ)}">
          <select id="fuSort" class="tin sm">${sorts.map(([v, t]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${t}</option>`).join('')}</select>
          ${rows.length ? `<button class="primary" id="fuBulk">${WA_ICON} رسالة للقايمة كلها</button>` : ''}
        </div>
        ${k === 'appt' ? `<div class="rng">${[['today', 'النهارده'], ['tomorrow', 'بكرة'], ['week', 'الأسبوع ده'], ['all', 'كل المواعيد']].map(([v, t]) => `<button class="chip ${v === this.fuRange ? 'on' : ''}" data-rng="${v}">${t}</button>`).join('')}</div>` : ''}
        ${k === 'away' ? `<p class="hint2">آخر زيارة أقدم من <b>${this.followDays()}</b> يوم ومالهمش موعد جاي (المدة بتتغير من الإعدادات).</p>` : ''}
        ${k === 'exam' ? '<p class="hint2">مرضى كل زياراتهم «كشف فقط» ومفيش علاج بعدها.</p>' : ''}
        ${k === 'debt' ? `<div class="exp-total"><span>إجمالي المديونيات في القايمة</span><b>${egp(debtTotal)}</b></div>` : ''}
      </section>
      <section class="fcard">${this.patRows(rows, k, extra)}</section>
      ${this.selBar()}`;
    body.querySelectorAll('[data-fu]').forEach(b => (b.onclick = () => { this.fu = b.dataset.fu; this.fuSort = ''; this.fuQ = ''; this.render(); }));
    body.querySelectorAll('[data-rng]').forEach(b => (b.onclick = () => { this.fuRange = b.dataset.rng; this.render(); }));
    const qi = $('#fuQ'); qi.oninput = () => { this.fuQ = qi.value; const pos = qi.selectionStart; this.render(); const n = $('#fuQ'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} };
    $('#fuSort').onchange = e => { this.fuSort = e.target.value; this.render(); };
    const bulk = $('#fuBulk'); if (bulk) bulk.onclick = () => this.bulkSheet(k, rows.map(p => p.id));
    this.bindSel(body);
  },

  /* ================= 8) واتساب ================= */
  fill(text, p) {
    const inf = this.info(p);
    return text.replace(/\{الاسم\}/g, (p.name || '').trim())
      .replace(/\{المبلغ\}/g, `${fmt(Math.max(0, inf.bal))} جنيه`)
      .replace(/\{الموعد\}/g, inf.next ? `${dayLabel(inf.next)} (${dmy(inf.next)})` : '')
      .replace(/\{العيادة\}/g, this.clinicName());
  },
  waSheet(id, tplKey) {
    const p = this.pat(id); if (!p) return;
    if (!waNum(p.mobile)) return toast('رقم الموبايل بتاع المريض ده مش صحيح');
    const ta = el('textarea'); ta.value = this.fill(this.tpl(tplKey), p); ta.style.minHeight = '150px';
    const sel = el('select', 'tin');
    sel.innerHTML = Object.entries(TPL_NAME).map(([k, t]) => `<option value="${k}" ${k === tplKey ? 'selected' : ''}>${t}</option>`).join('');
    sel.onchange = () => { ta.value = this.fill(this.tpl(sel.value), p); };
    const to = el('p', 'hint'); to.innerHTML = `هتتبعت لـ <b></b> على <span dir="ltr">+${waNum(p.mobile)}</span>`; to.querySelector('b').textContent = p.name || '';
    openSheet('رسالة واتساب', [Object.assign(el('label'), { textContent: 'نوع الرسالة' }), sel, Object.assign(el('label'), { textContent: 'الرسالة (عدّل فيها براحتك)' }), ta, to], [
      ['افتح واتساب', 'ok', () => { window.open(waLink(p.mobile, ta.value), '_blank'); }],
      ['إلغاء', 'no', () => {}],
    ]);
  },
  // رسالة جماعية: واتساب ما بيسمحش يبعت لكذا حد مرة واحدة من لينك، فبنجهّز رسالة كل مريض ونفتحها واحدة ورا التانية
  bulkSheet(group, ids) {
    const groups = [['all', 'كل المرضى اللي ليهم موبايل'], ...FOLLOW.map(f => [f.k, f.t]), ['sel', `المرضى المختارين (${this.sel.size})`]];
    const body = el('div', 'bulk');
    let step = 'compose', list = [], sent = new Set(), cur = 0;
    const idsOf = g => {
      if (g === 'sel') return [...this.sel];
      if (g === 'all') return this.patients.map(p => p.id);
      if (ids && g === group) return ids;
      const keep = this.fuRange; if (g === 'appt') this.fuRange = 'week';
      const r = this.followList(g).map(p => p.id); this.fuRange = keep; return r;
    };
    let g = group, msg = this.tpl(FOLLOW.some(f => f.k === group) ? group : 'general');
    const draw = () => {
      if (step === 'compose') {
        const pts = idsOf(g).map(id => this.pat(id)).filter(p => p && waNum(p.mobile));
        const skipped = idsOf(g).length - pts.length;
        list = pts;
        body.innerHTML = `
          <label>المجموعة</label><select class="tin" id="bG">${groups.map(([k, t]) => `<option value="${k}" ${k === g ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <label>الرسالة</label><textarea id="bMsg" style="min-height:130px"></textarea>
          <p class="hint">تقدر تستخدم: <code>{الاسم}</code> <code>{المبلغ}</code> <code>{الموعد}</code> <code>{العيادة}</code> — وكل مريض هتوصله باسمه.</p>
          <p class="bcount">هتتبعت لـ <b>${pts.length}</b> مريض${skipped ? ` <small>(${skipped} من غير رقم صحيح)</small>` : ''}</p>
          ${pts.length ? `<div class="bprev"><small>مثال (أول مريض):</small><pre></pre></div>` : ''}`;
        const ta = body.querySelector('#bMsg'); ta.value = msg;
        const prev = () => { const pre = body.querySelector('.bprev pre'); if (pre) pre.textContent = this.fill(ta.value, pts[0]); };
        ta.oninput = () => { msg = ta.value; prev(); }; prev();
        body.querySelector('#bG').onchange = e => { g = e.target.value; msg = this.tpl(FOLLOW.some(f => f.k === g) ? g : 'general'); draw(); };
        foot([[`ابدأ الإرسال (${pts.length})`, 'ok', () => { if (!pts.length || !msg.trim()) return false; step = 'send'; cur = 0; draw(); return false; }], ['إلغاء', 'no', () => {}]]);
      } else {
        const p = list[cur];
        body.innerHTML = `
          <p class="bcount">اتبعت <b>${sent.size}</b> من <b>${list.length}</b></p>
          <div class="bprog"><i style="width:${(sent.size / list.length) * 100}%"></i></div>
          ${p ? `<div class="bnow"><b></b><span dir="ltr">+${waNum(p.mobile)}</span><pre></pre></div>` : '<p class="hint" style="font-size:16px">✓ خلصت كل الرسايل.</p>'}
          <div class="blist">${list.map((x, i) => `<button data-i="${i}" class="${sent.has(x.id) ? 'done' : ''} ${i === cur ? 'cur' : ''}">${sent.has(x.id) ? '✓' : i + 1}. ${esc(x.name || '')}</button>`).join('')}</div>
          <p class="hint">كل دوسة بتفتح واتساب برسالة المريض جاهزة — ابعتها وارجع هنا للي بعده.</p>`;
        if (p) { body.querySelector('.bnow b').textContent = p.name || ''; body.querySelector('.bnow pre').textContent = this.fill(msg, p); }
        body.querySelectorAll('.blist button').forEach(b => (b.onclick = () => { cur = +b.dataset.i; draw(); }));
        foot(p ? [[`افتح واتساب — ${p.name || ''}`, 'ok', () => {
          window.open(waLink(p.mobile, this.fill(msg, p)), '_blank');
          sent.add(p.id);
          const nxt = list.findIndex((x, i) => i > cur && !sent.has(x.id));
          cur = nxt >= 0 ? nxt : list.findIndex(x => !sent.has(x.id));
          if (cur < 0) cur = list.length;
          draw(); return false;
        }], ['تخطي', 'no', () => { cur = Math.min(list.length, cur + 1); draw(); return false; }]] : [['تم', 'ok', () => {}]]);
      }
    };
    const foot = btns => {
      const f = $('#sheetFoot'); f.innerHTML = '';
      for (const [label, cls, fn] of btns) { const b = el('button', cls); b.textContent = label; b.onclick = async () => { if ((await fn()) !== false) closeSheet(); }; f.append(b); }
    };
    openSheet('رسالة واتساب جماعية', [body], []);
    draw();
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

  /* ================= 3) المصروفات الشهرية ================= */
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

  /* ================= 4) التقرير الشهري ================= */
  monthData(month) {
    const lines = this.lines(month), pays = this.pays(month);
    const sums = this.sums(lines, pays);
    const labs = {}, docs = {}, days = {};
    const day = d => (days[d] = days[d] || { count: 0, income: 0, lab: 0, doc: 0, clinic: 0, collected: 0 });
    for (const l of lines) {
      const c = calcLine(l);
      if (c.lab) {
        const k = l.labId || '?';
        const x = labs[k] = labs[k] || { name: this.labName(l.labId) || l.ln || 'بدون اسم', count: 0, sum: 0 };
        x.count++; x.sum = r2(x.sum + c.lab);
      }
      const d = docs[l.doctor] = docs[l.doctor] || { name: this.docName(l), pcts: new Set(), count: 0, income: 0, lab: 0, due: 0 };
      d.pcts.add(c.pct); d.count++; d.income = r2(d.income + c.total); d.lab = r2(d.lab + c.lab); d.due = r2(d.due + c.doc);
      const y = day(l.date);
      y.count++; y.income = r2(y.income + c.total); y.lab = r2(y.lab + c.lab); y.doc = r2(y.doc + c.doc); y.clinic = r2(y.clinic + c.clinic); y.collected = r2(y.collected + c.paid);
    }
    for (const p of pays) { const y = day(p.date); y.collected = r2(y.collected + (num(p.amount) || 0)); }
    const ev = (this.expRec(month) || {}).v || {};
    const exps = this.expItems(true).filter(x => !x.del || num(ev[x.id])).map(x => ({ name: x.name, v: num(ev[x.id]) || 0 }));
    const expTotal = r2(exps.reduce((s, x) => s + x.v, 0));
    const outstanding = r2(this.patients.reduce((s, p) => s + Math.max(0, this.info(p).bal), 0));
    const visits = { exam: 0, treat: 0, follow: 0 }; lines.forEach(l => { if (visits[l.visit] != null) visits[l.visit]++; });
    return {
      month, lines, pays, ...sums, outstanding, visits, labs: Object.values(labs).sort((a, b) => b.sum - a.sum),
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
      ${T(['التاريخ', 'اليوم', 'الحالات', 'الدخل', 'المعامل', 'الدكاترة', 'العيادة', 'المحصّل'],
        D.days.map(x => `<tr><td class="c">${dmy(x.date)}</td><td>${day(x.date)}</td><td class="c">${x.count}</td><td>${egp(x.income)}</td><td>${egp(x.lab)}</td><td>${egp(x.doc)}</td><td><b>${egp(x.clinic)}</b></td><td>${egp(x.collected)}</td></tr>`),
        ['الإجمالي', '', D.lines.length, egp(D.income), egp(D.lab), egp(D.doc), egp(D.clinic), egp(D.collected)])}
      <h4>9. التحصيل والمديونيات</h4>
      ${T(['البند', 'المبلغ'], [
        `<tr><td>المدفوع وقت الزيارات</td><td>${egp(D.paid)}</td></tr>`,
        `<tr><td>دفعات لاحقة على حسابات</td><td>${egp(D.later)}</td></tr>`,
        `<tr><td><b>إجمالي المحصّل فعلاً في الشهر</b></td><td><b>${egp(D.collected)}</b></td></tr>`,
        `<tr><td>مديونيات جديدة اتسجلت في الشهر</td><td>${egp(D.debt)}</td></tr>`,
        `<tr><td>إجمالي المديونيات على المرضى (لحد النهارده)</td><td><b>${egp(D.outstanding)}</b></td></tr>`,
        `<tr><td>الزيارات: كشف فقط / علاج / متابعة</td><td>${D.visits.exam} / ${D.visits.treat} / ${D.visits.follow}</td></tr>`])}`;
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
    setTimeout(() => window.print(), 80);
  },

  /* ---- Excel (.xlsx حقيقي — بيتعمل على الجهاز من غير نت) ---- */
  exportXlsx(D) {
    const H = s => ({ v: s, s: 1 }), M = v => ({ v: r2(v || 0), s: 2 }), MT = v => ({ v: r2(v || 0), s: 3 }), B = s => ({ v: s, s: 4 });
    const summary = [
      [B(this.clinicName())], [B('التقرير الشهري — ' + monthName(D.month))], [],
      [H('البند'), H('المبلغ (ج.م)')],
      ['إجمالي الدخل', M(D.income)], ['إجمالي المعامل', M(D.lab)], ['إجمالي نصيب الدكاترة', M(D.doc)],
      ['إجمالي نصيب العيادة', M(D.clinic)], ['إجمالي المصروفات', M(D.expTotal)], [B('صافي ربح العيادة'), MT(D.profit)],
      [], ['المحصّل فعلاً في الشهر', M(D.collected)], ['منه دفعات لاحقة', M(D.later)], ['مديونيات جديدة في الشهر', M(D.debt)], ['إجمالي المديونيات على المرضى', M(D.outstanding)],
      [], ['عدد الحالات', D.lines.length], ['أيام الشغل', D.days.length], ['كشف فقط / علاج / متابعة', `${D.visits.exam} / ${D.visits.treat} / ${D.visits.follow}`],
    ];
    const lines = [[H('التاريخ'), H('اليوم'), H('المريض'), H('رقم الملف'), H('نوع الزيارة'), H('الدكتور'), H('النسبة %'), H('الإجمالي'), H('المدفوع'), H('الباقي'), H('المعمل'), H('مبلغ المعمل'), H('صافي بعد المعمل'), H('نصيب الدكتور'), H('نصيب العيادة'), H('الموعد الجاي')]];
    D.lines.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(l => {
      const c = calcLine(l), p = this.pat(l.patientId);
      lines.push([dmy(l.date), DAYS[fromIso(l.date).getDay()], this.patName(l.patientId, l.pn), p ? p.fileNo || '' : '', VISIT[l.visit] || '', this.docName(l), c.pct, M(c.total), M(c.paid), M(c.debt), c.lab ? this.labName(l.labId) || l.ln || '' : '', M(c.lab), M(c.net), M(c.doc), M(c.clinic), l.nextVisit ? dmy(l.nextVisit) : '']);
    });
    lines.push([B('الإجمالي'), '', '', '', '', '', '', MT(D.income), MT(D.paid), MT(D.debt), '', MT(D.lab), MT(D.income - D.lab), MT(D.doc), MT(D.clinic), '']);
    const pays = [[H('التاريخ'), H('المريض'), H('المبلغ'), H('ملاحظة')], ...D.pays.map(x => [dmy(x.date), this.patName(x.patientId, x.pn), M(num(x.amount)), x.note || '']), [B('الإجمالي'), '', MT(D.later), '']];
    const docs = [[H('الدكتور'), H('النسبة'), H('عدد الحالات'), H('إجمالي اللي دخّله'), H('نصيبه المستحق')], ...D.docs.map(x => [x.name, x.pct, x.count, M(x.income), M(x.due)]),
      [B('الإجمالي'), '', D.lines.length, MT(D.income), MT(D.doc)]];
    const labs = [[H('المعمل'), H('عدد الحالات'), H('المبلغ')], ...D.labs.map(x => [x.name, x.count, M(x.sum)]), [B('الإجمالي'), D.labs.reduce((s, x) => s + x.count, 0), MT(D.lab)]];
    const exps = [[H('البند'), H('المبلغ')], ...D.exps.map(x => [x.name, M(x.v)]), [B('إجمالي المصروفات'), MT(D.expTotal)], [], [B('نصيب العيادة'), M(D.clinic)], [B('صافي ربح العيادة'), MT(D.profit)]];
    const days = [[H('التاريخ'), H('اليوم'), H('الحالات'), H('الدخل'), H('المعامل'), H('الدكاترة'), H('العيادة'), H('المحصّل')],
      ...D.days.map(x => [dmy(x.date), DAYS[fromIso(x.date).getDay()], x.count, M(x.income), M(x.lab), M(x.doc), M(x.clinic), M(x.collected)]),
      [B('الإجمالي'), '', D.lines.length, MT(D.income), MT(D.lab), MT(D.doc), MT(D.clinic), MT(D.collected)]];
    const debts = [[H('المريض'), H('رقم الملف'), H('الموبايل'), H('آخر زيارة'), H('المتبقي')],
      ...this.patients.filter(p => this.info(p).bal > 0).sort((a, b) => this.info(b).bal - this.info(a).bal).map(p => [p.name || '', p.fileNo || '', p.mobile || '', dmy(this.info(p).last), M(this.info(p).bal)]),
      [B('الإجمالي'), '', '', '', MT(D.outstanding)]];
    const blob = xlsx([
      { name: 'الملخص', rows: summary, widths: [32, 18] },
      { name: 'سطور الدخل', rows: lines, widths: [12, 10, 22, 9, 11, 20, 9, 13, 13, 12, 16, 12, 14, 13, 13, 12] },
      { name: 'الدفعات', rows: pays, widths: [12, 24, 14, 24] },
      { name: 'الدكاترة', rows: docs, widths: [24, 10, 12, 18, 18] },
      { name: 'المعامل', rows: labs, widths: [24, 12, 16] },
      { name: 'المصروفات', rows: exps, widths: [28, 16] },
      { name: 'الدخل اليومي', rows: days, widths: [12, 10, 9, 14, 14, 14, 14, 14] },
      { name: 'المديونيات', rows: debts, widths: [24, 10, 15, 12, 14] },
    ]);
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `Bloom-Clinic-${D.month}.xlsx`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('✓ اتعمل ملف الإكسيل');
  },

  /* ================= 5) الإعدادات ================= */
  renderSet(body) {
    const s = this.settings();
    const docs = this.doctors(), labs = this.labs(), exps = this.expItems();
    body.innerHTML = `
      <section class="fcard">
        <h3>اسم العيادة <small>بيظهر في التقرير والفاتورة ورسايل الواتساب</small></h3>
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
      </section>
      <section class="fcard">
        <h3>المتابعة</h3>
        <label class="fl">«مجاش من فترة طويلة» = آخر زيارة أقدم من
          <span class="days-in"><input class="tin" id="sDays" inputmode="numeric" dir="ltr" value="${this.followDays()}"><em>يوم</em></span></label>
      </section>
      <section class="fcard">
        <h3>رسايل الواتساب الجاهزة <small>تقدر تستخدم {الاسم} {المبلغ} {الموعد} {العيادة}</small></h3>
        ${Object.entries(TPL_NAME).map(([k, t]) => `<label class="fl tpl">${t}<textarea class="tin" data-tpl="${k}" rows="3">${esc(this.tpl(k))}</textarea>
          ${(s.tpl || {})[k] ? `<button class="lnk sm" data-tplreset="${k}">رجّع الرسالة الأصلية</button>` : ''}</label>`).join('')}
      </section>`;
    $('#sClinic').onchange = async e => { s.clinicName = e.target.value.trim(); await this.put(s, ['clinicName']); };
    $('#sDays').onchange = async e => {
      const n = num(e.target.value);
      if (!n || n < 1 || n > 3650) { e.target.value = this.followDays(); return toast('اكتب عدد أيام صحيح'); }
      s.followDays = Math.round(n); await this.put(s, ['followDays']); toast('✓ اتحفظ');
    };
    body.querySelectorAll('[data-tpl]').forEach(t => (t.onchange = async () => { s.tpl = s.tpl || {}; s.tpl[t.dataset.tpl] = t.value; await this.put(s, ['tpl.' + t.dataset.tpl]); toast('✓ الرسالة اتحفظت'); }));
    body.querySelectorAll('[data-tplreset]').forEach(b => (b.onclick = async () => { s.tpl[b.dataset.tplreset] = ''; await this.put(s, ['tpl.' + b.dataset.tplreset]); this.render(); }));
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
const WA_ICON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>';

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
