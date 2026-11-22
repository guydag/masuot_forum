/* פורום מוביל: home, לו״ז (two-way with the Excel schedule), bookings, equipment, links and manager insights,
   around the existing reports page. Uses the globals of index.html: db, auth, firebase, $, closePreview, state. */
(function () {
  "use strict";
  var F = window.Forum = {};

  /* ---------- roles ---------- */
  var BOGER = ["מרכז בוגר", "דרג מתנדב", "מלווה ט׳", "מדריך שכבה"];
  F.ROLES = ["מדריך קורס", "ראשג״ד", "ראש״צ", "מרכז צעיר"].concat(BOGER);
  F.BOGER = BOGER;
  var ROLE_KEY = { "מדריך קורס": "course", "ראשג״ד": "rashgad", "ראש״צ": "rashatz", "מרכז צעיר": "young", "מרכז בוגר": "senior", "דרג מתנדב": "volunteer", "מלווה ט׳": "escort", "מדריך שכבה": "layer" };
  F.ROLE_KEY = ROLE_KEY;
  var me = { id: "", name: "", fullName: "", role: "", unit: "", admin: false };
  function isBoger() { return BOGER.indexOf(me.role) !== -1; }
  function isLead() { return me.role === "מרכז צעיר" || isBoger(); }      /* צוות הובלה */
  var can = F.can = {
    editCal: function () { return me.admin || isLead(); },
    seeAllGear: function () { return me.admin || isLead(); },
    shop: function () { return me.admin || isLead(); },
    manageBookings: function () { return me.admin || isLead(); },
    exportBookings: function () { return me.admin || isLead(); },
    unlimitedBooking: function () { return me.role === "מדריך קורס" || me.admin; },
    manageLinks: function () { return me.admin; }
  };
  F.me = function () { return me; };

  /* ---------- small helpers ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var IC = {
    home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    cal: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    prev: '<path d="M9 6l6 6-6 6"/>', next: '<path d="M15 6l-6 6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    fire: '<path d="M12 22c4 0 7-2.7 7-6.6 0-3.8-3-6.4-4.4-9.4-.6 2.3-1.8 3.6-3 4.2C11.5 7.4 10 4.5 7.6 2.6 7.9 7 5 9.4 5 14.2 5 18.8 8 22 12 22z"/>',
    house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    bus: '<path d="M12 21.5s-7-6.1-7-11.6a7 7 0 0 1 14 0c0 5.5-7 11.6-7 11.6z"/><circle cx="12" cy="9.8" r="2.6"/>',
    proj: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="8" cy="12" r="2.5"/><path d="M14 11h5M14 14h3"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    excel: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 12l4 5M13 12l-4 5"/>',
    google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-3-2.3a5.4 5.4 0 0 1-8-2.8H4v2.4A9 9 0 0 0 12 21z"/><path d="M7 13.7a5.4 5.4 0 0 1 0-3.4V7.9H4a9 9 0 0 0 0 8.2z"/><path d="M12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 4 7.9l3 2.4a5.4 5.4 0 0 1 5-3.7z"/>',
    img: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5-9 9"/>'
  };
  function svg(name, w) { return '<svg width="' + (w || 20) + '" height="' + (w || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || "") + "</svg>"; }
  F.svg = svg;
  function iconBtn(name, label, fn, cls) { var b = el("button", cls || "icon-btn"); b.type = "button"; b.innerHTML = svg(name); b.setAttribute("aria-label", label); b.title = label; if (fn) b.addEventListener("click", fn); return b; }
  function btn(label, cls, fn, icon) { var b = el("button", "btn " + (cls || "ghost small")); b.type = "button"; b.innerHTML = icon ? svg(icon, 17) : ""; b.appendChild(document.createTextNode(label)); if (fn) b.addEventListener("click", fn); return b; }
  function toast(t, err) { var o = document.querySelector(".toast-f"); if (o) o.remove(); var d = el("div", "toast-f" + (err ? " err" : ""), t); d.setAttribute("role", "status"); document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2800); }
  F.toast = toast;
  function myName() { return me.fullName || me.name || me.id.replace(/@.*/, ""); }
  function ts() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function isDesk() { return window.matchMedia("(hover: hover) and (pointer: fine)").matches; }
  /* Phones share, computers download / copy. */
  function sharePhone() { return !!navigator.share && window.matchMedia("(pointer: coarse)").matches; }
  F.sharePhone = sharePhone;
  async function copyText(t, msg) {
    try { await navigator.clipboard.writeText(t); toast(msg || "הועתק"); }
    catch (e) { var ta = el("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg || "הועתק"); } catch (e2) { toast("ההעתקה לא הצליחה", true); } ta.remove(); }
  }
  async function shareOrCopy(text, url, title) {
    if (sharePhone()) { try { await navigator.share({ title: title || "", text: text || "", url: url || undefined }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    copyText(url ? url : text, url ? "הקישור הועתק" : "הועתק");
  }
  async function shareOrDownload(blob, name) {
    if (sharePhone()) {
      try { var file = new File([blob], name, { type: blob.type }); if (!navigator.canShare || navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* Dates are handled as local "YYYY-MM-DD" strings. */
  var DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var DAYS_S = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  var MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function addMonths(s, n) { var d = parse(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); }
  function today() { return iso(new Date()); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function longDate(s) { var d = parse(s); return "יום " + DAYS[d.getDay()] + ", " + d.getDate() + " ב" + MONTHS[d.getMonth()]; }
  function shortDate(s) { var d = parse(s); return d.getDate() + "." + (d.getMonth() + 1); }
  function inDays(s) { var n = diffDays(today(), s); return n === 0 ? "היום" : n === 1 ? "מחר" : n === -1 ? "אתמול" : n > 0 ? "בעוד " + n + " ימים" : "לפני " + (-n) + " ימים"; }
  function weekStart(s) { var d = parse(s); d.setDate(d.getDate() - d.getDay()); return iso(d); }
  function minToHm(x) { x = ((x % 1440) + 1440) % 1440; return pad(Math.floor(x / 60)) + ":" + pad(x % 60); }
  function hmToMin(v) { var m = /^(\d{1,2}):(\d{2})/.exec(v || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }

  function inkFor(hex) {
    hex = String(hex || "").replace("#", "");
    if (hex.length !== 6) return "#1b1b1b";
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#24180f" : "#ffffff";
  }
  function paint(node, hex) { hex = String(hex || "C9CED6").replace("#", ""); node.style.setProperty("--cc", "#" + hex); node.style.setProperty("--ci", inkFor(hex)); return node; }

  /* ---------- modal (same look as the rest of the site) ---------- */
  function openModal(o) {
    closePreview(true); closeFP();
    var ov = el("div", "pv-overlay"); ov.id = "pvOverlay";
    var box = el("div", "pv-box " + (o.cls || "")); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", o.label || o.title || "");
    if (o.title) {
      var head = el("div", "pv-head"), tt = el("div", "pv-title"), h = el("strong", "", o.title); tt.appendChild(h);
      if (o.sub) tt.appendChild(el("span", "", o.sub));
      var x = el("button", "close-x pv-x"); x.type = "button"; x.setAttribute("aria-label", "סגירה"); x.innerHTML = svg("x", 16);
      x.addEventListener("click", function () { closePreview(); });
      head.appendChild(tt); head.appendChild(x); box.appendChild(head);
    }
    box.appendChild(o.body);
    if (o.foot && o.foot.length) { var f = el("div", "pv-foot eu-foot wrap"); o.foot.forEach(function (n) { f.appendChild(n); }); box.appendChild(f); }
    ov.appendChild(box);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closePreview(); });
    document.body.appendChild(ov);
    document.documentElement.classList.add("pv-open");
    void ov.offsetWidth; ov.classList.add("in");
    box.tabIndex = -1; try { box.focus({ preventScroll: true }); } catch (e) {}
    return box;
  }
  F.openModal = openModal;
  function field(label, inp, hint) {
    var w = el("div", "eu-f"), l = el("label", "", label);
    if (!inp.id) inp.id = "f" + Math.random().toString(36).slice(2, 8);
    l.htmlFor = inp.id; w.appendChild(l); w.appendChild(inp);
    if (hint) w.appendChild(el("p", "f-hint", hint));
    return w;
  }
  function input(type, val, ph) { var i = el(type === "textarea" ? "textarea" : "input", "field sm"); if (type !== "textarea") i.type = type === "number" ? "text" : (type || "text"); else i.rows = 2; if (type === "number") { i.inputMode = "numeric"; i.pattern = "[0-9]*"; } if (val != null) i.value = val; if (ph) i.placeholder = ph; return i; }
  function select(opts, val) { var s = el("select", "field sm"); opts.forEach(function (o) { var op = el("option", "", o[1]); op.value = o[0]; if (o[0] === val) op.selected = true; s.appendChild(op); }); return s; }

  /* Small popover that also works above a modal (date / time / menus); a bottom sheet on phones. From גאנט׳. */
  var FP = null;
  function closeFP() { if (!FP) return; var f = FP; FP = null; document.removeEventListener("keydown", f.kd, true); f.el.classList.remove("in"); f.el.classList.add("out"); f.back.classList.add("out"); setTimeout(function () { f.el.remove(); f.back.remove(); }, 160); }
  function floatPop(anchor, html, cls, onMount) {
    closeFP();
    var back = el("div", "fp-back"); document.body.appendChild(back);
    var box = el("div", "fp " + (cls || "")); box.innerHTML = html; document.body.appendChild(box);
    back.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); closeFP(); });
    back.addEventListener("touchend", function (e) { e.preventDefault(); closeFP(); });
    var kd = function (e) { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeFP(); } };
    document.addEventListener("keydown", kd, true);
    FP = { el: box, back: back, kd: kd };
    if (onMount) onMount(box);
    if (window.innerWidth < 600) box.classList.add("sheet");
    else {
      var r = anchor.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
      var left = r.right - w; left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      var top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      box.style.left = left + "px"; box.style.top = top + "px";
    }
    requestAnimationFrame(function () { box.classList.add("in"); });
    return box;
  }
  F.floatPop = floatPop; F.closeFP = closeFP;
  function fmtPick(d) { var dt = parse(d), o = { weekday: "short", day: "numeric", month: "long" }; if (dt.getFullYear() !== new Date().getFullYear()) o.year = "numeric"; return dt.toLocaleDateString("he-IL", o); }
  function datePop(anchor, val, onPick, opts) {
    opts = opts || {}; var cur = parse(val || today()); cur.setDate(1);
    var draw = function (box) {
      var ws = weekStart(iso(cur)), mo = cur.getMonth(), td = today();
      var n = (diffDays(ws, weekStart(iso(new Date(cur.getFullYear(), mo + 1, 0)))) / 7 + 1) * 7, cells = "";
      for (var i = 0; i < n; i++) {
        var d = addDays(ws, i), dt = parse(d), off = (opts.min && d < opts.min) || (opts.only && !opts.only[d]);
        cells += '<button type="button" class="dp-d ' + (dt.getMonth() !== mo ? "out" : "") + " " + (d === td ? "today" : "") + " " + (d === val ? "on" : "") + '" data-d="' + d + '" ' + (off ? "disabled" : "") + ">" + dt.getDate() + "</button>";
      }
      box.innerHTML = (opts.title ? '<h4 class="fp-title">' + esc(opts.title) + "</h4>" : "") +
        '<div class="dp-h"><button type="button" class="icon-btn" data-m="-1" aria-label="החודש הקודם">' + svg("prev") + "</button><b>" + esc(cur.toLocaleDateString("he-IL", { month: "long", year: "numeric" })) + '</b><button type="button" class="icon-btn" data-m="1" aria-label="החודש הבא">' + svg("next") + "</button></div>" +
        '<div class="dp-g"><i>א</i><i>ב</i><i>ג</i><i>ד</i><i>ה</i><i>ו</i><i>ש</i>' + cells + "</div>" +
        (opts.only ? "" : '<div class="dp-f"><button type="button" class="link" data-d="' + td + '">היום</button></div>');
    };
    floatPop(anchor, "", "dp", function (box) {
      draw(box);
      box.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b || b.disabled) return;
        if (b.dataset.m) { cur.setMonth(cur.getMonth() + (+b.dataset.m)); draw(box); return; }
        if (b.dataset.d) { closeFP(); onPick(b.dataset.d); }
      });
      var sx = null;
      box.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
      box.addEventListener("touchend", function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { cur.setMonth(cur.getMonth() + (dx > 0 ? 1 : -1)); draw(box); } }, { passive: true });
    });
  }
  function durLabel(d) { var h = Math.floor(d / 60), m = d % 60; if (!h) return m + " דק׳"; if (m) return h + ":" + pad(m) + " ש׳"; return h === 1 ? "שעה" : h === 2 ? "שעתיים" : h + " שעות"; }
  function timePop(anchor, cur, onPick, from) {
    var items = []; for (var x = (from != null ? from + 15 : 0); x < 1440; x += 15) items.push(x);
    if (from != null && !items.length) items.push(1439);
    var box = floatPop(anchor, '<div class="tp-list">' + items.map(function (v) { return '<button type="button" class="tp-i ' + (v === cur ? "on" : "") + '" data-m="' + v + '"><bdi dir="ltr">' + minToHm(v) + "</bdi>" + (from != null ? "<small>" + durLabel(v - from) + "</small>" : "") + "</button>"; }).join("") + "</div>", "tp", function (b) {
      b.addEventListener("click", function (e) { var t = e.target.closest("[data-m]"); if (t) { closeFP(); onPick(+t.dataset.m); } });
    });
    var list = box.querySelector(".tp-list"), best = null, bd = 1e9;
    Array.prototype.forEach.call(list.querySelectorAll("[data-m]"), function (b) { var dd = Math.abs(+b.dataset.m - cur); if (dd < bd) { bd = dd; best = b; } });
    if (best) list.scrollTop = best.offsetTop - list.clientHeight / 2 + best.offsetHeight / 2;
  }
  function menuPop(anchor, title, items, onPick) {
    floatPop(anchor, (title ? '<h4 class="fp-title">' + esc(title) + "</h4>" : "") + '<div class="fm-list">' + items.map(function (x) { return '<button type="button" class="fm-i ' + (x.on ? "on" : "") + '" data-v="' + esc(x.v) + '">' + (x.c ? '<i style="background:' + esc(x.c) + '"></i>' : "") + "<span>" + esc(x.l) + "</span>" + (x.on ? svg("check", 18) : "") + "</button>"; }).join("") + "</div>", "fm", function (b) {
      b.addEventListener("click", function (e) { var t = e.target.closest("[data-v]"); if (t) { closeFP(); onPick(t.dataset.v); } });
    });
  }
  /* A date field that opens the picker (the browser's own date input is not used anywhere). */
  function datePick(val, opts, onChange) {
    var b = el("button", "evc-pick d-pick"); b.type = "button"; b.dataset.v = val || "";
    var paintB = function () { b.textContent = b.dataset.v ? fmtPick(b.dataset.v) : (opts && opts.ph) || "בחירת תאריך"; b.classList.toggle("empty", !b.dataset.v); };
    paintB();
    b.addEventListener("click", function () { datePop(b, b.dataset.v || today(), function (d) { b.dataset.v = d; paintB(); if (onChange) onChange(d); }, opts); });
    b.val = function () { return b.dataset.v; };
    b.set = function (v) { b.dataset.v = v || ""; paintB(); };
    return b;
  }

  /* ---------- the org tree, as published by the sync job (id -> {n, r, m}) ---------- */
  var Org = F.Org = { map: {}, loaded: false };
  Org.virtual = {};
  Org.name = function (id) { var x = Org.map[id]; return x ? x.n : (id || "").replace(/@.*/, ""); };
  Org.seniors = function () { return Object.keys(Org.map).filter(function (k) { return Org.map[k].r === "מרכז בוגר"; }); };
  /* Who may approve someone's equipment: their direct manager and that person's manager; מרכז בוגר for מדריכי שכבה. */
  Org.approvers = function (uid) {
    var x = Org.map[uid] || { r: me.role, m: "" };
    if (x.r === "מדריך שכבה") return Org.seniors();
    var out = [], m1 = x.m, m2 = m1 && Org.map[m1] ? Org.map[m1].m : "";
    /* A direct manager who isn't registered yet: their own manager approves. */
    if (!m1 && x.mn && Org.virtual[x.mn]) return [Org.virtual[x.mn]];
    if (m1 && Org.map[m1]) out.push(m1);
    if (m2 && Org.map[m2] && out.indexOf(m2) === -1) out.push(m2);
    return out;
  };
  /* Only the direct manager gets the notification. */
  Org.notifyTo = function (uid) {
    var x = Org.map[uid] || { r: me.role, m: "" };
    if (x.r === "מדריך שכבה") return Org.seniors();
    if (!x.m && x.mn && Org.virtual[x.mn]) return [Org.virtual[x.mn]];
    return x.m && Org.map[x.m] ? [x.m] : [];
  };

  /* ---------- gadud / team list (kept by managers in the settings) ---------- */
  var Units = F.Units = { list: [] };
  F.isLead = isLead;
  /* Everyone outside צוות הובלה belongs to a gadud / team; they see each other's bookings and equipment requests. */
  F.myUnit = function () { return isLead() ? "" : (me.unit || ""); };
  F.sameUnit = function (u) { var m = F.myUnit(); return !!m && u === m; };
  Units.ask = function () {
    if (isLead() || me.unit || !Units.list.length || document.getElementById("pvOverlay")) return;
    var body = el("form", "eu-body"); body.noValidate = true;
    body.appendChild(el("p", "f-lead", "כדי שנמלא אותו בשבילך בשריונים ובציוד מרכז."));
    var sel = select([["", "בחירה מהרשימה…"]].concat(Units.list.map(function (u) { return [u, u]; })), "");
    body.appendChild(field("הגדוד / הצוות שלך", sel));
    var err = el("p", "eu-msg eu-err"); body.appendChild(err);
    var save = el("button", "btn primary small", "שמירה"); save.type = "submit";
    body.addEventListener("submit", async function (e) {
      e.preventDefault(); if (!sel.value) { err.textContent = "נא לבחור מהרשימה."; return; }
      save.disabled = true;
      try { await db.collection("users").doc(me.id).set({ unit: sel.value }, { merge: true }); me.unit = sel.value; if (window.state && state.profile) state.profile.unit = sel.value; closePreview(); toast("נשמר"); }
      catch (er) { err.textContent = "השמירה לא הצליחה."; save.disabled = false; }
    });
    var foot = el("div", "pv-foot eu-foot"); foot.appendChild(save); foot.appendChild(btn("אחר כך", "ghost small", function () { closePreview(); })); body.appendChild(foot);
    openModal({ title: "מה הגדוד / הצוות שלך?", body: body });
  };
  /* The gadud / team in a form: filled in by itself; צוות הובלה type it freely. */
  function unitField(val) {
    if (isLead()) return input("text", val || "", "");
    if (me.unit && (!val || val === me.unit)) { var d = el("output", "unit-fixed", me.unit); d.value = me.unit; return d; }
    return unitSelect(val);
  }
  function unitSelect(val) {
    var opts = [["", "בחירה…"]].concat(Units.list.map(function (u) { return [u, u]; }));
    if (val && Units.list.indexOf(val) === -1) opts.push([val, val]);
    var s = select(opts, val || me.unit || "");
    return s;
  }

  /* ---------- views and tab bar ---------- */
  var AREAS = [
    { key: "home", label: "בית", icon: "home" },
    { key: "cal", label: "לו״ז", icon: "cal" },
    { key: "book", label: "שריון מתחמים", icon: "flag" },
    { key: "gear", label: "ציוד מרכז", icon: "box" },
    { key: "reg", label: "רשומים", icon: "file" },
    { key: "links", label: "קישורים", icon: "link" },
    { key: "insights", label: "תובנות", icon: "chart", adminDesk: true },
    { key: "settings", label: "הגדרות", icon: "gear", bottom: true }
  ];
  function buildTabbar() {
    var nav = el("nav", "tabbar"); nav.setAttribute("aria-label", "אזורים");
    var brand = el("a", "tab-brand"); brand.href = "#home"; brand.setAttribute("aria-label", "פורום מוביל · לעמוד הבית"); brand.innerHTML = '<img src="logo.png?v=1" alt="" width="40" height="40" draggable="false"><div><b>פורום מוביל</b><small>שבט משואות</small></div>';
    nav.appendChild(brand);
    AREAS.forEach(function (a) {
      var t = el("a", "tab" + (a.bottom ? " tab-bottom" : "")); t.href = "#" + a.key; t.dataset.area = a.key;
      t.setAttribute("aria-label", a.label); t.title = a.label; t.draggable = false;
      t.innerHTML = svg(a.icon, 24) + '<span class="tl"></span><span class="bdg" hidden></span>';
      t.querySelector(".tl").textContent = a.label;
      if (a.adminDesk) t.hidden = true;
      nav.appendChild(t);
    });
    document.body.appendChild(nav);
  }
  F.badge = function (area, n, dot) {
    var b = document.querySelector('.tab[data-area="' + area + '"] .bdg'); if (!b) return;
    b.hidden = !n; b.classList.toggle("dot", !!dot); b.textContent = dot ? "" : n > 9 ? "9+" : String(n || "");
  };
  function head(view, title, extra) {
    var h = el("header", "fv-head");
    /* The logo takes you home. */
    var la = el("a", "fv-logo-a"); la.href = "#home"; la.setAttribute("aria-label", "לעמוד הבית");
    var logo = el("img", "fv-logo"); logo.src = "logo.png?v=1"; logo.alt = ""; logo.draggable = false; la.appendChild(logo); h.appendChild(la);
    h.appendChild(el("h1", "", title));
    if (extra) h.appendChild(extra);
    view.appendChild(h);
    return h;
  }
  function makeView(id, before) {
    var v = el("div", "view fv"); v.id = id; v.hidden = true;
    $("app").insertBefore(v, before || $("viewSettings"));
    return v;
  }
  F.viewFor = { home: "viewHome", cal: "viewCal", book: "viewBook", gear: "viewGear", links: "viewLinks", reg: "viewMain", settings: "viewSettings", insights: "viewInsights" };
  F.init = function () {
    document.documentElement.setAttribute("data-theme", "light");
    buildTabbar();
    Home.view = makeView("viewHome", $("viewMain"));
    Cal.view = makeView("viewCal", $("viewMain"));
    Book.view = makeView("viewBook", $("viewMain"));
    Gear.view = makeView("viewGear", $("viewMain"));
    Links.view = makeView("viewLinks");
    Ins.view = makeView("viewInsights");
    /* The reports area and the settings get the same header as the other areas. */
    var main = $("viewMain"), tmp = el("div"); head(tmp, "רשומים"); main.insertBefore(tmp.firstChild, main.firstChild);
    var sv = $("viewSettings"), tmp2 = el("div"); head(tmp2, "הגדרות"); sv.insertBefore(tmp2.firstChild, sv.firstChild);
    /* No dark mode and no "share the site" in the settings. */
    var th = $("themeSeg"); if (th) { var card = th.closest(".card"); if (card) { card.classList.add("f-hide"); var t1 = card.previousElementSibling; if (t1 && t1.tagName === "H2") t1.classList.add("f-hide"); } }
    var sc = $("shareCard"); if (sc) { var t2 = sc.previousElementSibling; if (t2 && t2.tagName === "H2") t2.classList.add("f-hide"); }
    var set = $("settingsBody");
    if (set) {
      var lo = btn("התנתקות", "ghost small set-logout", function () { location.hash = ""; auth.signOut(); });
      var ver = set.querySelector("p.version"), foot = el("div", "set-foot");
      var help = ver && ver.previousElementSibling && ver.previousElementSibling.classList.contains("note") ? ver.previousElementSibling : null;
      set.insertBefore(foot, ver || null);
      if (help) foot.appendChild(help); foot.appendChild(lo); if (ver) foot.appendChild(ver);
      Settings.box = el("div", "set-extra"); var us = $("usersSection"); set.insertBefore(Settings.box, us ? us.nextSibling : ver);
    }
    /* "new report" markers drive the dot on רשומים */
    if (typeof window.renderSaved === "function") {
      var orig = window.renderSaved;
      window.renderSaved = function () { orig.apply(this, arguments); F.regBadge(); };
    }
    var rz = null;
    /* On a phone the height changes all the time (the browser bars hide and show): then only fit the calendar again. */
    var lastW = window.innerWidth;
    window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () {
      var wch = window.innerWidth !== lastW; lastW = window.innerWidth;
      F.syncTabs();
      if (F.area === "cal" && Cal.loaded) { if (wch && !Cal.dragging()) Cal.render(true); else Cal.fit(); }
      if (F.area === "home" && wch) Home.render();
    }, 120); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && me.id && F.area === "home") Home.render(); });
  };
  F.regBadge = function () {
    var n = document.querySelectorAll("#savedList .tag.new").length;
    F.newReports = n;
    F.badge("reg", F.area === "reg" ? 0 : n, true);
    if (F.area === "home") Home.render();
  };
  F.syncTabs = function () {
    var t = document.querySelector('.tab[data-area="insights"]');
    if (t) t.hidden = !(me.admin && window.innerWidth >= 900);
  };
  F.area = ""; F.lastArea = "home";
  F.show = function (area) {
    if (area === "insights" && me.id && !(me.admin && window.innerWidth >= 900)) { location.replace("#home"); return; }
    if (area !== "settings") F.lastArea = area;
    F.area = area;
    document.body.dataset.area = area;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { var on = t.dataset.area === area; t.classList.toggle("on", on); if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
    var fab = $("calFab"); if (fab) fab.hidden = area !== "cal" || !can.editCal();
    if (!me.id) return;
    logView(area);
    if (area === "home") Home.render();
    if (area === "cal") Cal.open();
    if (area === "book") Book.open();
    if (area === "gear") Gear.open();
    if (area === "links") Links.open();
    if (area === "insights") Ins.open();
    if (area === "reg") F.badge("reg", 0);
    if (area === "settings") Settings.open();
  };
  var viewed = {};
  function logView(area) {
    try {
      if (window.IS_TEST || viewed[area]) return; viewed[area] = 1;
      var day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" }), data = { email: me.id, day: day, areas: {} };
      data.areas[area] = firebase.firestore.FieldValue.increment(1);
      db.collection("usage").doc(me.id + "_" + day).set(data, { merge: true }).catch(function () {});
    } catch (e) {}
  }
  F.onUser = function (user, isAdmin, profile) {
    document.body.classList.toggle("signed", !!user);
    if (!user) { me = { id: "", name: "", fullName: "", role: "", unit: "", admin: false }; F.stopAll(); return; }
    profile = profile || {};
    me = { id: (user.email || "").toLowerCase(), name: profile.name || "", fullName: profile.fullName || "", role: profile.role || "", unit: profile.unit || "", admin: !!isAdmin };
    F.syncTabs();
    F.startAll();
    F.show(F.area || "home");
    setTimeout(function () { if (!me.unit && me.role) Units.ask(); }, 2500);
  };
  /* Everything loads once at sign-in and then stays live, so moving between areas is instant. */
  var subs = [];
  F.listen = function (unsub) { subs.push(unsub); return unsub; };
  F.stopAll = function () { subs.forEach(function (u) { try { u(); } catch (e) {} }); subs = []; [Cal, Book, Gear, Links].forEach(function (m) { m.loaded = false; }); };
  F.startAll = function () {
    F.stopAll();
    F.listen(db.collection("config").doc("org").onSnapshot(function (s) { Org.virtual = (s.exists && s.data().virtualManagers) || {}; }, function () {}));
    F.listen(db.collection("org").doc("tree").onSnapshot(function (s) { Org.map = (s.exists && s.data().map) || {}; Org.loaded = true; Gear.changed(); }, function () { Org.loaded = true; }));
    F.listen(db.collection("public").doc("units").onSnapshot(function (s) { Units.list = (s.exists && s.data().list) || []; if (F.area === "settings") Settings.render(); }, function () {}));
    Cal.start(); Book.start(); Gear.start(); Links.start();
    /* Reports: reload the list when a new report is published. */
    var first = true;
    F.listen(db.collection("factories").orderBy("updatedAt", "desc").limit(1).onSnapshot(function () { if (first) { first = false; return; } if (typeof window.loadSaved === "function") window.loadSaved(); }, function () {}));
  };
  F.refresh = function () { return Promise.resolve(); };

  /* ======================================================================
     Home: an overview of the other areas (like the home page of גאנט׳)
     ====================================================================== */
  var Home = F.Home = {};
  function greeting() { var h = new Date().getHours(); return h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 22 ? "ערב טוב" : "לילה טוב"; }
  Home.render = function () {
    var v = Home.view; if (!v || !me.id) return;
    v.textContent = "";
    var h = el("header", "home-head");
    var logo = el("img", "fv-logo"); logo.src = "logo.png?v=1"; logo.alt = ""; logo.draggable = false; h.appendChild(logo);
    var t = el("div", "home-t"); t.appendChild(el("h1", "", greeting() + ", " + (me.name || myName().split(" ")[0]) + " 👋"));
    t.appendChild(el("p", "", longDate(today())));
    h.appendChild(t); v.appendChild(h);
    // KPI cards
    var td = today(), wk = addDays(td, 7);
    var myBk = Book.list.filter(function (b) { return b.uid === me.id && b.date >= td; });
    var missing = myBk.filter(Book.missingBoger).length;
    var gearNote = Gear.attention();
    var evWeek = Cal.loaded ? Cal.visible().filter(function (e) { return e.date <= wk && (e.end || e.date) >= td; }).length : 0;
    var k = el("div", "kpis");
    function kpi(n, label, color, area, sub) { var b = el("a", "kpi"); b.href = "#" + area; b.style.setProperty("--kc", color); b.appendChild(el("b", "", String(n))); b.appendChild(el("span", "", label)); if (sub) b.appendChild(el("small", "", sub)); k.appendChild(b); }
    kpi(evWeek, "אירועים בשבוע הקרוב", "var(--accent)", "cal");
    kpi(myBk.length, "השריונים שלי", "#579bfc", "book", missing ? missing + " חסרי בוגר" : "");
    kpi(gearNote.n, gearNote.label, gearNote.n ? "#e2445c" : "#00c875", "gear");
    kpi(F.newReports || 0, "דוחות חדשים", "#a25ddc", "reg");
    v.appendChild(k);
    if (Cal.loaded) v.appendChild(Cal.homeWidget());
    // My upcoming bookings + equipment
    var grid = el("div", "home-grid");
    var p1 = el("section", "panel"); p1.appendChild(panelHead("השריונים הקרובים שלי", "book", "flag"));
    if (!myBk.length) p1.appendChild(el("p", "muted-empty", "אין לך שריונים קרובים."));
    myBk.sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(0, 4).forEach(function (b) {
      var r = el("a", "home-row"); r.href = "#book";
      r.appendChild(el("b", "", shortDate(b.date)));
      var tx = el("span", "", Book.placeName(b) + " · " + (b.text || "")); r.appendChild(tx);
      if (Book.missingBoger(b)) r.appendChild(el("em", "miss", "חסר בוגר"));
      p1.appendChild(r);
    });
    var p2 = el("section", "panel"); p2.appendChild(panelHead("ציוד מרכז", "gear", "box"));
    var mine = Gear.list.filter(function (g) { return g.uid === me.id && g.date >= addDays(td, -7) && !g.dismissed; }).slice(0, 4);
    var toApprove = Gear.list.filter(function (g) { return g.status === "pending" && Gear.canApprove(g); }).length;
    if (toApprove) { var a = el("a", "home-row hot"); a.href = "#gear"; a.appendChild(el("b", "", String(toApprove))); a.appendChild(el("span", "", toApprove === 1 ? "בקשה אחת מחכה לאישור שלך" : "בקשות מחכות לאישור שלך")); p2.appendChild(a); }
    if (!mine.length && !toApprove) p2.appendChild(el("p", "muted-empty", "אין בקשות ציוד פתוחות."));
    mine.forEach(function (g) {
      var r = el("a", "home-row"); r.href = "#gear";
      r.appendChild(el("b", "", shortDate(g.date)));
      r.appendChild(el("span", "", (g.items || []).length + " פריטים"));
      r.appendChild(el("em", "st " + g.status, Gear.ST[g.status] || ""));
      p2.appendChild(r);
    });
    grid.appendChild(p1); grid.appendChild(p2);
    v.appendChild(grid);
  };
  function panelHead(title, area, icon) {
    var h = el("div", "panel-h"); var t = el("h2"); t.innerHTML = svg(icon, 18); t.appendChild(document.createTextNode(title)); h.appendChild(t);
    var a = el("a", "link", "לכל ה" + (area === "book" ? "שריונים" : "בקשות")); a.href = "#" + area; h.appendChild(a);
    return h;
  }

  /* ======================================================================
     לו״ז — the calendar of גאנט׳, on the tribe's Excel schedule.
     Changes are written to cal_ops; the sync job puts them in the Excel within seconds,
     and everyone sees them right away (pending changes are merged into the view).
     ====================================================================== */
  var Cal = F.Cal = { events: [], cats: [], ops: [], loaded: false, st: { view: "month", date: today(), tgKey: null, tgTop: null } };
  var CAL_VIEWS = [["month", "חודש"], ["week", "שבוע"], ["day", "יום"], ["agenda", "רשימה"]];
  function calDoc() { return me.admin ? "all" : "v_" + (ROLE_KEY[me.role] || "none"); }
  Cal.start = function () {
    var got = 0, ready = function () { if (++got >= 2 && !Cal.loaded) { Cal.loaded = true; Cal.changed(); } };
    F.listen(db.collection("cal").doc(calDoc()).onSnapshot(function (s) {
      var d = s.exists ? s.data() : {};
      try { Cal.events = d.events ? JSON.parse(d.events) : []; } catch (e) { Cal.events = []; }
      Cal.cats = d.cats || [];
      Cal.empty = !s.exists; Cal.error = false;
      if (Cal.loaded) Cal.changed(); else ready();
    }, function () { Cal.error = true; ready(); }));
    F.listen(db.collection("cal_ops").where("state", "==", "pending").onSnapshot(function (s) {
      var list = []; s.forEach(function (d) { var o = d.data(); o.id = d.id; list.push(o); });
      Cal.ops = list;
      if (Cal.loaded) Cal.changed(); else ready();
    }, function () { Cal.ops = []; ready(); }));
  };
  Cal.changed = function () {
    Cal._all = null;
    if (F.area === "cal" && Cal.built) { if (!Cal.dragging()) Cal.render(true); else { Cal.renderPending = true; (function retry() { setTimeout(function () { if (Cal.dragging()) return retry(); if (Cal.renderPending) { Cal.renderPending = false; Cal.render(true); } }, 600); })(); } }
    if (F.area === "home") Home.render();
    if (F.area === "book" && Book.built) Book.render();
  };
  Cal.open = function () { if (!Cal.built) Cal.build(); Cal.render(); };
  Cal.catColor = function (name) { var c = Cal.cats.filter(function (x) { return x.name === name; })[0]; return c ? c.color : ""; };
  /* The events as shown: the Excel's events plus the changes that are on their way to it. */
  Cal.visible = function () {
    var allowed = {}; Cal.cats.forEach(function (c) { allowed[c.name] = 1; });
    var byId = {}, out = Cal.events.map(function (e) { var c = Object.assign({}, e); byId[c.id] = c; return c; });
    Cal.ops.slice().sort(function (a, b) { return (a.atMs || 0) - (b.atMs || 0); }).forEach(function (o) {
      if (o.kind === "add") { out.push({ id: "op:" + o.id, opId: o.id, pend: "add", title: o.title, time: o.time || "", timeEnd: o.timeEnd || "", date: o.date, end: o.end || o.date, cat: o.cat || "", color: o.color || "" }); return; }
      var e = byId[o.target]; if (!e) return;
      if (o.kind === "delete") { e.hide = true; return; }
      ["title", "time", "timeEnd", "cat", "color"].forEach(function (k) { if (o[k] != null) e[k] = o[k]; });
      if (o.kind === "move") { e.date = o.date; e.end = o.end || o.date; }
      e.pend = o.kind; e.opId = o.id;
    });
    return out.filter(function (e) { return !e.hide && (!e.cat || allowed[e.cat] || me.admin); });
  };
  F.isActivity = function (e) { return !!e.act || /^פעול/.test(String(e.title || "").trim()); };
  F.activityDates = function () { var set = {}; Cal.visible().forEach(function (e) { if (F.isActivity(e)) set[e.date] = true; }); Book.list.forEach(function (b) { set[b.date] = true; }); return Object.keys(set).sort(); };
  F.activityOnly = function () { var set = {}; Cal.visible().forEach(function (e) { if (F.isActivity(e)) set[e.date] = true; }); return set; };

  /* Events in the shape the גאנט׳ calendar code works with: a = all day (sd..ed, ed exclusive), or s/e times. */
  function atMin(d, m) { var x = parse(d); x.setHours(0, m, 0, 0); return x.getTime(); }
  function calAll() {
    if (Cal._all) return Cal._all;
    Cal._all = Cal.visible().map(function (e, i) {
      var g = { t: e.title, src: e, idx: i, p: false, cat: e.cat, col: e.color || Cal.catColor(e.cat) };
      var m0 = hmToMin(e.time);
      if (m0 == null) { g.a = true; g.sd = e.date; g.ed = addDays(e.end || e.date, 1); }
      else {
        g.a = false; g.s = atMin(e.date, m0);
        var m1 = hmToMin(e.timeEnd), endDay = e.end || e.date;
        g.e = m1 != null ? atMin(endDay, m1) : g.s + 3600000;
        if (g.e <= g.s) g.e = endDay !== e.date ? atMin(endDay, 1439) : g.s + 3600000;
      }
      return g;
    });
    return Cal._all;
  }
  function evColor(e) { return "#" + String(e.col || "C9CED6").replace("#", ""); }
  function inkOn(hex) { return inkFor(hex); }
  function ymd(d) { return iso(d); }
  function hm(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function calEventsByDay(fromDay, days) {
    var out = {}, add = function (d, o) { (out[d] = out[d] || []).push(o); }, toDay = addDays(fromDay, days);
    calAll().forEach(function (ev, idx) {
      if (ev.a) { if (!(ev.sd < toDay && ev.ed > fromDay)) return; var d = ev.sd < fromDay ? fromDay : ev.sd, n = 0; while (d < ev.ed && d < toDay && n < 120) { add(d, Object.assign({}, ev, { idx: idx, allDay: true, cont: d !== ev.sd })); d = addDays(d, 1); n++; } }
      else {
        var s = new Date(ev.s), e = new Date(ev.e), sd = ymd(s), last = ymd(new Date(Math.max(ev.s, ev.e - 1)));
        if (!(sd < toDay && last >= fromDay)) return; var d2 = sd < fromDay ? fromDay : sd, k = 0;
        while (d2 <= last && d2 < toDay && k < 120) { var first = d2 === sd, fin = d2 === last;
          add(d2, Object.assign({}, ev, { idx: idx, allDay: false, cont: !first, tEnd: e, m0: first ? s.getHours() * 60 + s.getMinutes() : 0, m1: fin ? Math.max((e.getHours() * 60 + e.getMinutes()) || 1440, 1) : 1440 })); d2 = addDays(d2, 1); k++; }
      }
    });
    Object.keys(out).forEach(function (k) { out[k].sort(function (x, y) { return (x.allDay === y.allDay ? 0 : x.allDay ? -1 : 1) || ((x.m0 || 0) - (y.m0 || 0)) || ((x.s || 0) - (y.s || 0)); }); });
    return out;
  }
  function calTitle() {
    var st = Cal.st, d = parse(st.date);
    if (st.view === "month") return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    if (st.view === "day") return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
    if (st.view === "week") { var a = parse(weekStart(st.date)), b = parse(addDays(weekStart(st.date), 6));
      return a.getMonth() === b.getMonth() ? a.getDate() + "–" + b.getDate() + " ב" + b.toLocaleDateString("he-IL", { month: "long" }) + " " + b.getFullYear() : a.toLocaleDateString("he-IL", { day: "numeric", month: "short" }) + " – " + b.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }); }
    return "הלו״ז הקרוב";
  }
  function calPeriodKey(d) { var v = Cal.st.view; return v === "month" ? d.slice(0, 7) : v === "week" ? weekStart(d) : v === "day" ? d : "agenda"; }
  function calShift(dir) {
    var d = parse(Cal.st.date), v = Cal.st.view;
    if (v === "month") { d.setDate(1); d.setMonth(d.getMonth() + dir); } else d.setDate(d.getDate() + dir * (v === "week" ? 7 : v === "day" ? 1 : 30));
    Cal.st.date = ymd(d); Cal.render();
  }
  function evChip(e, mode) {
    var c = evColor(e), time = e.allDay || e.cont ? "" : '<span class="ct" dir="ltr">' + hm(e.s) + "</span> ";
    return '<button class="cv-chip ' + (e.allDay ? "ad" : "tm") + " " + (mode || "") + '" data-act="calev" data-i="' + e.idx + '" style="--cc:' + esc(c) + ";--ci:" + inkOn(c) + '"><span>' + time + esc(e.t) + "</span></button>";
  }
  function spanEvents() {
    var out = [];
    calAll().forEach(function (ev, idx) { var sd, ld;
      if (ev.a) { sd = ev.sd; ld = addDays(ev.ed, -1); } else { if (!(ev.e - ev.s >= 864e5)) return; sd = ymd(new Date(ev.s)); ld = ymd(new Date(ev.e - 1)); }
      if (sd && ld && ld > sd) out.push({ ev: ev, idx: idx, sd: sd, ld: ld }); });
    return out;
  }
  function weekBars(ws, n, spans) {
    var we = addDays(ws, n - 1);
    var segs = spans.filter(function (x) { return x.sd <= we && x.ld >= ws; }).map(function (x) { var a = x.sd < ws ? ws : x.sd, b = x.ld > we ? we : x.ld; return Object.assign({}, x, { c0: diffDays(ws, a), sp: diffDays(a, b) + 1, cl: x.sd < ws, cr: x.ld > we }); })
      .sort(function (p, q) { return p.c0 - q.c0 || q.sp - p.sp || String(p.ev.t).localeCompare(String(q.ev.t)); });
    var lanes = []; segs.forEach(function (g) { var l = lanes.findIndex(function (end) { return end < g.c0; }); if (l < 0) { l = lanes.length; lanes.push(-1); } lanes[l] = g.c0 + g.sp - 1; g.ln = l; });
    var depth = []; for (var i = 0; i < n; i++) depth.push(0);
    segs.forEach(function (g) { for (var k = g.c0; k < g.c0 + g.sp; k++) depth[k] = Math.max(depth[k], g.ln + 1); });
    return { segs: segs, depth: depth };
  }
  function barHtml(g) {
    var c = evColor(g.ev);
    return '<button class="cv-chip ad cv-bar ' + (g.cl ? "cl" : "") + " " + (g.cr ? "cr" : "") + '" data-act="calev" data-i="' + g.idx + '" style="--c0:' + g.c0 + ";--sp:" + g.sp + ";--ln:" + g.ln + ";--cc:" + esc(c) + ";--ci:" + inkOn(c) + '"><span>' + esc(g.ev.t) + "</span></button>";
  }
  function calMonth() {
    var first = parse(Cal.st.date); first.setDate(1);
    var start = weekStart(ymd(first)), month = first.getMonth(), td = today();
    var last = new Date(first.getFullYear(), month + 1, 0), N = Math.round((parse(weekStart(ymd(last))) - parse(start)) / 864e5) / 7 + 1, NN = N * 7;
    var spans = spanEvents(), spanIdx = {}; spans.forEach(function (x) { spanIdx[x.idx] = 1; });
    var ev = calEventsByDay(start, NN), weeks = "";
    for (var w = 0; w < N; w++) {
      var ws = addDays(start, w * 7), wb = weekBars(ws, 7, spans), cells = "";
      for (var k = 0; k < 7; k++) {
        var d = addDays(ws, k), dt = parse(d), items = (ev[d] || []).filter(function (e) { return !spanIdx[e.idx]; }).map(function (e) { return evChip(e, "m"); });
        cells += '<div class="cv-cell ' + (dt.getMonth() !== month ? "out" : "") + " " + (d === td ? "today" : "") + '" data-act="calday" data-d="' + d + '"><span class="cv-num">' + dt.getDate() + '</span><div class="cv-items" data-n="' + items.length + '">' + (wb.depth[k] ? '<i class="cv-sp" style="--n:' + wb.depth[k] + '"></i>' : "") + items.slice(0, 10).join("") + "</div></div>";
      }
      weeks += '<div class="cv-wk">' + cells + (wb.segs.length ? '<div class="cv-bars">' + wb.segs.map(barHtml).join("") + "</div>" : "") + "</div>";
    }
    return '<div class="cv-month"><div class="cv-wd">' + DAYS_S.map(function (x) { return "<span>" + x + "</span>"; }).join("") + '</div><div class="cv-grid" style="--rows:' + N + '">' + weeks + "</div></div>";
  }
  function layoutDay(segs) {
    var ev = segs.filter(function (e) { return !e.allDay; }).map(function (e) { return { e: e, a: e.m0, b: Math.max(e.m1, e.m0 + 20) }; }).sort(function (x, y) { return x.a - y.a || y.b - x.b; });
    var cluster = [], end = -1, out = [];
    var flush = function () { var cols = []; cluster.forEach(function (it) { var c = cols.findIndex(function (lastB) { return lastB <= it.a; }); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = it.b; it.col = c; }); cluster.forEach(function (it) { it.n = cols.length; out.push(it); }); cluster = []; };
    ev.forEach(function (it) { if (it.a >= end && cluster.length) flush(); cluster.push(it); end = Math.max(end, it.b); });
    if (cluster.length) flush();
    return out;
  }
  function tgTime(e) { var L = function (t) { return '<bdi dir="ltr">' + t + "</bdi>"; }, end = e.m1 < 1440;
    if (!e.cont) return end ? L(hm(e.s) + "–" + hm(e.e)) : "מ־" + L(hm(e.s));
    return end ? "עד " + L(hm(e.e)) : "כל היום"; }
  function tgHH() { return Cal.hh || (window.innerWidth <= 600 ? 34 : 42); }
  function calTimeGrid(days) {
    var start = Cal.st.view === "week" ? weekStart(Cal.st.date) : Cal.st.date, td = today();
    var ev = calEventsByDay(start, days), HH = tgHH(), ds = [];
    for (var i = 0; i < days; i++) ds.push(addDays(start, i));
    var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    var head = ds.map(function (d) { var dt = parse(d); return '<button class="tg-dh ' + (d === td ? "today" : "") + '" data-act="calday" data-d="' + d + '"><small>' + DAYS_S[dt.getDay()] + "</small><b>" + dt.getDate() + "</b></button>"; }).join("");
    var spans = spanEvents().filter(function (x) { return x.ev.a; }), spanIdx = {}; spans.forEach(function (x) { spanIdx[x.idx] = 1; });
    var wb = weekBars(start, days, spans);
    var allday = ds.map(function (d, k) { return '<div class="tg-ad" data-d="' + d + '">' + (wb.depth[k] ? '<i class="cv-sp" style="--n:' + wb.depth[k] + '"></i>' : "") + (ev[d] || []).filter(function (e) { return e.allDay && !spanIdx[e.idx]; }).map(function (e) { return evChip(e, "ad"); }).join("") + "</div>"; }).join("");
    var hasAll = wb.segs.length > 0 || ds.some(function (d) { return (ev[d] || []).some(function (e) { return e.allDay; }); });
    var edit = can.editCal();
    var cols = ds.map(function (d) { var lay = layoutDay((ev[d] || []).filter(function (e) { return !spanIdx[e.idx]; }));
      return '<div class="tg-col ' + (d === td ? "today" : "") + '" ' + (edit ? 'data-act="calslot" ' : "") + 'data-d="' + d + '">' + lay.map(function (it) { var e = it.e, c = evColor(e), top = it.a / 60 * HH, h = Math.max((it.b - it.a) / 60 * HH - 2, 18), w = 100 / it.n;
        return '<button class="tg-ev ' + (h < 26 ? "short" : "") + '" data-act="calev" data-i="' + e.idx + '" ' + (e.cont || e.m1 === 1440 && !e.allDay ? 'data-c="1"' : "") + ' style="top:' + top + "px;height:" + h + "px;inset-inline-start:calc(" + (it.col * w) + "% + 1px);width:calc(" + w + "% - 3px);--cc:" + esc(c) + ";--ci:" + inkOn(c) + '"><b>' + esc(e.t) + "</b><small>" + tgTime(e) + "</small></button>"; }).join("") +
        (d === td ? '<i class="tg-now" style="top:' + (nowMin / 60 * HH) + 'px"></i>' : "") + "</div>"; }).join("");
    var hours = ""; for (var h = 0; h < 24; h++) hours += '<span style="top:' + (h * HH) + 'px">' + (h ? pad(h) + ":00" : "") + "</span>";
    return '<div class="tg ' + (days === 1 ? "one" : "") + '" style="--days:' + days + ";--hh:" + HH + 'px"><div class="tg-head"><span class="tg-gut"></span>' + head + "</div>" +
      (hasAll ? '<div class="tg-allrow"><span class="tg-gut">כל היום</span>' + allday + (wb.segs.length ? '<div class="tg-bars">' + wb.segs.map(barHtml).join("") + "</div>" : "") + "</div>" : "") +
      '<div class="tg-scroll" id="tgscroll"><div class="tg-body"><div class="tg-hours">' + hours + '</div><div class="tg-cols">' + cols + "</div></div></div></div>";
  }
  function calAgenda() {
    var DAYSN = 45, from = Cal.st.date, ev = calEventsByDay(from, DAYSN), now = Date.now();
    var days = Object.keys(ev).sort();
    if (!days.length) return '<div class="empty-state"><h3>אין כלום בתקופה הזו</h3><p>אירועים יופיעו כאן.</p></div>';
    var dayHead = function (d) { var n = diffDays(today(), d), dt = parse(d), wd = dt.toLocaleDateString("he-IL", { weekday: "long" }), dm = dt.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
      return '<div class="cal-dh ' + (n === 0 ? "today" : "") + '"><b>' + (n === 0 ? "היום" : n === 1 ? "מחר" : wd) + "</b><span>" + (n === 0 || n === 1 ? wd + ", " : "") + dm + "</span></div>"; };
    return '<div class="cal-agenda">' + days.map(function (d) { return '<section class="cal-day">' + dayHead(d) + '<div class="cal-items">' + ev[d].map(function (e) {
      var past = !e.allDay && e.tEnd && e.tEnd.getTime() < now, c = evColor(e);
      var time = e.allDay ? "כל היום" : e.cont ? "המשך" : '<span dir="ltr">' + hm(e.s) + "–" + hm(e.e) + "</span>";
      return '<button class="cal-ev ' + (past ? "past" : "") + '" data-act="calev" data-i="' + e.idx + '" style="--cc:' + esc(c) + '"><span class="cal-t">' + time + '</span><span class="cal-b"><b>' + esc(e.t) + "</b>" + (e.cat ? "<small>" + esc(e.cat) + "</small>" : "") + "</span></button>"; }).join("") + "</div></section>"; }).join("") + "</div>";
  }

  Cal.build = function () {
    Cal.built = true;
    var v = Cal.view;
    Cal.top = el("div", "cv-top"); v.appendChild(Cal.top);
    Cal.body = el("div", "cv-body"); v.appendChild(Cal.body);
    var fab = el("button", "cal-fab"); fab.id = "calFab"; fab.type = "button"; fab.dataset.act = "calnew"; fab.innerHTML = svg("plus", 24) + "<span>אירוע חדש</span>"; fab.hidden = !can.editCal();
    fab.setAttribute("aria-label", "אירוע חדש");
    document.body.appendChild(fab);
    fab.addEventListener("click", function (e) { Cal.act(e, fab); });
    v.addEventListener("click", function (e) { var a = e.target.closest("[data-act]"); if (a && v.contains(a)) Cal.act(e, a); });
  };
  Cal.render = function (still) {
    if (!Cal.built) return;
    Cal._all = null;
    var st = Cal.st;
    var k = st.view + "|" + calPeriodKey(st.date); still = still || Cal.lastKey === k; Cal.lastKey = k;
    Cal.top.innerHTML = '<div class="cv-nav"><button class="cv-today" data-act="caltoday">היום</button><button class="icon-btn" data-act="calprev" aria-label="הקודם">' + svg("prev") + '</button><button class="icon-btn" data-act="calnext" aria-label="הבא">' + svg("next") + '</button><h1 class="cv-title">' + esc(calTitle()) + "</h1></div>" +
      '<div class="seg cv-seg" role="tablist">' + CAL_VIEWS.map(function (x) { return '<button class="seg-b ' + (st.view === x[0] ? "on" : "") + '" data-act="calview" data-v="' + x[0] + '" role="tab" aria-selected="' + (st.view === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      '<button class="icon-btn cv-info" data-act="calinfo" aria-label="מקרא הקטגוריות" title="מקרא הקטגוריות">' + svg("info", 22) + "</button>";
    if (!Cal.loaded) { Cal.body.innerHTML = '<div class="cv-loading"><span class="spin-dot"></span></div>'; return; }
    if (Cal.error) { Cal.body.innerHTML = '<div class="empty-state"><h3>אין הרשאה לקרוא את הלו״ז</h3></div>'; return; }
    var body = st.view === "month" ? calMonth() : st.view === "week" ? calTimeGrid(7) : st.view === "day" ? calTimeGrid(1) : calAgenda();
    Cal.body.className = "cv-body cv-" + st.view + (still ? " still" : "");
    Cal.body.innerHTML = body;
    afterCalendarRender();
  };
  /* While an event is held or dragged the calendar must not be drawn again (it would drop the drag). */
  Cal.dragging = function () { return !!(DD.active || MV.active || TGD.active || DD.pend || MV.pend || (TGD.touch && TGD.col) || (typeof MC !== "undefined" && (MC.active || MC.c0))); };
  Cal.fit = function () { if (!Cal.dragging()) calFit(); };
  function calFit() {
    var elx = Cal.body.querySelector(".cv-grid") || document.getElementById("tgscroll"); if (!elx) return;
    var bar = document.querySelector(".tabbar"), wide = window.innerWidth >= 900;
    var bottom = (!wide && bar ? bar.offsetHeight : 0) + (wide ? 22 : 10);
    var top = elx.getBoundingClientRect().top + (document.scrollingElement ? document.scrollingElement.scrollTop : 0) + (document.body.scrollTop || 0);
    var h = Math.floor(window.innerHeight - top - bottom - 2);
    var isGrid = elx.classList.contains("cv-grid");
    elx.style.height = Math.max(isGrid ? (window.innerWidth <= 600 ? 52 : 70) * (+elx.style.getPropertyValue("--rows") || 5) : 220, h) + "px";
    if (isGrid) fitMonthCells();
    else {
      /* week / day: 10:00–22:00 fill the visible height */
      var want = Math.max(26, Math.floor((elx.clientHeight - 4) / 12));
      if (Math.abs(want - tgHH()) >= 1 && !calFit.busy && !Cal.dragging()) { Cal.hh = want; calFit.busy = true; Cal.st.tgKey = null; Cal.render(true); calFit.busy = false; }
    }
  }
  /* Month view: nothing may be cut in half. Bars and chips that don't fit are hidden and counted in "+N" of their day. */
  function fitMonthCells() {
    var mob = window.innerWidth <= 600;
    Array.prototype.forEach.call(Cal.body.querySelectorAll(".cv-wk"), function (wk) {
      var cs = getComputedStyle(wk), bt = parseFloat(cs.getPropertyValue("--bt")) || 29, bl = parseFloat(cs.getPropertyValue("--bl")) || 22;
      var cells = Array.prototype.slice.call(wk.querySelectorAll(".cv-cell")), bars = Array.prototype.slice.call(wk.querySelectorAll(".cv-bar"));
      bars.forEach(function (b) { b.hidden = false; });
      var rowH = wk.clientHeight, moreH = mob ? 14 : 17;
      var lanesAll = Math.floor((rowH - bt - 3) / bl), lanesMore = Math.max(0, Math.floor((rowH - bt - 3 - moreH) / bl));
      var depth = cells.map(function (c) { var sp = c.querySelector(".cv-sp"); return sp ? +sp.style.getPropertyValue("--n") || 0 : 0; });
      var hiddenBars = cells.map(function () { return 0; });
      var maxDepth = Math.max.apply(null, depth.concat([0]));
      var lim = maxDepth <= lanesAll ? lanesAll : lanesMore;
      bars.forEach(function (b) {
        var ln = +b.style.getPropertyValue("--ln"), c0 = +b.style.getPropertyValue("--c0"), sp = +b.style.getPropertyValue("--sp");
        if (ln >= lim) { b.hidden = true; for (var k = c0; k < c0 + sp && k < 7; k++) hiddenBars[k]++; }
      });
      cells.forEach(function (cell, k) {
        var box = cell.querySelector(".cv-items"); if (!box) return;
        var old = box.querySelector(".cv-more"); if (old) old.remove();
        var spEl = box.querySelector(".cv-sp"); if (spEl) spEl.style.height = "calc(" + Math.min(depth[k], lim) + " * var(--bl) - 2px)";
        var chips = Array.prototype.filter.call(box.children, function (c) { return !c.classList.contains("cv-sp"); }); chips.forEach(function (c) { c.hidden = false; });
        var dataN = +box.dataset.n || chips.length, shown = chips.length;
        var hid = function () { return dataN - shown + hiddenBars[k]; };
        var fits = function () { return cell.scrollHeight <= cell.clientHeight + 1; };
        if (fits() && !hid()) return;
        var more = el("button", "cv-more"); more.type = "button"; more.dataset.act = "calmore"; more.dataset.d = cell.dataset.d; box.appendChild(more);
        var upd = function () { var n = hid(); more.textContent = mob ? "+" + n : n === 1 ? "עוד פריט אחד" : "עוד " + n + " פריטים"; };
        upd();
        while (shown > 0 && !fits()) { chips[shown - 1].hidden = true; shown--; upd(); }
        if (hid() <= 0) more.remove();
      });
    });
  }
  function afterCalendarRender() {
    calFit();
    var sc = document.getElementById("tgscroll"); if (!sc) return;
    var st = Cal.st, key = st.view + "|" + (st.view === "week" ? weekStart(st.date) : st.date);
    if (st.tgKey === key && st.tgTop != null) sc.scrollTop = st.tgTop;
    else { var now = new Date(), isToday = (st.view === "day" && st.date === today()) || (st.view === "week" && weekStart(st.date) === weekStart(today()));
      sc.scrollTop = 10 * tgHH(); st.tgKey = key; }
    st.tgTop = sc.scrollTop; sc.onscroll = function () { st.tgTop = sc.scrollTop; };
  }
  function calSlide(dir) {
    var b = Cal.body, reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!b || reduce) { calShift(dir); return; }
    var w = b.offsetWidth || window.innerWidth, sign = dir > 0 ? 1 : -1;
    b.style.transition = "transform .2s cubic-bezier(.4,0,.6,1), opacity .2s"; b.style.transform = "translateX(" + (sign * w * 0.6) + "px)"; b.style.opacity = "0";
    setTimeout(function () {
      calShift(dir);
      b.style.transition = "none"; b.style.transform = "translateX(" + (-sign * w * 0.35) + "px)"; b.style.opacity = "0"; void b.offsetWidth;
      b.style.transition = "transform .32s cubic-bezier(.2,.9,.25,1), opacity .25s ease"; b.style.transform = ""; b.style.opacity = "";
      setTimeout(function () { b.style.transition = ""; }, 360);
    }, 190);
  }
  /* swipe sideways between months / weeks / days: the page follows the finger, then slides */
  var SWP = { x: 0, y: 0, t: 0, on: false, mode: null, dx: 0 };
  document.addEventListener("touchstart", function (e) {
    var b = e.target.closest && e.target.closest(".cv-body");
    SWP.on = !!(b && F.area === "cal" && Cal.st.view !== "agenda" && e.touches.length === 1 && !TGD.active && !MV.active && !DD.active);
    if (SWP.on) { SWP.x = e.touches[0].clientX; SWP.y = e.touches[0].clientY; SWP.t = Date.now(); SWP.mode = null; SWP.dx = 0; }
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!SWP.on || TGD.active || MV.active || DD.active) return; var dx = e.touches[0].clientX - SWP.x, dy = e.touches[0].clientY - SWP.y;
    if (!SWP.mode && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) SWP.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    if (SWP.mode !== "h") return; SWP.dx = dx; var b = Cal.body; if (!b) return;
    b.style.transition = "none"; b.style.transform = "translateX(" + (dx * 0.85) + "px)"; b.style.opacity = String(1 - Math.min(0.45, Math.abs(dx) / (b.offsetWidth || 400) * 0.7));
  }, { passive: true });
  document.addEventListener("touchend", function () {
    if (!SWP.on) return; SWP.on = false; if (SWP.mode !== "h") return;
    var dx = SWP.dx, v = Math.abs(dx) / Math.max(1, Date.now() - SWP.t), b = Cal.body;
    if (Math.abs(dx) > 70 || (Math.abs(dx) > 30 && v > 0.45)) calSlide(dx > 0 ? 1 : -1);
    else if (b) { b.style.transition = "transform .3s cubic-bezier(.2,.9,.25,1), opacity .2s"; b.style.transform = ""; b.style.opacity = ""; }
  }, { passive: true });

  Cal.act = function (e, a) {
    var act = a.dataset.act, st = Cal.st;
    switch (act) {
      case "calprev": calSlide(-1); break;
      case "calnext": calSlide(1); break;
      case "caltoday": { var td = today(); if (calPeriodKey(td) === calPeriodKey(st.date)) break; st.date = td; st.tgKey = null; Cal.render(); break; }
      case "calview": if (st.view !== a.dataset.v) { st.view = a.dataset.v; st.tgKey = null; if (st.view === "agenda" && st.date < today()) st.date = today(); Cal.render(); } break;
      case "calinfo": Cal.legend(a); break;
      case "calday": { if (Date.now() - DD.endedAt < 450) break;
        if (isDesk() && !e.target.closest(".cv-num,.cv-more") && a.classList.contains("cv-cell")) { if (can.editCal()) Cal.form({ d: a.dataset.d }); break; }
        st.date = a.dataset.d; st.view = "day"; st.tgKey = null; Cal.render(); break; }
      case "calmore": e.stopPropagation(); if (isDesk()) { openDayPop(a, a.dataset.d); break; } st.date = a.dataset.d; st.view = "day"; st.tgKey = null; Cal.render(); break;
      case "calev": e.stopPropagation(); if (Date.now() - MV.endedAt < 450 || Date.now() - DD.endedAt < 450) break; Cal.show(calAll()[+a.dataset.i]); break;
      case "calnew": { var td2 = today(); Cal.form({ d: st.view === "month" && st.date.slice(0, 7) !== td2.slice(0, 7) ? st.date.slice(0, 8) + "01" : (st.view === "month" || st.view === "agenda" ? td2 : st.date) }); break; }
      case "calslot": { var t = e.target; if (t !== a && t.closest(".tg-ev")) break; if (Date.now() - TGD.endedAt < 500) break; var r = a.getBoundingClientRect(); var m = Math.min(23 * 60, Math.floor((e.clientY - r.top) / tgHH() * 2) * 30); Cal.form({ d: a.dataset.d, m0: m }); break; }
    }
  };
  /* The category key, behind the i button. */
  Cal.legend = function (anchor) {
    var list = Cal.cats.map(function (c) { return '<div class="lg-i"><i style="background:#' + esc(c.color) + '"></i><span>' + esc(c.name) + "</span></div>"; }).join("");
    floatPop(anchor, '<h4 class="fp-title">מקרא הקטגוריות</h4><div class="lg-list">' + (list || '<p class="muted-empty">אין קטגוריות</p>') + "</div>", "lg");
  };
  /* computer, month view: "עוד N" opens everything of that day in a small card over the day (like Google) */
  function openDayPop(anchor, d) {
    var dt = parse(d), evs = calEventsByDay(d, 1)[d] || [];
    var html = '<div class="dpp-h"><button type="button" class="icon-btn dpp-x" aria-label="סגירה">' + svg("x") + "</button><small>" + esc(dt.toLocaleDateString("he-IL", { weekday: "long" })) + '</small><button type="button" class="dpp-n ' + (d === today() ? "today" : "") + '" data-go title="מעבר ליום הזה">' + dt.getDate() + "</button></div>" +
      '<div class="dpp-list">' + evs.map(function (e) { return evChip(e, "m"); }).join("") + (evs.length ? "" : '<p class="muted-empty">אין אירועים</p>') + "</div>";
    var box = floatPop(anchor, html, "dpp", function (b) {
      b.querySelector(".dpp-x").onclick = closeFP;
      b.querySelector("[data-go]").onclick = function () { closeFP(); Cal.st.date = d; Cal.st.view = "day"; Cal.st.tgKey = null; Cal.render(); };
      b.addEventListener("click", function (ev) { var c = ev.target.closest("[data-act='calev']"); if (c) { closeFP(); Cal.show(calAll()[+c.dataset.i]); } });
    });
    var cell = anchor.closest(".cv-cell") || anchor, r = cell.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    box.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top - 10)) + "px";
  }

  /* ---- writing changes ---- */
  Cal.op = function (o) {
    o.state = "pending"; o.uid = me.id; o.byName = myName(); o.at = ts(); o.atMs = Date.now();
    return db.collection("cal_ops").add(o);
  };
  function baseOf(src) { return Cal.events.filter(function (x) { return x.id === src.id; })[0] || src; }
  /* Apply a change to one event: a new event, a pending one, or one already in the Excel. */
  /* Undo / redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y; ⌘ on Mac) for the changes made here, in this visit. */
  var UNDO = [], REDO = [];
  function remember(before, after) { UNDO.push({ b: before, a: after }); if (UNDO.length > 40) UNDO.shift(); REDO = []; }
  function sameEv(e, f) { return e.title === f.title && e.date === f.date && (e.end || e.date) === (f.end || f.date) && (e.time || "") === (f.time || "") && (e.timeEnd || "") === (f.timeEnd || ""); }
  function findEv(f) { var all = Cal.visible().filter(function (e) { return !e.hide && sameEv(e, f); }); return all.filter(function (e) { return e.pend; })[0] || all[0] || null; }
  /* Turn the calendar from the state "from" of one event to the state "to" (null = no event). */
  async function applyState(from, to) {
    if (!from) { await saveChange(null, to, true); return true; }
    var cur = findEv(from); if (!cur) return false;
    if (!to) await deleteEvent(cur, true); else await saveChange(cur, to, true);
    return true;
  }
  Cal.undo = async function (redo) {
    var st = redo ? REDO : UNDO, x = st.pop(); if (!x) { toast(redo ? "אין מה לשחזר" : "אין מה לבטל"); return; }
    try {
      var ok = redo ? await applyState(x.b, x.a) : await applyState(x.a, x.b);
      if (!ok) { toast("האירוע השתנה בינתיים, אי אפשר לבטל"); return; }
      (redo ? UNDO : REDO).push(x);
      toast(redo ? "השינוי שוחזר" : "השינוי בוטל");
    } catch (er) { st.push(x); toast("הפעולה לא הצליחה", true); }
  };
  document.addEventListener("keydown", function (e) {
    if (F.area !== "cal" || !(e.ctrlKey || e.metaKey) || e.altKey || !can.editCal()) return;
    var z = e.code === "KeyZ", y = e.code === "KeyY"; if (!z && !y) return;
    var a = document.activeElement; if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if (document.documentElement.classList.contains("pv-open") || Cal.dragging()) return;
    e.preventDefault(); Cal.undo(y || e.shiftKey);
  });
  async function saveChange(src, o, quiet) {
    if (!quiet) remember(src ? srcFields(src) : null, Object.assign({}, src ? srcFields(src) : {}, o));
    if (!src) return Cal.op(Object.assign({ kind: "add" }, o));
    if (src.pend === "add" && src.opId) return db.collection("cal_ops").doc(src.opId).set(o, { merge: true });
    var base = baseOf(src), moved = o.date !== base.date || (o.end || o.date) !== (base.end || base.date);
    if (src.pend && src.opId) await db.collection("cal_ops").doc(src.opId).delete();
    return Cal.op(Object.assign({ kind: moved ? "move" : "edit", target: base.id, sheet: base.sheet, ref: base.ref, raw: base.raw }, o));
  }
  async function deleteEvent(src, quiet) {
    if (!quiet) remember(srcFields(src), null);
    if (src.pend && src.opId) await db.collection("cal_ops").doc(src.opId).delete();
    if (src.pend === "add") return;
    var base = baseOf(src);
    if (base.sheet) await Cal.op({ kind: "delete", target: base.id, sheet: base.sheet, ref: base.ref, raw: base.raw, title: base.title });
  }
  function srcFields(src) { return { title: src.title, date: src.date, end: src.end || src.date, time: src.time || "", timeEnd: src.timeEnd || "", cat: src.cat || "", color: src.color || "" }; }

  /* ---- event details ---- */
  function fmtLong(d) { return parse(d).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }); }
  Cal.show = function (ev) {
    if (!ev) return; var src = ev.src, c = evColor(ev), when, L = function (t) { return '<span dir="ltr">' + t + "</span>"; };
    if (ev.a) { var last = addDays(ev.ed, -1); when = ev.sd === last ? esc(fmtLong(ev.sd)) + " · כל היום" : esc(fmtLong(ev.sd)) + " – " + esc(fmtLong(last)); }
    else { var sd = ymd(new Date(ev.s)), ed = ymd(new Date(ev.e - 1)); when = sd === ed ? esc(fmtLong(sd)) + " · " + L(hm(ev.s) + "–" + hm(ev.e)) : esc(fmtLong(sd)) + " " + L(hm(ev.s)) + " – " + esc(fmtLong(ed)) + " " + L(hm(ev.e)); }
    var edit = can.editCal();
    var body = el("div", "evd"); body.style.setProperty("--cc", c);
    body.innerHTML = '<div class="evd-head"><i></i><h3>' + esc(ev.t) + "</h3>" + (edit ? '<button class="icon-btn" data-edit aria-label="עריכה" title="עריכה">' + svg("pen") + '</button><button class="icon-btn" data-del aria-label="מחיקה" title="מחיקה">' + svg("trash") + "</button>" : "") + '<button class="icon-btn" data-x aria-label="סגירה">' + svg("x") + "</button></div>" +
      '<div class="evd-row">' + svg("clock", 18) + "<span>" + when + "</span></div>" +
      (ev.cat ? '<div class="evd-row">' + svg("tag", 18) + '<span class="evd-cat"><i style="background:' + esc(c) + '"></i>' + esc(ev.cat) + "</span></div>" : "") +
      '<a class="btn ghost small evd-open" target="_blank" rel="noopener" href="' + esc(gcalLink(src)) + '">' + svg("google", 17) + "הוספה ליומן Google</a>";
    var box = openModal({ label: ev.t, body: body, cls: "evd-box" });
    body.querySelector("[data-x]").onclick = function () { closePreview(); };
    var ed = body.querySelector("[data-edit]"); if (ed) ed.onclick = function () { Cal.form({ ev: ev }); };
    var dl = body.querySelector("[data-del]"); if (dl) dl.onclick = function () {
      if (body.querySelector(".evd-confirm")) return;
      var cf = el("div", "evd-confirm"); cf.appendChild(el("span", "", "למחוק את האירוע מהלו״ז ומהאקסל?"));
      cf.appendChild(btn("מחיקה", "primary tiny", async function () { try { await deleteEvent(src); closePreview(); toast("האירוע נמחק"); } catch (er) { toast("המחיקה לא הצליחה", true); } }));
      cf.appendChild(btn("ביטול", "ghost tiny", function () { cf.remove(); }));
      body.appendChild(cf);
    };
    return box;
  };
  function gcalLink(e) {
    var stamp = function (d, t) { return d.replace(/-/g, "") + (t ? "T" + minToHm(hmToMin(t)).replace(":", "") + "00" : ""); };
    var en;
    if (!e.time) en = { d: addDays(e.end || e.date, 1), t: "" };
    else if (e.timeEnd) en = { d: e.end || e.date, t: e.timeEnd };
    else { var m = hmToMin(e.time) + 60; en = m >= 1440 ? { d: addDays(e.date, 1), t: minToHm(m - 1440) } : { d: e.end || e.date, t: minToHm(m) }; }
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.title) + "&dates=" + stamp(e.date, e.time) + "/" + stamp(en.d, en.t) + "&ctz=Asia/Jerusalem&details=" + encodeURIComponent("מהלו״ז של שבט משואות");
  }

  /* ---- category guess from history (same title, same prefix, same first words) ---- */
  function normTitle(t) { return String(t || "").replace(/[^\p{L}\p{N}\s\-–:]/gu, " ").replace(/\s+/g, " ").trim(); }
  function titleFeats(t) {
    var n = normTitle(t); if (!n) return [];
    var pre = n.split(/\s*[-–:]\s*/)[0].trim(), w = pre.split(" "), f = ["f:" + n];
    if (pre && pre !== n) f.push("p:" + pre);
    if (w.length > 2) f.push("w2:" + w.slice(0, 2).join(" "));
    if (w[0] && w[0].length > 2 && w.length > 1) f.push("w1:" + w[0]);
    if (w.length === 1 && w[0].length > 2) f.push("w1:" + w[0]);
    return f;
  }
  var CATM = { sig: "", feats: null };
  function catModel() {
    var sig = Cal.events.length + "|" + Cal.cats.length;
    if (CATM.sig === sig) return CATM.feats;
    var feats = {}, ok = {}; Cal.cats.forEach(function (c) { ok[c.name] = 1; });
    Cal.events.forEach(function (e) { if (!e.cat || !ok[e.cat]) return; titleFeats(e.title).forEach(function (f) { var o = feats[f] = feats[f] || {}; o[e.cat] = (o[e.cat] || 0) + 1; }); });
    CATM = { sig: sig, feats: feats }; return feats;
  }
  function catGuess(t) {
    var feats = catModel(), fs = titleFeats(t);
    for (var i = 0; i < fs.length; i++) { var c = feats[fs[i]]; if (!c) continue;
      var tot = 0, best = null, n = 0; Object.keys(c).forEach(function (k) { tot += c[k]; if (c[k] > n) { n = c[k]; best = k; } });
      if (n / tot >= 0.75) return best; }
    return null;
  }

  /* ---- new / edit event (the toggles for several days and for hours, with the pickers of גאנט׳) ---- */
  Cal.form = function (o) {
    if (!can.editCal()) return;
    o = o || {};
    var ev = o.ev || null, src = ev ? ev.src : null, edit = !!src;
    var st = { multi: !!(o.d2 && o.d2 !== o.d), timed: o.m0 != null, d1: o.d || today(), d2: o.d2 || o.d || today(), m0: o.m0 != null ? o.m0 : 16 * 60 + 30, m1: o.m0 != null ? (o.m1 != null ? Math.min(1439, o.m1) : Math.min(1439, o.m0 + 60)) : 18 * 60 };
    if (edit) {
      st.d1 = src.date; st.d2 = src.end || src.date; st.multi = st.d2 !== st.d1;
      var a = hmToMin(src.time), b = hmToMin(src.timeEnd);
      st.timed = a != null; if (a != null) { st.m0 = a; st.m1 = b != null ? b : Math.min(1439, a + 60); }
    }
    var picked = edit && src.cat ? src.cat : null;
    var body = el("form", "evc"); body.noValidate = true;
    body.innerHTML = '<div class="evc-top"><button type="button" class="icon-btn" data-x aria-label="סגירה">' + svg("x") + "</button><b>" + (edit ? "עריכת אירוע" : "אירוע חדש") + '</b><button type="submit" class="btn primary tiny">שמירה</button></div>' +
      '<input class="evc-title" id="evct" placeholder="הוספת כותרת" maxlength="120" enterkeyhint="done" autocomplete="off">' +
      '<div class="evc-row">' + svg("cal", 20) + '<div class="evc-col"><label class="evc-sw"><span>כמה ימים</span><input type="checkbox" id="evcmd"><i></i></label>' +
      '<div class="evc-line"><button type="button" class="evc-pick" id="evcd"></button><span class="evc-end"><em>עד</em><button type="button" class="evc-pick" id="evcd2"></button></span></div></div></div>' +
      '<div class="evc-row">' + svg("clock", 20) + '<div class="evc-col"><label class="evc-sw"><span>שעה</span><input type="checkbox" id="evctm"><i></i></label>' +
      '<div class="evc-line evc-times"><button type="button" class="evc-pick" id="evcs"></button><em>–</em><button type="button" class="evc-pick" id="evce"></button></div></div></div>' +
      (Cal.cats.length ? '<div class="evc-row">' + svg("tag", 20) + '<div class="evd-catlist" id="evccats">' + Cal.cats.map(function (c) { return '<button type="button" class="catchip" data-cat="' + esc(c.name) + '" style="--c:#' + esc(c.color) + '"><i></i>' + esc(c.name) + "</button>"; }).join("") + "</div></div>" : "") +
      '<p class="evc-err" id="evcerr"></p>';
    var q = function (id) { return body.querySelector("#" + id); };
    q("evct").value = edit ? src.title : "";
    var sync = function () {
      q("evcd").textContent = fmtPick(st.d1); q("evcd2").textContent = fmtPick(st.d2);
      q("evcs").innerHTML = '<bdi dir="ltr">' + minToHm(st.m0) + "</bdi>"; q("evce").innerHTML = '<bdi dir="ltr">' + minToHm(st.m1) + "</bdi>";
      q("evcmd").checked = st.multi; q("evctm").checked = st.timed;
      body.querySelector(".evc-end").hidden = !st.multi; body.querySelector(".evc-times").hidden = !st.timed;
      if (updSave) updSave();
    };
    var updSave = null;
    q("evcmd").onchange = function () { st.multi = q("evcmd").checked; if (!st.multi) st.d2 = st.d1; else if (st.d2 <= st.d1) st.d2 = addDays(st.d1, 1); sync(); };
    q("evctm").onchange = function () { st.timed = q("evctm").checked; sync(); };
    q("evcd").onclick = function (e) { datePop(e.currentTarget, st.d1, function (d) { var k = diffDays(st.d1, d); st.d1 = d; st.d2 = addDays(st.d2, k); sync(); }, { title: "תאריך" }); };
    q("evcd2").onclick = function (e) { datePop(e.currentTarget, st.d2, function (d) { st.d2 = d < st.d1 ? st.d1 : d; sync(); }, { min: st.d1, title: "עד תאריך" }); };
    q("evcs").onclick = function (e) { timePop(e.currentTarget, st.m0, function (x) { var dur = Math.max(15, st.m1 - st.m0); st.m0 = x; st.m1 = Math.min(1439, x + dur); sync(); }); };
    q("evce").onclick = function (e) { timePop(e.currentTarget, st.m1, function (x) { st.m1 = x; sync(); }, st.multi ? null : st.m0); };
    var chips = Array.prototype.slice.call(body.querySelectorAll("#evccats [data-cat]"));
    var paintC = function (name, auto) { chips.forEach(function (b) { b.classList.toggle("on", b.dataset.cat === name); b.classList.toggle("auto", !!auto && b.dataset.cat === name); }); };
    var guess = function () { return catGuess(q("evct").value); };
    chips.forEach(function (b) { b.onclick = function () { picked = picked === b.dataset.cat ? null : b.dataset.cat; if (picked) paintC(picked); else paintC(guess(), true); if (updSave) updSave(); }; });
    q("evct").oninput = function () { if (!picked) paintC(guess(), true); };
    if (picked) paintC(picked); else paintC(guess(), true);
    sync();
    var sig = function () { return JSON.stringify([q("evct").value.trim(), st.multi, st.timed, st.d1, st.d2, st.m0, st.m1, picked]); };
    var sig0 = sig(), saveBtn = body.querySelector("button[type=submit]");
    if (edit) { updSave = function () { saveBtn.disabled = sig() === sig0; }; body.addEventListener("input", updSave); updSave(); }
    body.querySelector("[data-x]").onclick = function () { closePreview(); };
    var busy = false;
    body.addEventListener("submit", async function (e) {
      e.preventDefault(); if (busy || (edit && sig() === sig0)) return;
      var t = q("evct").value.replace(/\s+/g, " ").trim();
      if (!t) { q("evct").focus(); q("evct").classList.remove("shake"); void q("evct").offsetWidth; q("evct").classList.add("shake"); return; }
      var cat = picked || guess() || "";
      var data = { title: t, date: st.d1, end: st.multi && st.d2 > st.d1 ? st.d2 : st.d1, time: st.timed ? minToHm(st.m0) : "", timeEnd: st.timed ? minToHm(st.m1) : "", cat: cat, color: cat ? Cal.catColor(cat) : "" };
      busy = true; saveBtn.disabled = true;
      try { await saveChange(src, data); closePreview(); toast(edit ? "השינוי נשמר" : "האירוע נוסף"); }
      catch (er) { q("evcerr").textContent = "השמירה לא הצליחה. נסו שוב."; busy = false; saveBtn.disabled = false; }
    });
    openModal({ label: edit ? "עריכת אירוע" : "אירוע חדש", body: body, cls: "evc-box" });
    if (!edit && isDesk()) setTimeout(function () { q("evct").focus(); }, 60);
  };

  /* ---- week / day: drag on an empty spot to create an event (mouse: drag; touch: hold, then drag) ---- */
  var TGD = { active: false, col: null, d: "", a: 0, b: 0, timer: null, y0: 0, x0: 0, endedAt: 0, box: null, touch: false };
  function tgMin(col, clientY) { var r = col.getBoundingClientRect(); return Math.max(0, Math.min(1440, Math.round((clientY - r.top) / tgHH() * 4) * 15)); }
  function tgDraw() { var lo = Math.min(TGD.a, TGD.b), hi = Math.max(TGD.a, TGD.b, lo + 15);
    if (!TGD.box) { TGD.box = el("div", "tg-sel"); TGD.col.appendChild(TGD.box); }
    TGD.box.style.top = lo / 60 * tgHH() + "px"; TGD.box.style.height = (hi - lo) / 60 * tgHH() + "px"; TGD.box.innerHTML = '<span dir="ltr">' + minToHm(lo) + "–" + minToHm(hi) + "</span>"; }
  function tgStart(col, clientY) { TGD.active = true; TGD.col = col; TGD.d = col.dataset.d; TGD.a = Math.floor(tgMin(col, clientY) / 15) * 15; TGD.b = TGD.a + 60; tgDraw(); document.body.classList.add("tg-dragging"); }
  function tgEnd(open) { clearTimeout(TGD.timer); TGD.timer = null; if (!TGD.active) { TGD.col = null; return; }
    var lo = Math.min(TGD.a, TGD.b), hi = Math.max(TGD.a, TGD.b, lo + 15), d = TGD.d;
    TGD.active = false; TGD.endedAt = Date.now(); document.body.classList.remove("tg-dragging");
    var box = TGD.box; TGD.box = null; TGD.col = null;
    if (open) { Cal.form({ d: d, m0: lo, m1: hi }); setTimeout(function () { if (box) box.remove(); }, 250); } else if (box) box.remove(); }
  document.addEventListener("mousedown", function (e) { if (e.button !== 0 || !can.editCal()) return; var col = e.target.closest && e.target.closest(".tg-col[data-act]"); if (!col || e.target.closest(".tg-ev")) return; TGD.col = col; TGD.y0 = e.clientY; TGD.touch = false; });
  document.addEventListener("mousemove", function (e) { if (TGD.touch || !TGD.col) return;
    if (!TGD.active) { if (Math.abs(e.clientY - TGD.y0) < 6) return; tgStart(TGD.col, TGD.y0); }
    TGD.b = tgMin(TGD.col, e.clientY); if (TGD.b === TGD.a) TGD.b = TGD.a + 15; tgDraw(); e.preventDefault(); });
  document.addEventListener("mouseup", function (e) { if (TGD.touch) return; tgEnd(TGD.active && inCal(e)); });
  document.addEventListener("touchstart", function (e) { if (!can.editCal() || e.touches.length !== 1) return; var col = e.target.closest && e.target.closest(".tg-col[data-act]"); if (!col || e.target.closest(".tg-ev")) return;
    var t = e.touches[0]; TGD.touch = true; TGD.col = col; TGD.y0 = t.clientY; TGD.x0 = t.clientX; clearTimeout(TGD.timer);
    TGD.timer = setTimeout(function () { if (!TGD.col) return; tgStart(col, TGD.y0); if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {} }, 380); }, { passive: true });
  document.addEventListener("touchmove", function (e) { if (!TGD.touch || !TGD.col) return; var t = e.touches[0];
    if (!TGD.active) { if (Math.abs(t.clientY - TGD.y0) > 8 || Math.abs(t.clientX - TGD.x0) > 8) { clearTimeout(TGD.timer); TGD.col = null; } return; }
    e.preventDefault(); TGD.b = tgMin(TGD.col, t.clientY); if (TGD.b === TGD.a) TGD.b = TGD.a + 15; tgDraw();
    var sc = document.getElementById("tgscroll"); if (sc) { var r = sc.getBoundingClientRect(); if (t.clientY > r.bottom - 40) sc.scrollTop += 12; else if (t.clientY < r.top + 40) sc.scrollTop -= 12; } }, { passive: false });
  document.addEventListener("touchend", function () { if (!TGD.touch) return; tgEnd(TGD.active); TGD.touch = false; });
  document.addEventListener("touchcancel", function () { if (TGD.touch) { tgEnd(false); TGD.touch = false; } });

  /* ---- drag an event to another day: month view (computer) and the all-day row in week / day ---- */
  var DD = { pend: null, pendMode: "", active: false, touch: false, timer: null, x0: 0, y0: 0, lastX: 0, lastY: 0, ev: null, idx: -1, mode: "", ghost: null, nd: 1, d0: "", grab: 0, target: "", zone: null, edgeT: null, endedAt: 0 };
  function ddEvent(n) { if (!can.editCal() || !n) return null; return calAll()[+n.dataset.i] || null; }
  function ddSpan(ev) { if (ev.a) return [ev.sd, Math.max(1, diffDays(ev.sd, ev.ed))]; var sd = ymd(new Date(ev.s)); return [sd, diffDays(sd, ymd(new Date(Math.max(ev.s, ev.e - 1)))) + 1]; }
  function ddCells() { return Array.prototype.slice.call(document.querySelectorAll(DD.mode === "month" ? ".cv-month .cv-cell[data-d]" : ".cv-body .tg-ad[data-d]")); }
  function ddDayAt(x, y) {
    var cells = ddCells(); if (!cells.length) return null;
    if (DD.mode === "month") { var c = cells.filter(function (c) { var r = c.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; })[0]; return c ? c.dataset.d : null; }
    var c2 = cells.filter(function (c) { var r = c.getBoundingClientRect(); return x >= r.left && x < r.right; })[0];
    if (!c2) { var bd = 1e9; cells.forEach(function (k) { var r = k.getBoundingClientRect(), dd = Math.min(Math.abs(x - r.left), Math.abs(x - r.right)); if (dd < bd) { bd = dd; c2 = k; } }); }
    return c2 ? c2.dataset.d : null;
  }
  /* Month view, on a computer: drag across empty days to make a new event over them (like dragging over hours in week view). */
  var MC = { c0: null, active: false, a: null, b: null, endedAt: 0 };
  function mcCells() { return Array.prototype.slice.call(document.querySelectorAll(".cv-month .cv-cell[data-d]")); }
  function mcDayAt(x, y) { var c = mcCells().filter(function (c) { var r = c.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; })[0]; return c ? c.dataset.d : null; }
  function mcSource(t) {
    if (!t || !t.closest || !can.editCal()) return null;
    var cell = t.closest(".cv-month .cv-cell[data-d]"); if (!cell) return null;
    if (t.closest(".cv-chip, .cv-bar, .cv-more, .cv-num")) return null;
    return cell;
  }
  function mcDraw() {
    Array.prototype.forEach.call(document.querySelectorAll(".mc-prev"), function (x) { x.remove(); });
    var lo = MC.a < MC.b ? MC.a : MC.b, hi = MC.a < MC.b ? MC.b : MC.a;
    Array.prototype.forEach.call(document.querySelectorAll(".cv-month .cv-wk"), function (wk) {
      var cells = wk.querySelectorAll(".cv-cell[data-d]"); if (!cells.length) return;
      var c0 = -1, c1 = -1;
      Array.prototype.forEach.call(cells, function (c, k) { if (c.dataset.d >= lo && c.dataset.d <= hi) { if (c0 < 0) c0 = k; c1 = k; } });
      if (c0 < 0) return;
      var bars = wk.querySelector(".cv-bars"); if (!bars) { bars = el("div", "cv-bars"); wk.appendChild(bars); }
      var b = el("div", "cv-chip ad cv-bar mc-prev" + (cells[c0].dataset.d > lo ? " cl" : "") + (cells[c1].dataset.d < hi ? " cr" : ""));
      b.style.cssText = "--c0:" + c0 + ";--sp:" + (c1 - c0 + 1) + ";--ln:0";
      b.innerHTML = "<span>(אין כותרת)</span>"; bars.appendChild(b);
    });
  }
  function mcStart(cell) { MC.active = true; MC.a = MC.b = cell.dataset.d; document.body.classList.add("tg-dragging"); SWP.on = false; mcDraw(); }
  function mcMove(x, y) { var d = mcDayAt(x, y); if (d && d !== MC.b) { MC.b = d; mcDraw(); } }
  function mcEnd(open) {
    clearTimeout(MC.timer); var was = MC.active; MC.c0 = null; if (!was) return;
    MC.active = false; MC.endedAt = DD.endedAt = Date.now(); document.body.classList.remove("tg-dragging");
    var lo = MC.a < MC.b ? MC.a : MC.b, hi = MC.a < MC.b ? MC.b : MC.a;
    var clear = function () { Array.prototype.forEach.call(document.querySelectorAll(".mc-prev"), function (x) { x.remove(); }); };
    if (open) { Cal.form({ d: lo, d2: hi }); setTimeout(clear, 250); } else clear();
  }
  document.addEventListener("mousedown", function (e) { if (e.button !== 0 || !isDesk()) return; var c = mcSource(e.target); if (!c) return; MC.c0 = c; MC.x0 = e.clientX; MC.y0 = e.clientY; MC.touch = false; });
  document.addEventListener("mousemove", function (e) { if (MC.touch || !MC.c0) return;
    if (!MC.active) { if (Math.hypot(e.clientX - MC.x0, e.clientY - MC.y0) < 8) return; mcStart(MC.c0); }
    e.preventDefault(); mcMove(e.clientX, e.clientY); });
  document.addEventListener("mouseup", function (e) { if (MC.touch) return; mcEnd(MC.active && inCal(e)); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (MC.active) mcEnd(false); if (DD.active) ddEnd(false); if (MV.active) mvEnd(false); if (TGD.active) tgEnd(false);
    document.body.classList.remove("drag-out");
  });
  /* Letting go outside the calendar cancels a drag, like Escape. While outside, the drag looks faded. */
  function inCal(e) {
    var b = Cal.body && Cal.body.getBoundingClientRect(); if (!b || !e || e.clientX == null) return true;
    return e.clientX >= b.left - 4 && e.clientX <= b.right + 4 && e.clientY >= b.top - 4 && e.clientY <= b.bottom + 4;
  }
  document.addEventListener("mousemove", function (e) {
    var on = DD.active || MV.active || TGD.active || MC.active;
    document.body.classList.toggle("drag-out", !!on && !inCal(e));
  });
  document.addEventListener("mouseup", function () { setTimeout(function () { document.body.classList.remove("drag-out"); }, 0); });
  function buzz() { if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {} }
  /* A long press must not open the phone's own menu. */
  document.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest(".cv-body .cv-chip, .cv-body .cv-bar, .cv-body .tg-ev")) e.preventDefault(); });
  function ddSource(t) {
    if (!t || !t.closest) return null;
    var m = t.closest(".cv-month .cv-chip[data-act='calev'], .cv-month .cv-bar"); if (m) return [m, "month"];
    /* the list of a day ("עוד N פריטים") can be dragged from too */
    var q = t.closest(".dpp-list .cv-chip[data-act='calev']"); if (q && document.querySelector(".cv-month")) return [q, "pop"];
    var r = t.closest(".cv-body .tg-allrow .cv-bar, .cv-body .tg-ad .cv-chip[data-act='calev']"); if (r) return [r, "row"];
    return null;
  }
  function ddStart(n, mode, x, y) {
    var ev = ddEvent(n); if (!ev) return;
    var fromPop = mode === "pop"; if (fromPop) mode = "month";
    DD.mode = mode; var under = ddDayAt(x, y); var sp = ddSpan(ev);
    if (fromPop) under = sp[0];
    if (!under) return;
    Object.assign(DD, { active: true, ev: ev, idx: +n.dataset.i, nd: sp[1], d0: sp[0], grab: Math.max(0, Math.min(sp[1] - 1, diffDays(sp[0], under))), target: sp[0], zone: null, lastX: x, lastY: y });
    n.classList.add("mv-src");
    var r = n.getBoundingClientRect(), g = n.cloneNode(true); g.classList.remove("mv-src"); g.classList.add("dd-ghost"); g.removeAttribute("data-act");
    g.style.width = Math.min(r.width, 240) + "px"; g.style.height = r.height + "px"; DD.gx = x - r.left; DD.gy = y - r.top; if (DD.gx > Math.min(r.width, 240)) DD.gx = Math.min(r.width, 240) / 2;
    document.body.appendChild(g); DD.ghost = g;
    if (fromPop) { DD.gx = Math.min(r.width, 240) / 2; DD.gy = r.height / 2; closeFP(); }
    document.body.classList.add("tg-dragging"); SWP.on = false;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
    ddMove(x, y);
  }
  function ddMove(x, y) {
    if (!DD.active) return; DD.lastX = x; DD.lastY = y;
    DD.ghost.style.setProperty("left", (x - DD.gx) + "px", "important"); DD.ghost.style.setProperty("top", (y - DD.gy) + "px", "important");
    var under = ddDayAt(x, y); if (under) DD.target = addDays(under, -DD.grab);
    var last = addDays(DD.target, DD.nd - 1);
    ddCells().forEach(function (c) { c.classList.toggle("dd-on", c.dataset.d >= DD.target && c.dataset.d <= last); });
    if (DD.mode === "row") {
      var cells = ddCells(), L = cells.reduce(function (m, c) { return Math.min(m, c.getBoundingClientRect().left); }, 1e9), R = cells.reduce(function (m, c) { return Math.max(m, c.getBoundingClientRect().right); }, -1e9);
      var zone = x < L + 14 ? "L" : x > R + 2 ? "R" : null;
      if (zone !== DD.zone) { DD.zone = zone; clearInterval(DD.edgeT); DD.edgeT = null; if (zone) DD.edgeT = setInterval(function () { ddEdge(zone); }, 700); }
    }
  }
  function ddEdge(zone) {
    if (!DD.active) return; var dir = zone === "L" ? 1 : -1, top = Cal.st.tgTop;
    calShift(dir); Cal.st.tgKey = Cal.st.view + "|" + (Cal.st.view === "week" ? weekStart(Cal.st.date) : Cal.st.date); Cal.st.tgTop = top;
    var sc = document.getElementById("tgscroll"); if (sc) sc.scrollTop = top;
    var under = ddDayAt(DD.lastX, DD.lastY); if (under) DD.target = addDays(under, -DD.grab);
    ddMove(DD.lastX, DD.lastY);
  }
  function ddEnd(commit) {
    clearInterval(DD.edgeT); DD.edgeT = null; DD.zone = null;
    var ev = DD.ev, target = DD.target;
    DD.active = false; DD.ev = null; DD.endedAt = Date.now();
    if (DD.ghost) { DD.ghost.remove(); DD.ghost = null; }
    document.body.classList.remove("tg-dragging");
    Array.prototype.forEach.call(document.querySelectorAll(".mv-src"), function (x) { x.classList.remove("mv-src"); });
    Array.prototype.forEach.call(document.querySelectorAll(".dd-on"), function (x) { x.classList.remove("dd-on"); });
    if (commit && ev && target && target !== DD.d0) {
      var k = diffDays(DD.d0, target), f = srcFields(ev.src);
      f.date = addDays(f.date, k); f.end = addDays(f.end, k);
      saveChange(ev.src, f).then(function () { toast("האירוע הוזז"); }).catch(function () { toast("ההזזה לא הצליחה", true); });
    }
    if (Cal.renderPending) { Cal.renderPending = false; Cal.render(true); }
  }
  document.addEventListener("mousedown", function (e) { if (e.button !== 0 || !isDesk()) return; var s = ddSource(e.target); if (!s || !ddEvent(s[0])) return; DD.pend = s[0]; DD.pendMode = s[1]; DD.x0 = e.clientX; DD.y0 = e.clientY; DD.touch = false; });
  document.addEventListener("mousemove", function (e) { if (DD.touch) return;
    if (DD.pend && !DD.active) { if (Math.hypot(e.clientX - DD.x0, e.clientY - DD.y0) < 6) return; var p = DD.pend; DD.pend = null; ddStart(p, DD.pendMode, DD.x0, DD.y0); }
    if (!DD.active) return; e.preventDefault(); ddMove(e.clientX, e.clientY); });
  document.addEventListener("mouseup", function (e) { if (DD.touch) return; DD.pend = null; if (DD.active) ddEnd(inCal(e)); });
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1 || DD.active || MV.active) return; var s = ddSource(e.target); if (!s || !ddEvent(s[0])) return;
    var t = e.touches[0], tgt = e.target; DD.touch = true; DD.pend = s[0]; DD.pendMode = s[1]; DD.x0 = t.clientX; DD.y0 = t.clientY; clearTimeout(DD.timer);
    var tm = function (ev) { var p = ev.touches[0]; if (!DD.active) { if (Math.abs(p.clientX - DD.x0) > 8 || Math.abs(p.clientY - DD.y0) > 8) { clearTimeout(DD.timer); DD.pend = null; } return; } ev.preventDefault(); ddMove(p.clientX, p.clientY); };
    var te = function (ev) { clearTimeout(DD.timer); tgt.removeEventListener("touchmove", tm); tgt.removeEventListener("touchend", te); tgt.removeEventListener("touchcancel", te); DD.pend = null; if (DD.active) { if (ev.cancelable) ev.preventDefault(); ddEnd(ev.type === "touchend"); } DD.touch = false; };
    tgt.addEventListener("touchmove", tm, { passive: false }); tgt.addEventListener("touchend", te); tgt.addEventListener("touchcancel", te);
    DD.timer = setTimeout(function () { if (DD.pend) { var b = DD.pend; DD.pend = null; ddStart(b, DD.pendMode, DD.x0, DD.y0); if (DD.active) buzz(); } }, 420);
  }, { passive: true });

  /* ---- week / day: drag a timed event to move it; holding at the side edge moves to the next / previous week or day ---- */
  var MV = { active: false, pend: null, touch: false, timer: null, x0: 0, y0: 0, lastX: 0, lastY: 0, ev: null, idx: -1, box: null, dur: 0, grab: 0, d: "", m: 0, d0: "", m0: 0, zone: null, edgeT: null, endedAt: 0 };
  function mvEvent(b) {
    if (!can.editCal() || !b || b.dataset.c) return null; var ev = calAll()[+b.dataset.i];
    if (!ev || ev.a || !(ev.e > ev.s) || ev.e - ev.s >= 864e5 || ymd(new Date(ev.s)) !== ymd(new Date(ev.e - 1))) return null;
    return ev;
  }
  function mvStart(b, x, y) {
    var ev = mvEvent(b), col = b.closest(".tg-col"); if (!ev || !col) return;
    var s = new Date(ev.s), HH = tgHH(), r = col.getBoundingClientRect();
    Object.assign(MV, { active: true, ev: ev, idx: +b.dataset.i, dur: Math.round((ev.e - ev.s) / 6e4), d0: ymd(s), m0: s.getHours() * 60 + s.getMinutes(), zone: null });
    MV.grab = (y - r.top) / HH * 60 - MV.m0;
    b.classList.add("mv-src");
    var bx = el("div", "tg-ev mv-box"); bx.style.setProperty("--cc", b.style.getPropertyValue("--cc")); bx.style.setProperty("--ci", b.style.getPropertyValue("--ci"));
    bx.innerHTML = "<b>" + esc(ev.t) + '</b><small dir="ltr"></small>'; MV.box = bx;
    document.body.classList.add("tg-dragging"); SWP.on = false;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
    mvMove(x, y); requestAnimationFrame(mvLoop);
  }
  function mvMove(x, y) {
    if (!MV.active) return; MV.lastX = x; MV.lastY = y;
    var cols = Array.prototype.slice.call(document.querySelectorAll(".cv-body .tg-col[data-d]")); if (!cols.length) return;
    var col = cols.filter(function (c) { var r = c.getBoundingClientRect(); return x >= r.left && x < r.right; })[0];
    if (!col) { var bd = 1e9; cols.forEach(function (c) { var r = c.getBoundingClientRect(), dd = Math.min(Math.abs(x - r.left), Math.abs(x - r.right)); if (dd < bd) { bd = dd; col = c; } }); }
    var r = col.getBoundingClientRect(), HH = tgHH();
    var raw = Math.max(0, Math.min(1440 - MV.dur, (y - r.top) / HH * 60 - MV.grab));
    var m = Math.round(raw / 15) * 15; m = Math.max(0, Math.min(1440 - MV.dur, m));
    MV.d = col.dataset.d; MV.m = m;
    if (MV.box.parentNode !== col) col.appendChild(MV.box);
    var h = Math.max(MV.dur / 60 * HH - 2, 16);
    MV.box.style.top = raw / 60 * HH + "px"; MV.box.style.height = h + "px"; MV.box.classList.toggle("short", h < 26);
    MV.box.querySelector("small").textContent = minToHm(m) + "–" + minToHm(m + MV.dur);
    var cr = document.querySelector(".cv-body .tg-cols").getBoundingClientRect();
    var zone = x < cr.left + 14 ? "L" : x > cr.right + 2 ? "R" : null;
    if (zone !== MV.zone) { MV.zone = zone; clearInterval(MV.edgeT); MV.edgeT = null; if (zone) MV.edgeT = setInterval(function () { mvEdge(zone); }, 700); }
  }
  function mvLoop() {
    if (!MV.active) return;
    var sc = document.getElementById("tgscroll");
    if (sc) { var r = sc.getBoundingClientRect(), v = 0; if (MV.lastY > r.bottom - 34) v = 7; else if (MV.lastY < r.top + 34) v = -7;
      if (v) { var before = sc.scrollTop; sc.scrollTop += v; if (sc.scrollTop !== before) mvMove(MV.lastX, MV.lastY); } }
    requestAnimationFrame(mvLoop);
  }
  function mvEdge(zone) {
    if (!MV.active) return; var dir = zone === "L" ? 1 : -1, top = Cal.st.tgTop;
    calShift(dir); Cal.st.tgKey = Cal.st.view + "|" + (Cal.st.view === "week" ? weekStart(Cal.st.date) : Cal.st.date); Cal.st.tgTop = top;
    var sc = document.getElementById("tgscroll"); if (sc) sc.scrollTop = top;
    MV.box.remove(); mvMove(MV.lastX, MV.lastY);
  }
  function mvEnd(commit) {
    clearInterval(MV.edgeT); MV.edgeT = null; MV.zone = null;
    var ev = MV.ev, d = MV.d, m = MV.m, box = MV.box;
    MV.active = false; MV.ev = null; MV.box = null; MV.endedAt = Date.now(); TGD.endedAt = Date.now();
    document.body.classList.remove("tg-dragging");
    Array.prototype.forEach.call(document.querySelectorAll(".mv-src"), function (x) { x.classList.remove("mv-src"); });
    var moved = commit && ev && (d !== MV.d0 || m !== MV.m0);
    if (moved) {
      var f = srcFields(ev.src); f.date = d; f.end = d; f.time = minToHm(m); f.timeEnd = minToHm(Math.min(1439, m + MV.dur));
      saveChange(ev.src, f).then(function () { toast("האירוע הוזז"); }).catch(function () { toast("ההזזה לא הצליחה", true); });
    } else if (box) box.remove();
    if (Cal.renderPending) { Cal.renderPending = false; Cal.render(true); }
  }
  document.addEventListener("mousedown", function (e) { if (e.button !== 0) return; var b = e.target.closest && e.target.closest(".cv-body .tg-ev"); if (!b || !mvEvent(b)) return; MV.pend = b; MV.x0 = e.clientX; MV.y0 = e.clientY; MV.touch = false; });
  document.addEventListener("mousemove", function (e) { if (MV.touch) return;
    if (MV.pend && !MV.active) { if (Math.hypot(e.clientX - MV.x0, e.clientY - MV.y0) < 6) return; var b = MV.pend; MV.pend = null; mvStart(b, MV.x0, MV.y0); }
    if (!MV.active) return; e.preventDefault(); mvMove(e.clientX, e.clientY); });
  document.addEventListener("mouseup", function (e) { if (MV.touch) return; MV.pend = null; if (MV.active) mvEnd(inCal(e)); });
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1 || MV.active) return; var b = e.target.closest && e.target.closest(".cv-body .tg-ev"); if (!b || !mvEvent(b)) return;
    var t = e.touches[0], tgt = e.target; MV.touch = true; MV.pend = b; MV.x0 = t.clientX; MV.y0 = t.clientY; clearTimeout(MV.timer);
    var tm = function (ev) { var p = ev.touches[0]; if (!MV.active) { if (Math.abs(p.clientX - MV.x0) > 8 || Math.abs(p.clientY - MV.y0) > 8) { clearTimeout(MV.timer); MV.pend = null; } return; } ev.preventDefault(); mvMove(p.clientX, p.clientY); };
    var te = function (ev) { clearTimeout(MV.timer); tgt.removeEventListener("touchmove", tm); tgt.removeEventListener("touchend", te); tgt.removeEventListener("touchcancel", te); MV.pend = null; if (MV.active) { if (ev.cancelable) ev.preventDefault(); mvEnd(ev.type === "touchend"); } MV.touch = false; };
    tgt.addEventListener("touchmove", tm, { passive: false }); tgt.addEventListener("touchend", te); tgt.addEventListener("touchcancel", te);
    MV.timer = setTimeout(function () { if (MV.pend) { var bb = MV.pend; MV.pend = null; mvStart(bb, MV.x0, MV.y0); if (MV.active) buzz(); } }, 420);
  }, { passive: true });

  /* ---- the calendar at a glance, for the home page (like the iOS widget) ---- */
  Cal.homeWidget = function () {
    var td = today(), now = Date.now(), mob = window.innerWidth <= 600;
    var first = parse(td); first.setDate(1); var ms = weekStart(ymd(first)), mo = first.getMonth();
    var N = (diffDays(ms, weekStart(ymd(new Date(first.getFullYear(), mo + 1, 0)))) / 7 + 1) * 7, cells = "";
    for (var i = 0; i < N; i++) { var d = addDays(ms, i), dt = parse(d); cells += '<span class="' + (dt.getMonth() !== mo ? "out" : "") + " " + (d === td ? "today" : "") + '">' + dt.getDate() + "</span>"; }
    var month = '<div class="hc-month"><b class="hc-mn">' + esc(first.toLocaleDateString("he-IL", { month: "long" })) + '</b><div class="hc-days"><i>א</i><i>ב</i><i>ג</i><i>ד</i><i>ה</i><i>ו</i><i>ש</i>' + cells + "</div></div>";
    var ev = calEventsByDay(td, 7), seen = {};
    var live = function (d) { return (ev[d] || []).filter(function (e) { if (e.allDay) return true; return !(d === td && e.tEnd && e.tEnd.getTime() <= now); }); };
    var item = function (e, d, lbl) { var c = evColor(e), L = function (t) { return '<bdi dir="ltr">' + t + "</bdi>"; };
      var time = e.allDay ? "כל היום" : L(hm(e.s) + "–" + hm(e.e));
      return '<div class="hc-ev" style="--cc:' + esc(c) + ";--ci:" + inkOn(c) + '"><b>' + esc(e.t) + "</b><span>" + (lbl ? esc(lbl) + " · " : "") + time + "</span></div>"; };
    var dayLbl = function (d) { var n = diffDays(td, d); return n === 0 ? "היום" : n === 1 ? "מחר" : parse(d).toLocaleDateString("he-IL", { weekday: "long" }); };
    var right;
    if (mob) {
      var list = []; for (var k = 0; k < 7 && list.length < 2; k++) { var dd = addDays(td, k); live(dd).forEach(function (e) { if (list.length < 2 && !seen[e.idx]) { seen[e.idx] = 1; list.push(item(e, dd, dd === td ? "" : dayLbl(dd))); } }); }
      right = '<div class="hc-evs">' + (list.join("") || '<div class="hc-empty">' + svg("cal", 22) + "<span>אין אירועים בשבוע הקרוב</span></div>") + "</div>";
    } else {
      right = '<div class="hc-cols">' + [0, 1, 2].map(function (k) { var d = addDays(td, k), a = live(d), dt = parse(d);
        return '<div class="hc-col ' + (k === 0 ? "today" : "") + '"><div class="hc-ch"><b>' + dayLbl(d) + "</b><span>" + dt.getDate() + "." + (dt.getMonth() + 1) + "</span></div>" + a.slice(0, 4).map(function (e) { return item(e, d, ""); }).join("") + (a.length > 4 ? '<small class="hc-more">ועוד ' + (a.length - 4) + "</small>" : "") + (a.length ? "" : '<small class="hc-none">אין אירועים</small>') + "</div>"; }).join("") + "</div>";
    }
    var w = el("a", "hcal"); w.href = "#cal"; w.setAttribute("aria-label", "פתיחת הלו״ז");
    w.innerHTML = right + month;
    return w;
  };

  /* ======================================================================
     Area bookings (שריון מתחמים)
     ====================================================================== */
  var PLACES = [
    { key: "fire", name: "איזור אש", icon: "fire", needBoger: true, cap: 50, hint: "יש לתאם עם בוגר בהודעה, ולכתוב אותו לאחר התיאום." },
    { key: "home", name: "פעילות בבית", icon: "house" },
    { key: "out", name: "פעילות מחוץ לשבט", icon: "bus", multi: true, needBoger: true, hint: "צריך אישור הורים בוואטסאפ או בכתב." },
    { key: "proj", name: "מקרן", icon: "proj", noCount: true }
  ];
  var GARDENS = [["meah", "גן המאה"], ["zuck", "גן צוקרמן"]];
  F.PLACES = PLACES;
  var Book = F.Book = { list: [], tab: "next", loaded: false };
  Book.start = function () {
    F.listen(db.collection("bookings").where("date", ">=", addDays(today(), -60)).onSnapshot(function (snap) {
      Book.list = []; snap.forEach(function (d) { var x = d.data(); x.id = d.id; Book.list.push(x); });
      Book.loaded = true; Book.err = false; Book.badge();
      if (F.area === "book" && Book.built) Book.render();
      if (F.area === "home") Home.render();
    }, function () { Book.err = true; Book.loaded = true; if (Book.built) Book.render(); }));
  };
  Book.place = function (k) { return PLACES.filter(function (p) { return p.key === k; })[0] || { key: k, name: k, icon: "flag" }; };
  Book.placeName = function (b) { var p = Book.place(b.area); return p.name + (b.area === "out" && b.fields && b.fields.where ? " · " + b.fields.where : ""); };
  Book.missingBoger = function (b) { return !b.imported && Book.place(b.area).needBoger && !(b.fields && b.fields.boger); };
  /* Mine = what I booked, and what others of my gadud / team booked. */
  Book.isMine = function (b) { return b.uid === me.id || F.sameUnit(b.fields && b.fields.unit); };
  Book.mineMissing = function () { var t = today(); return Book.list.filter(function (b) { return Book.isMine(b) && b.date >= t && Book.missingBoger(b); }).length; };
  /* איזור אש: up to 50 children together, or one gadud / team of any size. */
  Book.people = function (bs) { return bs.reduce(function (s, b) { return s + (parseInt(b.fields && b.fields.count, 10) || 0); }, 0); };
  Book.room = function (p, bs) { if (!p.cap) return p.multi || !bs.length ? Infinity : 0; if (!bs.length) return Infinity; if (bs.some(function (b) { return !(parseInt(b.fields && b.fields.count, 10) > 0); })) return 0; return Math.max(0, p.cap - Book.people(bs)); };
  Book.sort = "near";
  Book.badge = function () { F.badge("book", Book.mineMissing() ? 1 : 0, true); };
  Book.open = function () { if (!Book.built) Book.build(); Book.render(); };
  Book.build = function () {
    Book.built = true;
    var v = Book.view;
    var x = el("div", "head-acts");
    Book.xl = iconBtn("excel", "ייצוא לאקסל", function () { Book.export(); }, "icon-btn xl-btn");
    x.appendChild(Book.xl);
    head(v, "שריון מתחמים", x);
    var bar = el("div", "bk-bar"); Book.seg = el("div", "fseg"); bar.appendChild(Book.seg);
    Book.sortSel = select([["near", "מהקרוב לרחוק"], ["far", "מהרחוק לקרוב"]], Book.sort); Book.sortSel.classList.add("bk-sort"); Book.sortSel.setAttribute("aria-label", "סדר");
    Book.sortSel.addEventListener("change", function () { Book.sort = Book.sortSel.value; Book.render(); });
    bar.appendChild(Book.sortSel); v.appendChild(bar);
    Book.body = el("div", "bk-list"); v.appendChild(Book.body);
  };
  Book.limit = function () { return addMonths(today(), 2); };
  Book.mineNear = function (date, exceptId) { return Book.list.filter(function (b) { return b.uid === me.id && b.id !== exceptId && Math.abs(diffDays(b.date, date)) < 61; }); };
  Book.render = function () {
    if (!Book.built) return;
    Book.xl.hidden = !can.exportBookings();
    var miss = Book.mineMissing();
    Book.seg.textContent = "";
    [["next", "פעולות קרובות"], ["mine", "השריונים שלי"]].forEach(function (s) {
      var b = el("button", s[0] === Book.tab ? "on" : "", s[1]); b.type = "button";
      if (s[0] === "mine" && miss) b.appendChild(el("i", "seg-dot"));
      b.addEventListener("click", function () { Book.tab = s[0]; Book.render(); });
      Book.seg.appendChild(b);
    });
    var box = Book.body; box.textContent = "";
    if (!Book.loaded || !Cal.loaded) { box.appendChild(el("p", "fv-empty", "טוען…")); return; }
    if (Book.err) { box.appendChild(el("div", "fv-err", "לא הצלחנו לטעון את השריונים.")); return; }
    var t = today(), lim = Book.limit();
    if (Book.tab === "mine") {
      var mine = Book.list.filter(function (b) { return Book.isMine(b) && b.date >= t; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      if (!mine.length) box.appendChild(el("p", "fv-empty", "אין לך שריונים קרובים."));
      mine.forEach(function (b) {
        var card = el("section", "bk-day"); card.appendChild(dayHead(b.date, ""));
        var areas = el("div", "bk-areas one"); areas.appendChild(placeCell(b.date, Book.place(b.area), [b], false, true)); card.appendChild(areas); box.appendChild(card);
      });
      return;
    }
    Book.sortSel.hidden = Book.tab !== "next";
    var set = {};
    Object.keys(F.activityOnly()).forEach(function (d) { if (d >= t && d <= lim) set[d] = true; });
    Book.list.forEach(function (b) { if (b.date >= t && b.date <= lim) set[b.date] = true; });
    var dates = Object.keys(set).sort(); if (Book.sort === "far") dates.reverse();
    if (!dates.length) box.appendChild(el("p", "fv-empty", "לא נמצאו פעולות קרובות בלו״ז."));
    dates.forEach(function (d) {
      var locked = d > lim;
      var card = el("section", "bk-day" + (locked ? " locked" : ""));
      card.appendChild(dayHead(d, locked ? "ייפתח לשריון ב-" + shortDate(addMonths(d, -2)) : ""));
      var areas = el("div", "bk-areas");
      PLACES.forEach(function (p) {
        var bs = Book.list.filter(function (x) { return x.date === d && x.area === p.key; });
        areas.appendChild(placeCell(d, p, bs, locked));
      });
      card.appendChild(areas); box.appendChild(card);
    });
  };
  function dayHead(d, extra) {
    var h = el("div", "bk-dh"), dd = parse(d);
    var bx = el("div", "bk-d"); bx.appendChild(el("b", "", String(dd.getDate()))); bx.appendChild(el("small", "", MONTHS[dd.getMonth()].slice(0, 3)));
    var tx = el("div", "bk-t"); tx.appendChild(el("strong", "", longDate(d)));
    var evs = Cal.visible().filter(function (e) { return e.date === d && F.isActivity(e); });
    tx.appendChild(el("span", "", [inDays(d), evs.map(function (e) { return e.title + (e.time ? " " + e.time : ""); }).join(", "), extra].filter(Boolean).join(" · ")));
    h.appendChild(bx); h.appendChild(tx); return h;
  }
  function placeCell(d, p, bs, locked, mineOnly) {
    var single = null;
    var taken = bs.length > 0, mineAny = bs.some(Book.isMine), room = Book.room(p, bs);
    var c = el("div", "bk-a " + (taken ? (mineAny ? "mine taken" : "taken") : "free"));
    var ic = el("span", "ic"); ic.innerHTML = svg(p.icon, 19); c.appendChild(ic);
    var tx = el("div", "tx"); tx.appendChild(el("b", "", p.name));
    if (!taken) tx.appendChild(el("span", "free-t", locked ? "עוד לא פתוח לשריון" : "פנוי"));
    bs.forEach(function (b) {
      var line = el("div", "bk-line");
      var main = el("span", "bk-txt", (p.key === "out" && b.fields && b.fields.where ? b.fields.where + " · " : "") + (b.text || ""));
      line.appendChild(main);
      var who = b.byName && b.uid !== me.id ? "שוריין ע״י " + b.byName : "";
      if (who) line.appendChild(el("em", "", who));
      if (Book.missingBoger(b)) line.appendChild(el("strong", "miss", "חסר בוגר"));
      var mine = b.uid === me.id;
      if (mine || can.manageBookings()) {
        var la = el("span", "bk-line-acts");
        if (mine) la.appendChild(iconBtn("pen", "עריכה", function () { Book.form(b.date, p, b); }, "icon-btn sm"));
        la.appendChild(iconBtn("trash", "ביטול השריון", function () { Book.cancel(b, line); }, "icon-btn sm"));
        /* One booking: its edit / delete sit under the button on the side. Several: next to each one. */
        if (bs.length === 1) single = la; else line.appendChild(la);
      }
      tx.appendChild(line);
    });
    c.appendChild(tx);
    var acts = el("div", "acts");
    /* איזור אש: how many places are left; with room for fewer than 10 it is not offered any more (and nothing is written). */
    if (p.cap && taken && !mineOnly && room >= 10 && room !== Infinity) tx.appendChild(el("span", "bk-room", "נשארו מקומות ל-" + room + " אנשים"));
    var open = !locked && d >= today() && !mineOnly && (p.cap && taken ? room >= 10 : room > 0);
    if (open) acts.appendChild(btn(taken ? "עוד" : "שריון", (taken ? "ghost" : "primary") + " tiny", function () { Book.form(d, p); }, taken ? "plus" : ""));
    if (single) acts.appendChild(single);
    c.appendChild(acts);
    return c;
  }
  Book.cancel = function (b, line) {
    if (line.querySelector(".bk-confirm")) return;
    var cf = el("span", "bk-confirm");
    cf.appendChild(btn("לבטל?", "primary tiny", async function () {
      try { await db.collection("bookings").doc(b.id).delete(); toast("השריון בוטל"); }
      catch (e) { toast("הביטול לא הצליח", true); }
    }));
    cf.appendChild(iconBtn("x", "לא", function () { cf.remove(); }, "icon-btn sm"));
    line.appendChild(cf);
  };
  Book.form = function (d, p, b) {
    var editing = !!b, vals = (b && b.fields) || {};
    var body = el("form", "eu-body"); body.noValidate = true;
    if (p.hint) body.appendChild(el("div", "fv-info", p.hint));
    var unit = unitField(vals.unit), count = input("number", vals.count || "", "כמה אנשים");
    var row = el("div", "frow"); row.appendChild(field("למי?", unit)); if (!p.noCount) row.appendChild(field("כמות אנשים", count)); body.appendChild(row);
    var ex = {};
    if (p.key === "out") {
      var takenG = {}; Book.list.forEach(function (x) { if (x.date === d && x.area === "out" && x.fields && x.id !== (b && b.id)) takenG[x.fields.place] = 1; });
      var opts = GARDENS.filter(function (g) { return !takenG[g[0]]; }).map(function (g) { return [g[0], g[1]]; }).concat([["other", "אחר"]]);
      ex.place = select(opts, vals.place || opts[0][0]);
      ex.other = input("text", vals.place === "other" ? vals.where || "" : "", "שם המקום");
      var otherW = field("לאן בדיוק?", ex.other); otherW.hidden = ex.place.value !== "other";
      ex.place.addEventListener("change", function () { otherW.hidden = ex.place.value !== "other"; if (!otherW.hidden) ex.other.focus(); });
      body.appendChild(field("לאן יוצאים", ex.place));
      body.appendChild(otherW);
    }
    if (p.needBoger) body.appendChild(field(p.key === "fire" ? "הבוגר שתואם איתו" : "שם הבוגר בשטח", ex.boger = input("text", vals.boger || "", "")));
    if (p.key === "proj") {
      var h0 = hmToMin((vals.hours || "").split("-")[0]) || 17 * 60, h1 = hmToMin((vals.hours || "").split("-")[1]) || h0 + 90;
      var tb0 = el("button", "evc-pick"), tb1 = el("button", "evc-pick"); tb0.type = tb1.type = "button";
      var ph = function () { tb0.innerHTML = '<bdi dir="ltr">' + minToHm(h0) + "</bdi>"; tb1.innerHTML = '<bdi dir="ltr">' + minToHm(h1) + "</bdi>"; };
      tb0.onclick = function () { timePop(tb0, h0, function (x) { var dur = h1 - h0; h0 = x; h1 = Math.min(1439, x + Math.max(15, dur)); ph(); }); };
      tb1.onclick = function () { timePop(tb1, h1, function (x) { h1 = x; ph(); }, h0); };
      ph();
      var line = el("div", "evc-line"); line.appendChild(tb0); line.appendChild(el("em", "", "–")); line.appendChild(tb1);
      var wrapT = el("div", "eu-f"); wrapT.appendChild(el("span", "eu-lab", "שעות")); wrapT.appendChild(line); body.appendChild(wrapT);
      ex.hours = { get value() { return minToHm(h0) + "-" + minToHm(h1); } };
    }
    var note = input("textarea", vals.note || "", "לא חובה"); body.appendChild(field("הערות", note));
    var err = el("p", "eu-msg eu-err"); body.appendChild(err);
    var save = el("button", "btn primary small", editing ? "שמירה" : "שריון"); save.type = "submit";
    body.addEventListener("submit", async function (e) {
      e.preventDefault(); err.textContent = "";
      var f = { unit: unit.value, count: p.noCount ? "" : count.value.replace(/\D/g, ""), note: note.value.trim() };
      if (ex.boger) f.boger = ex.boger.value.trim();
      if (ex.hours) f.hours = ex.hours.value;
      if (ex.place) { f.place = ex.place.value; f.where = f.place === "other" ? ex.other.value.trim() : GARDENS.filter(function (g) { return g[0] === f.place; })[0][1]; if (!f.where) { err.textContent = "יש לכתוב לאן יוצאים."; return; } }
      if (!f.unit) { err.textContent = F.isLead() ? "יש לכתוב לאיזה גדוד / צוות." : "יש לבחור גדוד / צוות."; return; }
      if (p.cap) {
        var others = Book.list.filter(function (x) { return x.date === d && x.area === p.key && x.id !== (b && b.id); });
        if (others.length) {
          if (!f.count) { err.textContent = "יש לכתוב כמה אנשים מגיעים."; return; }
          var free = p.cap - Book.people(others);
          if (+f.count > free) { err.textContent = free > 0 ? "נשארו מקומות רק ל-" + free + " אנשים באיזור אש בתאריך הזה." : "איזור אש מלא בתאריך הזה."; return; }
        }
      }
      if (d > Book.limit()) { err.textContent = "אפשר לשריין רק עד חודשיים קדימה."; return; }
      if (!editing && !can.unlimitedBooking()) {
        var near = Book.mineNear(d);
        if (near.length) { err.textContent = "כבר יש לך שריון ב-" + shortDate(near[0].date) + ". אפשר לשריין פעם אחת בכל חודשיים."; return; }
      }
      var text = [f.unit, f.count ? f.count + " אנשים" : "", f.hours ? f.hours : "", f.boger ? "בוגר: " + f.boger : "", f.note].filter(Boolean).join(" · ");
      var rnd = Math.random().toString(36).slice(2, 9);
      var id = editing ? b.id : p.key === "out" ? (f.place !== "other" ? d + "_out_" + f.place : d + "_out_" + rnd) : p.cap && Book.list.some(function (x) { return x.date === d && x.area === p.key; }) ? d + "_" + p.key + "_" + rnd : d + "_" + p.key;
      var ref = db.collection("bookings").doc(id);
      save.disabled = true;
      try {
        await db.runTransaction(async function (tx) {
          var cur = await tx.get(ref);
          if (cur.exists && !(editing && cur.data().uid === me.id)) throw new Error("taken");
          var doc = { date: d, area: p.key, areaName: p.name, text: text, fields: f, uid: me.id, byName: myName(), role: me.role, site: location.origin + location.pathname, at: editing && b.at ? b.at : ts() };
          tx.set(ref, doc);
        });
        closePreview();
        toast(p.needBoger && !f.boger ? "נשמר. חסר בוגר — אפשר להוסיף אחר כך" : (editing ? "השריון עודכן" : "שוריין " + p.name + " ל-" + shortDate(d)));
      } catch (er) {
        err.textContent = er && er.message === "taken" ? "מישהו כבר שריין את המקום הזה בתאריך הזה." : "השריון לא הצליח. נסו שוב.";
        save.disabled = false;
      }
    });
    var foot = el("div", "pv-foot eu-foot"); foot.appendChild(save); foot.appendChild(btn("ביטול", "ghost small", function () { closePreview(); })); body.appendChild(foot);
    openModal({ title: (editing ? "עריכת שריון · " : "שריון ") + p.name, sub: longDate(d), body: body });
  };
  /* Excel of the bookings, laid out like the original table (only for צוות הובלה). */
  Book.export = async function () {
    if (typeof ExcelJS === "undefined") { toast("ייצוא לא זמין כרגע", true); return; }
    var from = addDays(today(), -60), set = {};
    Object.keys(F.activityOnly()).forEach(function (d) { if (d >= from) set[d] = 1; });
    Book.list.forEach(function (b) { set[b.date] = 1; });
    var dates = Object.keys(set).sort();
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("שריון מתחמים", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1, xSplit: 1 }] });
    ws.columns = [{ header: "תאריך", width: 16 }].concat(PLACES.map(function (p) { return { header: p.name, width: p.key === "out" ? 40 : 30 }; }));
    var hr = ws.getRow(1); hr.height = 26;
    hr.eachCell(function (c) { c.font = { bold: true, size: 12, color: { argb: "FF5A2E0E" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE599" } }; c.alignment = { horizontal: "center", vertical: "middle" }; c.border = { bottom: { style: "medium", color: { argb: "FFE0B860" } } }; });
    dates.forEach(function (d, i) {
      var dt = parse(d), vals = [DAYS_S[dt.getDay()] + " " + shortDate(d)];
      var miss = [];
      PLACES.forEach(function (p, k) {
        var bs = Book.list.filter(function (b) { return b.date === d && b.area === p.key; });
        vals.push(bs.map(function (b) { return (p.key === "out" && b.fields && b.fields.where ? b.fields.where + ": " : "") + (b.text || "") + (b.byName ? " (" + b.byName + ")" : "") + (Book.missingBoger(b) ? " — חסר בוגר" : ""); }).join("\n"));
        if (bs.some(Book.missingBoger)) miss.push(k + 2);
      });
      var r = ws.addRow(vals);
      r.alignment = { vertical: "top", wrapText: true, horizontal: "right" };
      r.eachCell({ includeEmpty: true }, function (c, col) {
        c.border = { bottom: { style: "thin", color: { argb: "FFEEE2D0" } }, left: { style: "thin", color: { argb: "FFEEE2D0" } } };
        if (i % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
        if (miss.indexOf(col) !== -1) c.font = { color: { argb: "FFC0283E" } };
      });
      r.getCell(1).font = { bold: true, color: { argb: d < today() ? "FF9A8B7C" : "FF3A2A1C" } };
    });
    var buf = await wb.xlsx.writeBuffer();
    await shareOrDownload(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "שריון מתחמים " + shortDate(today()) + ".xlsx");
  };

  /* ======================================================================
     ציוד מרכז: requests go to the requester's direct manager (or that manager's manager) for approval
     ====================================================================== */
  var Gear = F.Gear = { list: [], tab: "mine", loaded: false };
  var ST = Gear.ST = { pending: "ממתין לאישור", approved: "אושר", changes: "הוחזר לתיקון", rejected: "נדחה" };
  Gear.start = function () {
    var parts = {};
    var merge = function () {
      var all = {}; Object.keys(parts).forEach(function (k) { parts[k].forEach(function (g) { all[g.id] = g; }); });
      Gear.list = Object.keys(all).map(function (k) { return all[k]; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
      Gear.loaded = true; Gear.changed();
    };
    var on = function (key, q) {
      F.listen(q.onSnapshot(function (s) { var l = []; s.forEach(function (d) { var x = d.data(); x.id = d.id; l.push(x); }); parts[key] = l; merge(); }, function () { parts[key] = []; merge(); }));
    };
    if (can.seeAllGear()) on("all", db.collection("gear").where("date", ">=", addDays(today(), -45)));
    else {
      on("mine", db.collection("gear").where("uid", "==", me.id)); on("appr", db.collection("gear").where("approvers", "array-contains", me.id));
      if (F.myUnit()) on("unit", db.collection("gear").where("unit", "==", F.myUnit()));
    }
  };
  Gear.changed = function () {
    var a = Gear.attention(); F.badge("gear", a.n, a.dot);
    if (F.area === "gear" && Gear.built) { Gear.render(); Gear.markSeen(); }
    if (F.area === "home") Home.render();
  };
  Gear.canApprove = function (g) { return me.admin || (g.approvers || []).indexOf(me.id) !== -1; };
  Gear.answered = function () { return Gear.list.filter(function (g) { return g.uid === me.id && g.ownerSeen === false && g.status !== "pending" && !g.dismissed; }); };
  Gear.attention = function () {
    var appr = Gear.list.filter(function (g) { return g.status === "pending" && Gear.canApprove(g) && g.uid !== me.id; }).length;
    var ans = Gear.answered().length;
    if (appr) return { n: appr, label: appr === 1 ? "בקשה מחכה לאישור שלך" : "בקשות מחכות לאישור שלך", dot: false };
    if (ans) return { n: ans, label: "תשובות חדשות על ציוד", dot: true };
    var open = Gear.list.filter(function (g) { return g.uid === me.id && g.status === "pending"; }).length;
    return { n: open, label: "בקשות ציוד ממתינות", dot: false, quiet: true };
  };
  /* Opening the area counts as having seen the answers. */
  Gear.markSeen = function () {
    Gear.answered().forEach(function (g) { g.ownerSeen = true; db.collection("gear").doc(g.id).set({ ownerSeen: true }, { merge: true }).catch(function () {}); });
    var a = Gear.attention(); F.badge("gear", a.dot ? 0 : a.n, false);
  };
  Gear.open = function () { if (!Gear.built) Gear.build(); Gear.render(); Gear.markSeen(); };
  Gear.build = function () {
    Gear.built = true;
    var v = Gear.view;
    head(v, "ציוד מרכז");
    Gear.newBtn = btn("בקשת ציוד חדשה", "primary small fv-act", function () { Gear.form(); }, "plus");
    v.appendChild(Gear.newBtn);
    Gear.seg = el("div", "fseg"); v.appendChild(Gear.seg);
    Gear.body = el("div", "gr-list"); v.appendChild(Gear.body);
  };
  Gear.tabs = function () {
    var t = [["mine", "הבקשות שלי"]];
    var appr = Gear.list.some(function (g) { return Gear.canApprove(g) && g.uid !== me.id; });
    if (appr || me.admin) t.push(["review", "לאישור"]);
    if (can.shop()) t.push(["shop", "רשימת קניות"]);
    if (can.seeAllGear()) t.push(["all", "כל הבקשות"]);
    return t;
  };
  Gear.render = function () {
    if (!Gear.built) return;
    var tabs = Gear.tabs();
    if (!tabs.some(function (t) { return t[0] === Gear.tab; })) Gear.tab = "mine";
    Gear.seg.textContent = ""; Gear.seg.hidden = tabs.length < 2;
    tabs.forEach(function (t) {
      var b = el("button", t[0] === Gear.tab ? "on" : "", t[1]); b.type = "button";
      if (t[0] === "review") { var n = Gear.list.filter(function (g) { return g.status === "pending" && Gear.canApprove(g) && g.uid !== me.id; }).length; if (n) b.appendChild(el("span", "cnt", String(n))); }
      b.addEventListener("click", function () { Gear.tab = t[0]; Gear.render(); });
      Gear.seg.appendChild(b);
    });
    var box = Gear.body; box.textContent = "";
    if (!Gear.loaded) { box.appendChild(el("p", "fv-empty", "טוען…")); return; }
    var t0 = today();
    if (Gear.tab === "shop") return Gear.shop(box);
    var list = Gear.list.filter(function (g) {
      if (Gear.tab === "mine") return (g.uid === me.id || F.sameUnit(g.unit)) && !g.dismissed && g.date >= addDays(t0, -14);
      if (Gear.tab === "review") return g.status === "pending" && Gear.canApprove(g) && g.uid !== me.id;
      return true;
    });
    if (!list.length) box.appendChild(el("p", "fv-empty", Gear.tab === "mine" ? "עוד לא ביקשת ציוד." : Gear.tab === "review" ? "אין בקשות שמחכות לאישור." : "אין בקשות."));
    list.forEach(function (g) { box.appendChild(Gear.card(g)); });
  };
  Gear.card = function (g) {
    var c = el("article", "gr");
    var h = el("div", "gr-h"), t = el("div", "gr-t");
    t.appendChild(el("strong", "", (g.unit || "בקשת ציוד") + " · " + longDate(g.date)));
    t.appendChild(el("small", "", [g.uid === me.id ? "" : g.byName, g.role, inDays(g.date)].filter(Boolean).join(" · ")));
    h.appendChild(t); h.appendChild(el("span", "st " + g.status, ST[g.status] || g.status)); c.appendChild(h);
    var tb = el("div", "gr-items");
    var groups = {}; (g.items || []).forEach(function (it) { var k = it.activity || ""; (groups[k] = groups[k] || []).push(it); });
    Object.keys(groups).forEach(function (k) {
      if (k) tb.appendChild(el("div", "gr-act", k));
      groups[k].forEach(function (it) { var li = el("div", "gr-it"); li.appendChild(el("span", "q", "×" + (it.qty || 1))); li.appendChild(el("span", "n", it.name)); tb.appendChild(li); });
    });
    c.appendChild(tb);
    if (g.note) c.appendChild(el("small", "gr-note-plain", "הערות: " + g.note));
    if (g.review && g.review.note && (g.status === "changes" || g.status === "rejected")) {
      var rn = el("div", "gr-note"); rn.appendChild(el("b", "", (g.status === "rejected" ? "סיבת הדחייה" : "מה צריך לתקן") + " (" + (g.review.byName || "") + "):")); rn.appendChild(document.createTextNode(g.review.note)); c.appendChild(rn);
    }
    if (g.status === "approved" && g.review && g.review.byName) c.appendChild(el("small", "gr-by", "אושר ע״י " + g.review.byName));
    var acts = el("div", "gr-acts");
    if (g.uid === me.id) {
      if (g.status === "rejected") acts.appendChild(btn("הבנתי", "primary tiny", function () { db.collection("gear").doc(g.id).set({ dismissed: true, ownerSeen: true }, { merge: true }).catch(function () { toast("העדכון לא הצליח", true); }); }, "check"));
      else acts.appendChild(btn(g.status === "changes" ? "תיקון ושליחה מחדש" : "עריכה", g.status === "changes" ? "primary tiny" : "ghost tiny", function () { Gear.form(g); }, "pen"));
      acts.appendChild(btn("מחיקה", "ghost tiny", function () { Gear.del(g, c); }, "trash"));
    }
    if (Gear.canApprove(g) && g.uid !== me.id) {
      if (g.status === "pending") {
        acts.appendChild(btn("אישור", "primary tiny", function () { Gear.review(g, "approved", ""); }, "check"));
        acts.appendChild(btn("החזרה לתיקון", "ghost tiny", function () { Gear.ask(g, c, "changes"); }, "undo"));
        acts.appendChild(btn("דחייה", "ghost tiny danger-t", function () { Gear.ask(g, c, "rejected"); }, "ban"));
      } else if (g.status === "approved") acts.appendChild(btn("ביטול האישור", "ghost tiny", function () { Gear.review(g, "pending", ""); }, "undo"));
    }
    if (acts.children.length) c.appendChild(acts);
    return c;
  };
  Gear.del = function (g, card) {
    if (card.querySelector(".gr-ask")) return;
    var w = el("div", "gr-ask row"); w.appendChild(el("span", "", "למחוק את הבקשה?"));
    w.appendChild(btn("מחיקה", "primary tiny", async function () { try { await db.collection("gear").doc(g.id).delete(); toast("הבקשה נמחקה"); } catch (e) { toast("המחיקה לא הצליחה", true); } }));
    w.appendChild(btn("ביטול", "ghost tiny", function () { w.remove(); }));
    card.appendChild(w);
  };
  Gear.ask = function (g, card, status) {
    var old = card.querySelector(".gr-ask"); if (old) old.remove();
    var w = el("div", "gr-ask");
    var ta = input("textarea", "", status === "rejected" ? "למה הבקשה נדחית?" : "מה צריך לתקן?"); w.appendChild(ta);
    var a = el("div", "gr-acts");
    a.appendChild(btn(status === "rejected" ? "דחייה" : "החזרה לתיקון", "primary tiny", function () { if (!ta.value.trim()) { ta.focus(); return; } Gear.review(g, status, ta.value.trim()); }));
    a.appendChild(btn("ביטול", "ghost tiny", function () { w.remove(); }));
    w.appendChild(a); card.appendChild(w); ta.focus();
  };
  Gear.review = async function (g, status, note) {
    try {
      var rv = { by: me.id, byName: myName(), note: note, at: Date.now() };
      var upd = { status: status, review: rv, updatedAt: ts(), ownerSeen: status === "pending", push: status === "pending" ? "" : "todo", pushTo: "owner" };
      await db.collection("gear").doc(g.id).set(upd, { merge: true });
      toast(status === "approved" ? "הבקשה אושרה ונוספה לרשימת הקניות" : status === "changes" ? "הבקשה הוחזרה לתיקון" : status === "rejected" ? "הבקשה נדחתה" : "האישור בוטל");
    } catch (e) { toast("העדכון לא הצליח", true); }
  };
  Gear.form = function (g) {
    var editing = !!g, t0 = today();
    var body = el("form", "eu-body"); body.noValidate = true;
    if (g && (g.status === "changes" || g.status === "rejected") && g.review) { var rn = el("div", "gr-note"); rn.appendChild(el("b", "", "מה ביקשו לתקן:")); rn.appendChild(document.createTextNode(g.review.note || "")); body.appendChild(rn); }
    var only = F.activityOnly(); if (g) only[g.date] = true;
    var next = Object.keys(only).filter(function (d) { return d >= t0; }).sort()[0] || "";
    var dp = datePick(g ? g.date : next, { only: only, title: "תאריך הפעולה", ph: "בחירת פעולה מהלו״ז" });
    var dw = el("div", "eu-f"); dw.appendChild(el("span", "eu-lab", "תאריך הפעולה")); dw.appendChild(dp); body.appendChild(dw);
    var unit = unitField(g ? g.unit : ""); body.appendChild(field("למי?", unit));
    var wrap = el("div", "eu-f"); wrap.appendChild(el("span", "eu-lab", "פריטים"));
    var items = el("div", "items-ed"); wrap.appendChild(items);
    function addRow(it, focus) {
      var r = el("div", "item-row");
      var prev = items.lastChild ? items.lastChild.querySelector(".i-act").value : "";
      var act = input("text", it ? it.activity || "" : prev, "פעילות"); act.classList.add("i-act");
      var n = input("text", it ? it.name : "", "פריט"); n.classList.add("i-name");
      var q = input("number", it ? String(it.qty || 1) : "1", "כמות"); q.classList.add("i-qty");
      var x = el("button", "x"); x.type = "button"; x.innerHTML = svg("x", 16); x.setAttribute("aria-label", "הסרת פריט");
      x.addEventListener("click", function () { if (items.children.length > 1) r.remove(); else { n.value = ""; q.value = "1"; } });
      n.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addRow(null, true); } });
      r.appendChild(act); r.appendChild(n); r.appendChild(q); r.appendChild(x); items.appendChild(r);
      if (focus) (act.value ? n : act).focus();
    }
    ((g && g.items) || [null, null]).forEach(function (it) { addRow(it); });
    wrap.appendChild(btn("פריט נוסף", "ghost tiny add-item", function () { addRow(null, true); }, "plus"));
    body.appendChild(wrap);
    var note = input("textarea", g ? g.note || "" : "", "לא חובה"); body.appendChild(field("הערות", note));
    var err = el("p", "eu-msg eu-err"); body.appendChild(err);
    var save = el("button", "btn primary small", editing ? "שליחה מחדש לאישור" : "שליחה לאישור"); save.type = "submit";
    body.addEventListener("submit", async function (ev) {
      ev.preventDefault(); err.textContent = "";
      var list = [];
      Array.prototype.forEach.call(items.children, function (r) {
        var a = r.querySelector(".i-act").value.trim(), n = r.querySelector(".i-name").value.trim(), q = parseInt(r.querySelector(".i-qty").value, 10) || 1;
        if (n) list.push({ activity: a, name: n, qty: q, bought: false });
      });
      if (!dp.val()) { err.textContent = "יש לבחור תאריך של פעולה."; return; }
      if (!unit.value) { err.textContent = "יש לבחור גדוד / צוות."; return; }
      if (!list.length) { err.textContent = "יש להוסיף לפחות פריט אחד."; return; }
      if (list.some(function (it) { return !it.activity; })) { err.textContent = "לכל פריט צריך לכתוב לאיזו פעילות הוא."; return; }
      var doc = { date: dp.val(), unit: unit.value, items: list, note: note.value.trim(), status: "pending", review: null, dismissed: false, ownerSeen: true,
        approvers: Org.approvers(me.id), notifyTo: Org.notifyTo(me.id), push: "todo", pushTo: "approver", site: location.origin + location.pathname, updatedAt: ts() };
      save.disabled = true;
      try {
        if (editing) await db.collection("gear").doc(g.id).set(doc, { merge: true });
        else { doc.uid = me.id; doc.byName = myName(); doc.role = me.role; doc.at = ts(); await db.collection("gear").add(doc); }
        closePreview(); toast(editing ? "הבקשה נשלחה שוב לאישור" : "הבקשה נשלחה לאישור"); Gear.tab = "mine";
      } catch (e) { err.textContent = "השליחה לא הצליחה. נסו שוב."; save.disabled = false; }
    });
    var foot = el("div", "pv-foot eu-foot"); foot.appendChild(save); foot.appendChild(btn("ביטול", "ghost small", function () { closePreview(); })); body.appendChild(foot);
    openModal({ title: editing ? "עריכת בקשת ציוד" : "בקשת ציוד חדשה", body: body, cls: "wide" });
  };
  /* The shopping list: everything approved for coming activities, with tick boxes; total only for the coming week. */
  Gear.shop = function (box) {
    var t0 = today(), wk = addDays(t0, 7);
    var appr = Gear.list.filter(function (g) { return g.status === "approved" && g.date >= t0; });
    if (!appr.length) { box.appendChild(el("p", "fv-empty", "אין ציוד מאושר לפעולות הקרובות.")); return; }
    var byDate = {}; appr.forEach(function (g) { (byDate[g.date] = byDate[g.date] || []).push(g); });
    var tot = {}, week = appr.filter(function (g) { return g.date <= wk; });
    week.forEach(function (g) { (g.items || []).forEach(function (it) { if (it.bought) return; var k = it.name.trim(); tot[k] = (tot[k] || 0) + (+it.qty || 1); }); });
    var keys = Object.keys(tot).sort(function (a, b) { return a.localeCompare(b, "he"); });
    var sum = el("section", "shop");
    var sh = el("div", "shop-h"); sh.appendChild(el("strong", "", "סה״כ לקנייה בשבוע הקרוב")); sh.appendChild(el("small", "", keys.length + " פריטים"));
    sh.appendChild(iconBtn(sharePhone() ? "share" : "copy", sharePhone() ? "שיתוף הרשימה" : "העתקת הרשימה", function () { shareOrCopy(shopText(byDate, wk)); }));
    sum.appendChild(sh);
    if (!keys.length) sum.appendChild(el("p", "fv-empty", week.length ? "הכל נקנה 🎉" : "אין מה לקנות השבוע."));
    keys.forEach(function (k) { var r = el("div", "shop-row static"); r.appendChild(el("span", "n", k)); r.appendChild(el("span", "q", "×" + tot[k])); sum.appendChild(r); });
    box.appendChild(sum);
    Object.keys(byDate).sort().forEach(function (d) {
      var s = el("section", "shop");
      var h = el("div", "shop-h"); h.appendChild(el("strong", "", longDate(d))); h.appendChild(el("small", "", inDays(d))); s.appendChild(h);
      byDate[d].forEach(function (g) {
        (g.items || []).forEach(function (it) {
          var r = el("div", "shop-row" + (it.bought ? " done" : ""));
          var ck = el("span", "ck"); ck.innerHTML = svg("check", 15); r.appendChild(ck);
          var n = el("span", "n", it.name); n.appendChild(el("small", "", [it.activity, g.unit, g.byName].filter(Boolean).join(" · "))); r.appendChild(n);
          r.appendChild(el("span", "q", "×" + (it.qty || 1)));
          r.setAttribute("role", "checkbox"); r.setAttribute("aria-checked", String(!!it.bought)); r.tabIndex = 0;
          r.addEventListener("click", async function () {
            it.bought = !it.bought; r.classList.toggle("done", it.bought); r.setAttribute("aria-checked", String(it.bought));
            try { await db.collection("gear").doc(g.id).set({ items: g.items }, { merge: true }); }
            catch (e) { it.bought = !it.bought; r.classList.toggle("done", it.bought); toast("העדכון לא הצליח", true); }
          });
          s.appendChild(r);
        });
      });
      box.appendChild(s);
    });
  };
  function shopText(byDate, wk) {
    var lines = ["🛒 רשימת קניות – ציוד מרכז"];
    Object.keys(byDate).sort().forEach(function (d) {
      if (d > wk) return;
      var its = []; byDate[d].forEach(function (g) { (g.items || []).forEach(function (it) { if (!it.bought) its.push("• " + it.name + " ×" + (it.qty || 1) + (it.activity ? " (" + it.activity + ")" : "")); }); });
      if (its.length) { lines.push(""); lines.push(longDate(d) + ":"); lines = lines.concat(its); }
    });
    return lines.join("\n");
  }

  /* ======================================================================
     Useful links
     ====================================================================== */
  var Links = F.Links = { list: [], loaded: false };
  Links.start = function () {
    F.listen(db.collection("links").onSnapshot(function (s) {
      Links.list = []; s.forEach(function (d) { var x = d.data(); x.id = d.id; Links.list.push(x); });
      Links.list.sort(function (a, b) { return (a.cat || "").localeCompare(b.cat || "", "he") || (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title), "he"); });
      Links.loaded = true; if (F.area === "links" && Links.built) Links.render();
    }, function () { Links.loaded = true; Links.err = true; if (Links.built) Links.render(); }));
  };
  Links.open = function () { if (!Links.built) Links.build(); Links.render(); };
  Links.build = function () {
    Links.built = true;
    var v = Links.view;
    head(v, "קישורים שימושיים");
    Links.addBtn = btn("קישור חדש", "primary small fv-act", function () { Links.form(); }, "plus");
    v.appendChild(Links.addBtn);
    Links.body = el("div", "lk-list"); v.appendChild(Links.body);
  };
  Links.render = function () {
    Links.addBtn.hidden = !can.manageLinks();
    var box = Links.body; box.textContent = "";
    if (!Links.loaded) { box.appendChild(el("p", "fv-empty", "טוען…")); return; }
    if (!Links.list.length) { box.appendChild(el("p", "fv-empty", can.manageLinks() ? "עוד אין קישורים. לחצו על ״קישור חדש״." : "עוד אין קישורים.")); return; }
    var lastCat = null;
    Links.list.forEach(function (l) {
      if ((l.cat || "") !== lastCat) { lastCat = l.cat || ""; if (lastCat) box.appendChild(el("div", "lk-cat", lastCat)); }
      var card = el("div", "lk");
      var a = el("a", "lk-main"); a.href = l.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.draggable = false;
      var fav = el("span", "fav"), host = ""; try { host = new URL(l.url).hostname; } catch (e) {}
      if (l.icon) { var im0 = el("img"); im0.alt = ""; im0.src = l.icon; im0.draggable = false; fav.appendChild(im0); fav.classList.add("own"); }
      else if (host) { var im = el("img"); im.alt = ""; im.draggable = false; im.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=64"; im.onerror = function () { fav.textContent = (l.title || "?").charAt(0); }; fav.appendChild(im); }
      else fav.textContent = (l.title || "?").charAt(0);
      a.appendChild(fav);
      var tx = el("span", "tx"); tx.appendChild(el("b", "", l.title)); tx.appendChild(el("small", "", l.desc || host)); a.appendChild(tx);
      card.appendChild(a);
      card.appendChild(iconBtn(sharePhone() ? "share" : "copy", sharePhone() ? "שיתוף הקישור" : "העתקת הקישור", function () { shareOrCopy(l.title, l.url, l.title); }, "icon-btn lk-b"));
      if (can.manageLinks()) card.appendChild(iconBtn("pen", "עריכה", function () { Links.form(l); }, "icon-btn lk-b"));
      box.appendChild(card);
    });
  };
  /* A picture the manager picks becomes a small square icon stored with the link. */
  function iconFromFile(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var S = 96, c = document.createElement("canvas"); c.width = c.height = S; var x = c.getContext("2d");
        var s = Math.min(img.width, img.height); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
        URL.revokeObjectURL(url); resolve(c.toDataURL("image/png"));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("img")); };
      img.src = url;
    });
  }
  Links.form = function (l) {
    var editing = !!l, icon = l ? l.icon || "" : "";
    var body = el("form", "eu-body"); body.noValidate = true;
    var t = input("text", l ? l.title : "", "למשל: טופס אישור הורים"), u = input("url", l ? l.url : "", "https://…"); u.dir = "ltr";
    var d = input("text", l ? l.desc || "" : "", "לא חובה"), c = input("text", l ? l.cat || "" : "", "למשל: טפסים");
    var cats = {}; Links.list.forEach(function (x) { if (x.cat) cats[x.cat] = 1; });
    if (Object.keys(cats).length) { var dl = el("datalist"); dl.id = "lkCats"; Object.keys(cats).forEach(function (k) { var o = el("option"); o.value = k; dl.appendChild(o); }); body.appendChild(dl); c.setAttribute("list", "lkCats"); }
    body.appendChild(field("שם", t)); body.appendChild(field("קישור", u)); body.appendChild(field("תיאור", d)); body.appendChild(field("קטגוריה", c));
    var iw = el("div", "eu-f"); iw.appendChild(el("span", "eu-lab", "אייקון"));
    var irow = el("div", "icon-row"), prev = el("span", "fav"), fileIn = el("input"); fileIn.type = "file"; fileIn.accept = "image/*"; fileIn.hidden = true;
    var paintI = function () { prev.textContent = ""; if (icon) { var im = el("img"); im.src = icon; im.alt = ""; prev.appendChild(im); prev.classList.add("own"); } else { prev.classList.remove("own"); prev.innerHTML = svg("img", 20); } rm.hidden = !icon; };
    var up = btn("העלאת תמונה", "ghost tiny", function () { fileIn.click(); }, "img"), rm = btn("אייקון אוטומטי", "ghost tiny", function () { icon = ""; paintI(); });
    fileIn.addEventListener("change", async function () { var f = fileIn.files[0]; if (!f) return; try { icon = await iconFromFile(f); paintI(); } catch (e) { toast("לא הצלחנו לקרוא את התמונה", true); } fileIn.value = ""; });
    irow.appendChild(prev); irow.appendChild(up); irow.appendChild(rm); irow.appendChild(fileIn); iw.appendChild(irow); body.appendChild(iw);
    paintI();
    var err = el("p", "eu-msg eu-err"); body.appendChild(err);
    var save = el("button", "btn primary small", "שמירה"); save.type = "submit";
    body.addEventListener("submit", async function (ev) {
      ev.preventDefault(); err.textContent = "";
      var url = u.value.trim(); if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      if (!t.value.trim()) { err.textContent = "יש לכתוב שם."; return; }
      try { new URL(url); } catch (e) { err.textContent = "הקישור לא תקין."; return; }
      var doc = { title: t.value.trim(), url: url, desc: d.value.trim(), cat: c.value.trim(), icon: icon, by: me.id, at: ts() };
      if (!editing) doc.order = Date.now();
      save.disabled = true;
      try { if (editing) await db.collection("links").doc(l.id).set(doc, { merge: true }); else await db.collection("links").add(doc); closePreview(); }
      catch (e) { err.textContent = "השמירה לא הצליחה."; save.disabled = false; }
    });
    var foot = el("div", "pv-foot eu-foot"); foot.appendChild(save);
    if (editing) foot.appendChild(btn("מחיקה", "ghost small", async function () { try { await db.collection("links").doc(l.id).delete(); closePreview(); } catch (e) { err.textContent = "המחיקה לא הצליחה."; } }, "trash"));
    foot.appendChild(btn("ביטול", "ghost small", function () { closePreview(); }));
    body.appendChild(foot);
    openModal({ title: editing ? "עריכת קישור" : "קישור חדש", body: body });
  };

  /* ======================================================================
     Settings additions for managers: the gadud / team list, and which roles see which categories
     ====================================================================== */
  var Settings = F.Settings = { vis: null };
  Settings.open = function () {
    var back = document.querySelector("#viewSettings nav.back a"); if (back) back.setAttribute("href", "#" + (F.lastArea || "home"));
    Settings.render();
    if (me.admin && !Settings.visLoaded) {
      Settings.visLoaded = true;
      F.listen(db.collection("config").doc("calendar").onSnapshot(function (s) { Settings.vis = (s.exists && s.data().hidden) || {}; Settings.render(); }, function () { Settings.vis = {}; }));
    }
  };
  Settings.render = function () {
    var box = Settings.box; if (!box) return;
    box.textContent = "";
    if (!me.admin) return;
    // category visibility per role
    box.appendChild(el("h2", "sec-title grp", "קטגוריות בלו״ז לפי תפקיד"));
    var c2 = el("section", "card vis-card");
    c2.appendChild(el("p", "note", "מסמנים איזה תפקיד רואה כל קטגוריה. הקטגוריות במקרא של כל אחד הן רק אלה שהוא רואה."));
    var vis = Settings.vis || {}, cats = Cal.cats;
    if (!cats.length) c2.appendChild(el("p", "muted-empty", "הקטגוריות ייטענו עם הלו״ז."));
    else {
      var tw = el("div", "vis-wrap"), tb = el("table", "vis-t"), thead = el("thead");
      /* צוות הובלה is one column (all its roles together); the rest of the roles each have their own. */
      var LEADR = ["מרכז צעיר"].concat(BOGER);
      var cols = [["צוות הובלה", LEADR], ["ראשג״ד", ["ראשג״ד"]], ["ראש״צ", ["ראש״צ"]], ["מדריך קורס", ["מדריך קורס"]]];
      var hr = el("tr"); hr.appendChild(el("th", "vis-c0", "קטגוריה")); cols.forEach(function (c) { hr.appendChild(el("th", "vis-r", c[0])); }); thead.appendChild(hr);
      tb.appendChild(thead);
      var tbody = el("tbody");
      cats.forEach(function (c) {
        var tr = el("tr"), th = el("th", "vis-c"); var dot = el("i"); dot.style.background = "#" + c.color; th.appendChild(dot); th.appendChild(document.createTextNode(c.name)); tr.appendChild(th);
        cols.forEach(function (col) {
          var td = el("td"), cb = el("input"); cb.type = "checkbox";
          cb.checked = col[1].every(function (r) { return (vis[r] || []).indexOf(c.name) === -1; });
          cb.setAttribute("aria-label", c.name + " · " + col[0]);
          cb.addEventListener("change", function () { col[1].forEach(function (r) { var h = (vis[r] || []).filter(function (x) { return x !== c.name; }); if (!cb.checked) h.push(c.name); vis[r] = h; }); saveVis(vis); });
          td.appendChild(cb); tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody); tw.appendChild(tb); c2.appendChild(tw);
    }
    box.appendChild(c2);
  };
  var visT = null;
  function saveVis(vis) { clearTimeout(visT); visT = setTimeout(async function () { try { await db.collection("config").doc("calendar").set({ hidden: vis }, { merge: true }); toast("נשמר. הלו״ז יתעדכן אצל כולם תוך כמה שניות"); } catch (e) { toast("השמירה לא הצליחה", true); } }, 400); }

  /* ======================================================================
     תובנות: for managers, on a computer
     ====================================================================== */
  /* Rough prices (₪, per unit as usually requested) of items that come up in requests. Matched by words in the item name. */
  var PRICES = [
    [/בריסטול/, 3], [/גיליון|דפים|דף A|נייר צבעוני|נייר/, 0.3], [/טוש|מרקר/, 3], [/עפרונ|עט /, 1.5], [/סלוטייפ|נייר דבק|דבק נייר/, 5], [/דבק|פלסטלינה/, 6],
    [/חבל/, 12], [/סיזל/, 15], [/בד /, 20], [/שקית|שקיות/, 0.5], [/שקי אשפה|שקית אשפה/, 0.5], [/כוס|כוסות/, 0.3], [/צלחת|צלחות/, 0.4], [/מזלג|כפית|סכו"ם|סכום/, 0.2],
    [/מרשמלו/, 8], [/במבה|ביסלי|חטיף/, 5], [/שוקולד/, 7], [/עוגי/, 10], [/שתייה|מיץ|בקבוק/, 7], [/מים/, 3], [/פיתה|לחם/, 1.5], [/ירקות|פירות/, 10],
    [/פחמים/, 25], [/גחלים/, 25], [/גז|מצית/, 10], [/נפט|נוזל הצתה/, 15], [/נר/, 2], [/פנס/, 20], [/סוללה|סוללות/, 4],
    [/בלון|בלונים/, 0.5], [/צבע/, 15], [/מכחול/, 4], [/ספוג/, 3], [/כפפ/, 1], [/אוהל/, 150], [/ברזנט|יריעה/, 40], [/יתד/, 2],
    [/כדור/, 25], [/קונוס|קונוסים/, 5], [/משרוקית/, 8], [/דגל/, 15], [/אזיק|סוגר/, 0.5], [/מספריים/, 10], [/סכין/, 12], [/מחבת|סיר/, 50]
  ];
  function price(it) { var n = String(it.name || ""); for (var i = 0; i < PRICES.length; i++) if (PRICES[i][0].test(n)) return PRICES[i][1] * (+it.qty || 1); return null; }
  var Ins = F.Ins = {};
  Ins.open = async function () {
    var v = Ins.view; v.textContent = "";
    head(v, "תובנות");
    var body = el("div", "ins"); v.appendChild(body);
    body.appendChild(el("p", "fv-empty", "אוספים נתונים…"));
    try {
      var since = new Date(Date.now() - 60 * 864e5).toLocaleDateString("sv-SE");
      var res = await Promise.all([
        db.collection("usage").where("day", ">=", since).get(),
        db.collection("bookings").get(),
        db.collection("gear").get(),
        db.collection("cal_ops").get(),
        db.collection("users").get()
      ]);
      var usage = [], books = [], gear = [], ops = [], users = {};
      res[0].forEach(function (d) { usage.push(d.data()); });
      res[1].forEach(function (d) { books.push(d.data()); });
      res[2].forEach(function (d) { gear.push(d.data()); });
      res[3].forEach(function (d) { ops.push(d.data()); });
      res[4].forEach(function (d) { users[d.id] = d.data(); });
      Ins.draw(body, usage, books, gear, ops, users);
    } catch (e) { body.textContent = ""; body.appendChild(el("div", "fv-err", "לא הצלחנו לטעון את הנתונים.")); }
  };
  Ins.draw = function (body, usage, books, gear, ops, users) {
    body.textContent = "";
    var nm = function (id) { var u = users[id]; return u ? (u.fullName || u.name || id) : (id || "").replace(/@.*/, ""); };
    var d30 = new Date(Date.now() - 30 * 864e5).toLocaleDateString("sv-SE"), d7 = new Date(Date.now() - 7 * 864e5).toLocaleDateString("sv-SE");
    var u30 = usage.filter(function (u) { return u.day >= d30; });
    var active7 = {}, active30 = {}, opens = 0, byUser = {}, areas = {}, perDay = {}, devices = { phone: 0, desktop: 0 }, app = 0;
    u30.forEach(function (u) {
      active30[u.email] = 1; if (u.day >= d7) active7[u.email] = 1;
      var n = (u.counts && u.counts.open) || 0; opens += n; byUser[u.email] = (byUser[u.email] || 0) + n + 1;
      Object.keys(u.areas || {}).forEach(function (a) { areas[a] = (areas[a] || 0) + (u.areas[a] || 0); });
      perDay[u.day] = (perDay[u.day] || 0) + 1;
      if (u.device) devices[u.device] = (devices[u.device] || 0) + 1; if (u.app) app++;
    });
    var gearCost = 0, unknown = 0, costBy = {}, countBy = {}, items = {}, unitCost = {};
    gear.forEach(function (g) {
      var c = 0; (g.items || []).forEach(function (it) { var p = price(it); if (p == null) unknown++; else c += p; items[it.name] = (items[it.name] || 0) + (+it.qty || 1); });
      if (g.status !== "rejected") { gearCost += c; costBy[g.uid] = (costBy[g.uid] || 0) + c; unitCost[g.unit || "—"] = (unitCost[g.unit || "—"] || 0) + c; }
      countBy[g.uid] = (countBy[g.uid] || 0) + 1;
    });
    var bookBy = {}, bookArea = {}, bookUnit = {};
    books.forEach(function (b) { if (b.imported) return; bookBy[b.uid] = (bookBy[b.uid] || 0) + 1; var a = Book.placeName(b); bookArea[a] = (bookArea[a] || 0) + 1; var u = (b.fields && b.fields.unit) || "—"; bookUnit[u] = (bookUnit[u] || 0) + 1; });
    var opsBy = {}; ops.forEach(function (o) { opsBy[o.uid] = (opsBy[o.uid] || 0) + 1; });
    var k = el("div", "kpis");
    function kpi(n, label, color, sub) { var b = el("div", "kpi static"); b.style.setProperty("--kc", color); b.appendChild(el("b", "", String(n))); b.appendChild(el("span", "", label)); if (sub) b.appendChild(el("small", "", sub)); k.appendChild(b); }
    kpi(Object.keys(active7).length, "משתמשים פעילים השבוע", "var(--accent)", Object.keys(active30).length + " ב-30 יום");
    kpi(opens, "כניסות ב-30 יום", "#579bfc", devices.phone + " ימי שימוש מטלפון · " + devices.desktop + " ממחשב");
    kpi(books.filter(function (b) { return !b.imported; }).length, "שריונים באתר", "#00c875");
    kpi("₪" + Math.round(gearCost).toLocaleString("he-IL"), "עלות משוערת של ציוד מרכז", "#e2445c", gear.length + " בקשות" + (unknown ? " · " + unknown + " פריטים בלי מחיר" : ""));
    body.appendChild(k);
    var grid = el("div", "ins-grid");
    var AREA_N = { home: "בית", cal: "לו״ז", book: "שריונים", gear: "ציוד מרכז", reg: "רשומים", links: "קישורים", settings: "הגדרות", insights: "תובנות" };
    grid.appendChild(bars("כניסות לפי עמוד (30 יום)", Object.keys(areas).map(function (a) { return [AREA_N[a] || a, areas[a]]; })));
    var days = []; for (var i = 29; i >= 0; i--) { var dd = new Date(Date.now() - i * 864e5).toLocaleDateString("sv-SE"); days.push([dd.slice(8) + "." + dd.slice(5, 7), perDay[dd] || 0]); }
    grid.appendChild(cols("משתמשים פעילים ביום", days));
    grid.appendChild(bars("מי נכנס הכי הרבה (30 יום)", Object.keys(byUser).map(function (id) { return [nm(id), byUser[id]]; }), 8));
    grid.appendChild(bars("מי משריין הכי הרבה", Object.keys(bookBy).map(function (id) { return [nm(id), bookBy[id]]; }), 8));
    grid.appendChild(bars("שריונים לפי מתחם", Object.keys(bookArea).map(function (a) { return [a, bookArea[a]]; })));
    grid.appendChild(bars("שריונים לפי גדוד / צוות", Object.keys(bookUnit).map(function (a) { return [a, bookUnit[a]]; }), 8));
    grid.appendChild(bars("מי מבקש הכי הרבה ציוד (עלות משוערת)", Object.keys(countBy).map(function (id) { return [nm(id) + " · " + countBy[id] + " בקשות", Math.round(costBy[id] || 0)]; }), 8, "₪"));
    grid.appendChild(bars("עלות משוערת לפי גדוד / צוות", Object.keys(unitCost).map(function (a) { return [a, Math.round(unitCost[a])]; }), 8, "₪"));
    grid.appendChild(bars("הפריטים המבוקשים ביותר", Object.keys(items).map(function (a) { return [a, items[a]]; }), 10));
    grid.appendChild(bars("שינויים בלו״ז מהאתר", Object.keys(opsBy).map(function (id) { return [nm(id), opsBy[id]]; }), 8));
    var roles = {}; Object.keys(users).forEach(function (id) { var r = users[id].role || "ללא תפקיד"; roles[r] = (roles[r] || 0) + 1; });
    grid.appendChild(bars("משתמשים לפי תפקיד", Object.keys(roles).map(function (r) { return [r, roles[r]]; })));
    var noUnit = Object.keys(users).filter(function (id) { return !users[id].unit && !users[id].paused; }).length;
    var noMgr = Object.keys(users).filter(function (id) { var u = users[id]; return !u.paused && !u.manager && !u.managerName && BOGER.indexOf(u.role) === -1; }).length;
    var miss = el("section", "panel ins-p"); miss.appendChild(el("h3", "", "מה חסר"));
    [[noUnit, "משתמשים בלי גדוד / צוות"], [noMgr, "משתמשים בלי אחראי ישיר"], [books.filter(function (b) { return b.date >= today() && Book.missingBoger(b); }).length, "שריונים קרובים בלי בוגר"], [gear.filter(function (g) { return g.status === "pending"; }).length, "בקשות ציוד שמחכות לאישור"]]
      .forEach(function (x) { var r = el("div", "ins-row"); r.appendChild(el("span", "", x[1])); r.appendChild(el("b", x[0] ? "hot" : "", String(x[0]))); miss.appendChild(r); });
    grid.appendChild(miss);
    body.appendChild(grid);
    body.appendChild(el("p", "note", "העלויות משוערות לפי מחירים ממוצעים בחנויות בארץ, לפי שם הפריט. הכניסות נספרות מהאתר החי בלבד."));
  };
  function bars(title, rows, max, unit) {
    var p = el("section", "panel ins-p"); p.appendChild(el("h3", "", title));
    rows = rows.filter(function (r) { return r[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, max || 12);
    if (!rows.length) { p.appendChild(el("p", "muted-empty", "אין עדיין נתונים.")); return p; }
    var top = rows[0][1];
    rows.forEach(function (r) {
      var row = el("div", "ins-bar"); row.appendChild(el("span", "l", r[0]));
      var tr = el("span", "tr"), f = el("i"); f.style.width = Math.max(3, r[1] / top * 100) + "%"; tr.appendChild(f); row.appendChild(tr);
      row.appendChild(el("b", "", (unit || "") + r[1].toLocaleString("he-IL"))); p.appendChild(row);
    });
    return p;
  }
  function cols(title, rows) {
    var p = el("section", "panel ins-p wide"); p.appendChild(el("h3", "", title));
    var top = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r[1]; })));
    var c = el("div", "ins-cols");
    rows.forEach(function (r) { var col = el("div", "col"); col.title = r[0] + ": " + r[1]; var f = el("i"); f.style.height = (r[1] / top * 100) + "%"; col.appendChild(f); col.appendChild(el("small", "", r[0])); c.appendChild(col); });
    p.appendChild(c); return p;
  }
})();
