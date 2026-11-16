/* Bloom Clinic — منطق الدمج المشترك بين الأبلكيشن والسيرفر (Apps Script)
   كل تعديل بيتسجل وقته في record._t[key] (key = اسم الخانة، أو "procs.3" لسطر، أو "teeth.UR5" لسنة).
   الدمج: لكل خانة، الأحدث هو اللي بيكسب — فتعديلين على نفس الملف من جهازين مختلفين ما بيمسحوش بعض. */
var SyncCore = (function () {
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function getK(o, k) {
    var ps = k.split('.');
    for (var i = 0; i < ps.length; i++) { if (o == null) return undefined; o = o[ps[i]]; }
    return o;
  }
  function setK(o, k, v) {
    var ps = k.split('.'), a = o;
    for (var i = 0; i < ps.length - 1; i++) {
      var nextIsIndex = /^\d+$/.test(ps[i + 1]);
      if (a[ps[i]] == null || typeof a[ps[i]] !== 'object') a[ps[i]] = nextIsIndex ? [] : {};
      a = a[ps[i]];
    }
    var last = ps[ps.length - 1];
    if (v === undefined) { if (Array.isArray(a)) a[last] = {}; else delete a[last]; }
    else a[last] = v;
  }
  /** يدمج نسختين من نفس ملف المريض */
  function merge(a, b) {
    if (!a) return clone(b);
    if (!b) return clone(a);
    var ta = a._t || {}, tb = b._t || {};
    var out = clone((b.updatedAt || 0) > (a.updatedAt || 0) ? b : a);
    out._t = {};
    var keys = {}, k;
    for (k in ta) keys[k] = 1;
    for (k in tb) keys[k] = 1;
    var sorted = Object.keys(keys).sort(function (x, y) { return x.split('.').length - y.split('.').length; });
    for (var i = 0; i < sorted.length; i++) {
      k = sorted[i];
      var useB = (tb[k] || 0) > (ta[k] || 0);
      setK(out, k, clone(getK(useB ? b : a, k)));
      out._t[k] = Math.max(ta[k] || 0, tb[k] || 0);
    }
    ['procs', 'pays'].forEach(function (f) {
      if (Array.isArray(out[f])) for (var j = 0; j < out[f].length; j++) if (out[f][j] == null) out[f][j] = {};
    });
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    delete out._dirty;
    return out;
  }
  return { merge: merge, getK: getK, setK: setK, clone: clone };
})();
if (typeof module !== 'undefined') module.exports = SyncCore;
