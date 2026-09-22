"use strict";
/* ============================================================
   Stallbook
   Data model
     event : the thing you apply to (venue, organiser, fee, registration)
     day   : one selling date belonging to an event
     sale  : belongs to a day
   ============================================================ */

/* ---------------------------- storage ---------------------------- */
const DBNAME = "stallbook", DBVER = 1;
let idb = null;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBNAME, DBVER);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("sales")) {
        const s = d.createObjectStore("sales", { keyPath: "id" });
        s.createIndex("ts", "ts");
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (store, mode) => idb.transaction(store, mode).objectStore(store);
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kvGet = k => req(tx("kv", "readonly").get(k));
const kvSet = (k, v) => req(tx("kv", "readwrite").put(v, k));
const salesAll = () => req(tx("sales", "readonly").getAll());
const salePut = s => req(tx("sales", "readwrite").put(s));
const saleDel = id => req(tx("sales", "readwrite").delete(id));

/* ---------------------------- state ---------------------------- */
const S = {
  items: [], materials: [], categories: [], productTypes: [], events: [], days: [], sales: [], cart: [],
  lots: [], writeoffs: [], reversals: [], trash: [], orders: [], assets: [], cash: [],
  tickets: [], activeTicket: null,
  settings: { currency: "$", activeDay: null, lastBackup: null },
  tab: "sell"
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = s => document.querySelector(s);
const all = s => [...document.querySelectorAll(s)];
const cur = n => "$" + (Math.round(n * 100) / 100).toFixed(2);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const saveItems = () => kvSet("items", S.items);
const saveMaterials = () => kvSet("materials", S.materials);
const saveCategories = () => kvSet("categories", S.categories);
const saveProductTypes = () => kvSet("productTypes", S.productTypes);
/* A type you've stopped buying folds away out of sight. Its supplies keep
   their stock and their history — this only decides where they're shown. */
const inactiveTypes = () => S.settings.inactiveTypes || [];
const isTypeOff = cat => inactiveTypes().includes(cat);
async function setTypeActive(cat, on) {
  const list = inactiveTypes().filter(c => c !== cat);
  S.settings.inactiveTypes = on ? list : list.concat([cat]);
  await saveSettings();
}
const saveTrash = () => kvSet("trash", S.trash);
const saveOrders = () => kvSet("orders", S.orders);
const saveAssets = () => kvSet("assets", S.assets);
const saveCash = () => kvSet("cash", S.cash);
const saveTickets = () => kvSet("tickets", { tickets: S.tickets, active: S.activeTicket });
const saveEvents = () => { stampPaid(false); return kvSet("events", S.events); };
const saveDays = () => kvSet("days", S.days);
const saveSettings = () => kvSet("settings", S.settings);
const saveLots = () => kvSet("lots", S.lots);
const saveWriteoffs = () => kvSet("writeoffs", S.writeoffs);
const saveReversals = () => kvSet("reversals", S.reversals);


/* ---------------------------- look ----------------------------
   Colour in this app is content, not decoration: it comes from the
   balloon, so a red dog is red everywhere it appears.
   -------------------------------------------------------------- */
const BALLOON = {
  red: "#e05c4f", blue: "#4f8fc9", pink: "#e2769c", purple: "#8d6bc4",
  yellow: "#edb63f", green: "#5aa877", orange: "#e8894a", black: "#4a4640",
  white: "#d9d2c4", rainbow: "#e2769c", mixed: "#8d6bc4"
};
const PALETTE = ["#e05c4f", "#4f8fc9", "#e2769c", "#8d6bc4", "#edb63f", "#5aa877", "#e8894a"];
const PRODUCT_HUE = {
  dog: "#e05c4f", sword: "#4f8fc9", bracelet: "#e2769c", headband: "#8d6bc4",
  wand: "#edb63f", crown: "#e8894a", dinosaur: "#5aa877", heart: "#e2769c", display: "#4f8fc9"
};
const balloonColor = word => BALLOON[String(word || "").trim().toLowerCase()] || null;
function hueFor(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
/* the colour of a thing, given whatever options are chosen for it */
function itemColor(item, opts) {
  for (const o of (opts || [])) { const c = balloonColor(o.o); if (c) return c; }
  if (item && item.color) return item.color;
  const n = String((item && item.name) || "").toLowerCase();
  for (const k in PRODUCT_HUE) if (n.includes(k)) return PRODUCT_HUE[k];
  return hueFor(n);
}
/* The coloured initials circle is gone — it guessed at colours and took up
   room. A thing with a photo shows the photo; everything else is just its name. */
/* Cards keep a picture spot either way: the photo if there is one, a quiet
   placeholder if not, so every card lines up and adding a photo later just
   fills the gap. Sheet headers only show a real photo. */
const ICON_PHOTO = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="3.5"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M5 17l4.5-4.5 3 3 2.5-2.5 4 4"></path></svg>';
const ICON_CROP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5V16a2 2 0 0 0 2 2h13.5"></path><path d="M2.5 6H16a2 2 0 0 1 2 2v13.5"></path></svg>';
const thumb = (thing, cls, spot) => thing && thing.photo
  ? `<span class="thumb ${cls || ""}" style="background-image:url('${thing.photo}')"></span>`
  : spot ? `<span class="thumb empty ${cls || ""}" aria-hidden="true">${ICON_PHOTO}</span>` : "";
const colorDot = (color, size) =>
  `<span class="dot" style="width:${size || 20}px;height:${size || 20}px;background:${color}"></span>`;

const ICON = {
  sell: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19z"></path><path d="M9 8a3 3 0 0 1 6 0"></path></svg>',
  items: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4.2"></circle><circle cx="16.5" cy="9" r="3.2"></circle><path d="M5 20c1-3.4 3.6-5 7-5s6 1.6 7 5"></path></svg>',
  days: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="15" rx="4.5"></rect><path d="M3.5 10.5h17M8.5 3.5v4M15.5 3.5v4"></path></svg>',
  money: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19c3-.4 4.6-2.2 6-6s3-6.4 6-7"></path><path d="M4 5v14h16"></path></svg>',
  safe: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5c4.7 0 8.5 1.6 8.5 3.5v10c0 1.9-3.8 3.5-8.5 3.5S3.5 18.9 3.5 17V7c0-1.9 3.8-3.5 8.5-3.5z"></path><path d="M3.5 7c0 1.9 3.8 3.5 8.5 3.5S20.5 8.9 20.5 7"></path></svg>',
  gear: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5h18"></path><path d="M4.5 8.5 3.5 13h17l-1-4.5"></path><path d="M6 13v7M18 13v7M6 16.5h12"></path><path d="M9 8.5V5.5a3 3 0 0 1 6 0v3"></path></svg>',
  stock: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"></path><path d="M4 8.5 12 13l8-4.5M12 13v7"></path></svg>',
  close: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  closeSm: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>'
};

const TABS = [
  { id: "sell", label: "Sell", kicker: "Tap a balloon", title: "Who's next?", icon: ICON.sell },
  { id: "items", label: "Make", kicker: "", title: "Things I make", icon: ICON.items },
  { id: "stock", label: "Inventory", kicker: "", title: "Inventory", icon: ICON.stock },
  { id: "gear", label: "Equipment", kicker: "Not for sale — what the stall is built from", title: "Stall equipment", icon: ICON.gear },
  { id: "events", label: "Events", kicker: "Registrations, bookings and selling days", title: "Events", icon: ICON.days },
  { id: "reports", label: "Reports", kicker: "Takings, write-offs and cash flow", title: "How it's going", icon: ICON.money },
  { id: "data", label: "Safe", kicker: "Never lose a summer", title: "Keep it safe", icon: ICON.safe }
];
const panelOf = id => $("#p" + id[0].toUpperCase() + id.slice(1));

/* what a tile says about whether you can still make one */
function stockNote(it) {
  if (it.stockMode !== "item" && hasRecipe(it)) {
    const mk = canMake(it);
    if (mk === null) return null;
    return { text: mk === 0 ? "None left" : "Enough for " + mk, warn: mk <= 5 };
  }
  if (tracks(it)) {
    const n = onHandTotal(it.id);
    return { text: n === 0 ? "None left" : "Enough for " + n, warn: n === 0 || lowStock(it) };
  }
  return null;
}

/* ---------------------------- dates ---------------------------- */
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseD(s) { const p = String(s || "").split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function daysUntil(s) {
  if (!s) return null;
  return Math.round((parseD(s) - parseD(todayISO())) / 864e5);
}
function fmtDate(d, withYear) {
  if (!d) return "";
  const dt = parseD(d);
  if (isNaN(dt)) return d;
  const o = { weekday: "short", day: "numeric", month: "short" };
  if (withYear || dt.getFullYear() !== new Date().getFullYear()) o.year = "numeric";
  return dt.toLocaleDateString(undefined, o);
}
function countdown(n) {
  if (n === null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? "in " + n + " days" : Math.abs(n) + " days ago";
}

/* ---------------------------- event helpers ----------------------------
   An event is the thing itself — Middlesex County Fair — and it usually comes
   round again. It holds what doesn't change: name, type, website, address,
   organiser, travel, how often it runs and roughly when registration opens.

   An application is one go at it: where you stand, the fee, the selling
   days, the on-the-day details and how it went. Every visit is its own
   application, so this year's answer never overwrites last year's.
   ----------------------------------------------------------------------- */
const STATUS = [
  ["none", "Not applied yet"], ["applied", "Applied"], ["waitlist", "Waitlisted"],
  ["accepted", "Accepted"], ["paid", "Booked & paid"], ["declined", "Declined"]
];
const statusLabel = k => (STATUS.find(s => s[0] === k) || STATUS[0])[1];
const IN_PROGRESS = ["applied", "waitlist", "accepted"];

const FREQ = [
  ["once", "Just once"], ["monthly", "Every month"], ["quarterly", "Every 3 months"],
  ["twice", "Twice a year"], ["annual", "Every year"]
];
const FREQ_STEP = { monthly: 1, quarterly: 3, twice: 6, annual: 12 };
const freqLabel = k => (FREQ.find(f => f[0] === k) || FREQ[0])[1];
const recurring = ev => !!FREQ_STEP[ev.freq];
const DECLINE_REASONS = ["Category full", "Too many balloon vendors", "Applied too late", "Didn't meet their criteria"];

function blankEvent() {
  return {
    id: uid(), name: "", type: "", address: "", website: "",
    org: { name: "", email: "", phone: "" }, travel: 0,
    freq: "annual", estOpen: "", estClose: "", regOpens: "", regDeadline: "",
    remindDays: 7, retired: false, retiredWhy: "", skip: [],
    apps: [], created: Date.now()
  };
}
function blankApp() {
  return {
    id: uid(), cycle: "", status: "applied", declineWhy: "",
    fee: 0, loadIn: "", startTime: "", endTime: "",
    boothSize: "", venue: "", power: false, tableProvided: false, tent: false,
    rating: 0, review: "", notes: "", created: Date.now()
  };
}
/* A new application starts as a copy of the last one — same fee, same pitch,
   same load-in — so going back to a fair is a few taps, not a form. */
function appFromLast(ev) {
  const last = latestApp(ev);
  const a = blankApp();
  if (last) for (const k of ["fee", "loadIn", "startTime", "endTime", "boothSize", "venue",
                             "power", "tableProvided", "tent", "notes"]) a[k] = last[k];
  return a;
}

const evOf = id => S.events.find(e => e.id === id) || null;
const dayOf = id => S.days.find(d => d.id === id) || null;
const daysOfEvent = id => S.days.filter(d => d.eventId === id).sort((a, b) => a.date.localeCompare(b.date));
const daysOfApp = id => S.days.filter(d => d.appId === id).sort((a, b) => a.date.localeCompare(b.date));
const salesOfDay = id => S.sales.filter(s => s.dayId === id);
const appOf = (ev, id) => (ev && ev.apps || []).find(a => a.id === id) || null;
function appOfDay(d) {
  const ev = d ? evOf(d.eventId) : null;
  return ev ? appOf(ev, d.appId) : null;
}

/* when an application happened: its first selling day, else the cycle it was
   for, else when it was started */
function appWhen(a) {
  const d = daysOfApp(a.id);
  if (d.length) return d[0].date;
  if (a.cycle) return a.cycle;
  const c = new Date(a.created || Date.now());
  return c.getFullYear() + "-" + String(c.getMonth() + 1).padStart(2, "0") + "-" + String(c.getDate()).padStart(2, "0");
}
const appsNewest = ev => (ev.apps || []).slice().sort((a, b) =>
  appWhen(b).localeCompare(appWhen(a)) || (b.created || 0) - (a.created || 0));
const latestApp = ev => appsNewest(ev)[0] || null;

/* "2026" for a yearly fair, "Mar 2026" for anything more often */
function appLabel(ev, a) {
  const d = daysOfApp(a.id);
  const at = parseD(appWhen(a));
  const monthly = ev && ev.freq && ev.freq !== "annual" && ev.freq !== "once";
  if (d.length || !a.cycle) {
    return monthly || !d.length
      ? at.toLocaleDateString(undefined, { month: "short", year: "numeric" })
      : String(at.getFullYear());
  }
  return "Registration " + at.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function appDates(a) {
  const d = daysOfApp(a.id);
  if (!d.length) return "No selling dates yet";
  if (d.length === 1) return fmtDate(d[0].date);
  return fmtDate(d[0].date) + " – " + fmtDate(d[d.length - 1].date) + "  (" + d.length + " days)";
}
const appEnd = a => { const d = daysOfApp(a.id); return d.length ? d[d.length - 1].date : ""; };
const appStarted = a => daysOfApp(a.id).some(d => daysUntil(d.date) <= 0);

/* The fee is a cost once you're booked and paid — not before. Travel is a
   cost once you've actually gone. */
function appCosts(ev, a) {
  const fee = a.status === "paid" ? (+a.fee || 0) : 0;
  const travel = appStarted(a) ? (+ev.travel || 0) : 0;
  return fee + travel;
}
function appMoney(ev, a) {
  const ds = daysOfApp(a.id).map(d => d.id);
  const sales = S.sales.filter(s => ds.includes(s.dayId));
  const taken = sales.reduce((x, s) => x + s.total, 0);
  const goods = sales.reduce((x, s) => x + s.cost, 0);
  const costs = appCosts(ev, a);
  return { taken, goods, costs, net: taken - goods - costs, sales: sales.length };
}
/* the most recent visit that has sales on it — "how did it go last time?" */
function lastResult(ev) {
  for (const a of appsNewest(ev)) {
    const m = appMoney(ev, a);
    if (m.sales) return { app: a, ...m };
  }
  return null;
}

/* ---- estimated registration dates, no year ----
   Stored as "MM-DD". A fair whose registration usually opens around 1 March
   gets a cycle every year; a monthly market every month from that anchor. */
const MONTHS = [...Array(12)].map((_, i) => new Date(2001, i, 1).toLocaleDateString(undefined, { month: "short" }));
function fmtMD(md) {
  if (!md) return "";
  const [m, d] = md.split("-").map(Number);
  return MONTHS[m - 1] + " " + d;
}
function isoOf(dt) {
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}
function addDays(iso, n) { const x = parseD(iso); x.setDate(x.getDate() + n); return isoOf(x); }
function mdAt(year, monthIdx, day) {
  const y = year + Math.floor(monthIdx / 12), m = ((monthIdx % 12) + 12) % 12;
  const dim = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, dim));
}
/* The cycle that matters right now: the first one whose applications
   haven't closed yet. Returns { open, close } as ISO dates, or null. */
function currentCycle(ev, ref) {
  if (!recurring(ev) || !ev.estOpen) return null;
  ref = ref || todayISO();
  const [om, od] = ev.estOpen.split("-").map(Number);
  let span = 30;
  if (ev.estClose) {
    const [cm, cd] = ev.estClose.split("-").map(Number);
    const o = new Date(2001, om - 1, od);
    let c = new Date(2001, cm - 1, cd);
    if (c < o) c = new Date(2002, cm - 1, cd);
    span = Math.round((c - o) / 864e5);
  }
  const step = FREQ_STEP[ev.freq];
  const y0 = parseD(ref).getFullYear() - 2;
  let prev = null;
  for (let k = 0; k < 400; k++) {
    const open = isoOf(mdAt(y0, om - 1 + k * step, od));
    const close = addDays(open, span);
    const c = { open, close, key: open, hasClose: !!ev.estClose };
    if (close >= ref) return Object.assign(c, { prev });
    prev = c;
  }
  return null;
}
/* the next cycle you haven't already applied to or skipped */
function upcomingCycle(ev) {
  let c = currentCycle(ev);
  for (let i = 0; c && i < 4; i++) {
    const done = (ev.apps || []).some(a => a.cycle === c.key && a.status !== "none") || (ev.skip || []).includes(c.key);
    if (!done) return c;
    c = currentCycle(ev, addDays(c.close, 1));
  }
  return c;
}
const remindFrom = (ev, openISO) => addDays(openISO, -Math.max(0, +ev.remindDays || 0));

/* ---- the three lanes on the Events screen ---- */

/* Registrations coming up: anything whose reminder date has arrived and you
   haven't applied to yet — unless you've said to skip it or never go again. */
function comingUp() {
  const today = todayISO(), out = [];
  for (const ev of S.events) {
    if (ev.retired) continue;
    const skip = ev.skip || [];
    if (recurring(ev)) {
      const busy = (ev.apps || []).some(a => IN_PROGRESS.includes(a.status) ||
        (a.status === "paid" && (!appEnd(a) || daysUntil(appEnd(a)) >= 0)));
      if (!ev.estOpen) { if (!busy) out.push({ ev, nodates: true, sortKey: "9999" }); continue; }
      const c = currentCycle(ev);
      if (!c) continue;
      const appFor = k => (ev.apps || []).find(a => a.cycle === k);
      const open = k => { const a = appFor(k); return !skip.includes(k) && !(a && a.status !== "none"); };
      if (today >= remindFrom(ev, c.open)) {
        if (open(c.key)) out.push({ ev, cycle: c, app: appFor(c.key), open: c.open, close: c.hasClose ? c.close : "", est: true, sortKey: c.open });
        continue;
      }
      /* between reminders: the last one closed and you never applied. Only
         for a registration that closed after the event was added here. */
      const p = c.prev;
      if (p && open(p.key) && p.close >= isoOf(new Date(ev.created || 0)))
        out.push({ ev, cycle: p, app: appFor(p.key), open: p.open, close: p.close, noClose: !p.hasClose,
                   est: true, late: true, sortKey: p.open });
    } else {
      if (skip.includes("once")) continue;
      const app = latestApp(ev);
      if (app && app.status !== "none") continue;
      if (!ev.regOpens && !ev.regDeadline) { out.push({ ev, app, nodates: true, sortKey: "9999" }); continue; }
      if (ev.regDeadline && ev.regDeadline < today) {
        /* missed it: flagged until dismissed, or 90 days go by */
        if (daysUntil(ev.regDeadline) >= -90)
          out.push({ ev, app, open: ev.regOpens, close: ev.regDeadline, est: false, late: true, sortKey: ev.regOpens || ev.regDeadline });
        continue;
      }
      if (ev.regOpens && today < remindFrom(ev, ev.regOpens)) continue;
      out.push({ ev, app, open: ev.regOpens, close: ev.regDeadline, est: false, sortKey: ev.regOpens || ev.regDeadline });
    }
  }
  return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/* Registrations in progress: sent off, waitlisted or accepted, not yet paid */
function inProgress() {
  const out = [];
  for (const ev of S.events) for (const a of (ev.apps || []))
    if (IN_PROGRESS.includes(a.status)) out.push({ ev, app: a });
  return out.sort((x, y) => appWhen(x.app).localeCompare(appWhen(y.app)));
}

/* Booked and paid: until the last selling day has been and gone */
function bookedPaid() {
  const out = [];
  for (const ev of S.events) for (const a of (ev.apps || [])) {
    if (a.status !== "paid") continue;
    const end = appEnd(a);
    if (end && daysUntil(end) < 0) continue;
    out.push({ ev, app: a });
  }
  const next = x => (daysOfApp(x.app.id).find(d => daysUntil(d.date) >= 0) || {}).date || "9999";
  return out.sort((x, y) => next(x).localeCompare(next(y)));
}

const needsAttention = () =>
  comingUp().some(c => !c.nodates) ||
  S.days.some(d => daysUntil(d.date) === 0 && !d.closed);

/* ---- event types, kept like Inventory's types ---- */
function eventTypes() {
  const set = new Set((S.settings.eventTypes || []).concat(S.events.map(e => e.type).filter(Boolean)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* Events go by their formal name, so the same fair shouldn't be in twice.
   Years and punctuation don't count: "Middlesex County Fair 2026" is the
   same as "middlesex county fair". */
const normName = s => String(s || "").toLowerCase().replace(/\b(19|20)\d{2}\b/g, "").replace(/[^a-z0-9]/g, "");
function sameNamed(name, notId) {
  const n = normName(name);
  if (!n) return { exact: null, near: [] };
  const others = S.events.filter(e => e.id !== notId);
  const exact = others.find(e => normName(e.name) === n) || null;
  const near = exact ? [] : others.filter(e => {
    const m = normName(e.name);
    return m.length >= 5 && n.length >= 5 && (m.includes(n) || n.includes(m));
  });
  return { exact, near };
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2001, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* ---------------------------- stock (FIFO) ----------------------------
   A lot is one delivery or making-session: a quantity at a known unit cost.
   Selling draws from the oldest lot first, so the cost recorded against a
   sale is what those particular units actually cost, not an average or an
   estimate. Every draw is stored on the sale line so it can be put back
   exactly if the sale is undone.
   ---------------------------------------------------------------------- */
/* Why a unit left stock without being sold, and why a sale was reversed.
   Kept as two lists because the answer to "can I sell this again" decides
   which question you're being asked. */
const LOSS_REASONS = ["Defective", "Damaged", "Made to order", "Used or opened",
                      "Weather", "Lost", "Sample", "Past its best"];
const RETURN_REASONS = ["Rang up by mistake", "Wrong item", "Wrong quantity", "Wrong price",
                        "Changed their mind", "Payment failed", "Swapped item"];
/* why something is being handed over again. A replacement is not a giveaway:
   the first one was paid for, this one is the cost of putting it right. */
const REPLACE_REASONS = ["Defective", "Popped or broke", "Wrong item given",
                         "Damaged by customer", "Goodwill"];

const vKey = opts => (opts || []).filter(o => o.o).map(o => o.o).join(" · ");
function stockKey(item, opts) {
  if (!item || item.stockMode !== "variant") return "";
  return vKey(opts);
}
const tracks = item => item && item.stockMode && item.stockMode !== "none";

/* every option combination an item can be sold as */
function combos(item) {
  let out = [[]];
  for (const g of (item.groups || [])) {
    const next = [];
    for (const base of out) for (const o of g.options) next.push(base.concat([{ g: g.name, o: o.name }]));
    out = next;
    if (out.length > 60) break;
  }
  return out.map(c => ({ opts: c, key: vKey(c), label: c.map(x => x.o).join(" · ") || "—" }));
}

/* A lot belongs to a stockId, which is either a product (finished goods you
   counted in) or a material (what you buy and build from). Ids are unique
   across both, so one shelf of batches serves both. */
const lotRef = l => l.stockId || l.itemId;
function lotsFor(stockId, key) {
  return S.lots
    .filter(l => lotRef(l) === stockId && (l.key || "") === (key || "") && l.remaining > 0)
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.created - b.created);
}
function allLotsFor(stockId, key) {
  return S.lots
    .filter(l => lotRef(l) === stockId && (key === null || (l.key || "") === (key || "")))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.created - b.created);
}
const onHand = (stockId, key) => lotsFor(stockId, key).reduce((a, l) => a + l.remaining, 0);
const onHandTotal = stockId => S.lots.filter(l => lotRef(l) === stockId).reduce((a, l) => a + l.remaining, 0);
const stockValue = stockId => S.lots.filter(l => lotRef(l) === stockId).reduce((a, l) => a + l.remaining * (+l.unitCost || 0), 0);

/* take qty out of the oldest lots; returns what it cost and what it drew from.
   Never refuses — a sale at a stall must not be blocked by paperwork — but
   records any shortfall so it shows up rather than quietly vanishing. */
function drawStock(stockId, key, qty, fallbackCost) {
  const out = { draw: [], cost: 0, short: 0 };
  let need = qty;
  for (const lot of lotsFor(stockId, key)) {
    if (need <= 0) break;
    const take = Math.min(need, lot.remaining);
    lot.remaining -= take;
    need -= take;
    out.draw.push({ lotId: lot.id, qty: take, unitCost: +lot.unitCost || 0 });
    out.cost += take * (+lot.unitCost || 0);
  }
  if (need > 0) { out.short = need; out.cost += need * (+fallbackCost || 0); }
  return out;
}
function returnStock(draw) {
  for (const d of (draw || [])) {
    const lot = S.lots.find(l => l.id === d.lotId);
    if (lot) lot.remaining = Math.min(lot.qty, lot.remaining + d.qty);
  }
}
/* record a loss for units already drawn out of stock — the lots are not touched,
   because the sale already consumed them */
function wasteDrawn(line, reason, dayId, date) {
  S.writeoffs.push({
    id: uid(), itemId: line.itemId, stockId: line.itemId, name: line.name, key: vKey(line.opts),
    date: date || todayISO(), qty: line.qty, reason: reason || "Cancelled sale",
    cost: line.costTotal, draw: line.draw || [], short: line.short || 0,
    used: (line.used || []).map(u => ({ materialId: u.materialId, draw: u.draw || [] })),
    dayId: dayId || woDayId(), created: Date.now()
  });
}

/* ---------------------------- write-offs ----------------------------
   A write-off can be undone — a miscount on our side, or the bag turns up in
   the car. Undoing puts the units back into the exact batches they came out
   of and marks the write-off as undone rather than deleting it, so the log
   still shows it happened. Everything that counts losses skips undone ones. */
const liveWriteoffs = () => S.writeoffs.filter(w => !w.undone);
/* the selling day a write-off belongs to: the open one, if it's still open */
function woDayId() {
  const d = activeDay();
  return d && !d.closed ? d.id : "";
}
/* which market a write-off happened at. Older ones weren't stamped, so fall
   back to a selling day on the same date. */
function woEvent(w) {
  const d = (w.dayId && dayOf(w.dayId)) || (w.date ? S.days.find(x => x.date === w.date) : null);
  return d ? evOf(d.eventId) : null;
}
const woDraws = w => (w.draw || []).concat(...(w.used || []).map(u => u.draw || []));

/* Write-offs at one market for one reason read as a single line. Ones made
   away from any market stay on their own. Undone ones group the same way. */
function writeoffGroups(ws) {
  const g = {};
  for (const w of ws) {
    const ev = woEvent(w);
    const key = ev ? ev.id + "|" + (w.reason || "") + "|" + (w.undone ? "u" : "") : w.id;
    if (!g[key]) g[key] = { key, ev, reason: w.reason || "no reason given", undone: !!w.undone,
                            list: [], qty: 0, cost: 0, date: "", first: "" };
    const x = g[key];
    x.list.push(w); x.qty += +w.qty || 0; x.cost += +w.cost || 0;
    if (!x.date || (w.date || "") > x.date) x.date = w.date || "";
    if (!x.first || (w.date || "") < x.first) x.first = w.date || "";
  }
  return Object.values(g).map(x => {
    x.qty = Math.round(x.qty * 1000) / 1000;
    x.list.sort((a, b) => (b.created || 0) - (a.created || 0));
    return x;
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.list[0].created || 0) - (a.list[0].created || 0));
}
const groupWhen = x => x.first && x.first !== x.date
  ? fmtDate(x.first, true) + " – " + fmtDate(x.date, true) : fmtDate(x.date, true);

/* Take k units off one write-off. The whole thing: mark it undone. Part of
   it: split it — what's undone becomes its own record marked undone, the
   rest stays written off. Units come back to the batches they left from,
   newest draw first; any that can't (not on record, or the batch is gone)
   still come off the write-off. */
function undoPartOf(w, k) {
  const r2 = n => Math.round(n * 1000) / 1000;
  const liveLot = d => S.lots.some(l => l.id === d.lotId);
  if (k >= (+w.qty || 0) - 1e-9 || (w.used && w.used.some(u => (u.draw || []).length))) {
    const draws = woDraws(w);
    const back = draws.filter(liveLot).reduce((a, d) => a + d.qty, 0);
    returnStock(draws);
    w.undone = Date.now();
    return r2(back);
  }
  const draws = (w.draw || []).map(d => ({ ...d }));
  const drawCost = draws.reduce((a, d) => a + d.qty * (+d.unitCost || 0), 0);
  const shortEach = w.short ? Math.max(0, (+w.cost || 0) - drawCost) / w.short : 0;
  let need = k, back = 0, cost = 0;
  const moved = [];
  const takeFrom = (onlyLive, doReturn) => {
    for (let i = draws.length - 1; i >= 0 && need > 1e-9; i--) {
      const d = draws[i];
      if (onlyLive !== liveLot(d) || d.qty <= 0) continue;
      const t = Math.min(need, d.qty);
      d.qty = r2(d.qty - t); need = r2(need - t); cost += t * (+d.unitCost || 0);
      moved.push({ lotId: d.lotId, qty: t, unitCost: d.unitCost });
      if (doReturn) back += t;
    }
  };
  takeFrom(true, true);
  const fromShort = Math.min(need, +w.short || 0);
  need = r2(need - fromShort); cost += fromShort * shortEach;
  takeFrom(false, false);
  returnStock(moved.filter(liveLot));
  w.draw = draws.filter(d => d.qty > 0);
  w.short = r2((+w.short || 0) - fromShort);
  w.qty = r2((+w.qty || 0) - k);
  w.cost = Math.round(((+w.cost || 0) - cost) * 10000) / 10000;
  S.writeoffs.push(Object.assign({}, w, {
    id: uid(), qty: k, cost: Math.round(cost * 10000) / 10000, draw: moved, short: fromShort,
    used: [], undone: Date.now(), splitFrom: w.id, created: w.created
  }));
  return r2(back);
}

/* Undo some or all of a rolled-up line: pick how many, newest first. */
function undoGroupAsk(x, unit, after) {
  const host = $("#confirms");
  const step = +qtyStep(unit || "each");
  const max = x.qty;
  let n = max;
  const where = x.ev ? " at " + (x.ev.name || "Untitled event") : "";
  host.innerHTML = `<div class="scrim confirm">
    <div class="sheet narrow" role="alertdialog" aria-modal="true" style="max-width:460px">
      <div class="shead"><h3>Undo a write-off</h3></div>
      <div class="sbody">
        <p class="note" style="margin:0 0 14px">${esc(x.list[0].name || "")} · ${esc(x.reason)}${esc(where)} ·
          ${esc(groupWhen(x))}. ${max} written off${x.list.length > 1 ? " over " + x.list.length + " times" : ""}.</p>
        <div class="slabel" style="margin-top:0">How many did you find?</div>
        <div class="qtyrow">
          <button class="step" id="uqM" aria-label="Fewer">−</button>
          <input type="number" id="uqN" inputmode="${qtyMode(unit || "each")}" step="${step}" min="${step}" max="${max}" value="${max}"
            style="width:110px;text-align:center;font-family:var(--display);font-weight:700;font-size:30px;background:var(--card)">
          <button class="step" id="uqP" aria-label="More">+</button>
        </div>
        <p class="note" id="uqNote" style="margin:10px 0 0;text-align:center"></p>
      </div>
      <div class="sfoot stack">
        <button class="btn sec" id="uqNo">Leave it</button>
        <button class="btn" id="uqGo">Put back</button>
      </div>
    </div></div>`;
  const close = () => { host.innerHTML = ""; };
  const clamp = v => Math.min(max, Math.max(step, qtyRound(+v || 0, unit || "each")));
  const paint = () => {
    $("#uqN").value = n;
    $("#uqNote").textContent = n >= max ? "All of them go back on the shelf."
      : n + " go" + (n === 1 ? "es" : "") + " back on the shelf; " + Math.round((max - n) * 1000) / 1000 + " stay written off.";
  };
  host.querySelector(".scrim").addEventListener("click", e => { if (e.target.classList.contains("scrim")) close(); });
  $("#uqM").onclick = () => { n = clamp(n - step); paint(); };
  $("#uqP").onclick = () => { n = clamp(n + step); paint(); };
  $("#uqN").onchange = e => { n = clamp(e.target.value); paint(); };
  $("#uqNo").onclick = close;
  $("#uqGo").onclick = async () => {
    n = clamp($("#uqN").value);
    let left = n, back = 0;
    for (const w of x.list) {
      if (left <= 1e-9) break;
      const k = Math.min(left, +w.qty || 0);
      back += undoPartOf(w, k);
      left = Math.round((left - k) * 1000) / 1000;
    }
    close();
    await saveLots(); await saveWriteoffs();
    if (after) after();
    refreshLists();
    back = Math.round(back * 1000) / 1000;
    toast(back ? back + " back on the shelf" : "Write-off undone");
  };
  paint();
}

/* put back everything a set of sales took out */
function lineDraws(l) {
  const out = [];
  if (l.draw && l.draw.length) out.push(...l.draw);
  for (const u of (l.used || [])) if (u.draw && u.draw.length) out.push(...u.draw);
  return out;
}
const lineDrewStock = l => lineDraws(l).length > 0;

async function returnSales(sales) {
  let touched = false;
  for (const s of sales) for (const l of (s.lines || [])) {
    const d = lineDraws(l);
    if (d.length) { returnStock(d); touched = true; }
  }
  if (touched) await saveLots();
}
/* which variants are at or under the warning level. For an item counted as one
   total that is either nothing or the whole item; for one counted per option
   combination it is each combination you actually stock. */
function lowVariants(item) {
  const level = +item.reorder || 0;
  if (!tracks(item) || level <= 0) return [];
  if (item.stockMode !== "variant") {
    const n = onHandTotal(item.id);
    return n <= level ? [{ key: "", label: "", n }] : [];
  }
  const keys = [...new Set(S.lots.filter(l => l.itemId === item.id).map(l => l.key || ""))];
  return keys.map(k => ({ key: k, label: k, n: onHand(item.id, k) }))
    .filter(x => x.n <= level)
    .sort((a, b) => a.n - b.n);
}
const lowStock = item => lowVariants(item).length > 0;

/* ---------------------------- materials ----------------------------
   What you actually buy: a white 260, a metre of ribbon, a foil weight.
   Products are built from these through a recipe, so the cost of a sale
   is the cost of what went into it.
   ------------------------------------------------------------------- */
function blankMaterial() {
  /* cost is no longer typed in — it carries over from the newest batch */
  return { id: uid(), name: "", category: "", unit: "each", priceDelta: 0, cost: 0, reorder: 0,
           packed: true, active: true, note: "", created: Date.now() };
}
const matById = id => S.materials.find(m => m.id === id) || null;
const matCategories = () => [...new Set(S.categories.concat(S.materials.map(m => m.category).filter(Boolean)))].sort();
const matsIn = cat => S.materials.filter(m => (m.category || "") === (cat || ""))
  .sort((a, b) => a.name.localeCompare(b.name));
const matLabel = m => m ? (m.name + (m.category ? " · " + m.category : "")) : "—";
const ICON_SEARCH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8d8578" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4 4"></path></svg>';
const searchBox = (id, value, placeholder) =>
  `<span class="searchbar">${ICON_SEARCH}
    <input type="text" id="${id}" value="${esc(value || "")}" placeholder="${esc(placeholder)}"></span>`;
const hits = (q, ...bits) => {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return true;
  return bits.filter(Boolean).join(" ").toLowerCase().includes(needle);
};

const matLow = m => isLive(m) && (+m.reorder || 0) > 0 && onHandTotal(m.id) <= (+m.reorder || 0);
/* Packed means it came to the market. Something can sit on the shelf at home
   and still be no use at the stall, so the counter only offers what travelled. */
const isPacked = m => !!m && m.packed !== false;
/* A retired material folds away with the inactive types. It keeps its stock and
   its history; it just stops being offered or chased. */
const isLive = m => !!m && m.active !== false && !isTypeOff(m.category);
const atHand = m => isPacked(m) && isLive(m) && onHandTotal(m.id) > 0;
/* what the counter can actually offer for a recipe line */
const pickable = (cat, showAll) => matsIn(cat).filter(m => showAll || atHand(m));


/* What a supply is counted in. Recipes do arithmetic on these numbers, so the
   unit is a label on a quantity — half a metre of ribbon, two balloons. */
const UNIT_GROUPS = [
  ["Count", ["each", "pair", "pack", "bag", "sheet", "roll"]],
  ["Length", ["metre", "centimetre", "foot", "inch"]],
  ["Weight", ["gram", "kilogram", "ounce", "pound"]],
  ["Volume", ["millilitre", "litre", "fluid ounce"]]
];
const ALL_UNITS = UNIT_GROUPS.flatMap(g => g[1]);
/* Things you count come in whole units — you cannot write off half a balloon.
   Things you measure do not: half a metre of ribbon is an ordinary amount. */
const COUNT_UNITS = new Set(UNIT_GROUPS[0][1]);
const isWholeUnit = unit => COUNT_UNITS.has(String(unit || "each").toLowerCase());
const qtyStep = unit => isWholeUnit(unit) ? "1" : "0.01";
const qtyMode = unit => isWholeUnit(unit) ? "numeric" : "decimal";
const qtyRound = (n, unit) => isWholeUnit(unit) ? Math.round(n) : n;
/* the unit a whole category is counted in, when they all agree */
function categoryUnit(cat) {
  const us = [...new Set(matsIn(cat).map(m => m.unit || "each"))];
  return us.length === 1 ? us[0] : null;
}
function unitSelect(id, chosen) {
  const val = chosen || "each";
  const known = ALL_UNITS.includes(val);
  return `<select id="${id}">
    ${known ? "" : `<option value="${esc(val)}" selected>${esc(val)}</option>`}
    ${UNIT_GROUPS.map(([label, us]) => `<optgroup label="${label}">
      ${us.map(u => `<option value="${u}" ${u === val ? "selected" : ""}>${u}</option>`).join("")}
    </optgroup>`).join("")}
  </select>`;
}

/* What a unit last cost you. Taken from the newest batch, so adding stock
   prefills from the last order rather than a figure kept by hand. */
function lastCost(stockId) {
  const lots = S.lots.filter(l => lotRef(l) === stockId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.created - a.created);
  if (lots.length) return +lots[0].unitCost || 0;
  const m = matById(stockId);
  return m ? (+m.cost || 0) : 0;
}

/* ---------------------------- recipes ----------------------------
   A recipe line is either a fixed material ("1 ribbon every time") or a
   pick from a category ("1 of any 260 balloon"), chosen at the counter.
   A line's quantity can vary with one option layer — a Jumbo taking two
   balloons where a Standard takes one.
   ----------------------------------------------------------------- */
const hasRecipe = item => !!(item && item.recipe && item.recipe.length);
/* A line names a type and, if you want, the particular materials of that type
   this product may use. Naming none means any of them will do. */
function lineMats(rl) {
  const chosen = (rl.materials || []).map(matById).filter(Boolean);
  return chosen.length ? chosen : matsIn(rl.category);
}
const linePickable = (rl, showAll) => lineMats(rl).filter(m => showAll || atHand(m));
const lineNeedsChoice = rl => lineMats(rl).length > 1;
const usesMaterials = item => hasRecipe(item);

function lineQtyFor(rl) { return +rl.qty || 0; }

/* turn a recipe plus the buyer's choices into concrete material amounts */
function resolveRecipe(item, opts, picks) {
  const out = [];
  for (const rl of (item.recipe || [])) {
    const qty = lineQtyFor(rl);
    if (qty <= 0) continue;
    const only = lineMats(rl);
    let id = (picks || {})[rl.id];
    if (!id || !only.some(m => m.id === id)) id = (only.find(atHand) || only[0] || {}).id;
    const m = matById(id);
    out.push({ recipeLineId: rl.id, category: rl.category, materialId: id || null,
      name: m ? m.name : "(nothing to use)", qty, material: m || null });
  }
  return out;
}
/* what the buyer pays on top for the materials they picked */
function recipeUplift(item, opts, picks) {
  return resolveRecipe(item, opts, picks)
    .reduce((a, r) => a + (r.material ? (+r.material.priceDelta || 0) * r.qty : 0), 0);
}
/* how many of these you could make right now, set by whichever material
   runs out first. A choice line counts the whole category, since any of
   them would do. */
function canMake(item) {
  if (!hasRecipe(item)) return null;
  let least = Infinity;
  for (const rl of item.recipe) {
    const per = +rl.qty || 0;
    if (per <= 0) continue;
    const have = lineMats(rl).filter(m => isPacked(m) && isLive(m))
      .reduce((a, m) => a + onHandTotal(m.id), 0);
    least = Math.min(least, Math.floor(have / per));
  }
  return least === Infinity ? null : least;
}

/* roughly what one costs to build, for the margin shown in the list.
   A choice line averages its category, since which one gets used varies. */
function recipeCostEstimate(item) {
  if (!hasRecipe(item)) return null;
  let total = 0;
  for (const rl of item.recipe) {
    const per = +rl.qty || 0;
    if (per <= 0) continue;
    const ms = lineMats(rl);
    if (!ms.length) continue;
    total += per * (ms.reduce((a, m) => a + lastCost(m.id), 0) / ms.length);
  }
  return total;
}

function defaultPicks(item) {
  const picks = {};
  for (const rl of (item.recipe || [])) {
    const options = lineMats(rl);
    const ready = options.find(atHand);
    if (ready || options[0]) picks[rl.id] = (ready || options[0]).id;
  }
  return picks;
}

/* ---------------------------- boot ---------------------------- */
(async function boot() {
  try { idb = await openDB(); }
  catch (e) {
    alert("Storage unavailable.\n\nThis page has to be served, not opened straight from disk. On Windows run run-windows.bat and use the http://localhost address it opens.");
    return;
  }
  S.items = (await kvGet("items")) || [];
  S.materials = (await kvGet("materials")) || [];
  S.categories = (await kvGet("categories")) || [];
  S.productTypes = (await kvGet("productTypes")) || [];
  S.trash = (await kvGet("trash")) || [];
  S.orders = (await kvGet("orders")) || [];
  S.assets = (await kvGet("assets")) || [];
  S.cash = (await kvGet("cash")) || [];
  const tk = (await kvGet("tickets")) || {};
  S.tickets = tk.tickets || [];
  S.activeTicket = tk.active || null;
  S.events = (await kvGet("events")) || [];
  S.days = (await kvGet("days")) || [];
  S.lots = (await kvGet("lots")) || [];
  S.writeoffs = (await kvGet("writeoffs")) || [];
  S.reversals = (await kvGet("reversals")) || [];
  S.settings = Object.assign(S.settings, (await kvGet("settings")) || {});
  S.sales = (await salesAll()) || [];
  await migrate();
  await migrateRecipes();
  await migrateEvents();
  const seen = [...new Set(S.materials.map(m => m.category).filter(Boolean))];
  const missing = seen.filter(c => !S.categories.includes(c));
  if (missing.length) { S.categories = S.categories.concat(missing).sort(); await saveCategories(); }
  const pseen = [...new Set(S.items.map(i => i.type).filter(Boolean))];
  const pmissing = pseen.filter(c => !S.productTypes.includes(c));
  if (pmissing.length) { S.productTypes = S.productTypes.concat(pmissing).sort(); await saveProductTypes(); }

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const local = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname);
  if ("serviceWorker" in navigator) {
    if (local) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    else navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  renderAll();
})();

/* old shape: sessions [{id,date,location,eventType,notes}] and sales.sessionId */
/* Old recipes named a mode and sometimes a single material; option layers
   carried the colour. Both fold into one line: a type, the materials allowed,
   and how many. */
async function migrateRecipes() {
  let touched = false;
  for (const it of S.items) {
    for (const rl of (it.recipe || [])) {
      if (rl.mode === undefined && rl.materials !== undefined) continue;
      if (rl.mode === "fixed" && rl.materialId) {
        const m = matById(rl.materialId);
        rl.category = m ? m.category : rl.category;
        rl.materials = rl.materialId ? [rl.materialId] : [];
      } else {
        rl.materials = [];
      }
      delete rl.mode; delete rl.materialId; delete rl.label;
      delete rl.varyBy; delete rl.qtyBy;
      touched = true;
    }
    if (it.groups && it.groups.length) { it.groups = []; touched = true; }
    if (it.stockMode === "variant") { it.stockMode = "item"; touched = true; }
  }
  if (touched) await saveItems();
}

async function migrate() {
  const old = await kvGet("sessions");
  if (!old || !old.length || S.events.length) return;
  for (const s of old) {
    const ev = Object.assign(blankEvent(), {
      id: "ev" + s.id, name: s.location || "Untitled event", type: s.eventType || "", freq: "once",
      created: s.created || Date.now()
    });
    S.events.push(ev);
    S.days.push({ id: s.id, eventId: ev.id, date: s.date, notes: s.notes || "", created: ev.created });
  }
  for (const sale of S.sales) {
    if (!sale.dayId && sale.sessionId) { sale.dayId = sale.sessionId; await salePut(sale); }
  }
  if (S.settings.activeSession && !S.settings.activeDay) S.settings.activeDay = S.settings.activeSession;
  await saveEvents(); await saveDays(); await saveSettings();
}

/* Events used to be one visit each, with the fee, status and on-the-day
   details on the event itself. Each old event becomes an event with one
   application carrying those details, and its selling days hang off that. */
const APP_FIELDS = ["fee", "loadIn", "startTime", "endTime", "boothSize", "venue",
                    "power", "tableProvided", "tent", "rating", "review", "notes"];
/* When a stall fee was paid is what dates it in the cash flow. New bookings
   are stamped the day they're marked paid; ones from before this existed take
   their first selling day, which is the best guess there is. */
function stampPaid(legacy) {
  let touched = false;
  for (const ev of S.events) for (const a of (ev.apps || [])) {
    if (a.status === "paid" && !a.paidOn) {
      const d = daysOfApp(a.id)[0];
      a.paidOn = legacy ? (d ? d.date : isoOf(new Date(a.created || Date.now()))) : todayISO();
      touched = true;
    } else if (a.status !== "paid" && a.paidOn) { delete a.paidOn; touched = true; }
  }
  return touched;
}
async function migrateEvents() {
  let touched = stampPaid(true);
  for (const ev of S.events) {
    if (!Array.isArray(ev.apps)) {
      const a = blankApp();
      for (const k of APP_FIELDS) if (ev[k] !== undefined) a[k] = ev[k];
      const hasDays = S.days.some(d => d.eventId === ev.id);
      let st = ev.status || "none";
      if (st === "accepted" && ev.feePaid) st = "paid";
      /* an old event with dates and no status was simply somewhere you sold */
      if (st === "none" && hasDays) st = "paid";
      a.status = st;
      a.created = ev.created || Date.now();
      for (const k of APP_FIELDS.concat(["status", "feePaid"])) delete ev[k];
      ev.apps = [a];
      ev.freq = ev.freq || "once";
      touched = true;
    }
    ev.org = ev.org || { name: "", email: "", phone: "" };
    if (ev.remindDays === undefined) { ev.remindDays = 7; touched = true; }
    if (!Array.isArray(ev.skip)) { ev.skip = []; touched = true; }
    for (const k of ["estOpen", "estClose", "regOpens", "regDeadline", "retiredWhy"]) if (ev[k] === undefined) ev[k] = "";
    if (ev.retired === undefined) ev.retired = false;
  }
  let dtouched = false;
  for (const d of S.days) {
    const ev = evOf(d.eventId);
    if (!ev) continue;
    if (d.appId && appOf(ev, d.appId)) continue;
    if (!ev.apps.length) ev.apps.push(Object.assign(blankApp(), { status: "paid" }));
    d.appId = latestApp(ev).id;
    dtouched = true; touched = true;
  }
  const known = S.settings.eventTypes || [];
  const types = [...new Set(known.concat(S.events.map(e => e.type).filter(Boolean)))];
  if (types.length !== known.length) { S.settings.eventTypes = types.sort(); await saveSettings(); }
  if (touched) await saveEvents();
  if (dtouched) await saveDays();
}

/* Anything that changes stock or the catalogue shows on three screens at once:
   the sell grid, Make and Inventory. Refresh them together so none goes stale. */
function refreshLists() { renderItems(); renderStock(); renderGrid(); renderSession(); }

function renderAll() {
  renderNav(); setTab(S.tab);
  renderSession(); renderGrid(); renderTicket();
  renderItems(); renderStock(); renderGear(); renderEvents(); renderReports(); renderData();
}

/* ---------------------------- tabs ---------------------------- */
function renderNav() {
  $("#navlist").innerHTML = TABS.map(t => `
    <button class="navbtn" role="tab" data-tab="${t.id}" aria-selected="${S.tab === t.id}">
      ${t.icon}<span>${t.label}</span>
      ${t.id === "events" || t.id === "stock" ? '<span class="nd hidden"></span>' : ""}
    </button>`).join("");
  $("#navlist").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => setTab(b.dataset.tab));
}

function setTab(id) {
  S.tab = id;
  const meta = TABS.find(t => t.id === id) || TABS[0];
  $("#navlist").querySelectorAll("[data-tab]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.tab === id)));
  TABS.forEach(t => panelOf(t.id).classList.toggle("hidden", t.id !== id));
  $("#ticketWrap").classList.toggle("hidden", id !== "sell");
  $("#kicker").textContent = meta.kicker;
  $("#title").textContent = meta.title;
  if (id === "sell") renderGrid();
  if (id === "reports") renderReports();
  if (id === "events") renderEvents();
  if (id === "items") renderItems();
  if (id === "stock") renderStock();
  if (id === "gear") renderGear();
  panelOf(id).scrollTop = 0;
}

/* ---------------------------- selling day bar ---------------------------- */
function activeDay() { return dayOf(S.settings.activeDay); }
function dayLabel(d) {
  if (!d) return "Nothing open";
  const ev = evOf(d.eventId);
  return fmtDate(d.date) + " · " + (ev ? (ev.name || "Untitled event") : "Unknown event");
}
function dayTitle(d) {
  if (!d) return "Nowhere yet";
  const ev = evOf(d.eventId);
  return ev ? (ev.name || "Untitled event") : "Unknown event";
}
const dayClosed = d => !!(d && d.closed);
/* Practice rounds only make sense at home: offered when the open market is "My stall". */
function practiceAllowed() {
  const d = activeDay();
  const ev = d ? evOf(d.eventId) : null;
  return !!ev && String(ev.name || "").trim().toLowerCase() === "my stall";
}
function daySummary(d) {
  const sales = salesOfDay(d.id);
  const lines = sales.flatMap(x => x.lines || []);
  return {
    sales: sales.length,
    things: lines.reduce((a, l) => a + l.qty, 0),
    taken: sales.reduce((a, x) => a + x.total, 0),
    free: lines.filter(l => l.mode === "free").reduce((a, l) => a + l.qty, 0)
  };
}

/* Packing down: close the day, show what it came to, and nudge a backup
   while the tablet is still in your hand. */
function finishDaySheet() {
  const d = activeDay();
  if (!d) return;
  const ev = evOf(d.eventId) || {};
  const t = daySummary(d);
  const cartLeft = cart().reduce((a, l) => a + l.qty, 0);

  sheet("Done for today?", `
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi big tint"><div class="k">Taken today</div><div class="v">${esc(cur(t.taken))}</div>
        <div class="n">${t.sales} sale${t.sales === 1 ? "" : "s"} · ${t.things} thing${t.things === 1 ? "" : "s"}${t.free ? " · " + t.free + " given away" : ""}</div></div>
    </div>
    <p class="note">${esc(ev.name || "This market")} on ${esc(fmtDate(d.date, true))}. Closing it just puts
      the till away — nothing is deleted, and you can open it again any time.</p>
    ${cartLeft ? `<p class="note" style="color:var(--warn-ink)"><b>${cartLeft} thing${cartLeft === 1 ? " is" : "s are"} still in the ticket.</b>
      Closing up clears it without recording a sale.</p>` : ""}
    <p class="note">A backup is saved as you close up.</p>
  `, [
    { label: "Close it up", cls: "btn", id: "fdGo" }
  ], { narrow: true });

  $("#fdGo").onclick = async () => {
    d.closed = Date.now();
    S.settings.activeDay = null;
    setCart([]);
    /* straight away, before anything is awaited: iPadOS only opens the share
       sheet while the tap is still fresh */
    doBackup();
    await saveDays(); await saveSettings();
    closeSheet(); renderAll();
    toast("Closed up — " + cur(t.taken) + " today");
  };
}

function dayTakings() {
  const d = activeDay();
  return d ? salesOfDay(d.id).reduce((a, s) => a + s.total, 0) : 0;
}
function renderSession() {
  const d = activeDay();
  $("#dayVal").textContent = dayTitle(d);
  $("#dayBtn").classList.toggle("none", !d);
  const takings = document.querySelector(".takings");
  if (takings) takings.classList.toggle("hidden", !vendorMode());
  $("#railTotal").textContent = cur(dayTakings());
  const dot = document.querySelector('.navbtn[data-tab="events"] .nd');
  if (dot) dot.classList.toggle("hidden", !needsAttention());
  const sdot = document.querySelector('.navbtn[data-tab="stock"] .nd');
  if (sdot) sdot.classList.toggle("hidden", !inventoryNeedsAttention());
}
$("#dayBtn").onclick = dayPicker;

function dayPicker() {
  const withN = S.days.map(d => ({ d, n: daysUntil(d.date) }));
  const now = withN.filter(x => x.n === 0);
  const soon = withN.filter(x => x.n > 0 && x.n <= 60).sort((a, b) => a.n - b.n);
  const past = withN.filter(x => x.n < 0).sort((a, b) => b.n - a.n).slice(0, 6);

  const row = x => {
    const ev = evOf(x.d.eventId) || {};
    const ap = appOfDay(x.d) || {};
    const when = parseD(x.d.date);
    const open = x.d.id === S.settings.activeDay;
    const bits = [ev.type, ap.startTime && ap.endTime ? fmtTime(ap.startTime) + " – " + fmtTime(ap.endTime) : ""].filter(Boolean);
    return `<button class="ag" data-open="${x.d.id}" style="margin-bottom:8px">
      <span class="badge" style="background:var(--sand);color:var(--green-dark)">
        <b>${when.getDate()}</b><span>${when.toLocaleDateString(undefined, { month: "short" })}</span></span>
      <span class="b">
        <span class="n">${esc(ev.name || "Untitled event")}</span>
        <span class="k" style="letter-spacing:0;text-transform:none;font-size:13px;font-weight:600;margin-top:2px">${esc(bits.join(" · ") || countdown(x.n))}</span>
      </span>
      ${open ? '<span class="st">Open now</span>' : (dayClosed(x.d) ? '<span class="st grey">Done</span>' : "")}
    </button>`;
  };

  const openNow = activeDay();
  const t = openNow ? daySummary(openNow) : null;
  /* markets with no date on them yet — without this they could never be picked */
  const undated = S.events.filter(e => !daysOfEvent(e.id).some(d => daysUntil(d.date) >= 0))
    .sort((a, b) => (a.retired - b.retired) || (a.name || "").localeCompare(b.name || ""));

  sheet("Where are you selling?", `
    ${now.length ? `<div class="slabel">On today</div>${now.map(row).join("")}` : ""}
    ${openNow ? `<div class="slabel">Open now</div>
      <div class="card tint" style="margin-bottom:16px">
        <div style="font-family:var(--display);font-weight:700;font-size:20px;color:var(--green-deep)">${esc(dayTitle(openNow))}</div>
        <div class="note" style="margin:2px 0 12px;color:#3f5c49">${esc(cur(t.taken))} from ${t.sales} sale${t.sales === 1 ? "" : "s"} so far</div>
        <button class="btn sm" id="dpFinish">Done selling for today</button>
      </div>` : ""}
    ${soon.length ? `<div class="slabel">Coming up</div>${soon.map(row).join("")}` : ""}
    ${past.length ? `<div class="slabel">Before</div>${past.map(row).join("")}` : ""}
    ${undated.length ? `<div class="slabel">Somewhere else — tap to sell there today</div>
      ${undated.map(e => `<button class="ag" data-today="${e.id}" style="margin-bottom:8px">
        <span class="badge"><b>+</b><span>Today</span></span>
        <span class="b"><span class="n">${esc(e.name || "Untitled event")}</span>
          <span class="k" style="letter-spacing:0;text-transform:none;font-size:13px;font-weight:600;margin-top:2px">${esc(e.type || "Adds today as a selling day")}</span></span>
      </button>`).join("")}` : ""}
    ${!S.days.length ? '<p class="note">No selling days yet. Make an event under <b>Events</b> — that holds its name, website and who to ring — then add an application with its dates.</p>' : ""}
    <div class="slabel">Not on the list?</div>
    <button class="btn sec sm" id="dpNew" style="margin-bottom:10px">Add an event and sell there today</button>
    <button class="btn ghost" id="dpQuick">Just sell here today</button>
  `, null, { narrow: true });

  document.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => {
    S.settings.activeDay = b.dataset.open;
    const d = dayOf(b.dataset.open);
    if (d && d.closed) { delete d.closed; await saveDays(); }
    await saveSettings();
    closeSheet(); renderSession(); renderGrid();
    toast("Open at " + dayTitle(activeDay()));
  });
  document.querySelectorAll("[data-today]").forEach(b => b.onclick = () => sellTodayAt(evOf(b.dataset.today)));
  if ($("#dpFinish")) $("#dpFinish").onclick = () => finishDaySheet();
  $("#dpNew").onclick = () => eventSheet(null, { afterSave: ev => sellTodayAt(ev) });
  /* "My stall" is one event, reused, rather than a new one every time */
  $("#dpQuick").onclick = async () => {
    let ev = S.events.find(e => String(e.name || "").trim().toLowerCase() === "my stall");
    if (!ev) {
      ev = Object.assign(blankEvent(), { name: "My stall", type: "", freq: "once", skip: ["once"] });
      S.events.push(ev);
    }
    await sellTodayAt(ev);
  };
}

/* ---------------------------- events tab ----------------------------
   Three lanes: registrations coming up (top left), registrations in progress
   (bottom left) and booked & paid (right). Every event sits underneath.
   -------------------------------------------------------------------- */
const statusTone = k => k === "paid" || k === "accepted" ? "" : (k === "declined" ? "warn" : "grey");
const shortDate = iso => parseD(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const linkBtn = (href, label, ext) =>
  `<a class="btn sec sm auto" style="text-decoration:none;text-align:center" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
const contactBtns = ev => [
  ev.website ? linkBtn(ev.website, "Website", true) : "",
  ev.org && ev.org.phone ? linkBtn("tel:" + ev.org.phone, "Ring them") : "",
  ev.org && ev.org.email ? linkBtn("mailto:" + ev.org.email, "Email") : ""
].join("");

function resultFact(ev) {
  const r = lastResult(ev);
  if (!r) return `<span class="fact">No sales recorded here yet</span>`;
  return `<span class="fact ${r.net >= 0 ? "good" : "warn"}">Last time (${esc(appLabel(ev, r.app))}): took ${esc(cur(r.taken))} · kept ${esc(cur(r.net))}</span>`;
}

function upCard(c) {
  const ev = c.ev;
  let head, sub = "", tone = "";
  if (c.nodates) {
    head = recurring(ev) ? "When does registration usually open?" : "No registration dates yet";
    sub = recurring(ev) ? "Add a rough date so you get a reminder" : "Add them so this reminds you in time";
  } else {
    const pre = c.est ? "around " : "";
    const nO = c.open ? daysUntil(c.open) : null, nC = c.close ? daysUntil(c.close) : null;
    if (c.late) {
      tone = "late";
      head = c.noClose ? "Opened " + pre + shortDate(c.open) + " — may have closed"
                       : "Past the " + (c.est ? "estimated " : "") + "close date";
      sub = c.noClose ? countdown(nO) + " · no close date set"
                      : "Closed " + pre + shortDate(c.close) + " · " + countdown(nC) + " · check if they're still taking applications";
    } else if (nO !== null && nO > 0) {
      head = "Registration opens " + pre + shortDate(c.open);
      sub = countdown(nO) + (c.close ? " · closes " + pre + shortDate(c.close) : "");
      if (nO <= 3) tone = "urgent";
    } else {
      head = "Registration is open";
      sub = c.close ? "Closes " + pre + shortDate(c.close) + " · " + countdown(nC)
                    : (c.open ? "Opened " + pre + shortDate(c.open) : "");
      tone = "urgent";
    }
  }
  const key = c.cycle ? c.cycle.key : "once";
  return `<div class="evcard lanecard ${tone}">
    <div class="top">
      <span class="nm">${esc(ev.name || "Untitled event")}
        <span class="loc">${esc([ev.type, freqLabel(ev.freq)].filter(Boolean).join(" · "))}</span></span>
    </div>
    <div class="bigline ${tone}"><b>${esc(head)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>
    <div class="facts">
      ${resultFact(ev)}
      ${c.nodates ? "" : `<span class="fact">Reminding you ${+ev.remindDays || 0} day${+ev.remindDays === 1 ? "" : "s"} ahead</span>`}
      ${c.app ? `<span class="fact warn">Application started</span>` : ""}
    </div>
    <div class="evacts">
      ${c.nodates
        ? `<button class="btn sm auto" data-evopen="${ev.id}">Set the dates</button>`
        : (c.app
            ? `<button class="btn sm auto" data-appopen="${ev.id}:${c.app.id}">Carry on</button>`
            : `<button class="btn sm auto" data-apply="${ev.id}" data-cycle="${c.cycle ? c.cycle.key : ""}">I've applied</button>`)}
      ${contactBtns(ev)}
    </div>
    <div class="evacts quiet">
      ${c.nodates ? "" : `<button class="btn ghost sm auto" data-skip="${ev.id}" data-key="${key}">${recurring(ev) ? "Skip this time" : "Not going"}</button>`}
      <button class="btn ghost sm auto" data-retire="${ev.id}">Don't go again</button>
      <button class="btn ghost sm auto" data-evopen="${ev.id}">Event details</button>
    </div>
  </div>`;
}

/* where you stand, as a row you can tap straight along */
function standRow(a) {
  const steps = [["applied", "Applied"], ["waitlist", "Waitlisted"], ["accepted", "Accepted"], ["paid", "Booked & paid"]];
  return `<div class="stand">${steps.map(([k, l]) =>
    `<button class="stp ${a.status === k ? "on" : ""}" data-setst="${a.id}" data-st="${k}">${l}</button>`).join("")}
    <button class="stp no" data-setst="${a.id}" data-st="declined">Declined…</button></div>`;
}

function progCard(x) {
  const { ev, app: a } = x;
  const ds = daysOfApp(a.id);
  return `<div class="evcard lanecard">
    <div class="top">
      <span class="nm">${esc(ev.name || "Untitled event")}
        <span class="loc">${esc(appLabel(ev, a))}${ev.type ? " · " + esc(ev.type) : ""}</span></span>
    </div>
    <div class="bigline ${a.status === "accepted" ? "good" : ""}"><span>Where you stand</span><b>${esc(statusLabel(a.status))}</b></div>
    ${standRow(a)}
    <div class="facts">
      ${+a.fee ? `<span class="fact ${a.status === "accepted" ? "warn" : ""}">Table ${esc(cur(+a.fee))}${a.status === "accepted" ? " to pay" : ""}</span>` : ""}
      <span class="fact">${esc(appDates(a))}</span>
    </div>
    <div class="evacts">
      <button class="btn sec sm auto" data-appopen="${ev.id}:${a.id}">Details</button>
      ${contactBtns(ev)}
    </div>
  </div>`;
}

function paidCard(x) {
  const { ev, app: a } = x;
  const ds = daysOfApp(a.id);
  const facts = [];
  if (+a.fee) facts.push(`<span class="fact good">Table ${esc(cur(+a.fee))} paid</span>`);
  if (a.boothSize) facts.push(`<span class="fact">${esc(a.boothSize)}</span>`);
  if (a.venue) facts.push(`<span class="fact">${esc(a.venue)}</span>`);
  if (a.power) facts.push(`<span class="fact">Power</span>`);
  if (a.tableProvided) facts.push(`<span class="fact">Table provided</span>`);
  if (a.tent) facts.push(`<span class="fact warn">Bring the tent</span>`);
  return `<div class="evcard lanecard">
    <div class="top">
      <span class="nm">${esc(ev.name || "Untitled event")}
        <span class="loc">${esc(appLabel(ev, a))}${ev.type ? " · " + esc(ev.type) : ""}</span></span>
      <span class="st">Booked</span>
    </div>
    <div class="loadin">
      <span class="k">Load-in</span>
      <b>${a.loadIn ? esc(fmtTime(a.loadIn)) : "Not set"}</b>
      ${a.startTime || a.endTime ? `<span>Selling ${esc(fmtTime(a.startTime) || "?")} – ${esc(fmtTime(a.endTime) || "?")}</span>` : ""}
    </div>
    ${ev.address
      ? `<a class="addr" href="https://maps.apple.com/?q=${encodeURIComponent(ev.address)}" target="_blank" rel="noopener">
           <span class="k">Address</span><span class="v">${esc(ev.address)}</span><span class="go">Map ›</span></a>`
      : `<div class="addr none"><span class="k">Address</span><span class="v">Not set — add it on the event</span></div>`}
    <div class="selldays">
      ${ds.length ? ds.map(d => {
        const n = daysUntil(d.date), open = d.id === S.settings.activeDay;
        return `<div class="inset ${n === 0 ? "today" : ""}">
          <span class="b"><span class="n">${esc(fmtDate(d.date, true))}</span>
            <span class="s">${esc(countdown(n))}${d.closed ? " · done" : ""}</span></span>
          ${open ? '<span class="st">Open now</span>'
                 : (n === 0 ? `<button class="btn sm auto" data-sellday="${d.id}">Sell here</button>` : "")}
        </div>`;
      }).join("") : `<p class="note" style="margin:0">No selling dates yet — add them in Details.</p>`}
    </div>
    ${facts.length ? `<div class="facts">${facts.join("")}</div>` : ""}
    <div class="evacts">
      <button class="btn sec sm auto" data-appopen="${ev.id}:${a.id}">Details</button>
      ${ev.org && ev.org.phone ? linkBtn("tel:" + ev.org.phone, "Ring them") : ""}
    </div>
  </div>`;
}

/* one line per event in the full list underneath */
function evRow(ev) {
  const la = latestApp(ev);
  let next = "";
  if (ev.retired) next = "Not going again";
  else if (recurring(ev)) {
    const c = upcomingCycle(ev);
    next = c ? "Next registration around " + fmtDate(c.open, true) : "No estimated dates";
  } else if (ev.regOpens || ev.regDeadline) next = "Registration " + (ev.regOpens ? fmtDate(ev.regOpens, true) : "closes " + fmtDate(ev.regDeadline, true));
  const n = (ev.apps || []).length;
  return `<button class="evcard evrow" data-evopen="${ev.id}">
    <span class="top" style="margin-bottom:6px">
      <span class="nm">${esc(ev.name || "Untitled event")}
        <span class="loc">${esc([ev.type, freqLabel(ev.freq)].filter(Boolean).join(" · "))}</span></span>
      ${la ? `<span class="st ${statusTone(la.status)}">${esc(statusLabel(la.status))}</span>` : ""}
    </span>
    <span class="facts" style="margin-bottom:0">
      ${next ? `<span class="fact ${ev.retired ? "warn" : ""}">${esc(next)}</span>` : ""}
      <span class="fact">${n} application${n === 1 ? "" : "s"}</span>
      ${lastResult(ev) ? resultFact(ev) : ""}
    </span>
  </button>`;
}

function renderEvents() {
  const p = $("#pEvents");
  const cu = comingUp(), ip = inProgress(), bp = bookedPaid();
  const everything = S.events.slice().sort((a, b) =>
    (a.retired - b.retired) || (a.name || "").localeCompare(b.name || ""));

  const lane = (cls, title, list, body, empty) => `<section class="lane ${cls}">
    <div class="lanehead"><span class="sect">${title}</span><span class="cnt">${list.length}</span></div>
    ${list.length ? body : `<p class="note lanenote">${empty}</p>`}
  </section>`;

  p.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      <button class="btn sm auto" id="evNew">+ Add an event</button>
      <button class="btn sec sm auto" id="evIcs">Put them in my calendar</button>
    </div>
    <div class="evboard">
      <div class="lanecol">
      ${lane("l-up", "Registrations coming up", cu, cu.map(upCard).join(""),
        "Nothing to sign up for right now. Each event shows up here a few days before its registration usually opens.")}
      ${lane("l-prog", "Registrations in progress", ip, ip.map(progCard).join(""),
        "Nothing waiting on an answer.")}
      </div>
      <div class="lanecol">
      ${lane("l-paid", "Booked and paid", bp, bp.map(paidCard).join(""),
        "Nothing booked yet. Mark an application Booked &amp; paid and its selling days show here.")}
      </div>
    </div>
    ${everything.length ? `<div class="sect">Every event</div><div class="evgrid">${everything.map(evRow).join("")}</div>`
      : '<p class="note">No events yet. An event is the fair or market itself — its name, website, organiser and roughly when registration opens. Each time you apply, that\'s an application under it.</p>'}`;

  $("#evNew").onclick = () => eventSheet(null, {});
  $("#evIcs").onclick = exportIcs;
  p.querySelectorAll("[data-evopen]").forEach(b => b.onclick = () => eventSheet(evOf(b.dataset.evopen), {}));
  p.querySelectorAll("[data-appopen]").forEach(b => b.onclick = () => {
    const [e, a] = b.dataset.appopen.split(":");
    appSheet(e, a, {});
  });
  p.querySelectorAll("[data-apply]").forEach(b => b.onclick = () =>
    appSheet(b.dataset.apply, null, { cycle: b.dataset.cycle, status: "applied" }));
  p.querySelectorAll("[data-skip]").forEach(b => b.onclick = async () => {
    const ev = evOf(b.dataset.skip), key = b.dataset.key;
    ev.skip = (ev.skip || []).concat([key]);
    await saveEvents(); renderEvents();
    toast(recurring(ev) ? "Skipped — you'll hear about it next time" : "Taken off the list", "Undo", async () => {
      ev.skip = ev.skip.filter(k => k !== key); await saveEvents(); renderEvents();
    });
  });
  p.querySelectorAll("[data-retire]").forEach(b => b.onclick = () => retireAsk(evOf(b.dataset.retire)));
  p.querySelectorAll("[data-setst]").forEach(b => b.onclick = async () => {
    const hit = S.events.map(ev => ({ ev, a: appOf(ev, b.dataset.setst) })).find(x => x.a);
    if (!hit) return;
    const st = b.dataset.st;
    if (st === "declined") { declineSheet(hit.ev, hit.a); return; }
    hit.a.status = st;
    await saveEvents(); renderEvents();
    toast(st === "paid" ? "Booked — its selling days are on the right" : statusLabel(st));
  });
  p.querySelectorAll("[data-sellday]").forEach(b => b.onclick = () => sellOnDay(b.dataset.sellday));
  renderSession();
}

async function sellOnDay(id) {
  const d = dayOf(id);
  if (!d) return;
  S.settings.activeDay = id;
  if (d.closed) { delete d.closed; await saveDays(); }
  await saveSettings();
  renderSession(); renderGrid(); renderEvents();
  toast("Open at " + dayTitle(d));
}

function retireAsk(ev, after) {
  confirmAsk({
    title: "Stop reminding you about " + (ev.name || "this event") + "?",
    body: "It drops off Registrations coming up for good. Its history stays, and you can switch the reminder back on from the event.",
    yes: "Don't go again", no: "Keep it", danger: false,
    onYes: async () => {
      ev.retired = true;
      await saveEvents(); renderEvents();
      toast("Won't remind you again", "Undo", async () => { ev.retired = false; await saveEvents(); renderEvents(); });
      if (after) after();
    }
  });
}

/* A no: say why, and whether it's worth trying next time round */
function declineSheet(ev, a, after) {
  sheet("Declined · " + esc(ev.name || "Event"), `
    <label class="f"><span class="t">Why they said no</span>
      <textarea id="dWhy" placeholder="Category was full">${esc(a.declineWhy)}</textarea></label>
    <div class="togs" style="margin-bottom:14px">${DECLINE_REASONS.map(r =>
      `<button class="tog sm" data-dr="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <p class="note">${recurring(ev)
      ? "Try again next time and it comes back to Registrations coming up when the next one is due."
      : "This one only runs once, so this just records it."}</p>
  `, recurring(ev)
    ? [{ label: "Try again next time", cls: "btn", id: "dAgain" },
       { label: "Don't apply again", cls: "btn sec", id: "dNever" }]
    : [{ label: "Save", cls: "btn", id: "dAgain" }], { narrow: true });
  document.querySelectorAll("[data-dr]").forEach(b => b.onclick = () => {
    const t = $("#dWhy");
    t.value = t.value.trim() ? t.value.trim() + ". " + b.dataset.dr : b.dataset.dr;
  });
  const done = async never => {
    a.status = "declined";
    a.declineWhy = $("#dWhy").value.trim();
    if (never) { ev.retired = true; ev.retiredWhy = a.declineWhy; }
    else if (recurring(ev) && !a.cycle) {
      const c = currentCycle(ev);
      if (c) ev.skip = (ev.skip || []).concat([c.key]);
    }
    await saveEvents(); closeSheet(); renderAll();
    toast(never ? "Declined — won't remind you again" : "Declined — see you next time");
    if (after) after();
  };
  $("#dAgain").onclick = () => done(false);
  if ($("#dNever")) $("#dNever").onclick = () => done(true);
}

/* ---------------------------- event editor ---------------------------- */
function mdPicker(id, md) {
  const [m, d] = md ? md.split("-").map(Number) : [0, 0];
  return `<span class="mdp">
    <select id="${id}M"><option value="">Month</option>${MONTHS.map((n, i) =>
      `<option value="${i + 1}" ${m === i + 1 ? "selected" : ""}>${n}</option>`).join("")}</select>
    <select id="${id}D"><option value="">Day</option>${[...Array(31)].map((_, i) =>
      `<option value="${i + 1}" ${d === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
  </span>`;
}
function readMD(id) {
  const m = $("#" + id + "M"), d = $("#" + id + "D");
  if (!m || !m.value) return "";
  return String(m.value).padStart(2, "0") + "-" + String(d.value || 1).padStart(2, "0");
}

function appSummary(ev, a) {
  const m = appMoney(ev, a);
  const bits = [];
  if (+a.fee) bits.push("Table " + cur(+a.fee));
  if (a.boothSize) bits.push(a.boothSize);
  if (a.loadIn) bits.push("Load-in " + fmtTime(a.loadIn));
  if (a.startTime || a.endTime) bits.push((fmtTime(a.startTime) || "?") + " – " + (fmtTime(a.endTime) || "?"));
  if (a.venue) bits.push(a.venue);
  if (a.power) bits.push("Power");
  if (a.tableProvided) bits.push("Table provided");
  if (a.tent) bits.push("Tent needed");
  return `<div class="card tint latest">
    <div class="top" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
      <span style="flex:1"><b style="font-family:var(--display);font-size:18px">${esc(appLabel(ev, a))}</b>
        <span class="note" style="display:block;margin:0">${esc(appDates(a))}</span></span>
      <span class="st ${statusTone(a.status)}">${esc(statusLabel(a.status))}</span>
    </div>
    ${bits.length ? `<div class="facts" style="margin-bottom:8px">${bits.map(b => `<span class="fact">${esc(b)}</span>`).join("")}</div>` : ""}
    ${m.sales ? `<p class="note" style="margin:0 0 6px">Took ${esc(cur(m.taken))} · kept ${esc(cur(m.net))}${a.rating ? " · " + "★".repeat(a.rating) : ""}</p>` : ""}
    ${a.status === "declined" && a.declineWhy ? `<p class="note" style="margin:0 0 6px">Declined: ${esc(a.declineWhy)}</p>` : ""}
    ${a.review ? `<p class="note" style="margin:0 0 6px">“${esc(a.review)}”</p>` : ""}
    ${a.notes ? `<p class="note" style="margin:0 0 6px">${esc(a.notes)}</p>` : ""}
    <button class="btn sec sm auto" data-appgo="${a.id}">Open it</button>
  </div>`;
}

function eventSheet(existing, opts) {
  opts = opts || {};
  const ev = existing ? JSON.parse(JSON.stringify(existing)) : blankEvent();
  ev.org = ev.org || { name: "", email: "", phone: "" };
  ev.apps = ev.apps || [];
  let newType = !eventTypes().length;
  const apps = existing ? appsNewest(existing) : [];

  sheet(existing ? esc(ev.name || "Event") : "New event", `
    <div class="sect">The event</div>
    <label class="f"><span class="t">Name</span><input type="text" id="eName" value="${esc(ev.name)}" placeholder="Middlesex County Fair" autocomplete="off"></label>
    <div id="eDup"></div>
    <div class="rowf">
      <label class="f"><span class="t">Event type</span><span id="typeBox"></span></label>
      <label class="f"><span class="t">Website</span><input type="url" id="eWeb" value="${esc(ev.website)}" placeholder="https://"></label>
    </div>
    <label class="f"><span class="t">Address</span><input type="text" id="eAddr" value="${esc(ev.address)}" placeholder="For the map link"></label>

    <div class="sect">Organiser</div>
    <label class="f"><span class="t">Contact name</span><input type="text" id="eOName" value="${esc(ev.org.name)}"></label>
    <div class="rowf">
      <label class="f"><span class="t">Email</span><input type="email" id="eOMail" value="${esc(ev.org.email)}"></label>
      <label class="f"><span class="t">Phone</span><input type="tel" id="eOTel" value="${esc(ev.org.phone)}"></label>
    </div>

    <div class="sect">Registration</div>
    <label class="f"><span class="t">How often it runs</span>
      <select id="eFreq">${FREQ.map(f => `<option value="${f[0]}" ${ev.freq === f[0] ? "selected" : ""}>${f[1]}</option>`).join("")}</select></label>
    <div id="regBox"></div>
    <label class="f"><span class="t">Remind me this many days before it opens</span>
      <input type="number" id="eRemind" inputmode="numeric" min="0" max="120" step="1" value="${+ev.remindDays || 0}"></label>
    <p class="note" id="eNext"></p>
    <div id="retBox"></div>

    <div class="sect">Travel &amp; other</div>
    <label class="f"><span class="t">Travel &amp; other, each time you go</span><input type="number" id="eTravel" inputmode="decimal" step="0.01" min="0" value="${ev.travel || ""}"></label>
    <p class="note">Fuel, parking, a hotel — whatever it costs to get there. It comes off the profit for every visit you actually make.</p>

    ${existing ? `
      ${apps.length ? `<div class="sect">Latest application</div>${appSummary(existing, apps[0])}` : ""}
      <div class="sect">Applications</div>
      ${apps.length ? `<div class="card">${apps.map(a => {
        const m = appMoney(existing, a);
        return `<button class="inset" data-appgo="${a.id}">
          <span class="b"><span class="n">${esc(appLabel(existing, a))}</span>
            <span class="s">${esc(appDates(a))}${m.sales ? " · kept " + esc(cur(m.net)) : ""}</span></span>
          <span class="st ${statusTone(a.status)}">${esc(statusLabel(a.status))}</span>
        </button>`;
      }).join("")}</div>` : '<p class="note">No applications yet. Add one each time you apply — it starts as a copy of the last, so there\'s little to fill in.</p>'}
      <button class="btn sec sm auto" id="eNewApp">+ New application</button>` : `
      <p class="note" style="margin-top:18px">Save the event, then add an application each time you apply to it.</p>`}
  `, [
    { label: "Save", cls: "btn", id: "evSave" },
    existing ? { label: "Delete", cls: "btn sec", id: "evDel" } : null
  ].filter(Boolean));

  /* type: pick one, or add a new one */
  const drawType = () => {
    const box = $("#typeBox"), types = eventTypes();
    if (newType) {
      box.innerHTML = `<span style="display:flex;gap:8px">
        <input type="text" id="eTypeNew" value="${esc(ev.type)}" placeholder="County fair" style="flex:1">
        ${types.length ? '<button class="xbtn" id="eTypeBack" aria-label="Pick an existing type">↩</button>' : ""}</span>`;
      $("#eTypeNew").oninput = e => ev.type = e.target.value;
      if ($("#eTypeBack")) $("#eTypeBack").onclick = e => { e.preventDefault(); newType = false; ev.type = types.includes(ev.type) ? ev.type : ""; drawType(); };
    } else {
      box.innerHTML = `<select id="eType"><option value="">Pick one</option>
        ${types.map(t => `<option value="${esc(t)}" ${t === ev.type ? "selected" : ""}>${esc(t)}</option>`).join("")}
        <option value="__new">+ New type…</option></select>`;
      $("#eType").onchange = e => {
        if (e.target.value === "__new") { newType = true; ev.type = ""; drawType(); setTimeout(() => $("#eTypeNew").focus(), 30); }
        else ev.type = e.target.value;
      };
    }
  };
  drawType();

  /* same fair already here? Only asked of a new event, or when the name is
     changed — an event that already has a twin shouldn't be locked because of it. */
  const origName = existing ? normName(existing.name) : null;
  const nameChanged = v => !existing || normName(v) !== origName;
  const drawDup = () => {
    const v = $("#eName").value;
    const { exact, near } = nameChanged(v) ? sameNamed(v, ev.id) : { exact: null, near: [] };
    const box = $("#eDup");
    if (exact) box.innerHTML = `<div class="card dupwarn"><b>${esc(exact.name)}</b> is already one of your events.
      Apply to it again from there rather than adding it twice.
      <button class="btn sm auto" data-dupopen="${exact.id}" style="margin-top:10px">Open ${esc(exact.name)}</button></div>`;
    else if (near.length) box.innerHTML = `<div class="card dupnear">Is it one of these?
      <span class="facts" style="margin:8px 0 0">${near.map(e => `<button class="fact" data-dupopen="${e.id}">${esc(e.name)}</button>`).join("")}</span></div>`;
    else box.innerHTML = "";
    box.querySelectorAll("[data-dupopen]").forEach(b => b.onclick = () => eventSheet(evOf(b.dataset.dupopen), {}));
  };
  $("#eName").oninput = drawDup;
  drawDup();

  /* registration dates follow the frequency: real dates for a one-off,
     month and day for anything that comes round again */
  const readReg = () => {
    if ($("#eRegO")) { ev.regOpens = $("#eRegO").value; ev.regDeadline = $("#eRegC").value; }
    if ($("#eEOM")) { ev.estOpen = readMD("eEO"); ev.estClose = readMD("eEC"); }
  };
  const drawNext = () => {
    const tmp = Object.assign({}, ev, { remindDays: +$("#eRemind").value || 0 });
    let t = "";
    if (recurring(tmp)) {
      const c = upcomingCycle(tmp);
      if (c) t = `Next registration around <b>${esc(fmtDate(c.open, true))}</b> — it shows under Registrations coming up from ${esc(fmtDate(remindFrom(tmp, c.open), true))}.`;
      else t = "Give a month and day so the reminder knows when to come round.";
    } else if (tmp.regOpens) {
      t = `Shows under Registrations coming up from ${esc(fmtDate(remindFrom(tmp, tmp.regOpens), true))}.`;
    }
    $("#eNext").innerHTML = t;
  };
  const drawReg = () => {
    $("#regBox").innerHTML = recurring(ev)
      ? `<div class="rowf">
          <label class="f"><span class="t">Usually opens around</span>${mdPicker("eEO", ev.estOpen)}</label>
          <label class="f"><span class="t">Usually closes around</span>${mdPicker("eEC", ev.estClose)}</label>
        </div>`
      : `<div class="rowf">
          <label class="f"><span class="t">Opens</span><input type="date" id="eRegO" value="${esc(ev.regOpens)}"></label>
          <label class="f"><span class="t">Closes</span><input type="date" id="eRegC" value="${esc(ev.regDeadline)}"></label>
        </div>`;
    $("#regBox").querySelectorAll("select,input").forEach(x => x.onchange = () => { readReg(); drawNext(); });
    drawNext();
  };
  $("#eFreq").onchange = e => { readReg(); ev.freq = e.target.value; drawReg(); };
  $("#eRemind").oninput = drawNext;
  drawReg();

  const drawRet = () => {
    $("#retBox").innerHTML = ev.retired
      ? `<div class="card dupwarn">You said you won't go again${ev.retiredWhy ? ` (${esc(ev.retiredWhy)})` : ""}, so there's no reminder.
          <button class="btn sm auto" id="eUnretire" style="margin-top:10px">Remind me again</button></div>`
      : ((ev.skip || []).length && recurring(ev) && currentCycle(ev) && ev.skip.includes(currentCycle(ev).key)
          ? `<div class="card dupnear">Skipping this time round — it'll remind you for the one after.
              <button class="btn sec sm auto" id="eUnskip" style="margin-top:10px">Remind me this time after all</button></div>` : "");
    if ($("#eUnretire")) $("#eUnretire").onclick = () => { ev.retired = false; ev.retiredWhy = ""; drawRet(); };
    if ($("#eUnskip")) $("#eUnskip").onclick = () => { const k = currentCycle(ev).key; ev.skip = ev.skip.filter(x => x !== k); drawRet(); };
  };
  drawRet();

  const collect = () => {
    readReg();
    ev.name = $("#eName").value.trim();
    ev.type = String(newType ? ($("#eTypeNew") ? $("#eTypeNew").value : ev.type) : ($("#eType") ? $("#eType").value : ev.type)).trim();
    if (ev.type === "__new") ev.type = "";
    ev.website = $("#eWeb").value.trim();
    if (ev.website && !/^https?:\/\//i.test(ev.website)) ev.website = "https://" + ev.website;
    ev.address = $("#eAddr").value.trim();
    ev.org = { name: $("#eOName").value.trim(), email: $("#eOMail").value.trim(), phone: $("#eOTel").value.trim() };
    ev.freq = $("#eFreq").value;
    ev.remindDays = Math.max(0, Math.round(+$("#eRemind").value || 0));
    ev.travel = +$("#eTravel").value || 0;
  };
  const valid = () => {
    if (!ev.name) { alert("Give the event its name — the formal one, like Middlesex County Fair."); return false; }
    const { exact } = nameChanged(ev.name) ? sameNamed(ev.name, ev.id) : { exact: null };
    if (exact) { alert(exact.name + " is already one of your events. Open it and add a new application instead."); return false; }
    if (!recurring(ev) && ev.regOpens && ev.regDeadline && ev.regOpens > ev.regDeadline) {
      alert("Registration closes before it opens — check those two dates."); return false;
    }
    return true;
  };
  const persist = async () => {
    const live = evOf(ev.id);
    if (live) ev.apps = live.apps;           /* applications are saved on their own sheet */
    const i = S.events.findIndex(x => x.id === ev.id);
    if (i >= 0) S.events[i] = ev; else S.events.push(ev);
    if (ev.type && !(S.settings.eventTypes || []).includes(ev.type)) {
      S.settings.eventTypes = (S.settings.eventTypes || []).concat([ev.type]).sort();
      await saveSettings();
    }
    await saveEvents();
  };
  /* going into an application saves the event first, so nothing typed is lost */
  const thenApp = async (appId, o) => {
    collect();
    if (!valid()) return;
    await persist();
    appSheet(ev.id, appId, Object.assign({ back: true }, o || {}));
  };

  document.querySelectorAll("[data-appgo]").forEach(b => b.onclick = () => thenApp(b.dataset.appgo));
  if ($("#eNewApp")) $("#eNewApp").onclick = () => {
    const c = currentCycle(ev);
    thenApp(null, { cycle: c ? c.key : "", status: "applied" });
  };

  $("#evSave").onclick = async () => {
    collect();
    if (!valid()) return;
    await persist(); closeSheet(); renderAll();
    toast(existing ? "Saved" : "Added — it'll remind you when registration is due");
    if (opts.afterSave) opts.afterSave(evOf(ev.id));
  };
  if ($("#evDel")) $("#evDel").onclick = () => {
    const ds = daysOfEvent(ev.id);
    const n = ds.reduce((a, d) => a + salesOfDay(d.id).length, 0);
    const na = (existing.apps || []).length;
    confirmAsk({
      title: "Delete " + (ev.name || "this event") + "?",
      body: `Its ${na} application${na === 1 ? "" : "s"}` +
        (n ? `, ${ds.length} selling date${ds.length === 1 ? "" : "s"} and <b>${n} recorded sale${n === 1 ? "" : "s"}</b> go with it, and the stock those sales used comes back. `
           : (ds.length ? ` and ${ds.length} selling date${ds.length === 1 ? "" : "s"} go with it. ` : " go with it. ")) +
        "You can put it all back from <b>Safe → Recently deleted</b>.",
      onYes: async () => {
        const src = evOf(ev.id) || existing;
        const sales = ds.flatMap(d => salesOfDay(d.id));
        await trashPut("event", src.name || "Event",
          na + " application" + (na === 1 ? "" : "s") + (n ? " · " + n + " sale" + (n === 1 ? "" : "s") : ""),
          { event: src, days: ds, sales });
        for (const d of ds) {
          await returnSales(salesOfDay(d.id));
          for (const s of salesOfDay(d.id)) await saleDel(s.id);
          S.sales = S.sales.filter(x => x.dayId !== d.id);
          if (S.settings.activeDay === d.id) S.settings.activeDay = null;
        }
        S.days = S.days.filter(d => d.eventId !== ev.id);
        S.events = S.events.filter(e => e.id !== ev.id);
        await saveEvents(); await saveDays(); await saveSettings();
        closeSheet(); renderAll();
        toast((src.name || "Event") + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
      }
    });
  };
}

/* ---------------------------- application editor ----------------------------
   One go at an event: where you stand, the fee, the selling days, the day
   itself and how it went. A new one is a copy of the last. */
function appSheet(evId, appId, opts) {
  opts = opts || {};
  const src = evOf(evId);
  if (!src) return;
  const existing = appId ? appOf(src, appId) : null;
  const copied = !existing && !!latestApp(src);
  const a = existing ? JSON.parse(JSON.stringify(existing))
    : Object.assign(appFromLast(src), { status: opts.status || "applied", cycle: opts.cycle || "" });
  let days = existing ? daysOfApp(a.id).map(d => ({ ...d })) : [];
  let never = false;

  const tog = (id, on, label) => `<button class="tog sm" id="${id}" aria-pressed="${!!on}">${label}</button>`;
  const title = esc(src.name || "Event") + " · " + (existing ? esc(appLabel(src, a)) : "New application");

  sheet(title, `
    ${copied ? '<p class="note">Copied from last time — check the fee, the times and the dates.</p>' : ""}
    <div class="sect">Where you stand</div>
    <div class="togs" id="aStand" style="margin-bottom:12px">${STATUS.map(s =>
      `<button class="tog sm" data-ast="${s[0]}" aria-pressed="${a.status === s[0]}">${s[1]}</button>`).join("")}</div>
    <div id="aDecl"></div>

    <div class="sect">What it costs</div>
    <label class="f"><span class="t">Booth / table fee</span><input type="number" id="aFee" inputmode="decimal" step="0.01" min="0" value="${a.fee || ""}"></label>
    <p class="note">Counted against the profit once you're Booked &amp; paid. Travel is set on the event.</p>

    <div class="sect">Selling days</div>
    <div id="aDays"></div>
    <div class="rowf" style="align-items:flex-end">
      <label class="f" style="margin-bottom:0"><span class="t">Add a date</span><input type="date" id="aNewDay" value=""></label>
      <button class="btn sec sm" id="aAddDay" style="flex:0 0 auto;width:auto;padding-left:18px;padding-right:18px">Add</button>
    </div>

    <div class="sect">On the day</div>
    <div class="rowf">
      <label class="f"><span class="t">Load-in</span><input type="time" id="aLoad" value="${esc(a.loadIn)}"></label>
      <label class="f"><span class="t">Opens</span><input type="time" id="aStart" value="${esc(a.startTime)}"></label>
      <label class="f"><span class="t">Closes</span><input type="time" id="aEnd" value="${esc(a.endTime)}"></label>
    </div>
    <label class="f"><span class="t">Pitch size</span><input type="text" id="aBooth" value="${esc(a.boothSize)}" placeholder="10x10, or 6ft table"></label>
    <div class="togs" style="margin-bottom:14px">
      <button class="tog sm" id="aIndoor" aria-pressed="${a.venue === "Indoor"}">Indoor</button>
      <button class="tog sm" id="aOutdoor" aria-pressed="${a.venue === "Outdoor"}">Outdoor</button>
      ${tog("aPower", a.power, "Power")}
      ${tog("aTable", a.tableProvided, "Table provided")}
      ${tog("aTent", a.tent, "Tent needed")}
    </div>

    <div class="sect">Afterwards</div>
    <label class="f"><span class="t">Worth doing again?</span>
      <span class="stars" id="aStars">${[1, 2, 3, 4, 5].map(i =>
        `<button data-star="${i}" aria-pressed="${a.rating >= i}" aria-label="${i} of 5">★</button>`).join("")}
        <button class="btn ghost" id="aClearStars" style="width:auto;padding:4px 10px">clear</button></span></label>
    <label class="f"><span class="t">How it went</span><textarea id="aReview" placeholder="Sold out of dogs by 1pm. Bring double next year.">${esc(a.review)}</textarea></label>
    <label class="f"><span class="t">Notes</span><textarea id="aNotes" placeholder="Parking round the back. Ask for Dee.">${esc(a.notes)}</textarea></label>
  `, [
    { label: "Save", cls: "btn", id: "apSave" },
    opts.back ? { label: "Back to the event", cls: "btn sec", id: "apBack" } : null,
    existing ? { label: "Delete this application", cls: "btn sec", id: "apDel" } : null
  ].filter(Boolean));

  const drawDecl = () => {
    const box = $("#aDecl");
    if (a.status !== "declined") { box.innerHTML = ""; return; }
    box.innerHTML = `
      <label class="f"><span class="t">Why they said no</span>
        <textarea id="aWhy" placeholder="Category was full">${esc(a.declineWhy)}</textarea></label>
      <div class="togs" style="margin-bottom:10px">${DECLINE_REASONS.map(r =>
        `<button class="tog sm" data-dr="${esc(r)}">${esc(r)}</button>`).join("")}</div>
      ${recurring(src) ? `<div class="togs" style="margin-bottom:14px">
        <button class="tog sm" id="aAgain" aria-pressed="${!never}">Try again next time</button>
        <button class="tog sm" id="aNever" aria-pressed="${never}">Don't apply again</button></div>` : ""}`;
    $("#aWhy").oninput = e => a.declineWhy = e.target.value;
    box.querySelectorAll("[data-dr]").forEach(b => b.onclick = () => {
      const t = $("#aWhy");
      t.value = t.value.trim() ? t.value.trim() + ". " + b.dataset.dr : b.dataset.dr;
      a.declineWhy = t.value;
    });
    if ($("#aAgain")) $("#aAgain").onclick = () => { never = false; drawDecl(); };
    if ($("#aNever")) $("#aNever").onclick = () => { never = true; drawDecl(); };
  };
  $("#aStand").querySelectorAll("[data-ast]").forEach(b => b.onclick = () => {
    a.status = b.dataset.ast;
    $("#aStand").querySelectorAll("[data-ast]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.ast === a.status)));
    drawDecl();
  });
  drawDecl();

  const drawDays = () => {
    days.sort((x, y) => x.date.localeCompare(y.date));
    $("#aDays").innerHTML = days.length
      ? `<div class="card">${days.map((d, i) => {
          const n = salesOfDay(d.id).length;
          return `<div class="inset"><span class="b"><span class="n">${esc(fmtDate(d.date, true))}</span>
            <span class="s">${esc(countdown(daysUntil(d.date)))}${n ? " · " + n + " sale" + (n === 1 ? "" : "s") : ""}</span></span>
            <button class="xbtn" data-dx="${i}" aria-label="Remove date">✕</button></div>`;
        }).join("")}</div>`
      : '<p class="note">No dates yet. A three-day fair gets three dates.</p>';
    $("#aDays").querySelectorAll("[data-dx]").forEach(b => b.onclick = () => {
      const i = +b.dataset.dx, n = salesOfDay(days[i].id).length;
      if (!n) { days.splice(i, 1); drawDays(); return; }
      confirmAsk({
        title: "Take this date off?",
        body: `${n} sale${n === 1 ? " was" : "s were"} recorded on it. ${n === 1 ? "It" : "They"} will be deleted when you save, and the stock ${n === 1 ? "it" : "they"} used comes back.`,
        yes: "Take it off",
        onYes: () => { days.splice(i, 1); drawDays(); }
      });
    });
  };
  drawDays();
  const addDay = v => {
    if (!v || days.some(d => d.date === v)) return false;
    days.push({ id: uid(), eventId: src.id, appId: a.id, date: v, notes: "", created: Date.now() });
    return true;
  };
  $("#aAddDay").onclick = () => {
    const v = $("#aNewDay").value;
    if (!v) return;
    if (!addDay(v)) { toast("That date is already on the list"); return; }
    $("#aNewDay").value = "";
    drawDays();
  };

  const toggle = (id, set) => $(id).onclick = () => {
    const on = $(id).getAttribute("aria-pressed") !== "true";
    $(id).setAttribute("aria-pressed", String(on)); set(on);
  };
  toggle("#aPower", v => a.power = v);
  toggle("#aTable", v => a.tableProvided = v);
  toggle("#aTent", v => a.tent = v);
  $("#aIndoor").onclick = () => {
    a.venue = a.venue === "Indoor" ? "" : "Indoor";
    $("#aIndoor").setAttribute("aria-pressed", String(a.venue === "Indoor"));
    $("#aOutdoor").setAttribute("aria-pressed", "false");
  };
  $("#aOutdoor").onclick = () => {
    a.venue = a.venue === "Outdoor" ? "" : "Outdoor";
    $("#aOutdoor").setAttribute("aria-pressed", String(a.venue === "Outdoor"));
    $("#aIndoor").setAttribute("aria-pressed", "false");
  };
  $("#aStars").querySelectorAll("[data-star]").forEach(b => b.onclick = () => {
    a.rating = +b.dataset.star;
    $("#aStars").querySelectorAll("[data-star]").forEach(x => x.setAttribute("aria-pressed", String(+x.dataset.star <= a.rating)));
  });
  $("#aClearStars").onclick = () => {
    a.rating = 0;
    $("#aStars").querySelectorAll("[data-star]").forEach(x => x.setAttribute("aria-pressed", "false"));
  };

  const collect = () => {
    addDay($("#aNewDay").value);          /* a date typed in but never Added still counts */
    a.fee = +$("#aFee").value || 0;
    a.loadIn = $("#aLoad").value; a.startTime = $("#aStart").value; a.endTime = $("#aEnd").value;
    a.boothSize = $("#aBooth").value.trim();
    a.review = $("#aReview").value.trim(); a.notes = $("#aNotes").value.trim();
    if ($("#aWhy")) a.declineWhy = $("#aWhy").value.trim();
    if (a.status !== "declined") a.declineWhy = "";
  };
  const persist = async () => {
    const ev = evOf(src.id);
    const i = ev.apps.findIndex(x => x.id === a.id);
    if (i >= 0) ev.apps[i] = a; else ev.apps.push(a);
    const keep = days.map(d => d.id);
    for (const gone of daysOfApp(a.id).filter(d => !keep.includes(d.id))) {
      await returnSales(salesOfDay(gone.id));
      for (const s of salesOfDay(gone.id)) await saleDel(s.id);
      S.sales = S.sales.filter(s => s.dayId !== gone.id);
      if (S.settings.activeDay === gone.id) S.settings.activeDay = null;
    }
    S.days = S.days.filter(d => d.appId !== a.id).concat(days.map(d => ({ ...d, eventId: ev.id, appId: a.id })));
    if (a.status === "declined") {
      if (never) { ev.retired = true; ev.retiredWhy = a.declineWhy; }
      else if (recurring(ev) && !a.cycle) {
        const c = currentCycle(ev);
        if (c && !(ev.skip || []).includes(c.key)) ev.skip = (ev.skip || []).concat([c.key]);
      }
    }
    await saveEvents(); await saveDays(); await saveSettings();
  };

  $("#apSave").onclick = async () => {
    collect();
    await persist(); closeSheet(); renderAll();
    toast(a.status === "paid" ? "Booked & paid" : "Saved");
    if (opts.back) eventSheet(evOf(src.id), {});
  };
  if ($("#apBack")) $("#apBack").onclick = () => eventSheet(evOf(src.id), {});
  if ($("#apDel")) $("#apDel").onclick = () => {
    const ds = daysOfApp(a.id);
    const n = ds.reduce((x, d) => x + salesOfDay(d.id).length, 0);
    confirmAsk({
      title: "Delete this application?",
      body: (n ? `Its ${ds.length} date${ds.length === 1 ? "" : "s"} and <b>${n} recorded sale${n === 1 ? "" : "s"}</b> go with it, and the stock those sales used comes back. `
               : (ds.length ? "Its dates go with it. " : "")) + "The event itself stays. You can put it back from <b>Safe → Recently deleted</b>.",
      onYes: async () => {
        const ev = evOf(src.id), live = appOf(ev, a.id);
        const sales = ds.flatMap(d => salesOfDay(d.id));
        await trashPut("app", (ev.name || "Event") + " · " + appLabel(ev, live),
          ds.length + " date" + (ds.length === 1 ? "" : "s") + (n ? " · " + n + " sale" + (n === 1 ? "" : "s") : ""),
          { eventId: ev.id, app: live, days: ds, sales });
        for (const d of ds) {
          await returnSales(salesOfDay(d.id));
          for (const s of salesOfDay(d.id)) await saleDel(s.id);
          S.sales = S.sales.filter(x => x.dayId !== d.id);
          if (S.settings.activeDay === d.id) S.settings.activeDay = null;
        }
        S.days = S.days.filter(d => d.appId !== a.id);
        ev.apps = ev.apps.filter(x => x.id !== a.id);
        await saveEvents(); await saveDays(); await saveSettings();
        closeSheet(); renderAll();
        toast("Application deleted", "Undo", () => restoreTrash(S.trash[0].id));
      }
    });
  };
}

/* Sell somewhere today that has no date for today: use an application that
   has no dates yet, or start one from the last. Being there means booked. */
async function sellTodayAt(ev) {
  const today = todayISO();
  const have = S.days.find(d => d.eventId === ev.id && d.date === today);
  if (have) { await sellOnDay(have.id); return; }
  let a = appsNewest(ev).find(x => !daysOfApp(x.id).length && x.status !== "declined");
  if (!a) { a = Object.assign(appFromLast(ev), { status: "paid", cycle: (currentCycle(ev) || {}).key || "" }); ev.apps.push(a); }
  else a.status = "paid";
  const d = { id: uid(), eventId: ev.id, appId: a.id, date: today, notes: "", created: Date.now() };
  S.days.push(d); S.settings.activeDay = d.id;
  await saveEvents(); await saveDays(); await saveSettings();
  closeSheet(); renderAll();
  toast("Open at " + dayTitle(d));
}

/* ---------------------------- calendar export ---------------------------- */
function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) {
  const out = [];
  let s = line;
  while (s.length > 73) { out.push(s.slice(0, 73)); s = " " + s.slice(73); }
  out.push(s);
  return out.join("\r\n");
}
function icsDate(d) { return String(d).replace(/-/g, ""); }
function icsDateTime(d, t) { return icsDate(d) + "T" + String(t).replace(":", "") + "00"; }
function addDay(d) {
  const x = parseD(d); x.setDate(x.getDate() + 1);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}
function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Stallbook//Market POS//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const push = (uidStr, summary, dtLines, desc, alarms, url, where) => {
    L.push("BEGIN:VEVENT", "UID:" + uidStr, "DTSTAMP:" + stamp, ...dtLines,
      fold("SUMMARY:" + icsEscape(summary)));
    if (desc) L.push(fold("DESCRIPTION:" + icsEscape(desc)));
    if (where) L.push(fold("LOCATION:" + icsEscape(where)));
    if (url) L.push(fold("URL:" + url));
    for (const a of alarms) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + a,
      fold("DESCRIPTION:" + icsEscape(summary)), "END:VALARM");
    L.push("END:VEVENT");
  };
  const allDay = d => ["DTSTART;VALUE=DATE:" + icsDate(d), "DTEND;VALUE=DATE:" + icsDate(addDay(d))];
  let n = 0;
  for (const ev of S.events) {
    const nm = ev.name || "Untitled event";
    const contact = [ev.org && ev.org.name, ev.org && ev.org.email, ev.org && ev.org.phone].filter(Boolean).join(" · ");
    const info = [ev.website, contact].filter(Boolean).join("\n");
    const lead = "-P" + Math.max(0, +ev.remindDays || 0) + "D";

    /* registration: the next expected opening for anything you haven't applied to */
    if (!ev.retired) {
      let open = "", close = "", tag = "";
      if (recurring(ev)) {
        const c = currentCycle(ev);
        const app = c && (ev.apps || []).find(a => a.cycle === c.key);
        if (c && !(ev.skip || []).includes(c.key) && (!app || app.status === "none")) {
          open = c.open; close = c.hasClose ? c.close : ""; tag = c.key;
        }
      } else {
        const app = latestApp(ev);
        if (!(ev.skip || []).includes("once") && (!app || app.status === "none")) {
          open = ev.regOpens; close = ev.regDeadline; tag = "once";
        }
      }
      const est = recurring(ev) ? " (expected)" : "";
      if (open && daysUntil(open) >= -1) {
        n++;
        push(ev.id + "-" + tag + "-open@stallbook", "Registration opens" + est + ": " + nm, allDay(open),
          info, [lead, "-PT15H"].filter((v, i, a) => a.indexOf(v) === i), ev.website);
      }
      if (close && daysUntil(close) >= -1) {
        n++;
        push(ev.id + "-" + tag + "-close@stallbook", "Applications close" + est + ": " + nm, allDay(close),
          info, ["-P7D", "-PT15H"], ev.website);
      }
    }

    /* selling days, with that application's times */
    for (const d of daysOfEvent(ev.id)) {
      if (daysUntil(d.date) < -1) continue;
      const a = appOf(ev, d.appId) || {};
      if (a.status === "declined") continue;
      n++;
      const start = a.loadIn || a.startTime, end = a.endTime;
      const dt = start && end
        ? ["DTSTART:" + icsDateTime(d.date, start), "DTEND:" + icsDateTime(d.date, end)]
        : allDay(d.date);
      const desc = [
        a.loadIn ? "Load-in " + a.loadIn : "",
        a.boothSize ? "Pitch " + a.boothSize : "",
        [a.venue, a.power ? "power" : "", a.tent ? "bring tent" : "", a.tableProvided ? "table provided" : ""].filter(Boolean).join(", "),
        contact, a.notes
      ].filter(Boolean).join("\n");
      push(d.id + "-day@stallbook", nm, dt, desc, ["-PT15H"], ev.website, ev.address);
    }
  }
  L.push("END:VCALENDAR");
  return { text: L.join("\r\n"), count: n };
}

function exportIcs() {
  const { text, count } = buildIcs();
  if (!count) { toast("Nothing upcoming to add"); return; }
  saveOut("stallbook-calendar.ics", text, "text/calendar");
  toast(count + " date" + (count === 1 ? "" : "s") + " ready — open the file to add them");
}

/* ---------------------------- tickets ----------------------------
   More than one person can be serving at once, so a sale in progress is a
   ticket. There is always at least one, and the one you're adding to is the
   one that's open.
   ------------------------------------------------------------------ */
function newTicket(label) {
  return { id: uid(), label: label || "", lines: [], created: Date.now() };
}
function ensureTicket() {
  if (!S.tickets.length) S.tickets = [newTicket()];
  if (!S.tickets.some(t => t.id === S.activeTicket)) S.activeTicket = S.tickets[0].id;
  return S.tickets.find(t => t.id === S.activeTicket);
}
const ticketOf = id => S.tickets.find(t => t.id === id) || null;
const cart = () => ensureTicket().lines;
const setCart = lines => { ensureTicket().lines = lines; };
const ticketName = (t, i) => t.label || ("Ticket " + (i + 1));
const ticketTotal = t => (t.lines || []).reduce((a, l) => a + unitPrice(l) * l.qty, 0);
const ticketCount = t => (t.lines || []).reduce((a, l) => a + l.qty, 0);
/* "the cart" is whatever the open ticket is holding */
Object.defineProperty(S, "cart", {
  get: () => cart(),
  set: v => setCart(v),
  configurable: true
});

/* ---------------------------- what's for sale ----------------------------
   Two ways of looking at the same shelf. Vendor is where prices and what's on
   today get decided; POS is what you use with a customer in front of you.
   ------------------------------------------------------------------------- */
const vendorMode = () => S.settings.sellMode === "vendor";
const itemActive = it => !!it && it.active !== false;
const forSale = m => !!m && m.forSale === true;

const unitCostOf = thing => {
  const m = matById(thing.id);
  if (m) return lastCost(m.id);
  const est = recipeCostEstimate(thing);
  return est === null ? (+thing.cost || 0) : est;
};
const marginOf = thing => {
  const price = +thing.price || 0;
  const cost = unitCostOf(thing);
  return { cost, profit: price - cost, pct: price > 0 ? Math.round((price - cost) / price * 100) : 0 };
};

/* a material sold as-is behaves like a one-line product */
const sellableMaterials = () => S.materials.filter(m => forSale(m) && isLive(m));
const sellThing = id => S.items.find(i => i.id === id) || matById(id) || null;
const isMaterialSale = id => !!matById(id) && !S.items.some(i => i.id === id);

function sellSections(forPos) {
  const out = [];
  const prods = S.items.filter(it => !forPos || itemActive(it));
  const groups = {};
  for (const it of prods) (groups[it.type || "Everything else"] ||= []).push(it);
  for (const g of Object.keys(groups).sort()) out.push({ title: g, things: groups[g].sort((a, b) => a.name.localeCompare(b.name)) });

  const mats = {};
  for (const m of (forPos ? sellableMaterials().filter(x => isPacked(x) && onHandTotal(x.id) > 0) : S.materials.filter(forSale))) {
    (mats[m.category || "Odds and ends"] ||= []).push(m);
  }
  for (const g of Object.keys(mats).sort()) out.push({ title: g, mats: true, things: mats[g].sort((a, b) => a.name.localeCompare(b.name)) });
  return out;
}

/* ---------------------------- sell grid ---------------------------- */
function sellCard(thing, isMat) {
  const vend = vendorMode();
  const price = +thing.price || 0;
  const m = isMat ? thing : null;
  const sn = isMat ? null : stockNote(thing);
  const left = isMat ? onHandTotal(thing.id) : null;
  const off = vend && (isMat ? !forSale(thing) : !itemActive(thing));
  const mg = marginOf(thing);
  return `<div class="tile ${off ? "off" : ""}">
    <button class="tilehit" data-sell="${thing.id}">
      ${thumb(thing, "sw", true)}
      <span class="nm">${esc(thing.name)}</span>
    </button>
    <button class="pp" data-price="${thing.id}">${price ? esc(cur(price)) : "Set price"}</button>
    ${vend ? `<span class="sl">${price
        ? esc(cur(mg.profit)) + " kept · " + mg.pct + "%"
        : "costs " + esc(cur(mg.cost))}</span>
      <button class="tog sm" data-onoff="${thing.id}" aria-pressed="${!off}" style="padding:5px 14px;font-size:13px">${off ? "Off today" : "On sale"}</button>`
    : `${isMat ? `<span class="sl ${left === 0 ? "warn" : ""}">${left} left</span>`
              : (sn ? `<span class="sl ${sn.warn ? "warn" : ""}">${esc(sn.text)}</span>` : "")}`}
  </div>`;
}

function renderGrid() {
  const g = $("#grid");
  const vend = vendorMode();
  if (S.tab === "sell") {
    $("#kicker").textContent = vend ? "Prices and what's on today" : "Tap a balloon";
    $("#title").textContent = vend ? "Vendor view" : "Who's next?";
  }
  const sections = sellSections(!vend);
  const anything = sections.some(sec => sec.things.length);

  const modeBar = `<div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:2px">
      <div class="seg" role="tablist">
        <button id="modePos" role="tab" aria-selected="${!vend}">POS</button>
        <button id="modeVendor" role="tab" aria-selected="${vend}">Vendor view</button>
      </div>
      ${vend ? '<span class="note" style="margin:0">Set what you charge and what\'s on sale today. Customers never see this.</span>' : ""}
    </div>`;

  if (!S.items.length && !S.materials.some(forSale)) {
    g.innerHTML = modeBar + `<div style="grid-column:1/-1">
      <p class="note">Nothing to sell yet. Add something under <b>Make</b>, or mark a material
        for sale under <b>Inventory</b> if you sell it as it comes.</p>
      <button class="btn auto" id="goItems">Add something</button></div>`;
    bindMode();
    if ($("#goItems")) $("#goItems").onclick = () => setTab("items");
    return;
  }

  g.innerHTML = modeBar + (anything
    ? sections.filter(sec => sec.things.length).map(sec => `
        <div style="grid-column:1/-1" class="sect">${esc(sec.title)}</div>
        ${sec.things.map(t => sellCard(t, !!sec.mats)).join("")}`).join("")
    : `<div style="grid-column:1/-1"><p class="note">Nothing is on sale today. Switch to
        <b>Vendor view</b> to turn things back on.</p></div>`);

  bindMode();

  g.querySelectorAll("[data-price]").forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    priceSheet(sellThing(b.dataset.price));
  });
  g.querySelectorAll("[data-onoff]").forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    const t = sellThing(b.dataset.onoff);
    if (isMaterialSale(t.id)) { t.forSale = !forSale(t); await saveMaterials(); }
    else { t.active = !itemActive(t); await saveItems(); }
    renderGrid();
  });
  g.querySelectorAll("[data-sell]").forEach(b => b.onclick = () => {
    const t = sellThing(b.dataset.sell);
    if (vendorMode()) { priceSheet(t); return; }
    const tile = b.closest(".tile");
    tile.classList.remove("pop");
    void tile.offsetWidth;
    tile.classList.add("pop");
    if (isMaterialSale(t.id)) { quickAdd(t); return; }
    if ((t.recipe || []).some(lineNeedsChoice)) lineSheet(t, null);
    else quickAdd(t);
  });
}

function bindMode() {
  const set = async v => { S.settings.sellMode = v; await saveSettings(); renderGrid(); renderSession(); };
  if ($("#modePos")) $("#modePos").onclick = () => set("pos");
  if ($("#modeVendor")) $("#modeVendor").onclick = () => set("vendor");
}

/* Price lives with selling, so it's set from the tile. */
function priceSheet(it) {
  if (!it) return;
  const isMat = isMaterialSale(it.id);
  const mg = marginOf(it);
  const optionMats = isMat ? []
    : [...new Map((it.recipe || []).flatMap(lineMats).map(m => [m.id, m])).values()];

  sheet("What do you charge?", `
    <div class="shead" style="padding:0 0 10px">
      ${thumb(it, "sw")}
      <h3 style="font-size:22px">${esc(it.name)}</h3></div>
    <label class="f"><span class="t">Price</span>
      <input type="number" id="pxVal" inputmode="decimal" step="0.01" min="0" value="${it.price || ""}" placeholder="6.00"></label>
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="k">Costs to make</div><div class="v sm">${esc(cur(mg.cost))}</div></div>
      <div class="kpi tint"><div class="k">You keep</div><div class="v sm" id="pxKeep">—</div></div>
    </div>
    ${optionMats.length ? `<div class="sect" style="margin-top:0">Options</div>
      <p class="note">Which ones you're offering today, and what a customer pays extra for
        picking one. Switching one off here leaves it in stock — it just isn't on the table.</p>
      <div class="card">${optionMats.map(m => `<div class="inset">
        ${colorDot(balloonColor(m.name) || hueFor(m.name), 18)}
        <span class="b"><span class="n">${esc(m.name)}</span>
          <span class="s">${Math.round(onHandTotal(m.id) * 100) / 100} ${esc(m.unit || "each")} left</span></span>
        <button class="tog sm" data-mon="${esc(m.id)}" aria-pressed="${isPacked(m)}"
          style="padding:6px 14px;font-size:13px">${isPacked(m) ? "On" : "Off"}</button>
        <input type="number" data-delta="${esc(m.id)}" inputmode="decimal" step="0.01"
          value="${m.priceDelta || ""}" placeholder="+0" style="max-width:96px;text-align:right">
      </div>`).join("")}</div>` : ""}
    <div class="togs" style="margin-top:14px">
      <button class="tog sm" id="pxOn" aria-pressed="${isMat ? forSale(it) : itemActive(it)}">On sale today</button>
    </div>
  `, [{ label: "Save", cls: "btn", id: "pxGo" }], { narrow: !optionMats.length });

  const paint = () => {
    const p = +$("#pxVal").value || 0;
    const profit = p - mg.cost;
    $("#pxKeep").innerHTML = p
      ? esc(cur(profit)) + ' <span style="font-size:14px;font-weight:600">· ' + Math.round(profit / p * 100) + "%</span>"
      : "—";
  };
  paint();
  $("#pxVal").oninput = paint;
  document.querySelectorAll("[data-mon]").forEach(b => b.onclick = () => {
    const m = matById(b.dataset.mon);
    if (!m) return;
    m.packed = !isPacked(m);
    b.setAttribute("aria-pressed", String(isPacked(m)));
    b.textContent = isPacked(m) ? "On" : "Off";
  });
  $("#pxOn").onclick = () => {
    const on = $("#pxOn").getAttribute("aria-pressed") !== "true";
    $("#pxOn").setAttribute("aria-pressed", String(on));
  };
  $("#pxGo").onclick = async () => {
    it.price = +$("#pxVal").value || 0;
    const on = $("#pxOn").getAttribute("aria-pressed") === "true";
    document.querySelectorAll("[data-delta]").forEach(inp => {
      const m = matById(inp.dataset.delta);
      if (m) m.priceDelta = +inp.value || 0;
    });
    if (isMat) { it.forSale = on; await saveMaterials(); }
    else { it.active = on; await saveItems(); await saveMaterials(); }
    closeSheet(); refreshLists();
  };
}

function requireDay() {
  if (activeDay()) return true;
  toast("Pick where you're selling");
  dayPicker();
  return false;
}
function quickAdd(it) {
  if (!requireDay()) return;
  if (isMaterialSale(it.id)) {
    addLine({ itemId: it.id, name: it.name, opts: [], qty: 1, base: +it.price || 0,
      unitCost: lastCost(it.id), mode: "full", dType: "pct", dVal: 0, reason: "", picks: {} });
    toast(it.name + " added");
    return;
  }
  const picks = defaultPicks(it);
  addLine({
    itemId: it.id, name: it.name, opts: [], qty: 1,
    base: (+it.price || 0) + recipeUplift(it, [], picks),
    unitCost: +it.cost || 0, mode: "full", dType: "pct", dVal: 0, reason: "", picks
  });
  toast(it.name + " added");
}
function addLine(l) {
  l.uid = uid();
  const key = JSON.stringify([l.itemId, l.opts, l.mode, l.dType, l.dVal, l.reason, l.picks || {}]);
  const same = cart().find(x => JSON.stringify([x.itemId, x.opts, x.mode, x.dType, x.dVal, x.reason, x.picks || {}]) === key);
  if (same) same.qty += l.qty; else cart().push(l);
  saveTickets();
  renderTicket();
}
function unitPrice(l) {
  if (l.mode === "free" || l.mode === "practice") return 0;
  if (l.mode === "set" || l.mode === "replace") return Math.max(0, +l.dVal || 0);
  const base = l.base;
  if (l.mode === "discount") {
    const v = +l.dVal || 0;
    return Math.max(0, l.dType === "pct" ? base * (1 - v / 100) : base - v);
  }
  return base;
}

/* ---------------------------- line sheet ---------------------------- */
const DEAL_STEPS = [10, 20, 50];

function lineSheet(item, existing) {
  if (!requireDay()) return;
  const st = existing ? JSON.parse(JSON.stringify(existing)) : {
    itemId: item.id, name: item.name,
    opts: [],
    qty: 1, base: 0, unitCost: +item.cost || 0, mode: "full", dType: "pct", dVal: 0, reason: "",
    picks: defaultPicks(item)
  };
  st.picks = st.picks || {};
  let scope = existing ? existing.qty : 1;
  let showAll = false;
  const pickLines = (item.recipe || []).filter(lineNeedsChoice);
  const syncOpts = () => {
    st.opts = resolveRecipe(item, [], st.picks).filter(r => r.material)
      .map(r => ({ g: r.category || "Material", o: r.name, d: 0 }));
  };
  const recalc = () => {
    syncOpts();
    st.base = (+item.price || 0) + recipeUplift(item, st.opts, st.picks);
  };
  recalc();

  sheet(esc(item.name), `
    <div id="sheetBody"></div>
  `, [{ label: existing ? "Save it" : "Add it", cls: "btn", id: "lineGo" }],
    { thumb: item, foot: true,
      extra: existing ? [{ label: "Popped", cls: "btn popped", id: "lineScrap" },
                         { label: "Take it off", cls: "btn sec", id: "lineDel" }] : null });

  const body = () => {
    recalc();
    $("#sheetBody").innerHTML = `
      <div id="matPicks">${pickLines.map(rl => {
        const need = lineQtyFor(rl);
        const all = lineMats(rl);
        const options = linePickable(rl, showAll);
        /* count what's being held back even while everything is shown, so the
           way back into the short list doesn't vanish once it's used */
        const hiddenCount = all.length - linePickable(rl, false).length;
        return `<div class="slabel">${esc(rl.category || "Material")}${need !== 1 ? " · uses " + need : ""}</div>
          <div class="togs" data-pick="${esc(rl.id)}">
            ${options.length ? options.map(m => {
              const have = onHandTotal(m.id);
              const c = balloonColor(m.name) || hueFor(m.name);
              const short = have < need * st.qty;
              return `<button class="tog" data-m="${esc(m.id)}" aria-pressed="${st.picks[rl.id] === m.id}">
                ${colorDot(c)}${esc(m.name)}<span class="d" style="${short ? "color:var(--warn-ink)" : ""}">${have} left</span>
                ${+m.priceDelta ? `<span class="d">${m.priceDelta > 0 ? "+" : "−"}${cur(Math.abs(m.priceDelta))}</span>` : ""}
              </button>`;
            }).join("")
            : (all.length
                ? `<p class="note">None of your ${esc(rl.category)} came to this market, or they're all used up.</p>`
                : `<p class="note">Nothing in "${esc(rl.category)}" yet — add some under Inventory.</p>`)}
          </div>
          ${hiddenCount > 0 ? `<button class="btn ghost" data-showall="1" style="margin-top:0">${showAll ? "Just what I brought" : "Show " + hiddenCount + " I didn't bring"}</button>` : ""}`;
      }).join("")}
      ${(() => {
        if (!hasRecipe(item)) return "";
        const fixed = resolveRecipe(item, [], st.picks)
          .filter(r => r.material && !pickLines.some(pl => pl.id === r.recipeLineId));
        if (!fixed.length) return "";
        return `<p class="note" style="margin-top:10px">Also uses ${fixed.map(f => esc((f.qty * st.qty) + " × " + f.name)).join(", ")}.</p>`;
      })()}</div>

      ${existing && existing.qty > 1 ? `<div class="slabel">Change</div>
        <div class="togs even" style="margin-bottom:4px">
          <button class="tog" id="scopeOne" aria-pressed="${scope === 1}">Just 1 of ${existing.qty}</button>
          <button class="tog" id="scopeAll" aria-pressed="${scope === existing.qty}">All ${existing.qty}</button>
        </div>
        <p class="note" style="margin:6px 0 0">${scope === existing.qty
          ? "Changing every one of them."
          : "The one you change is split onto its own line."}</p>` : ""}

      <div class="slabel">How many</div>
      <div class="qtyrow">
        <button class="step" id="qm" aria-label="One fewer">−</button>
        <span class="qtyn" id="qn">${st.qty}</span>
        <button class="step" id="qp" aria-label="One more">+</button>
      </div>

      <div class="slabel">Price</div>
      <div class="togs even">
        <button class="tog" id="mFull" aria-pressed="${st.mode === "full"}">Full price</button>
        <button class="tog" id="mDisc" aria-pressed="${["discount", "set"].includes(st.mode)}">Discounted</button>
        <button class="tog" id="mFree" aria-pressed="${st.mode === "free"}">A gift</button>
        <button class="tog" id="mRepl" aria-pressed="${st.mode === "replace"}">Swap</button>
        ${practiceAllowed() || st.mode === "practice" ? `<button class="tog" id="mPrac" aria-pressed="${st.mode === "practice"}">Practice</button>` : ""}
      </div>
      <div class="note hidden" id="costHint" style="margin:8px 0 0;font-size:13px"></div>
      <div id="modeExtra"></div>`;

    document.querySelectorAll("[data-pick]").forEach(wrap => {
      const rid = wrap.dataset.pick;
      wrap.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { st.picks[rid] = b.dataset.m; body(); });
    });
    document.querySelectorAll("[data-showall]").forEach(b => b.onclick = () => { showAll = !showAll; body(); });
    if ($("#scopeOne")) $("#scopeOne").onclick = () => { scope = 1; st.qty = 1; body(); };
    if ($("#scopeAll")) $("#scopeAll").onclick = () => { scope = existing.qty; st.qty = existing.qty; body(); };
    $("#qm").onclick = () => { st.qty = Math.max(1, st.qty - 1); body(); };
    $("#qp").onclick = () => { st.qty++; body(); };
    $("#mFull").onclick = () => { st.mode = "full"; st.dVal = 0; st.reason = ""; body(); };
    $("#mDisc").onclick = () => { st.mode = "discount"; st.dType = "amt"; st.dVal = 0; st.reason = ""; body(); };
    $("#mFree").onclick = () => { st.mode = "free"; st.dVal = 0; st.reason = ""; body(); };
    if ($("#mPrac")) $("#mPrac").onclick = () => { st.mode = "practice"; st.dVal = 0; st.reason = ""; body(); };
    $("#mRepl").onclick = () => { st.mode = "replace"; st.dVal = 0; st.reason = ""; body(); };

    drawExtra();
    paintFoot();
  };

  const drawExtra = () => {
    const e = $("#modeExtra");
    if (st.mode === "discount" || st.mode === "set") {
      const own = st.mode === "set";
      e.innerHTML = `<div class="togs" id="dealPills" style="margin-top:10px">
          ${DEAL_STEPS.map(v => `<button class="tog sm" data-deal="${v}" aria-pressed="${!own && st.dType === "pct" && +st.dVal === v}">${v}% off</button>`).join("")}
          <button class="tog sm" data-own="1" aria-pressed="${own}">Own price</button>
        </div>
        ${own
          ? `<label class="f" style="margin-top:12px"><span class="t">Charge this much each</span>
              <input type="number" id="sV" inputmode="decimal" step="0.01" min="0" value="${st.dVal || ""}"></label>`
          : `<label class="f" style="margin-top:12px"><span class="t">Or type it</span>
              <div class="rowf">
                <select id="dT"><option value="amt" ${st.dType !== "pct" ? "selected" : ""}>money off</option><option value="pct" ${st.dType === "pct" ? "selected" : ""}>% off</option></select>
                <input type="number" id="dV" inputmode="decimal" step="0.01" min="0" value="${st.dVal || ""}">
              </div></label>`}
        <label class="f"><span class="t">Why (if you want)</span>
          <input type="text" id="rIn" value="${esc(st.reason)}" placeholder="Haggled, a regular, a bundle"></label>`;
      e.querySelectorAll("[data-deal]").forEach(b => b.onclick = () => {
        st.mode = "discount"; st.dType = "pct"; st.dVal = +b.dataset.deal; drawExtra(); paintFoot();
      });
      const ownBtn = e.querySelector("[data-own]");
      if (ownBtn) ownBtn.onclick = () => {
        st.mode = own ? "discount" : "set";
        st.dVal = own ? 0 : (+st.base || 0);
        if (own) st.dType = "amt";
        drawExtra(); paintFoot();
      };
      if ($("#dT")) $("#dT").onchange = ev2 => { st.dType = ev2.target.value; paintFoot(); };
      if ($("#dV")) $("#dV").oninput = ev2 => { st.dVal = +ev2.target.value || 0; paintFoot(); };
      if ($("#sV")) $("#sV").oninput = ev2 => { st.dVal = +ev2.target.value || 0; paintFoot(); };
      $("#rIn").oninput = ev2 => { st.reason = ev2.target.value; };
    } else if (st.mode === "replace") {
      e.innerHTML = `<label class="f" style="margin-top:12px"><span class="t">Charge for the swap — 0 if it's free</span>
          <input type="number" id="pV" inputmode="decimal" step="0.01" min="0" value="${st.dVal || 0}"></label>
        <div class="togs">
          ${REPLACE_REASONS.map(r => `<button class="tog sm" data-pr="${esc(r)}" aria-pressed="${st.reason === r}">${esc(r)}</button>`).join("")}
        </div>`;
      $("#pV").oninput = ev2 => { st.dVal = +ev2.target.value || 0; paintFoot(); };
      e.querySelectorAll("[data-pr]").forEach(b => b.onclick = () => {
        st.reason = st.reason === b.dataset.pr ? "" : b.dataset.pr;
        drawExtra(); paintFoot();
      });
    } else e.innerHTML = "";
  };

  const paintFoot = () => {
    recalc();
    const u = unitPrice(st);
    const f = $("#footValue");
    if (f) f.textContent = cur(u * st.qty);
    const hint = $("#costHint");
    if (hint) {
      const show = ["discount", "set", "free", "practice"].includes(st.mode);
      hint.classList.toggle("hidden", !show);
      if (show) {
        const per = isMaterialSale(item.id)
          ? lastCost(item.id)
          : resolveRecipe(item, [], st.picks).reduce((acc, r) =>
              acc + (r.material ? lastCost(r.material.id) * r.qty : 0), 0) || (+st.unitCost || 0);
        hint.textContent = "costs you " + cur(per * st.qty);
      }
    }
    const note = $("#footNote");
    if (note) {
      let t = "";
      if (st.mode === "replace") t = u === 0 ? "swap, no charge" : "swap";
      else if (st.mode === "practice") t = "practice, no charge";
      else if (u < st.base) t = "instead of " + cur(st.base * st.qty);
      else if (u > st.base) t = "above the usual " + cur(st.base * st.qty);
      note.textContent = t;
    }
  };

  if ($("#lineScrap")) $("#lineScrap").onclick = () => scrapSheet(item, st);

  $("#lineGo").onclick = async () => {
    if (!existing) { addLine(st); }
    else if (scope < existing.qty) {
      /* only some of them changed — the changed ones become their own line */
      const rest = existing.qty - scope;
      existing.qty = rest;
      const split = Object.assign({}, st, { uid: uid(), qty: scope });
      const at = cart().indexOf(existing);
      cart().splice(at + 1, 0, split);
    } else {
      Object.assign(existing, st);
    }
    await saveTickets();
    closeSheet(); renderTicket();
  };
  if ($("#lineDel")) $("#lineDel").onclick = async () => {
    setCart(cart().filter(x => x.uid !== existing.uid));
    await saveTickets();
    closeSheet(); renderTicket();
  };
  body();
}

/* One that didn't survive being made. The materials are gone whether or not a
   customer ever pays, so they come off the shelf now and the line stays put
   for another go. */
function scrapSheet(item, st) {
  const used = isMaterialSale(item.id)
    ? [{ material: item, qty: 1, name: item.name }]
    : resolveRecipe(item, [], st.picks).filter(r => r.material);
  if (!used.length) { toast("Nothing to write off"); return; }

  sheet("That one popped?", `
    <p class="note">These come off the shelf as used up, and the ticket stays as it is so you
      can have another go. Nothing about the price changes.</p>
    <div class="card">${used.map(u => `<div class="inset">
      ${colorDot(balloonColor(u.name) || hueFor(u.name), 18)}
      <span class="b"><span class="n">${esc(u.name)}</span>
        <span class="s">${Math.round(onHandTotal(u.material.id) * 100) / 100} ${esc(u.material.unit || "each")} left</span></span>
      <span class="r">${u.qty} × ${esc(cur(lastCost(u.material.id)))}</span>
    </div>`).join("")}</div>
    <div class="slabel">What happened</div>
    <div class="togs" id="scrapWhy">
      ${["Popped", "Went wrong", "Wrong colour", "Dropped it"].map((r, i) =>
        `<button class="tog sm" data-sw="${esc(r)}" aria-pressed="${i === 0}">${esc(r)}</button>`).join("")}
    </div>
    <label class="f" style="margin-top:12px"><span class="t">Or say why</span>
      <input type="text" id="scrapOther"></label>
  `, [{ label: "Write it off", cls: "btn", id: "scrapGo" }], { narrow: true });

  let why = "Popped";
  document.querySelectorAll("[data-sw]").forEach(b => b.onclick = () => {
    why = b.dataset.sw;
    document.querySelectorAll("[data-sw]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#scrapOther").value = "";
  });
  $("#scrapOther").oninput = () => {
    why = $("#scrapOther").value;
    document.querySelectorAll("[data-sw]").forEach(x => x.setAttribute("aria-pressed", "false"));
  };

  $("#scrapGo").onclick = async () => {
    let cost = 0;
    for (const u of used) {
      const r = drawStock(u.material.id, "", u.qty, lastCost(u.material.id));
      S.writeoffs.push({
        id: uid(), stockId: u.material.id, itemId: u.material.id, name: u.material.name, key: "",
        date: todayISO(), qty: u.qty, reason: (why || "Popped").trim() + " while making " + item.name,
        cost: r.cost, draw: r.draw, short: r.short, dayId: woDayId(), created: Date.now()
      });
      cost += r.cost;
    }
    await saveLots(); await saveWriteoffs();
    closeSheet(); refreshLists(); renderTicket();
    toast("Written off — " + cur(cost) + ". Have another go.");
  };
}

/* ---------------------------- ticket ---------------------------- */
function lineRow(l, ticketId) {
  const u = unitPrice(l);
  const item0 = sellThing(l.itemId);
  const mats = (item0 && hasRecipe(item0))
    ? resolveRecipe(item0, [], l.picks || {}).filter(r => r.material).map(r => r.name)
    : [];
  /* opts are derived from the material picks, so the two lists overlap */
  const words = [...new Set(l.opts.filter(x => x.o).map(x => x.o).concat(mats))];
  const colour = item0 && isMaterialSale(item0.id)
    ? (balloonColor(item0.name) || hueFor(item0.name))
    : itemColor(item0 || { name: l.name }, l.opts);
  let chip = "";
  if (l.mode === "free") chip = `<span class="chip">Gift${l.reason ? " · " + esc(l.reason) : ""}</span>`;
  else if (l.mode === "practice") chip = `<span class="chip neutral">Practice</span>`;
  else if (l.mode === "discount") chip = `<span class="chip">${l.dType === "pct" ? (+l.dVal || 0) + "% off" : cur(+l.dVal || 0) + " off"}${l.reason ? " · " + esc(l.reason) : ""}</span>`;
  else if (l.mode === "set") chip = `<span class="chip">Own price · was ${esc(cur(l.base))}</span>`;
  else if (l.mode === "replace") chip = `<span class="chip">Swap${(+l.dVal || 0) ? " · " + esc(cur(+l.dVal)) : " · no charge"}${l.reason ? " · " + esc(l.reason) : ""}</span>`;
  return `<div class="tline">
    <button class="qd" data-line="${l.uid}" data-tk="${ticketId}" style="background:${colour}" aria-label="Change ${esc(l.name)}">${l.qty}×</button>
    <button class="b" data-line="${l.uid}" data-tk="${ticketId}" style="text-align:left">
      <span class="n">${esc(l.name)}</span>
      ${words.length ? `<span class="o">${esc(words.join(" · "))}</span>` : ""}
      ${chip}
    </button>
    <span class="amt">${u === 0 ? "—" : esc(cur(u * l.qty))}</span>
    <button class="pebble" data-drop="${l.uid}" data-tk="${ticketId}" aria-label="Take ${esc(l.name)} off">${ICON.closeSm}</button>
  </div>`;
}

/* a short peek at what's on a ticket, so two of them can be told apart */
function ticketPeek(t) {
  const lines = t.lines || [];
  const show = lines.slice(0, 3);
  const rest = lines.length - show.length;
  if (!lines.length) return '<span class="s">empty</span>';
  return show.map(l => {
    const item0 = sellThing(l.itemId);
    const mats = (item0 && hasRecipe(item0))
      ? resolveRecipe(item0, [], l.picks || {}).filter(r => r.material).map(r => r.name) : [];
    const words = [...new Set(l.opts.filter(x => x.o).map(x => x.o).concat(mats))];
    return `<span class="peek"><span class="q">${l.qty}×</span>
      <span class="t">${esc(l.name)}${words.length ? " · " + esc(words.join(" · ")) : ""}</span></span>`;
  }).join("") + (rest > 0 ? `<span class="more">+${rest} more</span>` : "");
}

function renderTicket() {
  ensureTicket();
  const many = S.tickets.length > 1;
  const host = $("#tickets");
  const list = $("#ticketList");
  $("#ticketWrap").classList.toggle("withlist", many);
  list.classList.toggle("hidden", !many);

  const t = S.tickets.find(x => x.id === S.activeTicket);
  const i = S.tickets.indexOf(t);
  const n = ticketCount(t);
  const total = ticketTotal(t);
  const listed = (t.lines || []).reduce((a, l) => a + l.base * l.qty, 0);

  host.innerHTML = `<div class="ticket open">
      <div class="thead">
        <span class="k">${esc(ticketName(t, i))}</span>
        <span class="c">${n === 0 ? "Nothing yet" : n === 1 ? "1 thing" : n + " things"}</span>
        ${many ? `<button class="pebble" data-close-tk="${t.id}" aria-label="Close ${esc(ticketName(t, i))}">${ICON.closeSm}</button>` : ""}
      </div>
      <div class="tlines">
        ${t.lines.length ? t.lines.map(l => lineRow(l, t.id)).join("")
          : '<div class="tempty">Tap a balloon to start a sale.</div>'}
      </div>
      <div class="tfoot">
        ${listed > total ? `<div class="saverow"><span>Deals &amp; gifts</span><span>−${esc(cur(listed - total))}</span></div>` : ""}
        <div class="totalblock"><span class="k">Total</span><span class="v">${esc(cur(total))}</span></div>
        <button class="btn" id="completeBtn">Complete order</button>
        <button class="btn ghost" id="clearBtn">Start over</button>
      </div>
    </div>
    ${many ? "" : '<button class="btn sec sm" id="newTicket" style="margin-top:10px">+ Another ticket</button>'}`;

  list.innerHTML = !many ? "" :
    S.tickets.filter(x => x.id !== t.id).map(x => {
      const j = S.tickets.indexOf(x);
      return `<button class="tkshut" data-open-tk="${x.id}">
        <span class="tkhead"><span class="n">${esc(ticketName(x, j))}</span>
          <span class="amt">${esc(cur(ticketTotal(x)))}</span></span>
        ${ticketPeek(x)}
      </button>`;
    }).join("") + '<button class="btn sec sm" id="newTicket">+ Another</button>';

  document.querySelectorAll("[data-open-tk]").forEach(b => b.onclick = async () => {
    S.activeTicket = b.dataset.openTk;
    await saveTickets(); renderTicket();
  });
  document.querySelectorAll("[data-close-tk]").forEach(b => b.onclick = () => {
    const tt = ticketOf(b.dataset.closeTk);
    const go = async () => {
      S.tickets = S.tickets.filter(x => x.id !== tt.id);
      ensureTicket();
      await saveTickets(); renderTicket();
    };
    /* always asks, the same as Start over — a stray tap shouldn't lose a ticket */
    const n = ticketCount(tt);
    confirmAsk({
      title: "Close this ticket?",
      body: n ? `${n} thing${n === 1 ? "" : "s"} on it will come off. Nothing is sold and no stock moves.`
              : "It's empty, so nothing is lost.",
      yes: "Close it", onYes: go
    });
  });
  if ($("#newTicket")) $("#newTicket").onclick = async () => {
    const fresh = newTicket();
    S.tickets.push(fresh);
    S.activeTicket = fresh.id;
    await saveTickets(); renderTicket();
    toast("New ticket");
  };

  host.querySelectorAll("[data-line]").forEach(b => b.onclick = () => {
    const l = cart().find(x => x.uid === b.dataset.line);
    if (!l) return;
    const src = sellThing(l.itemId) ||
      { id: l.itemId, name: l.name, cost: l.unitCost, recipe: [], price: l.base };
    lineSheet(src, l);
  });
  host.querySelectorAll("[data-drop]").forEach(b => b.onclick = async () => {
    setCart(cart().filter(x => x.uid !== b.dataset.drop));
    await saveTickets(); renderTicket();
  });

  bindTicketFoot();
  renderSession();
}

function bindTicketFoot() {
  const done = $("#completeBtn"), clear = $("#clearBtn");
  if (clear) clear.onclick = () => {
    if (!cart().length) return;
    const n = cart().reduce((a, l) => a + l.qty, 0);
    confirmAsk({
      title: "Start over?",
      body: `${n} thing${n === 1 ? "" : "s"} will come off this ticket. Nothing is sold and no stock moves.`,
      yes: "Start over",
      onYes: async () => { setCart([]); await saveTickets(); renderTicket(); toast("Cleared"); }
    });
  };
  if (done) done.onclick = completeOrder;
}
async function completeOrder() {
  if (!cart().length) { toast("Add something first"); return; }
  const d = activeDay();
  if (!d) { dayPicker(); return; }
  let drew = false, shortOf = [];
  const sale = {
    id: uid(), dayId: d.id, ts: Date.now(),
    lines: cart().map(l => {
      const u = unitPrice(l);
      const opts = l.opts.filter(x => x.o);
      const item = S.items.find(i => i.id === l.itemId);
      const line = {
        itemId: l.itemId, name: l.name, opts, qty: l.qty, base: l.base, unit: u,
        cost: +l.unitCost || 0, mode: l.mode, dType: l.dType, dVal: +l.dVal || 0, reason: l.reason || "",
        total: u * l.qty, listed: l.base * l.qty,
        costTotal: (+l.unitCost || 0) * l.qty, draw: [], used: [], short: 0,
        picks: l.picks || {}
      };
      const asMaterial = isMaterialSale(l.itemId) ? matById(l.itemId) : null;
      if (asMaterial) {
        const r = drawStock(asMaterial.id, "", l.qty, lastCost(asMaterial.id));
        line.used = [{ materialId: asMaterial.id, name: asMaterial.name, qty: l.qty,
          draw: r.draw, cost: r.cost, short: r.short }];
        line.costTotal = r.cost;
        line.short = r.short;
        drew = true;
        if (r.short) shortOf.push(asMaterial.name);
      } else if (hasRecipe(item) && item.stockMode !== "item") {
        const need = resolveRecipe(item, opts, l.picks || {});
        line.used = [];
        line.costTotal = 0;
        for (const n of need) {
          if (!n.materialId) { line.short += n.qty * l.qty; continue; }
          const r = drawStock(n.materialId, "", n.qty * l.qty, n.materialId ? lastCost(n.materialId) : 0);
          line.used.push({ materialId: n.materialId, name: n.name, qty: n.qty * l.qty,
            draw: r.draw, cost: r.cost, short: r.short });
          line.costTotal += r.cost;
          line.short += r.short;
          if (r.short) shortOf.push(n.name);
        }
        drew = true;
      } else if (tracks(item)) {
        const r = drawStock(l.itemId, stockKey(item, opts), l.qty, +l.unitCost || 0);
        line.draw = r.draw; line.short = r.short; line.costTotal = r.cost;
        drew = true;
        if (r.short) shortOf.push(l.name + (opts.length ? " " + vKey(opts) : ""));
      }
      return line;
    }),
    total: cart().reduce((a, l) => a + unitPrice(l) * l.qty, 0)
  };
  sale.cost = sale.lines.reduce((a, l) => a + l.costTotal, 0);
  sale.profit = sale.total - sale.cost;
  await salePut(sale); S.sales.push(sale);
  if (drew) { await saveLots(); refreshLists(); }
  setCart([]);
  await saveTickets();
  renderTicket();
  renderSession();
  if (shortOf.length) toast("More " + shortOf[0] + " than you had", "Top up", () => setTab("items"));
  toast("Sold! " + cur(sale.total), "Undo", () => undoSale(sale));
};





/* What came to the market. Everything is packed until you say otherwise.
   Parked for now — the per-supply "I bring this to markets" toggle covers it
   until this moves onto the Sell screen. */
function kitSheet() {
  const draw = () => {
    const byCat = {};
    for (const m of S.materials) (byCat[m.category || "Odds and ends"] ||= []).push(m);
    const left = S.materials.filter(m => !isPacked(m)).length;

    sheet("What's in the kit", `
      <p class="note">Tap anything you didn't bring. It stays in stock and keeps its history — it just won't clutter the counter while you're selling.${left ? " <b>" + left + " left at home.</b>" : ""}</p>
      ${S.materials.length ? Object.entries(byCat).sort((a, b) => a[0].localeCompare(b[0])).map(([cat, ms]) => `
        <div class="slabel">${esc(cat)}</div>
        <div class="togs">
          ${ms.sort((a, b) => a.name.localeCompare(b.name)).map(m => {
            const c = balloonColor(m.name) || hueFor(m.name);
            const n = onHandTotal(m.id);
            return `<button class="tog sm" data-kit="${esc(m.id)}" aria-pressed="${isPacked(m)}">
              ${colorDot(c, 16)}${esc(m.name)}<span class="d">${Math.round(n * 100) / 100}</span>
            </button>`;
          }).join("")}
        </div>`).join("")
        : '<p class="note">No supplies yet.</p>'}
      ${S.materials.length ? `<div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn sec sm" id="kitAll">Bring everything</button>
        <button class="btn sec sm" id="kitStocked">Only what's in stock</button>
      </div>` : ""}
    `, null, { narrow: false });

    document.querySelectorAll("[data-kit]").forEach(b => b.onclick = async () => {
      const m = matById(b.dataset.kit);
      m.packed = !isPacked(m);
      b.setAttribute("aria-pressed", String(isPacked(m)));
      await saveMaterials();
      refreshLists();
    });
    if ($("#kitAll")) $("#kitAll").onclick = async () => {
      S.materials.forEach(m => m.packed = true);
      await saveMaterials(); draw(); refreshLists(); toast("Everything's in the kit");
    };
    if ($("#kitStocked")) $("#kitStocked").onclick = async () => {
      S.materials.forEach(m => m.packed = onHandTotal(m.id) > 0);
      await saveMaterials(); draw(); refreshLists(); toast("Packed whatever's in stock");
    };
  };
  draw();
}

/* ---------------------------- on order ----------------------------
   Knowing a supply is low is only half of it. An order records what was
   asked for, when, and when it's due, so a low shelf doesn't send you
   ordering the same balloons twice.
   ------------------------------------------------------------------- */
const openOrders = stockId => S.orders
  .filter(o => o.status === "open" && (!stockId || o.stockId === stockId))
  .sort((a, b) => (a.expected || "9999").localeCompare(b.expected || "9999"));
const onOrderQty = stockId => openOrders(stockId).reduce((a, o) => a + (+o.qty || 0), 0);
const orderLate = o => o.expected && daysUntil(o.expected) < 0;
/* a delivery is "late", not "3 days ago" */
function orderWhen(o) {
  if (!o.expected) return "no date";
  const n = daysUntil(o.expected);
  if (n < 0) return Math.abs(n) + (Math.abs(n) === 1 ? " day late" : " days late");
  return countdown(n);
}

/* what wants re-ordering: low on the shelf and nothing already coming */
function needsReorder() {
  return S.materials
    .filter(m => matLow(m) && !openOrders(m.id).length)
    .sort((a, b) => onHandTotal(a.id) - onHandTotal(b.id));
}
const inventoryNeedsAttention = () => needsReorder().length > 0 || openOrders().some(orderLate);

function orderSheet(preselectId) {
  const low = needsReorder();
  const open = openOrders();

  const orderRow = o => {
    const m = matById(o.stockId) || { name: "Gone", unit: "each" };
    const late = orderLate(o);
    const n = daysUntil(o.expected);
    return `<div class="inset">
      <span class="fact ${late ? "warn" : ""}" style="min-width:74px;text-align:center">${esc(orderWhen(o))}</span>
      <span class="b"><span class="n">${o.qty} ${esc(m.unit || "each")} of ${esc(m.name)}</span>
        <span class="s">ordered ${esc(fmtDate(o.placed, true))}${o.expected ? " · expected " + esc(fmtDate(o.expected, true)) : " · no date given"}${o.note ? " · " + esc(o.note) : ""}</span></span>
      <button class="btn sm auto" data-arrived="${o.id}">It's here</button>
      <button class="xbtn" data-cancelorder="${o.id}" aria-label="Cancel order">✕</button>
    </div>`;
  };

  sheet("Re-ordering", `
    ${open.length ? `<div class="slabel">On its way</div>
      <div class="card">${open.map(orderRow).join("")}</div>` : ""}

    <div class="slabel">Running low</div>
    ${low.length ? `<div class="card">${low.map(m => `<div class="inset">
        ${(() => { const c = balloonColor(m.name) || hueFor(m.name);
          return `<span class="dot" style="width:22px;height:22px;background:${c}"></span>`; })()}
        <span class="b"><span class="n">${esc(m.name)}</span>
          <span class="s">${Math.round(onHandTotal(m.id) * 100) / 100} ${esc(m.unit || "each")} left · warn at ${m.reorder}</span></span>
        <button class="btn sec sm auto" data-order="${m.id}">Order some</button>
      </div>`).join("")}</div>`
      : `<p class="note">${open.length ? "Everything low is already on its way." : "Nothing is running low. Set the warning level on a supply to be told sooner."}</p>`}

    <div id="ordForm"></div>
  `, null, { narrow: false });

  const drawForm = id => {
    const box = $("#ordForm");
    const m = matById(id);
    if (!m) { box.innerHTML = ""; return; }
    const due = new Date(); due.setDate(due.getDate() + 7);
    const dueISO = due.getFullYear() + "-" + String(due.getMonth() + 1).padStart(2, "0") + "-" + String(due.getDate()).padStart(2, "0");
    box.innerHTML = `<div class="grp">
      <div class="rowf">
        <label class="f"><span class="t">How many</span>
          <input type="number" id="ordQty" inputmode="${qtyMode(m.unit)}" step="${qtyStep(m.unit)}" min="0" placeholder="100"></label>
        <label class="f"><span class="t">Ordered on</span><input type="date" id="ordPlaced" value="${todayISO()}"></label>
        <label class="f"><span class="t">Expected delivery date</span><input type="date" id="ordDue" value="${dueISO}"></label>
      </div>
      <label class="f" style="margin-bottom:10px"><span class="t">Note</span>
        <input type="text" id="ordNote" placeholder="Partyline, order #2291"></label>
      <button class="btn sm" id="ordGo">Mark as ordered</button>
    </div>`;
    $("#ordGo").onclick = async () => {
      const q = qtyRound(+$("#ordQty").value || 0, m.unit);
      if (q <= 0) { alert("How many did you order?"); return; }
      S.orders.push({
        id: uid(), stockId: m.id, qty: q, placed: $("#ordPlaced").value || todayISO(),
        expected: $("#ordDue").value || "", note: $("#ordNote").value.trim(),
        status: "open", created: Date.now()
      });
      await saveOrders();
      closeSheet(); refreshLists();
      toast(q + " of " + m.name + " marked as ordered");
    };
  };
  if (preselectId) drawForm(preselectId);

  document.querySelectorAll("[data-order]").forEach(b => b.onclick = () => {
    drawForm(b.dataset.order);
    $("#ordForm").scrollIntoView({ block: "center" });
  });

  document.querySelectorAll("[data-arrived]").forEach(b => b.onclick = () => {
    const o = S.orders.find(x => x.id === b.dataset.arrived);
    const m = matById(o.stockId);
    if (!m) { toast("That material is gone"); return; }
    closeSheet();
    receiveSheet(o, m);
  });

  document.querySelectorAll("[data-cancelorder]").forEach(b => b.onclick = () => {
    const o = S.orders.find(x => x.id === b.dataset.cancelorder);
    const m = matById(o.stockId) || { name: "it" };
    confirmAsk({
      title: "Cancel this order?",
      body: `${o.qty} of ${esc(m.name)}, ordered ${esc(fmtDate(o.placed, true))}. It'll show as running low again.`,
      yes: "Cancel it",
      onYes: async () => {
        o.status = "cancelled";
        await saveOrders();
        closeSheet(); refreshLists(); orderSheet();
        toast("Order cancelled");
      }
    });
  });
}

/* an order arriving becomes a batch, at whatever it actually cost */
function receiveSheet(o, m) {
  sheet(m.name + " arrived", `
    <p class="note">Ordered ${esc(fmtDate(o.placed, true))}${o.expected ? ", expected " + esc(fmtDate(o.expected, true)) : ""}${o.note ? " · " + esc(o.note) : ""}. Check what turned up and what it cost — this becomes a batch on the shelf.</p>
    <div class="rowf">
      <label class="f"><span class="t">How many came</span>
        <input type="number" id="rcQty" inputmode="${qtyMode(m.unit)}" step="${qtyStep(m.unit)}" min="0" value="${o.qty}"></label>
      <label class="f"><span class="t">Cost each</span>
        <input type="number" id="rcCost" inputmode="decimal" step="0.001" min="0" value="${lastCost(m.id) || ""}" placeholder="0.12"></label>
      <label class="f"><span class="t">Arrived on</span><input type="date" id="rcDate" value="${todayISO()}"></label>
    </div>
    <label class="f"><span class="t">Note</span><input type="text" id="rcNote" value="${esc(o.note || "")}"></label>
  `, [{ label: "Put it on the shelf", cls: "btn", id: "rcGo" }]);

  $("#rcGo").onclick = async () => {
    const q = qtyRound(+$("#rcQty").value || 0, m.unit);
    if (q <= 0) { alert("How many arrived?"); return; }
    S.lots.push({
      id: uid(), stockId: m.id, key: "", date: $("#rcDate").value || todayISO(),
      qty: q, remaining: q, unitCost: +$("#rcCost").value || 0,
      note: $("#rcNote").value.trim(), created: Date.now()
    });
    o.status = "arrived";
    o.arrivedAt = Date.now();
    o.received = q;
    await saveLots(); await saveOrders();
    closeSheet(); refreshLists();
    toast(q + " of " + m.name + " on the shelf");
  };
}

/* ---------------------------- where it went ----------------------------
   Every unit that arrives is a batch; every unit that leaves is either
   something you made and sold, or something written off. Reading those three
   sources back gives a full history for any one supply, and the three totals
   should reconcile with what's on the shelf.
   ----------------------------------------------------------------------- */
function movementsFor(stockId) {
  const out = [];

  for (const l of S.lots.filter(x => lotRef(x) === stockId)) {
    out.push({
      ts: l.created || parseD(l.date).getTime(), date: l.date, kind: "in",
      qty: +l.qty || 0, cost: (+l.qty || 0) * (+l.unitCost || 0),
      label: "Batch purchased", lot: l,
      detail: [
        (Math.round(l.remaining * 100) / 100) + " of " + l.qty + " left",
        cur(+l.unitCost || 0) + " each",
        l.note
      ].filter(Boolean).join(" · ")
    });
  }

  /* Sales and write-offs are rolled up to one line per market, so a busy day
     reads "−3 sold at the fair" rather than three rows of −1. The breakdown of
     what was made (or why it was written off) goes in the detail. */
  const bucket = (map, key, seed) => (map[key] = map[key] || Object.assign({ qty: 0, cost: 0, ts: 0, dates: new Set(), parts: {} }, seed));
  const note = (b, ts, date, qty, cost, part) => {
    b.qty += qty; b.cost += cost;
    if (ts > b.ts) { b.ts = ts; b.date = date; }
    if (date) b.dates.add(date);
    b.parts[part] = (b.parts[part] || 0) + Math.abs(qty);
  };
  const partsText = parts => Object.entries(parts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => k + " ×" + (Math.round(n * 100) / 100)).join(" · ");
  const spanText = dates => dates.size > 1 ? dates.size + " days" : "";

  const sold = {};
  for (const s of S.sales) {
    const c = ctxOf(s.dayId);
    const key = (c.ev && c.ev.id) || c.event || "—";
    for (const ln of (s.lines || [])) {
      const verb = ln.mode === "free" ? "Given away as " : ln.mode === "replace" ? "Swapped for "
        : ln.mode === "practice" ? "Practice " : "Made ";
      for (const u of (ln.used || [])) {
        if (u.materialId !== stockId || !u.qty) continue;
        note(bucket(sold, key, { event: c.event }), s.ts, c.date, -u.qty, -(u.cost || 0), verb + ln.name);
      }
      if (ln.itemId === stockId && ln.draw && ln.draw.length) {
        const q = ln.draw.reduce((a, d) => a + d.qty, 0);
        note(bucket(sold, key, { event: c.event }), s.ts, c.date, -q, -(ln.costTotal || 0),
          ln.mode === "free" ? "Given away" : ln.mode === "replace" ? "Swapped" : ln.mode === "practice" ? "Practice" : "Sold");
      }
    }
  }
  for (const b of Object.values(sold)) {
    out.push({
      ts: b.ts, date: b.date, kind: "sold", qty: b.qty, cost: b.cost,
      label: "Sales at " + b.event,
      detail: [spanText(b.dates), partsText(b.parts)].filter(Boolean).join(" · ")
    });
  }

  const lost = {};
  for (const w of liveWriteoffs()) {
    if ((w.stockId || w.itemId) !== stockId) continue;
    const ts = w.created || parseD(w.date).getTime();
    const ev = woEvent(w);
    if (!ev) {
      /* written off away from any market — each one stands on its own */
      out.push({
        ts, date: w.date, kind: "written", qty: -(+w.qty || 0), cost: -(+w.cost || 0),
        label: "Written off", detail: w.reason || "no reason given"
      });
      continue;
    }
    note(bucket(lost, ev.id, { event: ev.name || "Untitled event" }), ts, w.date,
      -(+w.qty || 0), -(+w.cost || 0), w.reason || "no reason given");
  }
  for (const b of Object.values(lost)) {
    out.push({
      ts: b.ts, date: b.date, kind: "written", qty: b.qty, cost: b.cost,
      label: "Written off at " + b.event,
      detail: [spanText(b.dates), partsText(b.parts)].filter(Boolean).join(" · ")
    });
  }

  return out.sort((a, b) => b.ts - a.ts);
}

function movementTotals(stockId) {
  const ms = movementsFor(stockId);
  const round = n => Math.round(n * 1000) / 1000;
  const inQty = round(ms.filter(m => m.qty > 0).reduce((a, m) => a + m.qty, 0));
  const soldQty = round(-ms.filter(m => m.kind === "sold").reduce((a, m) => a + m.qty, 0));
  const lostQty = round(-ms.filter(m => m.kind === "written").reduce((a, m) => a + m.qty, 0));
  const lostCost = -ms.filter(m => m.kind === "written").reduce((a, m) => a + m.cost, 0);
  const soldCost = -ms.filter(m => m.kind === "sold").reduce((a, m) => a + m.cost, 0);
  const expected = round(inQty - soldQty - lostQty);
  const actual = round(onHandTotal(stockId));
  return { ms, inQty, soldQty, lostQty, lostCost, soldCost, expected, actual, agrees: Math.abs(expected - actual) < 0.005 };
}

const MOVE_TONE = { in: "good", sold: "", written: "warn" };

/* the history list, shared by supplies and by finished goods */
const MOVE_FILTERS = [["all", "Everything"], ["in", "Batches"], ["written", "Written off"], ["sold", "Sales"]];

function movementList(stockId, unit, only, canDelete) {
  const t = movementTotals(stockId);
  const u = unit || "each";
  if (!t.ms.length) return '<p class="note">Nothing has come in or gone out yet.</p>';
  const shown = (only && only !== "all" ? t.ms.filter(m => m.kind === only) : t.ms).slice(0, 40);
  if (!shown.length) return '<p class="note">Nothing of that sort yet.</p>';
  return `
    ${shown.map(m => `<div class="inset">
      <span class="fact ${MOVE_TONE[m.kind]}" style="min-width:64px;text-align:center">${m.qty > 0 ? "+" : ""}${Math.round(m.qty * 100) / 100}</span>
      <span class="b"><span class="n">${esc(m.label)}</span>
        <span class="s">${esc(fmtDate(m.date, true) || "—")}${m.detail ? " · " + esc(m.detail) : ""}</span></span>
      <span class="r">${esc(cur(Math.abs(m.cost)))}</span>
      ${canDelete && m.lot && m.lot.qty === m.lot.remaining ? `<button class="xbtn" data-mlx="${m.lot.id}" aria-label="Delete batch">✕</button>` : ""}
    </div>`).join("")}
    ${t.agrees ? "" : `<p class="note" style="margin:10px 0 0;color:var(--warn-ink)">These add up to ${t.expected} ${esc(u)} but the shelf says ${t.actual}. Usually a batch was deleted after something had been used from it, or a backup was loaded mid-season.</p>`}`;
}

/* ---------------------------- deleting things ----------------------------
   Nothing is removed outright. A delete asks first, then puts the record in
   Recently deleted, where it can be put back whole — stock batches and all.
   -------------------------------------------------------------------------- */
const TRASH_CAP = 40;
const TRASH_KIND = {
  material: "Material", product: "Thing you make", event: "Market", batch: "Batch", category: "Type",
  asset: "Equipment", assetType: "Type of equipment", cash: "Money in or out"
};
function agoWords(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const h = Math.round(mins / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.round(h / 24);
  return d + (d === 1 ? " day ago" : " days ago");
}

function confirmAsk(opts) {
  const host = $("#confirms");
  host.innerHTML = `<div class="scrim confirm">
    <div class="sheet narrow" role="alertdialog" aria-modal="true" style="max-width:440px">
      <div class="shead"><h3>${esc(opts.title)}</h3></div>
      <div class="sbody"><p class="note" style="margin:0">${opts.body}</p></div>
      <div class="sfoot stack">
        <button class="btn sec" id="cfNo">${esc(opts.no || "Keep it")}</button>
        <button class="btn ${opts.danger === false ? "" : "danger"}" id="cfYes">${esc(opts.yes || "Delete")}</button>
      </div>
    </div></div>`;
  const close = () => { host.innerHTML = ""; };
  host.querySelector(".scrim").addEventListener("click", e => { if (e.target.classList.contains("scrim")) close(); });
  $("#cfNo").onclick = close;
  $("#cfYes").onclick = () => { close(); opts.onYes(); };
}

async function trashPut(kind, label, detail, payload) {
  S.trash.unshift({ id: uid(), ts: Date.now(), kind, label, detail, payload });
  if (S.trash.length > TRASH_CAP) S.trash.length = TRASH_CAP;
  await saveTrash();
}

/* take stock back out of the lots a restored sale had drawn on */
function reapplyDraws(draw) {
  for (const d of (draw || [])) {
    const lot = S.lots.find(l => l.id === d.lotId);
    if (lot) lot.remaining = Math.max(0, lot.remaining - d.qty);
  }
}

async function restoreTrash(id) {
  const t = S.trash.find(x => x.id === id);
  if (!t) return;
  const p = t.payload;
  if (t.kind === "material") {
    if (!matById(p.material.id)) S.materials.push(p.material);
    for (const l of (p.lots || [])) if (!S.lots.some(x => x.id === l.id)) S.lots.push(l);
    if (p.material.category && !S.categories.includes(p.material.category)) {
      S.categories = S.categories.concat([p.material.category]).sort();
      await saveCategories();
    }
    await saveMaterials(); await saveLots();
  } else if (t.kind === "product") {
    if (!S.items.some(i => i.id === p.item.id)) S.items.push(p.item);
    for (const l of (p.lots || [])) if (!S.lots.some(x => x.id === l.id)) S.lots.push(l);
    await saveItems(); await saveLots();
  } else if (t.kind === "event") {
    if (!evOf(p.event.id)) S.events.push(p.event);
    for (const d of (p.days || [])) if (!dayOf(d.id)) S.days.push(d);
    for (const s of (p.sales || [])) {
      if (S.sales.some(x => x.id === s.id)) continue;
      for (const l of (s.lines || [])) reapplyDraws(lineDraws(l));
      S.sales.push(s); await salePut(s);
    }
    await migrateEvents();
    await saveEvents(); await saveDays(); await saveLots();
  } else if (t.kind === "app") {
    const ev = evOf(p.eventId);
    if (!ev) { toast("Its event has gone — restore the event first"); return; }
    if (!appOf(ev, p.app.id)) ev.apps.push(p.app);
    for (const d of (p.days || [])) if (!dayOf(d.id)) S.days.push(d);
    for (const s of (p.sales || [])) {
      if (S.sales.some(x => x.id === s.id)) continue;
      for (const l of (s.lines || [])) reapplyDraws(lineDraws(l));
      S.sales.push(s); await salePut(s);
    }
    await saveEvents(); await saveDays(); await saveLots();
  } else if (t.kind === "batch") {
    if (!S.lots.some(x => x.id === p.lot.id)) S.lots.push(p.lot);
    await saveLots();
  } else if (t.kind === "asset") {
    if (!S.assets.some(a => a.id === p.asset.id)) S.assets.push(p.asset);
    if (p.asset.type && !assetTypes().includes(p.asset.type)) {
      S.settings.assetTypes = assetTypes().concat([p.asset.type]).sort(); await saveSettings();
    }
    await saveAssets();
  } else if (t.kind === "cash") {
    if (!S.cash.some(c => c.id === p.entry.id)) S.cash.push(p.entry);
    await saveCash();
  } else if (t.kind === "assetType") {
    if (!assetTypes().includes(p.name)) { S.settings.assetTypes = assetTypes().concat([p.name]).sort(); await saveSettings(); }
  } else if (t.kind === "category") {
    if (!S.categories.includes(p.name)) { S.categories = S.categories.concat([p.name]).sort(); }
    await saveCategories();
  }
  S.trash = S.trash.filter(x => x.id !== id);
  await saveTrash();
  renderAll();
  toast(t.label + " is back");
}

async function trashDrop(id) {
  S.trash = S.trash.filter(x => x.id !== id);
  await saveTrash();
  renderData();
}

/* ---------------------------- undoing a sale ----------------------------
   Stock that was drawn has to go somewhere. Most of the time it goes back on
   the table. But anything made for that particular buyer — a name on it, a
   colour they picked, a shape twisted to order — cannot be re-sold, so it is
   a loss rather than stock.
   ------------------------------------------------------------------------ */
const cartLineFrom = l => ({
  uid: uid(), itemId: l.itemId, name: l.name, opts: l.opts, qty: l.qty, base: l.base,
  unitCost: l.cost, mode: l.mode, dType: l.dType, dVal: l.dVal, reason: l.reason
});

async function finishUndo(sale, rows) {
  const backToStock = [], wasted = [];
  for (const l of sale.lines) {
    const r = rows.find(x => x.line === l);
    if (r && r.mode === "waste") wasted.push({ line: l, reason: r.reason });
    else backToStock.push(l);
  }
  for (const l of backToStock) returnStock(lineDraws(l));
  for (const w of wasted) wasteDrawn(w.line, w.reason || "Cancelled sale", sale.dayId);

  S.reversals.push({
    id: uid(), ts: Date.now(), dayId: sale.dayId, saleId: sale.id, total: sale.total,
    lines: sale.lines.map(l => {
      const r = rows.find(x => x.line === l);
      return {
        name: l.name, variant: vKey(l.opts), qty: l.qty, cost: l.costTotal,
        disposition: r ? r.mode : "stock", reason: r ? (r.reason || "") : ""
      };
    })
  });

  if (wasted.length || backToStock.some(lineDrewStock)) {
    await saveLots(); await saveWriteoffs();
  }
  await saveReversals();
  await saleDel(sale.id);
  S.sales = S.sales.filter(x => x.id !== sale.id);
  setCart(backToStock.map(cartLineFrom));
  renderTicket(); refreshLists();

  const units = wasted.reduce((a, w) => a + w.line.qty, 0);
  const lost = wasted.reduce((a, w) => a + w.line.costTotal, 0);
  if (units && cart().length) toast("Undone — " + units + " written off, the rest is back in the ticket");
  else if (units) toast("Sale cancelled — " + units + " written off at " + cur(lost));
  else toast("Sale undone — back in the ticket");
}

function undoSale(sale) {
  const drawn = sale.lines.filter(lineDrewStock);
  if (!drawn.length) { finishUndo(sale, []); return; }

  const rows = drawn.map(l => {
    const item = S.items.find(i => i.id === l.itemId);
    const mto = !!(item && item.madeToOrder);
    return { line: l, mode: mto ? "waste" : "stock", reason: mto ? "Made to order" : "" };
  });

  sheet("Undo this sale", `
    <p class="note">Where do these go, and why? Anything made for that buyer can't go back on the table.</p>
    <div id="undoRows"></div>
    ${(() => {
      const n = sale.lines.length - drawn.length;
      if (!n) return "";
      return `<p class="note">${n === 1 ? "1 other line isn't stock-counted and just goes" : n + " other lines aren't stock-counted and just go"} back in the ticket.</p>`;
    })()}
  `, [
    { label: "Undo sale", cls: "btn", id: "undoGo" },
    { label: "Keep it", cls: "btn sec", id: "undoNo" }
  ]);

  const draw = () => {
    $("#undoRows").innerHTML = rows.map((r, i) => {
      const v = vKey(r.line.opts);
      const list = r.mode === "waste" ? LOSS_REASONS : RETURN_REASONS;
      return `<div class="grp">
        <div style="font-weight:600;margin-bottom:2px">${esc(r.line.name)}${v ? " · " + esc(v) : ""}</div>
        <div class="note" style="margin-bottom:10px">${r.line.qty} unit${r.line.qty === 1 ? "" : "s"} · cost ${esc(cur(r.line.costTotal))}</div>
        <div class="togs even" data-row="${i}">
          <button class="tog d-stock" data-d="stock" aria-pressed="${r.mode === "stock"}">Back to stock</button>
          <button class="tog d-waste" data-d="waste" aria-pressed="${r.mode === "waste"}">A loss</button>
        </div>
        <div class="togs" data-reasons="${i}" style="margin-bottom:10px">
          ${list.map(x => `<button class="tog sm" data-r="${esc(x)}" aria-pressed="${r.reason === x}">${esc(x)}</button>`).join("")}
        </div>
        <input type="text" data-other="${i}" value="${list.includes(r.reason) ? "" : esc(r.reason)}" placeholder="Or put it in your own words">
      </div>`;
    }).join("");

    $("#undoRows").querySelectorAll("[data-row]").forEach(box => {
      const i = +box.dataset.row;
      box.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
        if (rows[i].mode === b.dataset.d) return;
        rows[i].mode = b.dataset.d;
        rows[i].reason = "";
        draw();
      });
    });
    $("#undoRows").querySelectorAll("[data-reasons]").forEach(box => {
      const i = +box.dataset.reasons;
      box.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
        rows[i].reason = rows[i].reason === b.dataset.r ? "" : b.dataset.r;
        box.querySelectorAll("[data-r]").forEach(x =>
          x.setAttribute("aria-pressed", String(x.dataset.r === rows[i].reason)));
        const other = $("#undoRows").querySelector(`[data-other="${i}"]`);
        if (other) other.value = "";
      });
    });
    $("#undoRows").querySelectorAll("[data-other]").forEach(inp => {
      const i = +inp.dataset.other;
      inp.oninput = () => {
        rows[i].reason = inp.value;
        $("#undoRows").querySelectorAll(`[data-reasons="${i}"] [data-r]`)
          .forEach(x => x.setAttribute("aria-pressed", "false"));
      };
    });
  };
  draw();
  $("#undoGo").onclick = () => { closeSheet(); finishUndo(sale, rows); };
  $("#undoNo").onclick = closeSheet;
}

/* ---------------------------- items ---------------------------- */
function itemNavUnused() {
  return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
    <span style="flex:1"></span>
    <button class="btn sm auto" id="addThing">+ Add something</button>
  </div>`;
}

function productCard(it) {
  const est = recipeCostEstimate(it);
  const cost = est === null ? (+it.cost || 0) : est;
  const sn = stockNote(it);
  const from = (it.recipe || []).map(r => r.category).filter(Boolean).join(" + ");
  const chips = [];
  if (sn && sn.warn) chips.push('<span class="chip">Nearly out</span>');
  if (it.stockMode === "item") chips.push(`<span class="chip neutral">${onHandTotal(it.id)} made up</span>`);
  return `<button class="pcard" data-edit="${it.id}">
    ${thumb(it, "sw", true)}
    <span class="nm">${esc(it.name)}</span>
    <span class="s">${esc(from || "nothing yet")}${sn ? "<br>" + esc(sn.text) : ""}</span>
    ${chips.length ? `<span class="chips">${chips.join("")}</span>` : ""}
    <span class="pill">${esc(cur(cost))}</span>
  </button>`;
}

function renderItems() {
  const p = $("#pItems");
  const q = S.makeQ || "";
  const match = it => hits(q, it.name, (it.recipe || []).map(r => r.category).join(" "),
    (it.recipe || []).flatMap(r => lineMats(r).map(m => m.name)).join(" "));
  const shown = S.items.filter(match);

  p.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      ${searchBox("makeSearch", q, "Search things you make")}
      <span style="flex:1"></span>
      <button class="btn sm auto" id="addThing">+ Add something</button>
    </div>
    ${shown.length ? `<div class="pgrid">${shown.map(productCard).join("")}</div>`
      : `<p class="note">${q ? `Nothing matches "${esc(q)}".`
        : "Nothing here yet. Add the first thing you make, say what it's built from, and the cost works itself out."}</p>`}
    ${S.items.some(hasRecipe) ? '<p class="note" style="margin-top:14px">Cost is what the materials last cost. The figure on a real sale is what the batches it drew on actually cost.</p>' : ""}`;

  const sb = $("#makeSearch");
  if (sb) {
    sb.oninput = () => { S.makeQ = sb.value; renderItems(); };
    if (q) { sb.focus(); sb.setSelectionRange(q.length, q.length); }
  }
  $("#addThing").onclick = () => itemSheet(null);
  p.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => itemSheet(S.items.find(i => i.id === b.dataset.edit)));
}

function bindItemNav() { /* the two lists are separate tabs now */ }

function materialCard(m) {
  const n = onHandTotal(m.id);
  const coming = openOrders(m.id);
  const used = S.items.filter(i => (i.recipe || []).some(r => lineMats(r).some(x => x.id === m.id))).length;
  const chips = [];
  if (!isPacked(m)) chips.push('<span class="chip neutral">Left at home</span>');
  if (isPacked(m) && matLow(m) && !coming.length) chips.push('<span class="chip">Nearly out</span>');
  if (coming.length) chips.push(`<span class="chip ${coming.some(orderLate) ? "" : "good"}">${coming.reduce((a, o) => a + o.qty, 0)} coming</span>`);
  return `<button class="pcard ${m.active === false ? "off" : ""}" data-mat="${m.id}">
    ${thumb(m, "sw", true)}
    <span class="nm">${esc(m.name)}</span>
    <span class="big">${Math.round(n * 100) / 100} ${esc(m.unit || "each")} left</span>
    <span class="s">${used ? "in " + used + (used === 1 ? " thing" : " things") : "not used yet"}${(+m.reorder || 0) ? "<br>Reorder under " + m.reorder : ""}</span>
    ${chips.length ? `<span class="chips">${chips.join("")}</span>` : ""}
  </button>`;
}

function renderStock() {
  const p = $("#pStock");
  const q = S.stockQ || "";
  const low = S.materials.filter(matLow);
  const needing = needsReorder();
  const open = openOrders();
  const late = open.filter(orderLate);
  const ordered = low.filter(m => openOrders(m.id).length);

  const match = m => hits(q, m.name, m.category, m.unit);
  const byCat = {};
  for (const c of S.categories) byCat[c] = [];
  for (const m of S.materials) (byCat[m.category || "Odds and ends"] ||= []).push(m);

  const live = Object.entries(byCat).filter(([cat]) => !isTypeOff(cat))
    .map(([cat, ms]) => [cat, ms.filter(m => m.active !== false && match(m))])
    .filter(([cat, ms]) => ms.length || !q)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const off = Object.entries(byCat).filter(([cat]) => isTypeOff(cat))
    .map(([cat, ms]) => [cat, ms.filter(match)])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const retired = S.materials.filter(m => m.active === false && !isTypeOff(m.category) && match(m))
    .sort((a, b) => a.name.localeCompare(b.name));
  const offCount = off.length + retired.length;
  const found = live.reduce((a, [, ms]) => a + ms.length, 0);

  p.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      ${searchBox("stockSearch", q, "Search materials")}
      <span style="flex:1"></span>
      <button class="btn sm auto" id="addSupply">+ Add a material</button>
    </div>
    ${S.materials.length ? `<div style="max-width:300px;margin-bottom:18px">
      <button class="kpi ${needing.length ? "warn" : ""}" id="kpiLow" style="text-align:left;width:100%">
        <div class="k">Nearly out</div>
        <div class="v">${low.length ? low.length + (low.length === 1 ? " material" : " materials") : "None"}</div>
        <div class="n">${low.length
          ? (ordered.length ? ordered.length + " re-ordered" + (late.length ? " · " + late.length + " late" : "") : "none re-ordered yet")
          : "nothing to chase"}</div></button>
    </div>` : '<p class="note">Inventory is what you buy: a white 260, a metre of ribbon, a weight. Give each one a type — like "260 balloon" — so a recipe can say "any 260 balloon" and every colour you add works straight away.</p>'}
    ${q && !found && !offCount ? `<p class="note">Nothing matches "${esc(q)}".</p>` : ""}
    ${live.map(([cat, ms]) => `
      <div class="typehead">
        <span class="sect" style="margin:0">${esc(cat)}</span>
        <button class="tlink" data-typeoff="${esc(cat)}">Make inactive</button>
        ${(byCat[cat] || []).length ? "" : `<button class="tlink x" data-typedel="${esc(cat)}" aria-label="Delete ${esc(cat)}">✕</button>`}
      </div>
      ${ms.length ? `<div class="pgrid">${ms.sort((a, b) => a.name.localeCompare(b.name)).map(materialCard).join("")}</div>`
        : `<p class="note">${q ? "Nothing here matches." : "Nothing under this type yet."}</p>`}`).join("")}
    ${offCount ? `
      <button class="typehead" id="toggleOff" style="width:100%;margin-top:26px">
        <span class="sect" style="margin:0;color:var(--ink-mute)">Inactive · ${offCount}</span>
        <span class="tlink">${S.showInactive ? "Hide" : "Show"}</span>
      </button>
      ${S.showInactive ? `
        ${retired.length ? `<div class="pgrid" style="margin-bottom:12px">${retired.map(materialCard).join("")}</div>` : ""}
        ${off.map(([cat, ms]) => `
          <div class="typehead">
            <span class="sect" style="margin:0;color:var(--ink-mute)">${esc(cat)}</span>
            <button class="tlink" data-typeon="${esc(cat)}">Make active</button>
            ${(byCat[cat] || []).length ? "" : `<button class="tlink x" data-typedel="${esc(cat)}" aria-label="Delete ${esc(cat)}">✕</button>`}
          </div>
          ${ms.length ? `<div class="pgrid">${ms.map(materialCard).join("")}</div>`
            : '<p class="note">nothing filed under it</p>'}`).join("")}` : ""}` : ""}`;

  const sb = $("#stockSearch");
  if (sb) {
    sb.oninput = () => { S.stockQ = sb.value; renderStock(); };
    if (q) { sb.focus(); sb.setSelectionRange(q.length, q.length); }
  }
  $("#addSupply").onclick = () => materialSheet(null);
  if ($("#kpiLow")) $("#kpiLow").onclick = () => orderSheet();
  if ($("#toggleOff")) $("#toggleOff").onclick = () => { S.showInactive = !S.showInactive; renderStock(); };
  p.querySelectorAll("[data-typeoff]").forEach(b => b.onclick = async () => {
    await setTypeActive(b.dataset.typeoff, false); renderStock();
    toast(b.dataset.typeoff + " moved to inactive");
  });
  p.querySelectorAll("[data-typeon]").forEach(b => b.onclick = async () => {
    await setTypeActive(b.dataset.typeon, true); renderStock();
    toast(b.dataset.typeon + " is active again");
  });
  p.querySelectorAll("[data-typedel]").forEach(b => b.onclick = () => {
    const cat = b.dataset.typedel;
    confirmAsk({
      title: "Delete " + cat + "?",
      body: "Nothing is filed under it. You can put it back from <b>Safe → Recently deleted</b>.",
      onYes: async () => {
        await trashPut("category", cat, "type of supply", { name: cat });
        S.categories = S.categories.filter(x => x !== cat);
        await setTypeActive(cat, true);
        await saveCategories();
        renderStock();
        toast(cat + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
      }
    });
  });
  p.querySelectorAll("[data-mat]").forEach(b => b.onclick = () => materialSheet(matById(b.dataset.mat)));
}

/* the list of types, so one can be added without a supply to hang it on */
function categorySheet() {
  const draw = () => {
    sheet("Types of supply", `
      <p class="note">A type groups things you'd swap for one another. Recipes ask for a type — "any 260 balloon" — so anything you add under it can be used straight away.</p>
      ${S.categories.length ? `<div class="card">${S.categories.slice().sort().map(c => {
        const n = S.materials.filter(m => m.category === c).length;
        return `<div class="inset">
          <span class="b"><span class="n">${esc(c)}</span><span class="s">${n} material${n === 1 ? "" : "s"}</span></span>
          <button class="xbtn" data-catx="${esc(c)}" aria-label="Delete ${esc(c)}">✕</button>
        </div>`;
      }).join("")}</div>` : '<p class="note">No types yet.</p>'}
      <label class="f" style="margin-top:14px"><span class="t">Add a type</span>
        <div style="display:flex;gap:10px">
          <input type="text" id="newCat" placeholder="260 balloon" style="flex:1">
          <button class="btn sec sm auto" id="addCat">Add</button>
        </div></label>
    `, null, { narrow: true });

    $("#addCat").onclick = async () => {
      const v = $("#newCat").value.trim();
      if (!v) return;
      if (S.categories.includes(v)) { toast("Already there"); return; }
      S.categories = S.categories.concat([v]).sort();
      await saveCategories(); draw(); renderStock();
      toast(v + " added");
    };
    document.querySelectorAll("[data-catx]").forEach(b => b.onclick = () => {
      const c = b.dataset.catx;
      const n = S.materials.filter(m => m.category === c).length;
      if (n) {
        confirmAsk({ title: "Still in use", danger: false, yes: "I see", no: "",
          body: `${n} suppl${n === 1 ? "y is" : "ies are"} filed under <b>${esc(c)}</b>. Move or delete ${n === 1 ? "it" : "them"} first.`,
          onYes: () => {} });
        return;
      }
      confirmAsk({
        title: "Delete " + c + "?",
        body: "Nothing is filed under it. You can put it back from <b>Safe → Recently deleted</b>.",
        onYes: async () => {
          await trashPut("category", c, "type of supply", { name: c });
          S.categories = S.categories.filter(x => x !== c);
          await saveCategories(); draw(); renderStock();
          toast(c + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
        }
      });
    });
  };
  draw();
}

function categorySelect(id, chosen) {
  const cats = S.categories.slice().sort();
  return `<select id="${id}">
    ${cats.map(c => `<option value="${esc(c)}" ${c === chosen ? "selected" : ""}>${esc(c)}</option>`).join("")}
    <option value="__new">+ New type…</option>
  </select>`;
}

/* a titled panel that folds away; sections people visit rarely start shut */
function panel(id, title, open, bodyHtml, note) {
  return `<button class="acc" data-acc="${id}" aria-expanded="${open}">
      <span class="sect" style="margin:0">${esc(title)}</span>
      ${note ? `<span class="accnote">${note}</span>` : ""}
      <span class="chev">${open ? "▾" : "▸"}</span>
    </button>
    <div class="accbody ${open ? "" : "hidden"}" id="acc-${id}">${bodyHtml}</div>`;
}

function materialSheet(existing) {
  const m = existing ? JSON.parse(JSON.stringify(existing)) : blankMaterial();
  if (!existing && !m.category) m.category = S.categories[0] || "";
  let newCat = !S.categories.length;
  const open = { details: true, counts: true, batch: !existing, writeoff: false, history: false };
  let moveFilter = "all";

  sheet(existing ? (m.name || "Material") : "New material", '<div id="matBody"></div>', [
    { label: existing ? "Save" : "Add it", cls: "btn", id: "matSave" },
    existing ? { label: "Delete", cls: "btn sec", id: "matDel" } : null
  ].filter(Boolean));

  /* Pull whatever is typed into the form back onto the record before any
     redraw, so opening a panel or changing the unit can't wipe it. */
  const readDetails = () => {
    if (!$("#mName")) return;
    m.name = $("#mName").value;
    if ($("#mCatNew")) m.category = $("#mCatNew").value;
    else if ($("#mCat") && $("#mCat").value !== "__new") m.category = $("#mCat").value;
    if ($("#mUnit")) m.unit = $("#mUnit").value;
    if ($("#mReorder")) m.reorder = +$("#mReorder").value || 0;
  };
  const redraw = () => { readDetails(); keepBatch(); draw(); restoreBatch(); };

  const draw = () => {
    const lots = existing ? allLotsFor(m.id, null) : [];
    const coming = existing ? openOrders(m.id) : [];
    const t = existing ? movementTotals(m.id) : null;
    const wos = existing ? S.writeoffs.filter(w => (w.stockId || w.itemId) === m.id) : [];
    const woEv = w => { const e = woEvent(w); return e ? " · " + (e.name || "Untitled event") : ""; };
    const due = new Date(); due.setDate(due.getDate() + 7);
    const dueISO = due.getFullYear() + "-" + String(due.getMonth() + 1).padStart(2, "0") + "-" + String(due.getDate()).padStart(2, "0");

    /* ---------------- 1. details ---------------- */
    const details = `
      <div class="rowf">
        <label class="f"><span class="t">Name</span>
          <input type="text" id="mName" value="${esc(m.name)}" placeholder="White"></label>
        <label class="f"><span class="t">Type</span><span id="catBox"></span></label>
      </div>
      <label class="f"><span class="t">Photo</span>
        <div class="rowf" style="align-items:center">
          <span class="av" id="mPrev" style="flex:0 0 64px;${m.photo ? `background-image:url('${m.photo}')` : ""}"></span>
          <input type="file" id="mFile" accept="image/*" style="flex:1;border:0;padding:0;background:none">
          <button class="xbtn" id="mAdjust" aria-label="Move or zoom the photo" title="Move or zoom"${m.photo ? "" : " hidden"}>${ICON_CROP}</button>
          <button class="xbtn" id="mClearPhoto" aria-label="Remove photo">✕</button>
        </div></label>
      <div class="rowf">
        <label class="f"><span class="t">Counted in</span>${unitSelect("mUnit", m.unit)}</label>
        <label class="f"><span class="t">Warn me at or below</span>
          <input type="number" id="mReorder" inputmode="numeric" step="1" min="0" value="${m.reorder || ""}" placeholder="0 = never"></label>
      </div>
      <label class="f"><span class="t">Sell it as it comes?</span>
        <div class="togs"><button class="tog sm" id="mSell" aria-pressed="${forSale(m)}">Yes, on the Sell screen</button></div>
        ${forSale(m) ? '<span class="note" style="display:block;margin:8px 0 0">Set what you charge in <b>Sell → Vendor view</b>.</span>' : ""}
      </label>
      <span class="t" style="display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:6px">Still using it?</span>
      <div class="togs even" style="max-width:300px">
        <button class="tog sm" id="mOn" aria-pressed="${m.active !== false}">Active</button>
        <button class="tog sm" id="mOff" aria-pressed="${m.active === false}">Inactive</button>
      </div>`;

    /* ---------------- 2. counts ---------------- */
    const counts = !existing
      ? '<p class="note">Save it first, then you can count it and order more.</p>'
      : `<div class="kpis" style="margin-bottom:12px">
          <div class="kpi"><div class="k">Inventory on hand</div><div class="v">${Math.round(onHandTotal(m.id) * 100) / 100}</div>
            <div class="n">${esc(cur(stockValue(m.id)))} · last paid ${lots.length ? esc(cur(lastCost(m.id))) : "—"}</div></div>
          <div class="kpi ${coming.some(orderLate) ? "warn" : ""}"><div class="k">On its way</div>
            <div class="v">${coming.reduce((a, o) => a + o.qty, 0) || "None"}</div>
            <div class="n">${coming.length ? "expected " + esc(orderWhen(coming[0])) : "nothing ordered"}</div></div>
        </div>
        ${coming.length ? `<div class="card" style="margin-bottom:12px">${coming.map(o => `<div class="inset">
          <span class="fact ${orderLate(o) ? "warn" : ""}" style="min-width:78px;text-align:center">${esc(orderWhen(o))}</span>
          <span class="b"><span class="n">${o.qty} ${esc(m.unit || "each")}</span>
            <span class="s">ordered ${esc(fmtDate(o.placed, true))}${o.expected ? " · expected " + esc(fmtDate(o.expected, true)) : ""}${o.note ? " · " + esc(o.note) : ""}</span></span>
          <button class="btn sm auto" data-rcv="${o.id}">It's here</button>
          <button class="xbtn" data-cancel="${o.id}" aria-label="Cancel order">✕</button>
        </div>`).join("")}</div>` : ""}
        <div class="grp">
          <div class="rowf">
            <label class="f"><span class="t">How many</span>
              <input type="number" id="ordQty" inputmode="${qtyMode(m.unit)}" step="${qtyStep(m.unit)}" min="0" placeholder="100"></label>
            <label class="f"><span class="t">Ordered on</span><input type="date" id="ordPlaced" value="${todayISO()}"></label>
            <label class="f"><span class="t">Expected delivery date</span><input type="date" id="ordDue" value="${dueISO}"></label>
          </div>
          <label class="f" style="margin-bottom:10px"><span class="t">Note</span>
            <input type="text" id="ordNote" placeholder="Partyline, order #2291"></label>
          <button class="btn sec sm" id="ordGo">Mark as ordered</button>
        </div>`;

    /* ---------------- 3. add a batch ---------------- */
    const batch = `<div class="grp">
        <div class="rowf">
          <label class="f"><span class="t">Date in</span><input type="date" id="mlDate" value="${todayISO()}"></label>
          <label class="f"><span class="t">How many</span>
            <input type="number" id="mlQty" inputmode="${qtyMode(m.unit)}" step="${qtyStep(m.unit)}" min="0" placeholder="100"></label>
          <label class="f"><span class="t">Cost each</span>
            <input type="number" id="mlCost" inputmode="decimal" step="0.001" min="0" value="${existing ? (lastCost(m.id) || "") : ""}" placeholder="0.12"></label>
        </div>
        <label class="f" style="margin-bottom:${existing ? "10px" : "0"}"><span class="t">Note</span>
          <input type="text" id="mlNote" placeholder="Bag of 100 from Partyline"></label>
        ${existing ? '<button class="btn sec sm" id="mlAdd">Add to stock</button>'
                   : '<p class="note" style="margin:10px 0 0">Leave blank if you\'re only setting it up.</p>'}
      </div>`;

    /* ---------------- 4. write-offs ---------------- */
    const writeoff = !existing
      ? '<p class="note">Save it first.</p>'
      : `<div class="grp">
          <label class="f"><span class="t">How many</span>
            <input type="number" id="mwQty" inputmode="${qtyMode(m.unit)}" step="${qtyStep(m.unit)}" min="${qtyStep(m.unit)}" style="max-width:160px"></label>
          <div class="togs" id="mwReasons" style="margin-bottom:10px">
            ${LOSS_REASONS.map(x => `<button class="tog sm" data-mwr="${esc(x)}" aria-pressed="false">${esc(x)}</button>`).join("")}
          </div>
          <input type="text" id="mwWhy" placeholder="Or put it in your own words" style="margin-bottom:10px">
          <button class="btn sec sm" id="mwGo">Write off</button>
        </div>
        ${wos.length ? `<p class="note" style="margin:0 0 10px">Found some you wrote off? <b>Undo</b> lets you say how many, and puts them back into the batch they came from.</p>
        <div class="card">${writeoffGroups(wos).map(x => `<div class="inset"${x.undone ? ' style="opacity:.6"' : ""}>
          <span class="fact ${x.undone ? "" : "warn"}" style="min-width:64px;text-align:center${x.undone ? ";text-decoration:line-through" : ""}">−${Math.round(x.qty * 100) / 100}</span>
          <span class="b"><span class="n">${esc(x.reason)}</span>
            <span class="s">${esc(groupWhen(x) || "—")}${x.ev ? " · " + esc(x.ev.name || "Untitled event") : ""}${x.list.length > 1 ? " · " + x.list.length + " times" : ""}</span></span>
          <span class="r">${esc(cur(x.cost))}</span>
          ${x.undone ? '<span class="chip neutral" style="margin:0">Undone</span>' : `<button class="tlink" data-wundo="${esc(x.key)}">Undo</button>`}</div>`).join("")}</div>` : ""}`;

    /* ---------------- 5. where it went ---------------- */
    const history = !existing
      ? '<p class="note">Nothing yet.</p>'
      : `<div class="togs" id="moveFilters" style="margin-bottom:12px">
          ${MOVE_FILTERS.map(([id, label]) => `<button class="tog sm" data-mf="${id}" aria-pressed="${moveFilter === id}">${label}</button>`).join("")}
        </div>
        ${movementList(m.id, m.unit, moveFilter, true)}`;

    $("#matBody").innerHTML =
      panel("details", "Details", open.details, details) +
      panel("counts", "Counts", open.counts, counts,
        existing ? Math.round(onHandTotal(m.id) * 100) / 100 + " on hand" : "") +
      panel("batch", existing ? "Add a batch" : "First batch", open.batch, batch) +
      panel("writeoff", "Write-offs", open.writeoff, writeoff,
        existing && t.lostQty ? t.lostQty + " so far" : "") +
      panel("history", "Where it went", open.history, history);

    bind();
  };

  const stash = {};
  const keepBatch = () => {
    ["mlDate", "mlQty", "mlCost", "mlNote"].forEach(id => { if ($("#" + id)) stash[id] = $("#" + id).value; });
  };
  const restoreBatch = () => {
    Object.keys(stash).forEach(id => { if ($("#" + id) && stash[id] !== undefined) $("#" + id).value = stash[id]; });
  };

  const bind = () => {
    document.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => {
      open[b.dataset.acc] = !open[b.dataset.acc];
      redraw();
    });

    /* type: pick one, or type a new one */
    const drawCat = () => {
      const box = $("#catBox");
      box.innerHTML = newCat
        ? `<div style="display:flex;gap:8px">
             <input type="text" id="mCatNew" value="${esc(m.category)}" placeholder="260 balloon" style="flex:1">
             ${S.categories.length ? '<button class="xbtn" id="mCatBack" aria-label="Pick an existing type">↩</button>' : ""}
           </div>`
        : categorySelect("mCat", m.category);
      if (newCat) {
        $("#mCatNew").oninput = e => m.category = e.target.value;
        if ($("#mCatBack")) $("#mCatBack").onclick = () => { newCat = false; m.category = S.categories[0] || ""; drawCat(); };
      } else {
        $("#mCat").onchange = e => {
          if (e.target.value === "__new") { m.name = $("#mName").value; newCat = true; m.category = ""; drawCat(); setTimeout(() => $("#mCatNew").focus(), 30); }
          else m.category = e.target.value;
        };
      }
    };
    if ($("#catBox")) drawCat();

    if ($("#mSell")) $("#mSell").onclick = () => { readDetails(); m.forSale = !forSale(m); draw(); };
    wirePhoto(m, "m");
    if ($("#mOn")) $("#mOn").onclick = () => { readDetails(); m.active = true; draw(); };
    if ($("#mOff")) $("#mOff").onclick = () => { readDetails(); m.active = false; draw(); };
    if ($("#mUnit")) $("#mUnit").onchange = () => redraw();

    if (!existing) return;

    /* ordering, right where the counts are */
    if ($("#ordGo")) $("#ordGo").onclick = async () => {
      const q = qtyRound(+$("#ordQty").value || 0, m.unit);
      if (q <= 0) { alert("How many did you order?"); return; }
      S.orders.push({
        id: uid(), stockId: m.id, qty: q, placed: $("#ordPlaced").value || todayISO(),
        expected: $("#ordDue").value || "", note: $("#ordNote").value.trim(),
        status: "open", created: Date.now()
      });
      await saveOrders(); draw(); refreshLists();
      toast(q + " of " + m.name + " marked as ordered");
    };
    document.querySelectorAll("[data-rcv]").forEach(b => b.onclick = () => {
      const o = S.orders.find(x => x.id === b.dataset.rcv);
      closeSheet(); receiveSheet(o, m);
    });
    document.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => {
      const o = S.orders.find(x => x.id === b.dataset.cancel);
      confirmAsk({
        title: "Cancel this order?", yes: "Cancel it",
        body: `${o.qty} of ${esc(m.name)}, ordered ${esc(fmtDate(o.placed, true))}.`,
        onYes: async () => { o.status = "cancelled"; await saveOrders(); draw(); refreshLists(); toast("Order cancelled"); }
      });
    });

    /* batches */
    if ($("#mlAdd")) $("#mlAdd").onclick = async () => {
      const q = qtyRound(+$("#mlQty").value || 0, m.unit);
      if (q <= 0) { alert("How many are you adding?"); return; }
      const c = $("#mlCost").value;
      S.lots.push({
        id: uid(), stockId: m.id, key: "", date: $("#mlDate").value || todayISO(),
        qty: q, remaining: q, unitCost: c === "" ? lastCost(m.id) : (+c || 0),
        note: $("#mlNote").value.trim(), created: Date.now()
      });
      await saveLots(); draw(); refreshLists();
      toast(q + " added");
    };
    document.querySelectorAll("[data-mlx]").forEach(b => b.onclick = () => {
      const lot = S.lots.find(l => l.id === b.dataset.mlx);
      confirmAsk({
        title: "Delete this batch?",
        body: `${lot.qty} ${esc(m.unit || "each")} of ${esc(m.name)} from ${esc(fmtDate(lot.date, true))}. Nothing has been used from it. You can put it back from <b>Safe → Recently deleted</b>.`,
        onYes: async () => {
          await trashPut("batch", m.name + " batch", fmtDate(lot.date, true) + " · " + lot.qty + " at " + cur(+lot.unitCost || 0), { lot });
          S.lots = S.lots.filter(l => l.id !== lot.id);
          await saveLots(); draw(); refreshLists();
          toast("Batch deleted", "Undo", () => restoreTrash(S.trash[0].id));
        }
      });
    });

    /* write-offs */
    let why = "";
    document.querySelectorAll("[data-mwr]").forEach(b => b.onclick = () => {
      why = why === b.dataset.mwr ? "" : b.dataset.mwr;
      document.querySelectorAll("[data-mwr]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.mwr === why)));
      $("#mwWhy").value = "";
    });
    if ($("#mwWhy")) $("#mwWhy").oninput = () => {
      why = $("#mwWhy").value;
      document.querySelectorAll("[data-mwr]").forEach(x => x.setAttribute("aria-pressed", "false"));
    };
    if ($("#mwGo")) $("#mwGo").onclick = async () => {
      const q = qtyRound(+$("#mwQty").value || 0, m.unit);
      if (q <= 0) { alert("How many are you writing off?"); return; }
      const avail = onHandTotal(m.id);
      const go = async () => {
        const r = drawStock(m.id, "", q, lastCost(m.id));
        S.writeoffs.push({
          id: uid(), stockId: m.id, itemId: m.id, name: m.name, key: "", date: todayISO(), qty: q,
          reason: why.trim() || "Not given", cost: r.cost, draw: r.draw, short: r.short, dayId: woDayId(), created: Date.now()
        });
        why = "";
        await saveLots(); await saveWriteoffs(); draw(); refreshLists();
        toast(q + " written off — " + cur(r.cost));
      };
      if (q > avail) confirmAsk({ title: "More than you have", body: `Only ${avail} on record. Write off ${q} anyway?`, yes: "Write it off", onYes: go });
      else go();
    };

    document.querySelectorAll("[data-wundo]").forEach(b => b.onclick = () => {
      const x = writeoffGroups(S.writeoffs.filter(w => !w.undone && (w.stockId || w.itemId) === m.id)).find(g => g.key === b.dataset.wundo);
      if (x) undoGroupAsk(x, m.unit, () => draw());
    });

    /* history filters */
    document.querySelectorAll("[data-mf]").forEach(b => b.onclick = () => { moveFilter = b.dataset.mf; draw(); });
  };

  draw();

  $("#matSave").onclick = async () => {
    if (!open.details) { open.details = true; draw(); }
    readDetails();
    m.name = (m.name || "").trim();
    m.category = (m.category || "").trim();
    if (m.category === "__new") m.category = "";
    m.unit = m.unit || "each";
    if (!m.name) { alert("Give it a name."); return; }
    if (!m.category) { alert("Give it a type — that's how recipes find it."); return; }
    if (!S.categories.includes(m.category)) {
      S.categories = S.categories.concat([m.category]).sort();
      await saveCategories();
    }
    const i = S.materials.findIndex(x => x.id === m.id);
    if (i >= 0) S.materials[i] = m; else S.materials.push(m);

    if (!existing) {
      const q = qtyRound(+$("#mlQty").value || 0, m.unit);
      if (q > 0) {
        S.lots.push({
          id: uid(), stockId: m.id, key: "", date: $("#mlDate").value || todayISO(),
          qty: q, remaining: q, unitCost: +$("#mlCost").value || 0,
          note: $("#mlNote").value.trim(), created: Date.now()
        });
        await saveLots();
      }
    }
    await saveMaterials();
    closeSheet(); refreshLists();
  };

  if ($("#matDel")) $("#matDel").onclick = () => {
    const users = S.items.filter(i => (i.recipe || []).some(r => lineMats(r).some(x => x.id === m.id)));
    const held = onHandTotal(m.id);
    const warn = [
      users.length ? `${users.length} thing${users.length === 1 ? "" : "s"} you make ${users.length === 1 ? "uses" : "use"} it` : "",
      held > 0 ? `${Math.round(held * 100) / 100} still on the shelf` : ""
    ].filter(Boolean).join(", ");
    confirmAsk({
      title: "Delete " + (m.name || "this material") + "?",
      body: (warn ? warn.charAt(0).toUpperCase() + warn.slice(1) + ". " : "") +
        "Its batches go with it. You can put it all back from <b>Safe → Recently deleted</b>.",
      onYes: async () => {
        const lots = S.lots.filter(l => lotRef(l) === m.id);
        await trashPut("material", m.name || "Material", (m.category || "") + (lots.length ? " · " + lots.length + " batch" + (lots.length === 1 ? "" : "es") : ""),
          { material: m, lots });
        S.materials = S.materials.filter(x => x.id !== m.id);
        S.lots = S.lots.filter(l => lotRef(l) !== m.id);
        await saveMaterials(); await saveLots();
        closeSheet(); renderAll();
        toast((m.name || "Material") + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
      }
    });
  };
}
function itemSheet(item) {
  const it = item ? JSON.parse(JSON.stringify(item)) : {
    id: uid(), name: "", price: 0, cost: 0, photo: "", groups: [],
    stockMode: "recipe", reorder: 0, madeToOrder: false, recipe: []
  };
  it.recipe = it.recipe || [];
  it.groups = [];
  if (it.stockMode !== "item") it.stockMode = "recipe";
  it.price = +it.price || 0;
  const preMade = () => it.stockMode === "item";

  sheet(item ? (it.name || "Edit") : "Something new", '<div id="itemBody"></div>', [
    { label: item ? "Save" : "Add it", cls: "btn", id: "itemSave" },
    item ? { label: "Delete", cls: "btn sec", id: "itemDel" } : null
  ].filter(Boolean));

  let newGroup = !S.productTypes.length;
  const readTop = () => { if ($("#iName")) it.name = $("#iName").value; };
  const drawGroup = () => {
    const box = $("#groupBox");
    if (!box) return;
    box.innerHTML = newGroup
      ? `<div style="display:flex;gap:8px">
           <input type="text" id="iGroupNew" value="${esc(it.type || "")}" placeholder="Balloon art" style="flex:1">
           ${S.productTypes.length ? '<button class="xbtn" id="iGroupBack" aria-label="Pick an existing group">↩</button>' : ""}
         </div>`
      : `<select id="iGroup">
           ${S.productTypes.slice().sort().map(g => `<option value="${esc(g)}" ${it.type === g ? "selected" : ""}>${esc(g)}</option>`).join("")}
           <option value="__new">+ New group…</option>
         </select>`;
    if (newGroup) {
      $("#iGroupNew").oninput = e => it.type = e.target.value;
      if ($("#iGroupBack")) $("#iGroupBack").onclick = () => { newGroup = false; it.type = S.productTypes[0] || ""; drawGroup(); };
    } else {
      if (!it.type) it.type = S.productTypes[0] || "";
      $("#iGroup").value = it.type;
      $("#iGroup").onchange = e => {
        if (e.target.value === "__new") { readTop(); newGroup = true; it.type = ""; drawGroup(); setTimeout(() => $("#iGroupNew").focus(), 30); }
        else it.type = e.target.value;
      };
    }
  };
  /* types this recipe hasn't claimed yet */
  const freeTypes = () => {
    const used = it.recipe.map(r => r.category).filter(Boolean);
    return matCategories().filter(c => !used.includes(c));
  };

  const draw = () => {
    const cats = matCategories();
    const parts = it.recipe.map(rl => {
      const per = +rl.qty || 0;
      const ms = lineMats(rl);
      if (per <= 0 || !ms.length) return null;
      const avg = ms.reduce((acc, m) => acc + lastCost(m.id), 0) / ms.length;
      return {
        label: per + " × " + (rl.category || "?") + (ms.length > 1 ? " (average of " + ms.length + ")" : " · " + ms[0].name),
        cost: per * avg
      };
    }).filter(Boolean);
    const total = parts.reduce((acc, x) => acc + x.cost, 0);

    $("#itemBody").innerHTML = `
      <div class="rowf">
        <label class="f"><span class="t">Name</span>
          <input type="text" id="iName" value="${esc(it.name)}" placeholder="Balloon dog"></label>
        <label class="f"><span class="t">Group</span><span id="groupBox"></span></label>
      </div>

      <label class="f"><span class="t">Photo</span>
        <div class="rowf" style="align-items:center">
          <span class="av" id="iPrev" style="flex:0 0 64px;${it.photo ? `background-image:url('${it.photo}')` : ""}"></span>
          <input type="file" id="iFile" accept="image/*" style="flex:1;border:0;padding:0;background:none">
          <button class="xbtn" id="iAdjust" aria-label="Move or zoom the photo" title="Move or zoom"${it.photo ? "" : " hidden"}>${ICON_CROP}</button>
          <button class="xbtn" id="iClearPhoto" aria-label="Remove photo">✕</button>
        </div></label>

      <div class="sect">Cost to make</div>
      <div class="grp" style="margin-bottom:6px">
        ${parts.length ? parts.map(x => `<div class="inset" style="background:var(--sand);margin-bottom:6px">
            <span class="b"><span class="s" style="font-size:14px;color:var(--ink)">${esc(x.label)}</span></span>
            <span class="r">${esc(cur(x.cost))}</span></div>`).join("")
          : '<p class="note" style="margin:0">Say what it\'s made from below and this works itself out.</p>'}
        ${parts.length ? `<div class="inset" style="background:var(--green-tint);margin:0">
          <span class="b"><span class="n" style="font-size:16px">Each one costs</span></span>
          <span class="r">${esc(cur(total))}</span></div>` : ""}
      </div>
      <p class="note">Worked out from what the materials last cost. The figure on a real sale is
        always what the batches it drew on actually cost.</p>

      <div class="sect">What it's made from</div>
      <p class="note">One line per material it uses. Name the type, then the particular ones this
        product may use — leave those blank and any of that type will do.</p>
      ${!S.materials.length ? '<p class="note" style="color:var(--warn-ink)">No materials yet. Add them under Inventory first.</p>' : ""}
      <div id="recipeBox"></div>
      ${freeTypes().length
        ? '<button class="btn sec sm" id="addLine" style="margin-bottom:6px">Add a material</button>'
        : `<p class="note">Every type is already on the list. Add another type under Inventory if you need one.</p>`}

      <div class="sect">Anything else</div>
      <div class="togs" style="margin-bottom:10px">
        <button class="tog sm" id="iPre" aria-pressed="${preMade()}">I pre-make these and count them</button>
        <button class="tog sm" id="iMto" aria-pressed="${!!it.madeToOrder}">Made to order for the buyer</button>
      </div>
      <div id="stockBits"></div>`;

    drawGroup();
    drawRecipe();
    drawStockBits();
    bindTop();
  };

  /* ---- the recipe lines ---- */
  const drawRecipe = () => {
    const cats = matCategories();
    const box = $("#recipeBox");
    box.innerHTML = it.recipe.map((rl, i) => {
      const inType = matsIn(rl.category);
      const chosen = rl.materials || [];
      return `<div class="grp">
        <div class="rowf" style="align-items:flex-end">
          <label class="f" style="margin:0"><span class="t">Type</span>
            <select data-rcat="${i}">
              <option value="">— choose —</option>
              ${cats.filter(c => c === rl.category || !it.recipe.some((o, j) => j !== i && o.category === c))
                .map(c => `<option value="${esc(c)}" ${rl.category === c ? "selected" : ""}>${esc(c)} (${matsIn(c).length})</option>`).join("")}
            </select></label>
          <label class="f" style="margin:0;flex:0 0 120px"><span class="t">How many</span>
            <input type="number" data-rqty="${i}" inputmode="${qtyMode((inType[0] || {}).unit)}"
              step="${qtyStep((inType[0] || {}).unit)}" min="0" value="${rl.qty != null ? rl.qty : 1}"></label>
          <button class="xbtn" data-rx="${i}" style="flex:0 0 44px" aria-label="Remove line">✕</button>
        </div>
        ${rl.category ? `
          <span class="t" style="display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);margin:10px 0 6px">
            Which ones can it use${chosen.length ? "" : " · any of them"}</span>
          <div class="togs" data-rmats="${i}">
            ${inType.length ? inType.map(m => `<button class="tog sm" data-mid="${esc(m.id)}" aria-pressed="${chosen.includes(m.id)}">
                ${colorDot(balloonColor(m.name) || hueFor(m.name), 16)}${esc(m.name)}</button>`).join("")
              : `<p class="note" style="margin:0">Nothing filed under ${esc(rl.category)} yet.</p>`}
          </div>` : ""}
      </div>`;
    }).join("");

    box.querySelectorAll("[data-rcat]").forEach(el => el.onchange = () => {
      const rl = it.recipe[+el.dataset.rcat];
      rl.category = el.value; rl.materials = [];
      readTop(); draw();
    });
    box.querySelectorAll("[data-rqty]").forEach(el => el.oninput = () => {
      const rl = it.recipe[+el.dataset.rqty];
      const u = (matsIn(rl.category)[0] || {}).unit;
      rl.qty = qtyRound(+el.value || 0, u);
    });
    box.querySelectorAll("[data-rqty]").forEach(el => el.onchange = () => { readTop(); draw(); });
    box.querySelectorAll("[data-rx]").forEach(b2 => b2.onclick = () => {
      it.recipe.splice(+b2.dataset.rx, 1); readTop(); draw();
    });
    box.querySelectorAll("[data-rmats]").forEach(wrap => {
      const rl = it.recipe[+wrap.dataset.rmats];
      wrap.querySelectorAll("[data-mid]").forEach(b2 => b2.onclick = () => {
        rl.materials = rl.materials || [];
        rl.materials = rl.materials.includes(b2.dataset.mid)
          ? rl.materials.filter(x => x !== b2.dataset.mid)
          : rl.materials.concat([b2.dataset.mid]);
        readTop(); draw();
      });
    });
  };

  /* ---- finished stock, only when you pre-make ---- */
  const drawStockBits = () => {
    const box = $("#stockBits");
    if (!preMade()) { box.innerHTML = ""; return; }
    if (!item) { box.innerHTML = '<p class="note">Save it first, then come back to count them.</p>'; return; }
    const lots = allLotsFor(it.id, null);
    box.innerHTML = `
      <div class="kpis" style="margin-bottom:12px">
        <div class="kpi"><div class="k">Made up and ready</div><div class="v">${onHandTotal(it.id)}</div></div>
        <div class="kpi"><div class="k">Warn me at or below</div>
          <div class="v sm"><input type="number" id="iReorder" inputmode="numeric" step="1" min="0"
            value="${it.reorder || ""}" placeholder="0 = never" style="max-width:120px"></div></div>
      </div>
      <div class="grp">
        <div class="rowf">
          <label class="f"><span class="t">Date made</span><input type="date" id="lotDate" value="${todayISO()}"></label>
          <label class="f"><span class="t">How many</span><input type="number" id="lotQty" inputmode="numeric" step="1" min="1" placeholder="12"></label>
          <label class="f"><span class="t">Cost each</span><input type="number" id="lotCost" inputmode="decimal" step="0.01" min="0" placeholder="${(recipeCostEstimate(it) || 0).toFixed(2)}"></label>
        </div>
        <button class="btn sec sm" id="lotAdd">Add to stock</button>
      </div>
      ${lots.length ? `<div class="card">${lots.map(l => `<div class="inset">
        <span class="b"><span class="n">${esc(fmtDate(l.date, true))}</span>
          <span class="s">${l.remaining} of ${l.qty} left at ${esc(cur(+l.unitCost || 0))} each</span></span>
        <span class="r">${esc(cur(l.remaining * (+l.unitCost || 0)))}</span>
        ${l.qty === l.remaining ? `<button class="xbtn" data-lotx="${l.id}" aria-label="Delete batch">✕</button>` : ""}
      </div>`).join("")}</div>` : ""}`;

    $("#iReorder").oninput = e => it.reorder = +e.target.value || 0;
    $("#lotAdd").onclick = async () => {
      const q = Math.round(+$("#lotQty").value || 0);
      if (q < 1) { alert("How many are you adding?"); return; }
      const c = $("#lotCost").value;
      S.lots.push({
        id: uid(), stockId: it.id, itemId: it.id, key: "", date: $("#lotDate").value || todayISO(),
        qty: q, remaining: q, unitCost: c === "" ? (recipeCostEstimate(it) || 0) : (+c || 0),
        note: "", created: Date.now()
      });
      await saveLots(); readTop(); draw(); refreshLists();
      toast(q + " added");
    };
    box.querySelectorAll("[data-lotx]").forEach(b2 => b2.onclick = () => {
      const lot = S.lots.find(l => l.id === b2.dataset.lotx);
      confirmAsk({
        title: "Delete this batch?",
        body: `${lot.qty} from ${esc(fmtDate(lot.date, true))}. Nothing has been sold from it.`,
        onYes: async () => {
          await trashPut("batch", (it.name || "Thing") + " batch", fmtDate(lot.date, true) + " · " + lot.qty, { lot });
          S.lots = S.lots.filter(l => l.id !== lot.id);
          await saveLots(); readTop(); draw(); refreshLists();
          toast("Batch deleted", "Undo", () => restoreTrash(S.trash[0].id));
        }
      });
    });
  };

  const bindTop = () => {
    if ($("#addLine")) $("#addLine").onclick = () => {
      readTop();
      it.recipe.push({ id: uid(), category: freeTypes()[0] || "", materials: [], qty: 1 });
      draw();
    };
    $("#iPre").onclick = async () => {
      readTop();
      it.stockMode = preMade() ? "recipe" : "item";
      draw();
      /* it opens the batch panel, so persist at once — otherwise a batch added
         here and then abandoned would be left attached to nothing */
      const stored = S.items.find(x => x.id === it.id);
      if (stored) { stored.stockMode = it.stockMode; await saveItems(); refreshLists(); }
    };
    $("#iMto").onclick = () => { readTop(); it.madeToOrder = !it.madeToOrder; draw(); };
    wirePhoto(it, "i");
  };

  draw();

  $("#itemSave").onclick = async () => {
    readTop();
    it.name = (it.name || "").trim();
    it.type = ((newGroup && $("#iGroupNew")) ? $("#iGroupNew").value : (it.type || "")).trim();
    if (!it.name) { alert("Give it a name."); return; }
    if (it.type && !S.productTypes.includes(it.type)) {
      S.productTypes = S.productTypes.concat([it.type]).sort();
      await saveProductTypes();
    }
    it.recipe = it.recipe.filter(r => r.category && (+r.qty || 0) > 0);
    it.cost = Math.round((recipeCostEstimate(it) || 0) * 1000) / 1000;
    const i = S.items.findIndex(x => x.id === it.id);
    if (i >= 0) S.items[i] = it; else S.items.push(it);
    await saveItems();
    closeSheet(); refreshLists();
  };

  if ($("#itemDel")) $("#itemDel").onclick = () => confirmAsk({
    title: "Delete " + (it.name || "this") + "?",
    body: "Sales already recorded keep their own copy, so the money side is safe. You can put it back from <b>Safe → Recently deleted</b>.",
    onYes: async () => {
      const lots = S.lots.filter(l => lotRef(l) === it.id);
      await trashPut("product", it.name || "Thing", "something you make", { item: it, lots });
      S.items = S.items.filter(x => x.id !== it.id);
      S.lots = S.lots.filter(l => lotRef(l) !== it.id);
      await saveItems(); await saveLots();
      closeSheet(); renderAll();
      toast((it.name || "It") + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
    }
  });
}

function shrink(file, max, quality) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const M = max || 520, sc = Math.min(1, M / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", quality || 0.72));
      };
      img.onerror = () => res("");
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

/* ---------------------------- reports ---------------------------- */
/* Every report opens on the last 30 days, today included. The date boxes and
   the range picker widen it. ev is a search, not an exact name, so typing
   "river" narrows everything to Riverside Fair. */
const last30 = () => addDays(todayISO(), -29);
const RF = { ev: "", type: "", from: last30(), to: todayISO(), pop: "name", popAll: false, report: "takings" };
const REPORTS = [
  ["takings", "Takings"],
  ["written", "Written off"],
  ["cash", "Cash flow"]
];
const RANGES = [
  ["30", "Last 30 days", () => [addDays(todayISO(), -29), todayISO()]],
  ["90", "Last 90 days", () => [addDays(todayISO(), -89), todayISO()]],
  ["year", "This year", () => [todayISO().slice(0, 4) + "-01-01", todayISO()]],
  ["all", "All time", () => ["", ""]]
];
const rangeNow = () => (RANGES.find(([, , f]) => { const [a, b] = f(); return a === RF.from && b === RF.to; }) || ["custom"])[0];

function ctxOf(dayId) {
  const d = dayOf(dayId);
  const e = d ? evOf(d.eventId) : null;
  return { date: d ? d.date : "", event: e ? (e.name || "Untitled event") : "—", type: e ? e.type : "", ev: e, day: d };
}
const evMatch = name => hits(RF.ev, name);
function filteredSales() {
  return S.sales.filter(s => {
    const c = ctxOf(s.dayId);
    if (RF.ev && !evMatch(c.event)) return false;
    if (RF.type && c.type !== RF.type) return false;
    if (RF.from && c.date < RF.from) return false;
    if (RF.to && c.date > RF.to) return false;
    return true;
  });
}
/* visits (one application at one event) whose days fall inside the current
   filter — each visit's fee and travel count once */
function filteredVisits() {
  const seen = new Set();
  const add = d => { if (d && d.appId) seen.add(d.eventId + "|" + d.appId); };
  for (const s of filteredSales()) add(dayOf(s.dayId));
  for (const d of S.days) {
    const e = evOf(d.eventId); if (!e) continue;
    if (RF.ev && !evMatch(e.name || "Untitled event")) continue;
    if (RF.type && e.type !== RF.type) continue;
    if (RF.from && d.date < RF.from) continue;
    if (RF.to && d.date > RF.to) continue;
    if (daysUntil(d.date) <= 0) add(d);
  }
  return [...seen].map(k => {
    const [e, a] = k.split("|"), ev = evOf(e);
    const app = ev && appOf(ev, a);
    return app ? { ev, app } : null;
  }).filter(Boolean);
}

function reportFilters() {
  const evNames = [...new Set(S.events.map(e => e.name || "Untitled event"))].sort();
  const types = [...new Set(S.events.map(e => e.type).filter(Boolean))].sort();
  const rn = rangeNow();
  return `
    <div class="seg" style="margin-bottom:14px">
      ${REPORTS.map(([id, label]) =>
        `<button data-report="${id}" aria-selected="${RF.report === id}">${label}</button>`).join("")}
    </div>
    <div class="filters">
      ${RF.report === "takings" ? `
        <span class="searchbar" style="max-width:none;min-width:200px">${ICON_SEARCH}
          <input type="text" id="fEv" list="fEvList" value="${esc(RF.ev)}" placeholder="Search markets" autocomplete="off"></span>
        <datalist id="fEvList">${evNames.map(l => `<option value="${esc(l)}"></option>`).join("")}</datalist>
        <select id="fType"><option value="">Every event type</option>${types.map(l => `<option ${RF.type === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
      <select id="fRange">${RANGES.map(([id, label]) => `<option value="${id}" ${rn === id ? "selected" : ""}>${label}</option>`).join("")}
        ${rn === "custom" ? '<option value="custom" selected>Your own dates</option>' : ""}</select>
      <input type="date" id="fFrom" value="${RF.from}" aria-label="From"><input type="date" id="fTo" value="${RF.to}" aria-label="To">
    </div>
    <div id="repBody"></div>`;
}

/* the filter bar is drawn once; typing in the search only redraws what's under it */
function renderReportBody() {
  const host = $("#repBody");
  if (!host) return;
  if (RF.report === "cash") { host.innerHTML = reportCash(); bindCash(host); return; }
  host.innerHTML = RF.report === "written" ? reportWritten() : reportTakings();
  host.querySelectorAll("[data-wgrp]").forEach(b => b.onclick = () => {
    const x = WO_GROUPS[+b.dataset.wgrp];
    if (!x) return;
    const mat = matById(x.list[0].stockId || x.list[0].itemId);
    undoGroupAsk(x, mat ? mat.unit : "each", () => renderReports());
  });
  host.querySelectorAll("[data-pop]").forEach(b => b.onclick = () => { RF.pop = b.dataset.pop; renderReportBody(); });
  if ($("#popAll")) $("#popAll").onclick = () => { RF.popAll = !RF.popAll; renderReportBody(); };
  host.querySelectorAll("[data-dayrep]").forEach(b => b.onclick = () => dayReport(b.dataset.dayrep));
}

function renderReports() {
  const p = $("#pReports");
  p.innerHTML = reportFilters();
  renderReportBody();

  p.querySelectorAll("[data-report]").forEach(b => b.onclick = () => {
    RF.report = b.dataset.report; renderReports();
  });
  if ($("#fEv")) $("#fEv").oninput = e => { RF.ev = e.target.value; renderReportBody(); };
  if ($("#fType")) $("#fType").onchange = e => { RF.type = e.target.value; renderReports(); };
  $("#fRange").onchange = e => {
    const r = RANGES.find(x => x[0] === e.target.value);
    if (!r) return;
    [RF.from, RF.to] = r[2]();
    renderReports();
  };
  $("#fFrom").onchange = e => { RF.from = e.target.value; renderReports(); };
  $("#fTo").onchange = e => { RF.to = e.target.value; renderReports(); };
}

const inRange = date => (!RF.from || date >= RF.from) && (!RF.to || date <= RF.to);
const r3 = n => Math.round(n * 1000) / 1000;

/* what a sold line is made of, in the same words the ticket uses */
function lineMatNames(l) {
  const used = (l.used || []).map(u => u.name || (matById(u.materialId) || {}).name).filter(Boolean);
  return used.length ? used : (l.opts || []).filter(o => o.o).map(o => o.o);
}
const POP_VIEWS = [["name", "Just name"], ["mats", "Just raw materials"], ["both", "Name and raw materials"]];

/* -------- what came in -------- */
function reportTakings() {
  const sales = filteredSales();
  const lines = sales.flatMap(s => s.lines.map(l => ({ ...l, ts: s.ts, dayId: s.dayId, c: ctxOf(s.dayId) })));
  const evs = filteredVisits();

  const taken = lines.reduce((a, l) => a + l.total, 0);
  const goods = lines.reduce((a, l) => a + l.costTotal, 0);
  const fees = evs.reduce((a, v) => a + appCosts(v.ev, v.app), 0);
  const net = taken - goods - fees;
  const qty = lines.reduce((a, l) => a + l.qty, 0);
  const free = lines.filter(l => l.mode === "free");
  const freeQty = free.reduce((a, l) => a + l.qty, 0);
  const freeVal = free.reduce((a, l) => a + l.listed, 0);
  const discVal = lines.filter(l => l.mode === "discount" || l.mode === "set")
    .reduce((a, l) => a + Math.max(0, l.listed - l.total), 0);
  const repl = lines.filter(l => l.mode === "replace");
  const replQty = repl.reduce((a, l) => a + l.qty, 0);
  const replNet = repl.reduce((a, l) => a + l.costTotal - l.total, 0);
  const prac = lines.filter(l => l.mode === "practice");
  const pracQty = prac.reduce((a, l) => a + l.qty, 0);
  const pracCost = prac.reduce((a, l) => a + l.costTotal, 0);

  if (!sales.length && !evs.length) return `<p class="note">${RF.ev
    ? `No market matching "${esc(RF.ev)}" sold anything in these dates.`
    : "Nothing sold in these dates. Widen them with the range above."}</p>`;

  /* one bar per selling day, so two markets on the same date stay apart */
  const dayAgg = {};
  for (const l of lines) {
    const k = l.dayId || "—";
    dayAgg[k] = dayAgg[k] || { rev: 0, qty: 0, c: l.c };
    dayAgg[k].rev += l.total; dayAgg[k].qty += l.qty;
  }
  const byDay = Object.entries(dayAgg).sort((a, b) => (a[1].c.date || "").localeCompare(b[1].c.date || ""));
  const dayMax = Math.max(...byDay.map(r => r[1].rev), 0.01);

  /* most popular, three ways */
  const pop = {};
  const bump = (k, l, n, unit) => {
    pop[k] = pop[k] || { qty: 0, rev: 0, things: 0, free: 0, repl: 0, prac: 0, name: l.name, opts: l.opts, unit };
    const p = pop[k];
    p.qty += n; p.things += l.qty;
    if (RF.pop !== "mats") p.rev += l.total;
    if (l.mode === "free") p.free += l.qty;
    if (l.mode === "replace") p.repl += l.qty;
    if (l.mode === "practice") p.prac += l.qty;
  };
  for (const l of lines) {
    if (RF.pop === "name") bump(l.name, l, l.qty);
    else if (RF.pop === "both") bump([l.name, ...lineMatNames(l)].join(" · "), l, l.qty);
    else {
      const used = (l.used || []).filter(u => u.materialId || u.name);
      if (used.length) for (const u of used) {
        const m = matById(u.materialId);
        bump(u.name || (m && m.name) || "—", l, +u.qty || 0, m ? m.unit : "each");
      }
      else for (const w of lineMatNames(l)) bump(w, l, l.qty, "each");
    }
  }
  const popRows = Object.entries(pop).map(([k, v]) => [k, Object.assign(v, { qty: r3(v.qty) })])
    .sort((a, b) => b[1].qty - a[1].qty || b[1].rev - a[1].rev);
  const popShown = RF.popAll ? popRows : popRows.slice(0, 10);
  const popMax = Math.max(...popRows.map(r => r[1].qty), 0.01);
  const popColor = (k, v) => RF.pop === "mats"
    ? (balloonColor(k.split(" ")[0]) || hueFor(k))
    : itemColor({ name: v.name }, v.opts);
  const popNote = v => RF.pop === "mats"
    ? `in ${v.things} thing${v.things === 1 ? "" : "s"}`
    : [esc(cur(v.rev)), v.free ? v.free + " given away" : "", v.repl ? v.repl + " swapped" : "", v.prac ? v.prac + " practice" : ""]
      .filter(Boolean).join(" · ");

  return `
  <div class="kpis">
    <div class="kpi big"><div class="k">Money taken</div><div class="v">${esc(cur(taken))}</div>
      <div class="n">${sales.length} sale${sales.length === 1 ? "" : "s"} · ${qty} things</div></div>
    <div class="kpi big"><div class="k">Balloons cost</div><div class="v">${esc(cur(goods))}</div>
      <div class="n">what went into them</div></div>
    <div class="kpi big"><div class="k">Stalls &amp; travel</div><div class="v">${esc(cur(fees))}</div>
      <div class="n">${evs.length} visit${evs.length === 1 ? "" : "s"}</div></div>
    <div class="kpi big tint"><div class="k">Money kept</div><div class="v">${esc(cur(net))}</div>
      <div class="n">${[
        freeQty ? freeQty + " given away (" + esc(cur(freeVal)) + ")" : "",
        discVal ? esc(cur(discVal)) + " in deals" : "",
        replQty ? replQty + " swapped (" + esc(cur(replNet)) + ")" : "",
        pracQty ? pracQty + " practice (" + esc(cur(pracCost)) + ")" : ""
      ].filter(Boolean).join(" · ") || "after everything"}</div></div>
  </div>

  ${byDay.length ? `<div class="card"><div class="sect" style="margin-top:0">Every market day</div>
    <p class="note" style="margin-top:-6px">Tap a date to see every sale on it, and to reverse one.</p>
    <div class="bars">${byDay.map(([id, v]) => `
      <div class="bar tall">
        <button class="l daylink" data-dayrep="${esc(id)}">
          <b>${esc(v.c.date ? parseD(v.c.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No date")}</b><span>${esc(v.c.event)}</span></button>
        <span class="t"><i style="width:${Math.max(2, Math.round(v.rev / dayMax * 100))}%"></i></span>
        <span class="v">${esc(cur(v.rev))}</span>
      </div>`).join("")}</div></div>` : ""}

  ${popRows.length ? `<div class="card">
    <div class="sect" style="margin-top:0">Most popular</div>
    <div class="seg" style="margin-bottom:14px;flex-wrap:wrap">
      ${POP_VIEWS.map(([id, label]) => `<button data-pop="${id}" aria-selected="${RF.pop === id}">${label}</button>`).join("")}
    </div>
    <div class="bars">${popShown.map(([k, v]) => `
      <div class="bar pop">
        <span class="l"><span class="pn">${colorDot(popColor(k, v), 12)}<b>${esc(k)}</b></span>
          <span class="ps">${popNote(v)}</span></span>
        <span class="t"><i style="width:${Math.max(2, Math.round(v.qty / popMax * 100))}%;background:${popColor(k, v)}"></i></span>
        <span class="v">${v.qty}${RF.pop === "mats" && v.unit && v.unit !== "each" ? " " + esc(v.unit) : ""}</span>
      </div>`).join("")}</div>
    ${popRows.length > 10 ? `<button class="btn ghost" id="popAll">${RF.popAll ? "Just the top 10" : "Show all " + popRows.length}</button>` : ""}
    <p class="note" style="margin:12px 0 0">${RF.pop === "mats"
      ? "How much of each material went out in things sold, gifts and swaps included."
      : "How many went out, gifts and swaps included."}</p>
  </div>` : ""}`;
}

/* -------- one market day, sale by sale -------- */
function modeChip(l) {
  if (l.mode === "free") return `<span class="chip">Gift${l.reason ? " · " + esc(l.reason) : ""}</span>`;
  if (l.mode === "practice") return `<span class="chip neutral">Practice</span>`;
  if (l.mode === "discount") return `<span class="chip">${l.dType === "pct" ? (+l.dVal || 0) + "% off" : cur(+l.dVal || 0) + " off"}${l.reason ? " · " + esc(l.reason) : ""}</span>`;
  if (l.mode === "set") return `<span class="chip">Own price · was ${esc(cur(l.base))}</span>`;
  if (l.mode === "replace") return `<span class="chip">Swap${(+l.dVal || 0) ? " · " + esc(cur(+l.dVal)) : " · no charge"}${l.reason ? " · " + esc(l.reason) : ""}</span>`;
  return "";
}
const saleTime = ts => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function dayReport(dayId) {
  const c = ctxOf(dayId);
  const sales = S.sales.filter(s => s.dayId === dayId).sort((a, b) => a.ts - b.ts);
  const revs = S.reversals.filter(r => r.dayId === dayId).sort((a, b) => b.ts - a.ts);
  const taken = sales.reduce((a, s) => a + s.total, 0);
  const things = sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0);

  const saleBlock = (s, n) => `<div class="grp">
    <div class="gh" style="margin-bottom:8px">
      <span style="flex:1;min-width:0"><b style="font-family:var(--display);font-size:17px">Sale ${n}</b>
        <span class="note" style="margin:0 0 0 6px">${esc(saleTime(s.ts))}</span></span>
      <b style="font-family:var(--display);font-size:18px">${esc(cur(s.total))}</b>
      ${s.lines.length > 1 ? `<button class="tlink" data-rev-sale="${s.id}">Reverse sale</button>` : ""}
    </div>
    ${s.lines.map((l, i) => {
      const words = lineMatNames(l);
      return `<div class="inset" style="background:var(--card)">
        <span class="fact" style="min-width:44px;text-align:center">${l.qty}×</span>
        <span class="b"><span class="n">${esc(l.name)}</span>
          ${words.length ? `<span class="s">${esc(words.join(" · "))}</span>` : ""}${modeChip(l)}</span>
        <span class="r">${esc(cur(l.total))}</span>
        <button class="tlink" data-rev-line="${s.id}|${i}">Reverse</button>
      </div>`;
    }).join("")}
  </div>`;

  sheet(esc(c.event) + `<span style="display:block;font-family:var(--body);font-weight:600;font-size:15px;color:var(--ink-mute);margin-top:2px">${esc(fmtDate(c.date, true) || "No date")}</span>`, `
    <div class="kpis" style="grid-template-columns:repeat(2,1fr)">
      <div class="kpi tint"><div class="k">Taken</div><div class="v">${esc(cur(taken))}</div></div>
      <div class="kpi"><div class="k">Sales</div><div class="v">${sales.length}</div>
        <div class="n">${things} thing${things === 1 ? "" : "s"}</div></div>
    </div>
    ${sales.length ? sales.map((s, i) => saleBlock(s, i + 1)).join("")
      : '<p class="note">No sales left on this day.</p>'}
    ${revs.length ? `<div class="slabel">Reversed</div>
      ${revs.map(r => `<div class="inset">
        <span class="b"><span class="n">${esc(r.lines.map(l => l.qty + "× " + l.name + (l.variant ? " · " + l.variant : "")).join(", "))}</span>
          <span class="s">${esc(new Date(r.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }))} ·
            ${esc([...new Set(r.lines.map(l => (l.disposition === "waste" ? "written off" : "back into inventory") + (l.reason ? " · " + l.reason : "")))].join("; "))}</span></span>
        <span class="r" style="color:var(--ink-mute)">−${esc(cur(+r.total || 0))}</span>
      </div>`).join("")}` : ""}
  `, null);

  document.querySelectorAll("[data-rev-sale]").forEach(b => b.onclick = () => {
    const s = S.sales.find(x => x.id === b.dataset.revSale);
    if (s) reverseAsk(s, null);
  });
  document.querySelectorAll("[data-rev-line]").forEach(b => b.onclick = () => {
    const [sid, i] = b.dataset.revLine.split("|");
    const s = S.sales.find(x => x.id === sid);
    if (s && s.lines[+i]) reverseAsk(s, +i);
  });
}

/* Cut k units off a sold line. The stock those k drew comes with them,
   newest batch first, so what's left on the sale keeps its oldest units. */
function takeDraws(draws, amount) {
  const moved = [];
  let need = r3(amount);
  for (let i = draws.length - 1; i >= 0 && need > 1e-9; i--) {
    const d = draws[i];
    const t = r3(Math.min(need, d.qty));
    if (t <= 0) continue;
    d.qty = r3(d.qty - t); need = r3(need - t);
    moved.unshift({ lotId: d.lotId, qty: t, unitCost: d.unitCost });
  }
  for (let i = draws.length - 1; i >= 0; i--) if (draws[i].qty <= 1e-9) draws.splice(i, 1);
  return moved;
}
const m4 = n => Math.round(n * 10000) / 10000;
function splitLine(l, k) {
  const ratio = k / l.qty;
  const drawnQty = ds => (ds || []).reduce((a, d) => a + d.qty, 0);
  const part = Object.assign({}, l, {
    qty: k, total: m4(l.total * ratio), listed: m4(l.listed * ratio),
    costTotal: m4(l.costTotal * ratio), short: r3((+l.short || 0) * ratio),
    draw: takeDraws(l.draw || [], drawnQty(l.draw) * ratio),
    used: (l.used || []).map(u => {
      const p = Object.assign({}, u, {
        qty: r3((+u.qty || 0) * ratio), cost: m4((+u.cost || 0) * ratio), short: r3((+u.short || 0) * ratio),
        draw: takeDraws(u.draw || [], drawnQty(u.draw) * ratio)
      });
      u.qty = r3((+u.qty || 0) - p.qty); u.cost = m4((+u.cost || 0) - p.cost); u.short = r3((+u.short || 0) - p.short);
      return p;
    })
  });
  l.qty = r3(l.qty - k); l.total = m4(l.total - part.total); l.listed = m4(l.listed - part.listed);
  l.costTotal = m4(l.costTotal - part.costTotal); l.short = r3((+l.short || 0) - part.short);
  return part;
}

/* Reverse a whole sale (line null) or one line of it. Each line that took
   stock asks where it goes: back into inventory, or written off. */
function reverseAsk(sale, lineIdx) {
  const host = $("#confirms");
  const targets = lineIdx === null ? sale.lines.map((l, i) => i) : [lineIdx];
  const rows = targets.map(i => {
    const l = sale.lines[i];
    const item = S.items.find(x => x.id === l.itemId);
    const mto = !!(item && item.madeToOrder);
    return { i, line: l, k: l.qty, mode: mto ? "waste" : "stock", reason: "" };
  });
  const one = rows.length === 1 ? rows[0] : null;
  const whole = one && Number.isInteger(one.line.qty) && one.line.qty > 1;

  const draw = () => {
    const amt = rows.reduce((a, r) => a + r.line.total * (r.k / r.line.qty), 0);
    host.innerHTML = `<div class="scrim confirm">
      <div class="sheet narrow" role="alertdialog" aria-modal="true" style="max-width:520px">
        <div class="shead"><h3>${one ? "Reverse " + esc(one.line.name) : "Reverse this sale"}</h3></div>
        <div class="sbody">
          <p class="note" style="margin:0 0 14px">It comes off the day's takings. ${esc(cur(amt))} back to the customer.</p>
          ${whole ? `<div class="slabel" style="margin-top:0">How many?</div>
            <div class="qtyrow" style="margin-bottom:14px">
              <button class="step" id="rvM" aria-label="Fewer">−</button>
              <span class="qtyn" id="rvN">${one.k}</span>
              <button class="step" id="rvP" aria-label="More">+</button>
            </div>` : ""}
          ${rows.map((r, j) => {
            const took = lineDrewStock(r.line);
            const v = lineMatNames(r.line).join(" · ");
            const list = r.mode === "waste" ? LOSS_REASONS : RETURN_REASONS;
            return `<div class="grp">
              <div style="font-weight:700;margin-bottom:2px">${one ? "" : r.line.qty + "× "}${esc(r.line.name)}${v ? " · " + esc(v) : ""}</div>
              ${took ? `<div class="note" style="margin-bottom:10px">What went into ${r.k === 1 ? "it" : "them"}:</div>
                <div class="togs even" data-rrow="${j}" style="margin-bottom:10px">
                  <button class="tog" data-d="stock" aria-pressed="${r.mode === "stock"}">Back into inventory</button>
                  <button class="tog d-waste" data-d="waste" aria-pressed="${r.mode === "waste"}">Write it off</button>
                </div>
                <div class="togs" data-rreasons="${j}" style="margin-bottom:10px">
                  ${list.map(x => `<button class="tog sm" data-r="${esc(x)}" aria-pressed="${r.reason === x}">${esc(x)}</button>`).join("")}
                </div>
                <input type="text" data-rother="${j}" value="${list.includes(r.reason) ? "" : esc(r.reason)}" placeholder="Or put it in your own words">`
              : `<div class="note" style="margin:0">Nothing was taken from inventory for this.</div>`}
            </div>`;
          }).join("")}
        </div>
        <div class="sfoot stack">
          <button class="btn sec" id="rvNo">Keep it</button>
          <button class="btn danger" id="rvGo">Reverse</button>
        </div>
      </div></div>`;

    const close = () => { host.innerHTML = ""; };
    host.querySelector(".scrim").addEventListener("click", e => { if (e.target.classList.contains("scrim")) close(); });
    $("#rvNo").onclick = close;
    if (whole) {
      $("#rvM").onclick = () => { one.k = Math.max(1, one.k - 1); draw(); };
      $("#rvP").onclick = () => { one.k = Math.min(one.line.qty, one.k + 1); draw(); };
    }
    host.querySelectorAll("[data-rrow]").forEach(box => {
      const r = rows[+box.dataset.rrow];
      box.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
        if (r.mode === b.dataset.d) return;
        r.mode = b.dataset.d; r.reason = ""; draw();
      });
    });
    host.querySelectorAll("[data-rreasons]").forEach(box => {
      const r = rows[+box.dataset.rreasons];
      box.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
        r.reason = r.reason === b.dataset.r ? "" : b.dataset.r;
        box.querySelectorAll("[data-r]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.r === r.reason)));
        const other = host.querySelector(`[data-rother="${box.dataset.rreasons}"]`);
        if (other) other.value = "";
      });
    });
    host.querySelectorAll("[data-rother]").forEach(inp => {
      const j = +inp.dataset.rother;
      inp.oninput = () => {
        rows[j].reason = inp.value;
        host.querySelectorAll(`[data-rreasons="${j}"] [data-r]`).forEach(x => x.setAttribute("aria-pressed", "false"));
      };
    });
    $("#rvGo").onclick = async () => { close(); await doReverse(sale, rows); };
  };
  draw();
}

/* A thing built from materials is written off as those materials — "2 Red 260,
   Defective" — so the loss shows against what was actually bought. */
function wasteRaw(part, reason, dayId, date) {
  const used = (part.used || []).filter(u => u.materialId);
  if (!used.length) { wasteDrawn(part, reason, dayId, date); return; }
  for (const u of used) {
    const m = matById(u.materialId);
    S.writeoffs.push({
      id: uid(), itemId: u.materialId, stockId: u.materialId, name: u.name || (m && m.name) || part.name, key: "",
      date: date || todayISO(), qty: +u.qty || 0, reason, cost: +u.cost || 0,
      draw: u.draw || [], short: +u.short || 0, used: [], dayId: dayId || "", created: Date.now(),
      note: "Reversed " + part.name
    });
  }
}
async function doReverse(sale, rows) {
  const date = (dayOf(sale.dayId) || {}).date || todayISO();
  const rec = { id: uid(), ts: Date.now(), dayId: sale.dayId, saleId: sale.id, total: 0, lines: [], fromReport: true };
  let wasted = 0, back = false;
  /* highest index first, so removing a whole line doesn't shift the others */
  for (const r of rows.slice().sort((a, b) => b.i - a.i)) {
    const l = sale.lines[r.i];
    const part = r.k >= l.qty - 1e-9 ? l : splitLine(l, r.k);
    if (part === l) sale.lines.splice(r.i, 1);
    if (lineDrewStock(part)) {
      if (r.mode === "waste") { wasteRaw(part, r.reason || "Reversed sale", sale.dayId, date); wasted += part.qty; }
      else { returnStock(lineDraws(part)); back = true; }
    }
    rec.total += part.total;
    rec.lines.unshift({ name: part.name, variant: vKey(part.opts), qty: part.qty, cost: part.costTotal,
      amount: part.total, disposition: lineDrewStock(part) ? r.mode : "stock", reason: r.reason || "" });
  }
  rec.total = m4(rec.total);
  S.reversals.push(rec);

  if (sale.lines.length) {
    sale.total = m4(sale.lines.reduce((a, l) => a + l.total, 0));
    sale.cost = m4(sale.lines.reduce((a, l) => a + l.costTotal, 0));
    sale.profit = m4(sale.total - sale.cost);
    await salePut(sale);
  } else {
    await saleDel(sale.id);
    S.sales = S.sales.filter(x => x.id !== sale.id);
  }
  if (back || wasted) await saveLots();
  if (wasted) await saveWriteoffs();
  await saveReversals();

  refreshLists(); renderSession(); renderReports();
  dayReport(sale.dayId);
  toast("Reversed " + cur(rec.total) + (wasted ? " · " + wasted + " written off" : back ? " · back into inventory" : ""));
}

/* -------- what never sold -------- */
let WO_GROUPS = [];
function reportWritten() {
  const ws = liveWriteoffs().filter(w => inRange(w.date));
  if (!ws.length) return '<p class="note">Nothing written off in these dates. That\'s the good outcome.</p>';

  const cost = ws.reduce((a, w) => a + (+w.cost || 0), 0);
  const units = ws.reduce((a, w) => a + (+w.qty || 0), 0);
  const nameOf = id => (matById(id) || S.items.find(i => i.id === id) || {}).name;

  const group = pick => {
    const o = {};
    for (const w of ws) {
      const k = pick(w) || "—";
      o[k] = o[k] || { qty: 0, cost: 0 };
      o[k].qty += +w.qty || 0; o[k].cost += +w.cost || 0;
    }
    return Object.entries(o).sort((a, b) => b[1].cost - a[1].cost);
  };
  const byReason = group(w => w.reason || "No reason given");
  const byMat = group(w => nameOf(w.stockId || w.itemId) || w.name);
  const byMonth = group(w => (w.date || "").slice(0, 7));
  const max = Math.max(...byReason.map(r => r[1].cost), 0.01);

  /* same thing, same day, same reason: one line */
  const g = {};
  for (const w of ws) {
    const key = [w.date || "", w.stockId || w.itemId || w.name, w.reason || ""].join("|");
    if (!g[key]) g[key] = { key, ev: woEvent(w), reason: w.reason || "no reason given", undone: false,
                            list: [], qty: 0, cost: 0, date: w.date || "", first: w.date || "" };
    g[key].list.push(w); g[key].qty += +w.qty || 0; g[key].cost += +w.cost || 0;
  }
  WO_GROUPS = Object.values(g).map(x => {
    x.qty = r3(x.qty);
    x.list.sort((a, b) => (b.created || 0) - (a.created || 0));
    return x;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.cost - a.cost);

  return `
  <div class="kpis">
    <div class="kpi big"><div class="k">Written off</div><div class="v">${esc(cur(cost))}</div>
      <div class="n">${r3(units)} units, never sold</div></div>
    <div class="kpi big"><div class="k">Times it happened</div><div class="v">${ws.length}</div>
      <div class="n">across ${byMat.length} material${byMat.length === 1 ? "" : "s"}</div></div>
    <div class="kpi big"><div class="k">Worst reason</div><div class="v sm">${esc(byReason[0][0])}</div>
      <div class="n">${esc(cur(byReason[0][1].cost))} of it</div></div>
  </div>

  <div class="card"><div class="sect" style="margin-top:0">Why it happened</div>
    <div class="bars">${byReason.map(([k, v]) => `
      <div class="bar">
        <span class="l">${esc(k)}</span>
        <span class="t"><i style="width:${Math.max(2, Math.round(v.cost / max * 100))}%;background:#d8a56b"></i></span>
        <span class="v">${esc(cur(v.cost))}</span>
      </div>`).join("")}</div></div>

  <div class="card"><div class="sect" style="margin-top:0">Which material</div>
    ${byMat.map(([k, v]) => `<div class="inset">
      <span class="b"><span class="n">${esc(k)}</span><span class="s">${r3(v.qty)} units</span></span>
      <span class="r">${esc(cur(v.cost))}</span></div>`).join("")}</div>

  <div class="card"><div class="sect" style="margin-top:0">Month by month</div>
    ${byMonth.sort((a, b) => b[0].localeCompare(a[0])).map(([k, v]) => `<div class="inset">
      <span class="b"><span class="n">${esc(k)}</span><span class="s">${r3(v.qty)} units</span></span>
      <span class="r">${esc(cur(v.cost))}</span></div>`).join("")}</div>

  <div class="card"><div class="sect" style="margin-top:0">Every one</div>
    ${WO_GROUPS.map((x, i) => `<div class="inset">
      <span class="fact warn" style="min-width:64px;text-align:center">−${x.qty}</span>
      <span class="b"><span class="n">${esc(nameOf(x.list[0].stockId || x.list[0].itemId) || x.list[0].name)}</span>
        <span class="s">${esc(fmtDate(x.date, true) || "—")} · ${esc(x.reason)}${x.list.length > 1 ? " · " + x.list.length + " times" : ""}</span></span>
      <span class="r">${esc(cur(x.cost))}</span>
      <button class="tlink" data-wgrp="${i}">Undo</button></div>`).join("")}</div>`;
}

/* ---------------------------- data ---------------------------- */
/* Five backups, taking turns. Each save is named stallbook-backup-1.json …
   -5.json, and the sixth save goes back to 1. Saved into the same Files
   folder, iOS offers to replace the file with that name — so the folder
   holds the five newest and never grows. The app can't reach into Files
   itself; the rotating name is what does the tidying. */
const BACKUP_SLOTS = 5;
const nextSlot = () => {
  const n = +S.settings.backupNext || 1;
  return n >= 1 && n <= BACKUP_SLOTS ? n : 1;
};
const slotName = n => "stallbook-backup-" + n + ".json";
function backupJson(slot) {
  /* the file carries the state as it will be once it's saved, so loading
     slot 3 back later carries on at slot 4 rather than overwriting itself */
  const settings = slot ? Object.assign({}, S.settings, {
    backupNext: slot % BACKUP_SLOTS + 1,
    backupSlots: Object.assign({}, S.settings.backupSlots, { [slot]: Date.now() })
  }) : S.settings;
  return JSON.stringify({
    v: 7, exported: Date.now(), slot: slot || null,
    items: S.items, materials: S.materials, categories: S.categories,
    productTypes: S.productTypes, trash: S.trash,
    orders: S.orders, assets: S.assets, cash: S.cash,
    events: S.events, days: S.days,
    settings, sales: S.sales,
    lots: S.lots, writeoffs: S.writeoffs, reversals: S.reversals
  }, null, 1);
}
function unbacked() {
  const b = S.settings.lastBackup;
  if (!b) return S.sales.length;
  return S.sales.filter(x => x.ts > b.ts).length;
}
async function markBacked(slot) {
  S.settings.lastBackup = { ts: Date.now(), count: S.sales.length };
  if (slot) {
    S.settings.backupSlots = Object.assign({}, S.settings.backupSlots, { [slot]: Date.now() });
    S.settings.backupNext = slot % BACKUP_SLOTS + 1;
  }
  await saveSettings();
  if ($("#pData")) renderData();
}
/* A touch device (the iPad) gets the share sheet — it's the only way a web
   app can put a file in Files. A computer just downloads, which is certain.
   The Safe tab only counts a backup as saved once one of those actually
   finished; cancelling the share sheet says so rather than failing quietly. */
const useShareSheet = () => window.matchMedia && matchMedia("(pointer: coarse)").matches;
function saveOut(name, text, mime, slot) {
  const isBackup = mime === "application/json";
  try {
    const f = new File([text], name, { type: mime });
    if (useShareSheet() && navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f] })
        .then(() => { if (isBackup) { markBacked(slot); toast(slot ? "Backup " + slot + " of " + BACKUP_SLOTS + " saved" : "Backup saved"); } })
        .catch(() => {
          if (isBackup) toast("Backup not saved", "Try again", () => saveOut(name, text, mime, slot));
        });
      return;
    }
  } catch (e) {}
  dl(name, text, mime);
  if (isBackup) { markBacked(slot); toast("Backup " + (slot || "") + " saved to Downloads"); }
}
function dl(name, text, mime) {
  const b = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const doBackup = () => { const n = nextSlot(); saveOut(slotName(n), backupJson(n), "application/json", n); };

function backupStatus() {
  const b = S.settings.lastBackup, n = unbacked();
  if (!b) return { head: S.sales.length ? "Never saved" : "Nothing to save yet", note: S.sales.length ? S.sales.length + " sales only live on this tablet." : "Once you've sold something, save it here." };
  const days = Math.floor((Date.now() - b.ts) / 864e5);
  const when = days === 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
  const t = new Date(b.ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return {
    head: "Last saved " + when + ", " + t,
    note: n ? n + " sale" + (n === 1 ? "" : "s") + " since then — worth saving again." : "Everything is safe."
  };
}

function slotList() {
  const got = S.settings.backupSlots || {};
  const n = nextSlot();
  const when = ts => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + ", " + new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const newest = Object.entries(got).sort((a, b) => b[1] - a[1])[0];
  return `<div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
    ${Array.from({ length: BACKUP_SLOTS }, (_, i) => i + 1).map(k => `
      <div class="inset" style="background:rgba(255,255,255,.55);margin:0">
        <span class="fact" style="min-width:34px;text-align:center">${k}</span>
        <span class="b"><span class="n" style="font-size:14px">${slotName(k)}</span>
          <span class="s">${got[k] ? esc(when(got[k])) : "Not saved yet"}</span></span>
        ${newest && +newest[0] === k ? '<span class="chip good">Newest</span>' : ""}
        ${k === n ? `<span class="chip neutral">${got[k] ? "Replaced next" : "Next"}</span>` : ""}
      </div>`).join("")}
    <p class="note" style="margin:6px 0 0;color:#3f5c49">Save each one into the same folder in Files. When it asks, tap <b>Replace</b> — that swaps out the oldest, so there are never more than ${BACKUP_SLOTS}.</p>
  </div>`;
}
function renderData() {
  const bs = backupStatus();
  $("#pData").innerHTML = `
    <div style="max-width:740px">
      <div class="card tint" style="border-radius:28px">
        <div class="k" style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green-dark)">Backup</div>
        <div style="font-family:var(--display);font-weight:700;font-size:26px;color:var(--green-deep);margin:4px 0 6px">${esc(bs.head)}</div>
        <p style="font-size:15px;color:#3f5c49;margin:0 0 16px">${esc(bs.note)} A backup is one file you can keep in the Files app — if this tablet is ever wiped, it's the only way back.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn sm auto" id="expJson">Save backup ${nextSlot()}</button>
          <button class="btn white sm auto" id="impJson">Load a backup</button>
        </div>
        ${slotList()}
        <input type="file" id="impFile" class="offscreen">
      </div>

      <div class="card" style="border-radius:28px">
        <div class="sect" style="margin-top:0">Spreadsheets</div>
        <p class="note">One row per sale — handy when a grown-up wants to check the sums.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn sec sm auto" id="expCsv">Sales</button>
          <button class="btn sec sm auto" id="expStockCsv">Inventory</button>
          <button class="btn sec sm auto" id="expEvCsv">Events</button>
          <button class="btn sec sm auto" id="expGearCsv">Equipment</button>
          <button class="btn sec sm auto" id="expCashCsv">Cash flow</button>
        </div>
      </div>

      ${S.trash.length ? `<div class="card" style="border-radius:28px">
        <div class="sect" style="margin-top:0">Recently deleted</div>
        <p class="note">The last ${TRASH_CAP} things you deleted. Put one back and everything comes with it — batches, dates, sales.</p>
        ${S.trash.map(t => `<div class="inset">
          <span class="b"><span class="n">${esc(t.label)}</span>
            <span class="s">${esc(TRASH_KIND[t.kind] || t.kind)}${t.detail ? " · " + esc(t.detail) : ""} · ${esc(agoWords(t.ts))}</span></span>
          <button class="btn sec sm auto" data-undel="${t.id}">Put it back</button>
          <button class="xbtn" data-forget="${t.id}" aria-label="Delete forever">✕</button>
        </div>`).join("")}
      </div>` : ""}

      <div class="card" style="border-radius:28px;background:var(--warn-tint);box-shadow:none">
        <p class="note" style="color:var(--warn-ink);margin-bottom:14px"><b>Warning: this wipes all data on this iPad</b> —
          ${S.items.length} things · ${S.materials.length} materials · ${S.assets.length} pieces of equipment · ${S.events.length} events · ${S.sales.length} sales,
          and Recently deleted too. It cannot be undone. Save a backup first.</p>
        <button class="btn danger sm auto" id="wipe" style="background:var(--card)">Clear everything</button>
      </div>
    </div>`;

  $("#pData").querySelectorAll("[data-undel]").forEach(b => b.onclick = () => restoreTrash(b.dataset.undel));
  $("#pData").querySelectorAll("[data-forget]").forEach(b => b.onclick = () => {
    const t = S.trash.find(x => x.id === b.dataset.forget);
    confirmAsk({
      title: "Delete " + t.label + " forever?",
      body: "This one can't be put back afterwards.",
      yes: "Forever",
      onYes: () => trashDrop(t.id)
    });
  });
  $("#expJson").onclick = doBackup;
  bindExports();

  $("#impJson").onclick = () => $("#impFile").click();
  $("#impFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.items || !d.sales) throw 0;
      if (!confirm("Loading a backup replaces everything on this tablet. Carry on?")) { e.target.value = ""; return; }
      for (const s of S.sales) await saleDel(s.id);
      S.items = d.items || [];
      S.materials = d.materials || [];
      S.categories = d.categories || [...new Set((d.materials || []).map(m => m.category).filter(Boolean))].sort();
      S.productTypes = d.productTypes || [...new Set((d.items || []).map(i => i.type).filter(Boolean))].sort();
      S.trash = d.trash || [];
      S.orders = d.orders || [];
      S.assets = d.assets || [];
      S.cash = d.cash || [];
      S.sales = d.sales || [];
      S.lots = d.lots || [];
      S.writeoffs = d.writeoffs || [];
      S.reversals = d.reversals || [];
      S.settings = Object.assign(S.settings, d.settings || {});
      if (d.events || d.days) { S.events = d.events || []; S.days = d.days || []; }
      else {
        S.events = []; S.days = [];
        for (const s of (d.sessions || [])) {
          const ev = Object.assign(blankEvent(), { id: "ev" + s.id, name: s.location || "Untitled event", type: s.eventType || "", freq: "once" });
          S.events.push(ev);
          S.days.push({ id: s.id, eventId: ev.id, date: s.date, notes: s.notes || "", created: Date.now() });
        }
        S.sales.forEach(x => { if (!x.dayId && x.sessionId) x.dayId = x.sessionId; });
        if (S.settings.activeSession) S.settings.activeDay = S.settings.activeSession;
      }
      for (const s of S.sales) await salePut(s);
      await migrateEvents();
      await saveItems(); await saveMaterials(); await saveCategories(); await saveProductTypes(); await saveEvents();
      await saveDays(); await saveSettings();
      await saveLots(); await saveWriteoffs(); await saveReversals(); await saveTrash(); await saveOrders(); await saveAssets(); await saveCash();
      setCart([]); renderAll(); toast("Backup loaded");
    } catch (err) {
      alert("That file isn't a Stallbook backup. Look for one called stallbook-backup-<date>.json");
    }
    e.target.value = "";
  };

  $("#wipe").onclick = async () => {
    confirmAsk({
      title: "Are you sure?",
      body: "This wipes <b>all data</b> on this iPad — every thing you make, every material, every piece of equipment, every market, every sale and every record of money in or out. Recently deleted is cleared too.",
      yes: "Yes, I'm sure", no: "Cancel",
      onYes: () => confirmAsk({
        title: "Last warning",
        body: "Once this goes there is <b>no way back</b> except a backup file. Clear everything now?",
        yes: "Clear everything", no: "Cancel",
        onYes: async () => {
          for (const s of S.sales) await saleDel(s.id);
          S.items = []; S.materials = []; S.categories = []; S.productTypes = []; S.events = []; S.days = [];
          S.sales = []; setCart([]); S.lots = []; S.writeoffs = []; S.reversals = []; S.trash = []; S.orders = []; S.assets = []; S.cash = [];
          S.tickets = []; S.activeTicket = null; await saveTickets();
          S.settings.activeDay = null;
          await saveItems(); await saveMaterials(); await saveCategories(); await saveProductTypes(); await saveEvents();
          await saveDays(); await saveSettings();
          await saveLots(); await saveWriteoffs(); await saveReversals(); await saveTrash(); await saveOrders(); await saveAssets(); await saveCash();
          renderAll();
        }
      })
    });
  };
}

/* the three spreadsheet exports, unchanged — shared by the Safe screen */
function bindExports() {
  $("#expCsv").onclick = () => {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = ["sale_id", "date", "time", "hour", "event", "event_type", "item", "options", "qty",
      "list_price", "unit_price", "unit_cost", "price_mode", "discount_type", "discount_value",
      "reason", "line_total", "line_cost", "line_margin", "units_unstocked"];
    const rows = [head.join(",")];
    for (const s of S.sales) {
      const c = ctxOf(s.dayId), d = new Date(s.ts);
      for (const l of s.lines) rows.push([s.id, c.date, d.toTimeString().slice(0, 5), d.getHours(), c.event, c.type,
        l.name, l.opts.map(o => o.g + ": " + o.o).join(" | "), l.qty, l.base, l.unit, l.cost, l.mode,
        l.mode === "discount" ? l.dType : (l.mode === "set" ? "set" : (l.mode === "replace" ? "replacement fee" : "")),
        (l.mode === "discount" || l.mode === "set" || l.mode === "replace") ? l.dVal : "", l.reason,
        l.total, l.costTotal, l.total - l.costTotal, l.short || 0].map(q).join(","));
    }
    saveOut("stallbook-sales-" + todayISO() + ".csv", rows.join("\n"), "text/csv");
  };

  $("#expEvCsv").onclick = () => {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const head = ["event", "type", "frequency", "application", "status", "decline_reason", "first_day", "last_day", "days",
      "booth_fee", "travel", "taken", "cost_of_goods", "fee_and_travel_counted", "net", "items_sold", "rating",
      "website", "contact", "reg_opens", "reg_closes", "review", "notes"];
    const rows = [head.join(",")];
    for (const e of S.events) {
      const contact = [e.org && e.org.name, e.org && e.org.email, e.org && e.org.phone].filter(Boolean).join(" / ");
      const ro = recurring(e) ? (e.estOpen ? "~" + fmtMD(e.estOpen) : "") : e.regOpens;
      const rc = recurring(e) ? (e.estClose ? "~" + fmtMD(e.estClose) : "") : e.regDeadline;
      for (const a of appsNewest(e)) {
        const ds = daysOfApp(a.id), m = appMoney(e, a);
        const sold = S.sales.filter(s => ds.some(d => d.id === s.dayId)).flatMap(s => s.lines).reduce((x, l) => x + l.qty, 0);
        rows.push([e.name, e.type, freqLabel(e.freq), appLabel(e, a), statusLabel(a.status), a.declineWhy,
          ds[0] ? ds[0].date : "", ds.length ? ds[ds.length - 1].date : "", ds.length,
          a.fee || 0, e.travel || 0, m.taken, m.goods, m.costs, m.net, sold, a.rating || "",
          e.website, contact, ro, rc, a.review, a.notes].map(q).join(","));
      }
    }
    saveOut("stallbook-events-" + todayISO() + ".csv", rows.join("\n"), "text/csv");
  };

  $("#expCashCsv").onclick = () => {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [["date", "kind", "description", "who", "money_in", "money_out", "balance"].join(",")];
    let bal = 0;
    for (const m of cashMoves()) {
      bal += m.amount;
      rows.push([m.date, CASH_GROUP[m.group][0], m.label, m.who || "", m.amount > 0 ? m4(m.amount) : "",
        m.amount < 0 ? m4(-m.amount) : "", m4(bal)].map(q).join(","));
    }
    saveOut("stallbook-cashflow-" + todayISO() + ".csv", rows.join("\n"), "text/csv");
  };

  $("#expGearCsv").onclick = () => {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [["name", "type", "quantity", "cost_each", "total_cost", "bought_on", "bought_from", "condition", "still_using", "note"].join(",")];
    for (const a of S.assets.slice().sort((x, y) => (x.type || "").localeCompare(y.type || "") || x.name.localeCompare(y.name)))
      rows.push([a.name, a.type, a.qty, a.cost, assetTotal(a), a.bought, a.from, condLabel(a.condition),
        a.retired ? "no" : "yes", a.note].map(q).join(","));
    saveOut("stallbook-equipment-" + todayISO() + ".csv", rows.join("\n"), "text/csv");
  };

  $("#expStockCsv").onclick = () => {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const nameOf = id => {
      const it = S.items.find(i => i.id === id); if (it) return it.name;
      const m = matById(id); if (m) return m.name;
      return id;
    };
    const kindOf = id => S.items.some(i => i.id === id) ? "product" : (matById(id) ? "material" : "?");
    const rows = [["kind", "name", "category_or_variant", "date_in", "quantity", "remaining", "unit_cost", "remaining_value", "note"].join(",")];
    for (const l of S.lots.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""))) {
      const id = lotRef(l), m = matById(id);
      rows.push([kindOf(id), nameOf(id), m ? m.category : l.key, l.date, l.qty, l.remaining, l.unitCost,
        l.remaining * (+l.unitCost || 0), l.note].map(q).join(","));
    }
    rows.push("");
    rows.push(["materials_used_date", "event", "product", "material", "quantity", "cost"].join(","));
    for (const sale of S.sales) {
      const c = ctxOf(sale.dayId), d = new Date(sale.ts).toISOString().slice(0, 10);
      for (const l of sale.lines) for (const u of (l.used || []))
        rows.push([d, c.event, l.name, u.name, u.qty, u.cost].map(q).join(","));
    }
    rows.push("");
    rows.push(["write_off_date", "event", "item", "variant", "quantity", "cost", "reason", "undone_on"].join(","));
    for (const w of S.writeoffs) rows.push([w.date, (woEvent(w) || {}).name || "", w.name, w.key, w.qty, w.cost, w.reason,
      w.undone ? new Date(w.undone).toISOString().slice(0, 10) : ""].map(q).join(","));
    rows.push("");
    rows.push(["reversal_date", "event", "item", "variant", "quantity", "went_to", "reason", "cost"].join(","));
    for (const r of S.reversals) {
      const c = ctxOf(r.dayId), d = new Date(r.ts).toISOString().slice(0, 10);
      for (const l of r.lines) rows.push([d, c.event, l.name, l.variant, l.qty,
        l.disposition === "waste" ? "loss" : "back to stock", l.reason, l.cost].map(q).join(","));
    }
    saveOut("stallbook-stock-" + todayISO() + ".csv", rows.join("\n"), "text/csv");
  };
}

/* ---------------------------- cash flow ----------------------------
   Money coming into and going out of the business, by date. Most of it the
   app already knows — takings, materials bought, equipment, stall fees and
   travel. What it can't see is the owners: the cash you started with, money
   you put in later, what you pay yourselves, and the odd expense that isn't
   stock or kit (insurance, a permit). Those are entered here.

   Pre-made batches aren't counted: what they cost came from materials that
   were already counted when they were bought.
   ------------------------------------------------------------------ */
const CASH_KINDS = {
  start: { label: "Starting cash", sign: 1, group: "owner_in" },
  in: { label: "Money put in", sign: 1, group: "owner_in" },
  out: { label: "Paid to owner", sign: -1, group: "owner_out" },
  expense: { label: "Other expense", sign: -1, group: "expense" }
};
/* [name, shown in / out] — the order lines appear in the statement */
const CASH_GROUP = {
  owner_in: ["Money put in", 1], sales: ["Takings", 1], stock: ["Stock bought", -1],
  gear: ["Equipment", -1], stall: ["Stall fees and travel", -1], expense: ["Other expenses", -1],
  owner_out: ["Paid to owners", -1]
};
const cashWho = () => [...new Set(S.cash.map(c => (c.who || "").trim()).filter(Boolean))].sort();

function cashMoves() {
  const out = [];
  for (const c of S.cash) {
    const k = CASH_KINDS[c.kind] || CASH_KINDS.in;
    out.push({ date: c.date, amount: k.sign * (+c.amount || 0), group: k.group, who: c.who || "",
      label: c.note ? k.label + " · " + c.note : k.label, entry: c.id, kind: c.kind });
  }
  const byDay = {};
  for (const s of S.sales) {
    const c = ctxOf(s.dayId);
    const date = c.date || isoOf(new Date(s.ts));
    const k = (s.dayId || "") + "|" + date;
    byDay[k] = byDay[k] || { date, amount: 0, event: c.event };
    byDay[k].amount += +s.total || 0;
  }
  for (const d of Object.values(byDay)) if (d.amount)
    out.push({ date: d.date, amount: d.amount, group: "sales", label: "Takings · " + d.event });
  for (const l of S.lots) {
    const m = matById(lotRef(l));
    const cost = (+l.qty || 0) * (+l.unitCost || 0);
    if (!m || !cost) continue;
    out.push({ date: l.date || isoOf(new Date(l.created || Date.now())), amount: -cost, group: "stock",
      label: "Bought " + (Math.round(l.qty * 100) / 100) + " " + (m.unit || "each") + " " + m.name });
  }
  for (const a of S.assets) {
    const cost = assetTotal(a);
    if (!cost) continue;
    out.push({ date: a.bought || isoOf(new Date(a.created || Date.now())), amount: -cost, group: "gear",
      label: "Equipment · " + a.name + ((+a.qty || 1) > 1 ? " × " + a.qty : "") });
  }
  for (const ev of S.events) for (const a of (ev.apps || [])) {
    const name = ev.name || "Untitled event";
    if (a.status === "paid" && (+a.fee || 0)) out.push({ date: a.paidOn || todayISO(), amount: -(+a.fee), group: "stall", label: "Stall fee · " + name });
    const first = daysOfApp(a.id)[0];
    if (first && appStarted(a) && (+ev.travel || 0)) out.push({ date: first.date, amount: -(+ev.travel), group: "stall", label: "Travel · " + name });
  }
  return out.sort((x, y) => (x.date || "").localeCompare(y.date || "") || y.amount - x.amount);
}
/* what the business has right now — nothing dated in the future */
const cashNow = () => cashMoves().filter(m => m.date <= todayISO()).reduce((a, m) => a + m.amount, 0);

function reportCash() {
  const moves = cashMoves();
  const now = moves.filter(m => m.date <= todayISO()).reduce((a, m) => a + m.amount, 0);
  const before = moves.filter(m => RF.from && m.date < RF.from).reduce((a, m) => a + m.amount, 0);
  const inR = moves.filter(m => inRange(m.date));
  const close = before + inR.reduce((a, m) => a + m.amount, 0);
  const sum = g => inR.filter(m => m.group === g).reduce((a, m) => a + m.amount, 0);
  const trading = ["sales", "stock", "gear", "stall", "expense"].reduce((a, g) => a + sum(g), 0);
  const paid = -sum("owner_out"), putIn = sum("owner_in");
  const hasStart = S.cash.some(c => c.kind === "start");

  const buttons = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      <button class="btn sm auto" id="cashOut">Pay ourselves</button>
      <button class="btn sec sm auto" id="cashIn">${hasStart ? "Put money in" : "Set starting cash"}</button>
      <button class="btn sec sm auto" id="cashExp">Other expense</button>
    </div>`;
  if (!moves.length) return buttons + `<p class="note">Nothing to show yet. Start with the cash the business began with, then takings, stock, equipment and stall fees fill themselves in from the rest of the app.</p>`;

  const rows = Object.entries(CASH_GROUP).map(([g, [name]]) => [name, sum(g)]).filter(([, v]) => Math.abs(v) >= 0.005);
  const line = (label, v, strong) => `<div class="inset"${strong ? ' style="background:var(--green-tint)"' : ""}>
      <span class="b"><span class="n"${strong ? ' style="color:var(--green-deep)"' : ' style="font-weight:600;font-family:var(--body);font-size:16px"'}>${esc(label)}</span></span>
      <span class="r" style="${v < 0 ? "color:var(--warn-ink)" : ""}${strong ? ";font-size:20px" : ""}">${v < 0 ? "−" : (strong ? "" : "+")}${esc(cur(Math.abs(v)))}</span></div>`;

  const who = cashWho();
  const people = who.map(w => {
    const mine = inR.filter(m => m.who === w);
    return [w, mine.filter(m => m.group === "owner_in").reduce((a, m) => a + m.amount, 0),
      -mine.filter(m => m.group === "owner_out").reduce((a, m) => a + m.amount, 0)];
  }).filter(([, i, o]) => i || o);

  /* newest first, each with the balance after it */
  let run = before;
  const ledger = inR.map(m => { run += m.amount; return { ...m, bal: run }; }).reverse();
  const shown = S.cashAll ? ledger : ledger.slice(0, 25);

  return buttons + `
    <div class="kpis">
      <div class="kpi tint big"><div class="k">In the business now</div><div class="v">${now < 0 ? "−" : ""}${esc(cur(Math.abs(now)))}</div>
        <div class="n">${hasStart ? "everything up to today" : "no starting cash set yet"}</div></div>
      <div class="kpi"><div class="k">Paid to owners</div><div class="v">${esc(cur(paid))}</div><div class="n">in these dates</div></div>
      <div class="kpi"><div class="k">Money put in</div><div class="v">${esc(cur(putIn))}</div><div class="n">in these dates</div></div>
      <div class="kpi ${trading < 0 ? "warn" : ""}"><div class="k">From trading</div><div class="v">${trading < 0 ? "−" : ""}${esc(cur(Math.abs(trading)))}</div>
        <div class="n">takings less everything spent</div></div>
    </div>
    ${now < 0 ? `<p class="note" style="color:var(--warn-ink)">More has gone out than the app knows came in. Usually that means the starting cash, or money you put in, hasn't been entered yet.</p>` : ""}

    <div class="sect">Where the money went</div>
    <div class="card">
      ${RF.from ? line("At the start, " + fmtDate(RF.from, true), before) : ""}
      ${rows.map(([n, v]) => line(n, v)).join("")}
      ${line(RF.to && RF.to < todayISO() ? "At the end, " + fmtDate(RF.to, true) : "Left in the business", close, true)}
    </div>

    ${people.length ? `<div class="sect">Each of you</div>
      <div class="card">${people.map(([w, i, o]) => `<div class="inset">
        <span class="b"><span class="n">${esc(w)}</span>
          <span class="s">put in ${esc(cur(i))} · paid ${esc(cur(o))}</span></span>
        <span class="r">${Math.abs(o - i) < 0.005 ? "even" : esc(cur(Math.abs(o - i))) + (o > i ? " net out" : " net in")}</span></div>`).join("")}</div>` : ""}

    <div class="sect">Every movement</div>
    ${ledger.length ? `<div class="card">${shown.map(m => `<${m.entry ? `button data-cashed="${m.entry}"` : "div"} class="inset">
        <span class="fact ${m.amount < 0 ? "warn" : "good"}" style="min-width:92px;text-align:center">${m.amount < 0 ? "−" : "+"}${esc(cur(Math.abs(m.amount)))}</span>
        <span class="b"><span class="n" style="font-size:16px">${esc(m.label)}</span>
          <span class="s">${esc(fmtDate(m.date, true))}${m.who ? " · " + esc(m.who) : ""}${m.date > todayISO() ? " · not yet" : ""}</span></span>
        <span class="r" style="font-size:15px;color:var(--ink-mute)">${m.bal < 0 ? "−" : ""}${esc(cur(Math.abs(m.bal)))}</span>
      </${m.entry ? "button" : "div"}>`).join("")}</div>
      ${ledger.length > 25 ? `<button class="btn ghost" id="cashAll">${S.cashAll ? "Just the latest 25" : "Show all " + ledger.length}</button>` : ""}
      <p class="note" style="margin-top:12px">The right-hand figure is what was left after each one. Tap anything you entered yourself to change it. Takings count cash and card alike.</p>`
      : '<p class="note">Nothing in these dates.</p>'}`;
}

function bindCash(host) {
  $("#cashOut").onclick = () => cashSheet(null, "out");
  $("#cashIn").onclick = () => cashSheet(null, S.cash.some(c => c.kind === "start") ? "in" : "start");
  $("#cashExp").onclick = () => cashSheet(null, "expense");
  if ($("#cashAll")) $("#cashAll").onclick = () => { S.cashAll = !S.cashAll; renderReportBody(); };
  host.querySelectorAll("[data-cashed]").forEach(b => b.onclick = () => cashSheet(S.cash.find(c => c.id === b.dataset.cashed)));
}

function cashSheet(existing, kind) {
  const c = existing ? JSON.parse(JSON.stringify(existing))
    : { id: uid(), kind, date: todayISO(), amount: "", who: S.settings.lastWho || "", note: "", created: Date.now() };
  const owner = () => c.kind !== "expense";
  const heads = { start: "Starting cash", in: "Put money in", out: "Pay ourselves", expense: "Other expense" };
  const others = S.cash.filter(x => x.id !== c.id);
  const balNow = cashNow() - (existing && existing.date <= todayISO() ? (CASH_KINDS[existing.kind].sign * (+existing.amount || 0)) : 0);

  sheet(heads[c.kind], '<div id="cashBody"></div>', [
    { label: existing ? "Save" : "Record it", cls: "btn", id: "cashSave" },
    existing ? { label: "Delete", cls: "btn sec", id: "cashDel" } : null
  ].filter(Boolean), { narrow: true });

  const read = () => {
    c.amount = $("#cAmt").value === "" ? "" : Math.max(0, +$("#cAmt").value || 0);
    c.date = $("#cDate").value || todayISO();
    if ($("#cWho")) c.who = $("#cWho").value.trim();
    c.note = $("#cNote").value.trim();
  };

  const draw = () => {
    const tone = c.kind === "out" || c.kind === "expense";
    $("#cashBody").innerHTML = `
      ${c.kind === "start" || c.kind === "in" ? `<div class="togs even" style="margin-bottom:14px">
        <button class="tog sm" data-ck="start" aria-pressed="${c.kind === "start"}">Starting cash</button>
        <button class="tog sm" data-ck="in" aria-pressed="${c.kind === "in"}">Adding more</button>
      </div>
      <p class="note">${c.kind === "start"
        ? "What the business had on day one — the float, and anything already in its account."
        : "Money you've put in from your own pocket since — to buy stock, cover a fee, or top up the float."}
        ${c.kind === "start" && others.some(x => x.kind === "start") ? " <b>There's already a starting figure</b> — this one adds to it." : ""}</p>` : ""}
      ${c.kind === "out" ? `<p class="note">Profit you're taking out for yourselves. It isn't a cost of the business — it doesn't change what anything made — it just leaves the kitty.</p>` : ""}
      ${c.kind === "expense" ? `<p class="note">Something the business paid for that isn't stock, equipment or a stall fee — insurance, a permit, card-reader fees.</p>` : ""}
      ${tone ? `<div class="kpi tint" style="margin-bottom:14px"><div class="k">In the business right now</div>
        <div class="v sm">${balNow < 0 ? "−" : ""}${esc(cur(Math.abs(balNow)))}</div></div>` : ""}
      <div class="rowf">
        <label class="f"><span class="t">How much</span>
          <input type="number" id="cAmt" inputmode="decimal" step="0.01" min="0" value="${esc(c.amount)}" placeholder="200.00"></label>
        <label class="f"><span class="t">When</span><input type="date" id="cDate" value="${esc(c.date)}"></label>
      </div>
      ${owner() ? `<label class="f"><span class="t">${c.kind === "out" ? "Paid to" : "From"}</span>
        <input type="text" id="cWho" list="cWhoList" value="${esc(c.who)}" placeholder="Naomi" autocomplete="off">
        <datalist id="cWhoList">${cashWho().map(w => `<option value="${esc(w)}"></option>`).join("")}</datalist></label>` : ""}
      <label class="f" style="margin-bottom:0"><span class="t">Note</span>
        <input type="text" id="cNote" value="${esc(c.note)}" placeholder="${c.kind === "expense" ? "Public liability insurance" : (c.kind === "out" ? "Spring markets" : "Float for the till")}"></label>`;
    document.querySelectorAll("[data-ck]").forEach(b => b.onclick = () => { read(); c.kind = b.dataset.ck; draw(); });
  };
  draw();

  $("#cashSave").onclick = async () => {
    read();
    if (!(+c.amount > 0)) { alert("How much?"); return; }
    const go = async () => {
      if (owner() && c.who) S.settings.lastWho = c.who;
      const i = S.cash.findIndex(x => x.id === c.id);
      if (i >= 0) S.cash[i] = c; else S.cash.push(c);
      await saveCash(); await saveSettings();
      closeSheet(); renderReports(); renderData();
      toast(existing ? "Saved" : (c.kind === "out" ? cur(c.amount) + " paid" + (c.who ? " to " + c.who : " out")
        : c.kind === "expense" ? cur(c.amount) + " expense recorded" : cur(c.amount) + " put in"));
    };
    if (c.kind === "out" && c.date <= todayISO() && +c.amount > balNow + 0.005)
      confirmAsk({
        title: "More than the business has",
        body: `The app only knows of ${esc(cur(Math.max(0, balNow)))} in the business. If that's wrong, the starting cash or something you put in is probably missing. Record it anyway?`,
        yes: "Record it", no: "Go back", danger: false, onYes: go
      });
    else go();
  };

  if ($("#cashDel")) $("#cashDel").onclick = () => confirmAsk({
    title: "Delete this?",
    body: `${esc(CASH_KINDS[existing.kind].label)} of ${esc(cur(+existing.amount || 0))} on ${esc(fmtDate(existing.date, true))}. You can put it back from <b>Safe → Recently deleted</b>.`,
    onYes: async () => {
      await trashPut("cash", CASH_KINDS[existing.kind].label + " " + cur(+existing.amount || 0),
        fmtDate(existing.date, true) + (existing.who ? " · " + existing.who : ""), { entry: existing });
      S.cash = S.cash.filter(x => x.id !== existing.id);
      await saveCash();
      closeSheet(); renderReports(); renderData();
      toast("Deleted", "Undo", () => restoreTrash(S.trash[0].id));
    }
  });
}

/* ---------------------------- equipment ----------------------------
   The things the stall is built from — table, cloth, stands, signs, the
   gazebo. Bought once, used every market, never sold. Kept apart from
   Inventory on purpose: nothing here has batches, FIFO cost or write-offs,
   and none of it touches the cost of what you sell.
   ------------------------------------------------------------------ */
const ASSET_TYPES_START = ["Coverings", "Displays", "Furniture", "Shelter", "Signage", "Tech and payments"];
const assetTypes = () => S.settings.assetTypes || ASSET_TYPES_START.slice();
const CONDITIONS = [["good", "Good"], ["worn", "Showing wear"], ["fix", "Needs fixing"]];
const condLabel = k => (CONDITIONS.find(c => c[0] === k) || CONDITIONS[0])[1];
const assetTotal = a => Math.round((+a.qty || 0) * (+a.cost || 0) * 100) / 100;
const assetById = id => S.assets.find(a => a.id === id) || null;

function assetCard(a) {
  const qty = +a.qty || 1;
  const chips = [];
  if (a.condition === "fix") chips.push('<span class="chip">Needs fixing</span>');
  if (a.condition === "worn") chips.push('<span class="chip neutral">Showing wear</span>');
  const bits = [a.bought ? "bought " + fmtDate(a.bought, true) : "", a.from || ""].filter(Boolean).join("<br>");
  return `<button class="pcard ${a.retired ? "off" : ""}" data-asset="${a.id}">
    ${thumb(a, "sw", true)}
    <span class="nm">${esc(a.name)}</span>
    ${qty > 1 ? `<span class="big">${qty} of them</span>` : ""}
    ${bits ? `<span class="s">${bits.split("<br>").map(esc).join("<br>")}</span>` : ""}
    ${chips.length ? `<span class="chips">${chips.join("")}</span>` : ""}
    <span class="pill">${(+a.cost || 0) ? esc(cur(assetTotal(a))) : "no cost"}</span>
  </button>`;
}

function renderGear() {
  const p = $("#pGear");
  if (!p) return;
  const q = S.gearQ || "";
  const match = a => hits(q, a.name, a.type, a.from, a.note);
  const live = S.assets.filter(a => !a.retired);
  const retired = S.assets.filter(a => a.retired && match(a)).sort((a, b) => a.name.localeCompare(b.name));
  const spent = live.reduce((x, a) => x + assetTotal(a), 0);
  const pieces = live.reduce((x, a) => x + (+a.qty || 1), 0);
  const fix = live.filter(a => a.condition === "fix");

  const byType = {};
  for (const t of assetTypes()) byType[t] = [];
  for (const a of live) (byType[a.type || "Other"] ||= []).push(a);
  const groups = Object.entries(byType)
    .map(([t, as]) => [t, as.filter(match)])
    .filter(([, as]) => as.length)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const found = groups.reduce((x, [, as]) => x + as.length, 0);

  p.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      ${searchBox("gearSearch", q, "Search equipment")}
      <span style="flex:1"></span>
      <button class="btn sec sm auto" id="gearTypes">Types</button>
      <button class="btn sm auto" id="addGear">+ Add equipment</button>
    </div>
    ${S.assets.length ? `<div class="kpis">
      <div class="kpi"><div class="k">Pieces in use</div><div class="v">${pieces}</div>
        <div class="n">${live.length} ${live.length === 1 ? "entry" : "entries"}${S.assets.some(a => a.retired) ? " · " + S.assets.filter(a => a.retired).length + " retired" : ""}</div></div>
      <div class="kpi"><div class="k">Spent on it</div><div class="v">${esc(cur(spent))}</div>
        <div class="n">what the kit in use cost you</div></div>
      <div class="kpi ${fix.length ? "warn" : ""}"><div class="k">Needs fixing</div>
        <div class="v">${fix.length || "None"}</div>
        <div class="n">${fix.length ? esc(fix.map(a => a.name).slice(0, 2).join(", ")) + (fix.length > 2 ? " and more" : "") : "all in working order"}</div></div>
    </div>` : `<p class="note">Equipment is what the stall is built from — the table, the cloth, display stands, signs, the gazebo. It's never sold, so it lives here rather than in Inventory and doesn't touch the cost of anything you make.</p>`}
    ${q && !found && !retired.length ? `<p class="note">Nothing matches "${esc(q)}".</p>` : ""}
    ${groups.map(([t, as]) => `
      <div class="typehead">
        <span class="sect" style="margin:0">${esc(t)}</span>
      </div>
      ${as.length ? `<div class="pgrid">${as.sort((a, b) => a.name.localeCompare(b.name)).map(assetCard).join("")}</div>`
        : `<p class="note">${q ? "Nothing here matches." : "Nothing under this type yet."}</p>`}`).join("")}
    ${retired.length ? `
      <button class="typehead" id="toggleRetired" style="width:100%;margin-top:26px">
        <span class="sect" style="margin:0;color:var(--ink-mute)">Retired · ${retired.length}</span>
        <span class="tlink">${S.showRetired ? "Hide" : "Show"}</span>
      </button>
      ${S.showRetired ? `<div class="pgrid">${retired.map(assetCard).join("")}</div>` : ""}` : ""}`;

  const sb = $("#gearSearch");
  if (sb) {
    sb.oninput = () => { S.gearQ = sb.value; renderGear(); };
    if (q) { sb.focus(); sb.setSelectionRange(q.length, q.length); }
  }
  $("#addGear").onclick = () => assetSheet(null);
  $("#gearTypes").onclick = () => assetTypeSheet();
  if ($("#toggleRetired")) $("#toggleRetired").onclick = () => { S.showRetired = !S.showRetired; renderGear(); };
  p.querySelectorAll("[data-asset]").forEach(b => b.onclick = () => assetSheet(assetById(b.dataset.asset)));
}

function deleteAssetType(t, after) {
  confirmAsk({
    title: "Delete " + t + "?",
    body: "Nothing is filed under it. You can put it back from <b>Safe → Recently deleted</b>.",
    onYes: async () => {
      await trashPut("assetType", t, "type of equipment", { name: t });
      S.settings.assetTypes = assetTypes().filter(x => x !== t);
      await saveSettings();
      after(); renderGear(); renderData();
      toast(t + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
    }
  });
}

function assetTypeSheet() {
  const draw = () => {
    sheet("Types of equipment", `
      <p class="note">Only for grouping the Equipment screen. Rename freely — nothing else depends on them.</p>
      <div class="card">${assetTypes().slice().sort().map(t => {
        const n = S.assets.filter(a => a.type === t).length;
        return `<div class="inset">
          <span class="b"><span class="n">${esc(t)}</span><span class="s">${n} piece${n === 1 ? "" : "s"}</span></span>
          ${n ? "" : `<button class="xbtn" data-gtx="${esc(t)}" aria-label="Delete ${esc(t)}">✕</button>`}
        </div>`;
      }).join("") || '<p class="note" style="margin:0">No types yet.</p>'}</div>
      <label class="f" style="margin-top:14px"><span class="t">Add a type</span>
        <div style="display:flex;gap:10px">
          <input type="text" id="newGt" placeholder="Lighting" style="flex:1">
          <button class="btn sec sm auto" id="addGt">Add</button>
        </div></label>`, null, { narrow: true });
    $("#addGt").onclick = async () => {
      const v = $("#newGt").value.trim();
      if (!v) return;
      if (assetTypes().includes(v)) { toast("Already there"); return; }
      S.settings.assetTypes = assetTypes().concat([v]).sort();
      await saveSettings(); draw(); renderGear();
      toast(v + " added");
    };
    document.querySelectorAll("[data-gtx]").forEach(b => b.onclick = () => deleteAssetType(b.dataset.gtx, draw));
  };
  draw();
}

function assetSheet(existing) {
  const a = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), name: "", type: assetTypes()[0] || "", qty: 1, cost: "", bought: todayISO(),
    from: "", condition: "good", retired: false, photo: "", note: "", created: Date.now()
  };
  let newType = !assetTypes().length;

  sheet(existing ? esc(a.name || "Equipment") : "New equipment", '<div id="gearBody"></div>', [
    { label: existing ? "Save" : "Add it", cls: "btn", id: "gearSave" },
    existing ? { label: "Delete", cls: "btn sec", id: "gearDel" } : null
  ].filter(Boolean));

  const read = () => {
    if (!$("#gName")) return;
    a.name = $("#gName").value;
    if ($("#gTypeNew")) a.type = $("#gTypeNew").value;
    else if ($("#gType") && $("#gType").value !== "__new") a.type = $("#gType").value;
    a.qty = Math.max(1, Math.round(+$("#gQty").value || 1));
    a.cost = $("#gCost").value === "" ? "" : Math.max(0, +$("#gCost").value || 0);
    a.bought = $("#gBought").value;
    a.from = $("#gFrom").value;
    a.note = $("#gNote").value;
  };

  const draw = () => {
    $("#gearBody").innerHTML = `
      <div class="rowf">
        <label class="f"><span class="t">Name</span>
          <input type="text" id="gName" value="${esc(a.name)}" placeholder="6 ft folding table"></label>
        <label class="f"><span class="t">Type</span><span id="gTypeBox"></span></label>
      </div>
      <label class="f"><span class="t">Photo</span>
        <div class="rowf" style="align-items:center">
          <span class="av" id="gPrev" style="flex:0 0 64px;min-width:0;${a.photo ? `background-image:url('${a.photo}')` : ""}"></span>
          <input type="file" id="gFile" accept="image/*" style="flex:1;border:0;padding:0;background:none">
          <button class="xbtn" id="gAdjust" aria-label="Move or zoom the photo" title="Move or zoom" style="flex:0 0 44px;min-width:0"${a.photo ? "" : " hidden"}>${ICON_CROP}</button>
          <button class="xbtn" id="gClearPhoto" aria-label="Remove photo" style="flex:0 0 44px;min-width:0">✕</button>
        </div></label>
      <div class="rowf">
        <label class="f"><span class="t">How many</span>
          <input type="number" id="gQty" inputmode="numeric" step="1" min="1" value="${esc(a.qty || 1)}"></label>
        <label class="f"><span class="t">Cost each</span>
          <input type="number" id="gCost" inputmode="decimal" step="0.01" min="0" value="${esc(a.cost)}" placeholder="45.00"></label>
        <label class="f"><span class="t">Bought on</span>
          <input type="date" id="gBought" value="${esc(a.bought)}"></label>
      </div>
      <p class="note" id="gTotal" style="margin:-4px 0 14px"></p>
      <label class="f"><span class="t">Where from</span>
        <input type="text" id="gFrom" value="${esc(a.from)}" placeholder="Walmart, Amazon, handmade"></label>
      <span class="t" style="display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:6px">Condition</span>
      <div class="togs" style="margin-bottom:14px">
        ${CONDITIONS.map(([k, l]) => `<button class="tog sm" data-cond="${k}" aria-pressed="${a.condition === k}">${l}</button>`).join("")}
      </div>
      <label class="f"><span class="t">Note</span>
        <textarea id="gNote" placeholder="Leg wobbles — pack the shim">${esc(a.note)}</textarea></label>
      <span class="t" style="display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:6px">Still using it?</span>
      <div class="togs even" style="max-width:300px">
        <button class="tog sm" id="gOn" aria-pressed="${!a.retired}">In use</button>
        <button class="tog sm" id="gOff" aria-pressed="${!!a.retired}">Retired</button>
      </div>`;
    bind();
  };

  const showTotal = () => {
    const q = Math.max(1, Math.round(+$("#gQty").value || 1)), c = +$("#gCost").value || 0;
    $("#gTotal").textContent = q > 1 && c ? q + " × " + cur(c) + " = " + cur(q * c) + " altogether" : "";
  };

  const bind = () => {
    const drawType = () => {
      const box = $("#gTypeBox");
      const types = assetTypes().slice().sort();
      box.innerHTML = newType
        ? `<div style="display:flex;gap:8px">
             <input type="text" id="gTypeNew" value="${esc(a.type)}" placeholder="Displays" style="flex:1">
             ${types.length ? '<button class="xbtn" id="gTypeBack" aria-label="Pick an existing type">↩</button>' : ""}
           </div>`
        : `<select id="gType">
             ${types.map(t => `<option value="${esc(t)}" ${t === a.type ? "selected" : ""}>${esc(t)}</option>`).join("")}
             <option value="__new">+ New type…</option>
           </select>`;
      if (newType) {
        $("#gTypeNew").oninput = e => a.type = e.target.value;
        if ($("#gTypeBack")) $("#gTypeBack").onclick = () => { newType = false; a.type = types[0] || ""; drawType(); };
      } else {
        $("#gType").onchange = e => {
          if (e.target.value === "__new") { newType = true; a.type = ""; drawType(); setTimeout(() => $("#gTypeNew").focus(), 30); }
          else a.type = e.target.value;
        };
      }
    };
    drawType();
    $("#gQty").oninput = showTotal;
    $("#gCost").oninput = showTotal;
    showTotal();
    wirePhoto(a, "g");
    document.querySelectorAll("[data-cond]").forEach(b => b.onclick = () => { read(); a.condition = b.dataset.cond; draw(); });
    $("#gOn").onclick = () => { read(); a.retired = false; draw(); };
    $("#gOff").onclick = () => { read(); a.retired = true; draw(); };
  };

  draw();

  $("#gearSave").onclick = async () => {
    read();
    a.name = (a.name || "").trim();
    a.type = (a.type || "").trim();
    a.from = (a.from || "").trim();
    a.note = (a.note || "").trim();
    if (!a.name) { alert("Give it a name."); return; }
    if (!a.type) a.type = "Other";
    if (!assetTypes().includes(a.type)) {
      S.settings.assetTypes = assetTypes().concat([a.type]).sort();
      await saveSettings();
    } else if (!S.settings.assetTypes) {
      S.settings.assetTypes = assetTypes(); await saveSettings();
    }
    const i = S.assets.findIndex(x => x.id === a.id);
    if (i >= 0) S.assets[i] = a; else S.assets.push(a);
    await saveAssets();
    closeSheet(); renderGear();
    toast(existing ? a.name + " saved" : a.name + " added");
  };

  if ($("#gearDel")) $("#gearDel").onclick = () => {
    confirmAsk({
      title: "Delete " + (a.name || "this") + "?",
      body: "If you've stopped using it, <b>Retired</b> keeps the record instead. Deleting can be undone from <b>Safe → Recently deleted</b>.",
      onYes: async () => {
        await trashPut("asset", existing.name || "Equipment", (existing.type || "") + ((+existing.cost || 0) ? " · " + cur(assetTotal(existing)) : ""), { asset: existing });
        S.assets = S.assets.filter(x => x.id !== existing.id);
        await saveAssets();
        closeSheet(); renderGear(); renderData();
        toast((existing.name || "Equipment") + " deleted", "Undo", () => restoreTrash(S.trash[0].id));
      }
    });
  };
}

/* ---------------------------- photo framing ----------------------------
   A picked photo is kept twice: photoFull (the whole picture, up to 1200px)
   and photo (the square the cards show). photoFrame remembers where the
   square sits — zoom z (1 = whole short side fits) and centre cx/cy as
   fractions of the picture — so reopening the framer starts where you left
   it and re-framing never loses the edges of the original. Photos saved
   before this existed have no photoFull; their current square becomes the
   "whole picture" the first time they're adjusted. */
function wirePhoto(obj, p) {
  const prev = $(`#${p}Prev`), file = $(`#${p}File`), clr = $(`#${p}ClearPhoto`), adj = $(`#${p}Adjust`);
  if (!prev) return;
  const show = () => {
    prev.style.backgroundImage = obj.photo ? `url('${obj.photo}')` : "";
    if (adj) adj.hidden = !obj.photo;
  };
  const adjust = async () => {
    if (!obj.photo) return;
    const src = obj.photoFull || obj.photo;
    const r = await cropPhoto(src, obj.photoFull ? obj.photoFrame : null);
    if (!r) return;
    obj.photoFull = src; obj.photo = r.photo; obj.photoFrame = r.frame; show();
  };
  // the preview sits inside the Photo label, so a tap on it would normally open
  // the file picker; with a photo already there it opens the framer instead
  prev.style.cursor = "pointer";
  prev.onclick = e => { if (obj.photo) { e.preventDefault(); adjust(); } };
  if (adj) adj.onclick = e => { e.preventDefault(); adjust(); };
  if (clr) clr.onclick = e => {
    e.preventDefault();
    obj.photo = ""; delete obj.photoFull; delete obj.photoFrame; show();
  };
  if (file) file.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = "";   // lets the same picture be picked again
    const full = await shrink(f, 1200, 0.82);
    if (!full) { toast("That picture couldn't be opened — try a JPEG or PNG"); return; }
    const r = await cropPhoto(full, null);
    if (!r) return;        // cancelled: keep whatever was there before
    obj.photoFull = full; obj.photo = r.photo; obj.photoFrame = r.frame; show();
  };
}

function cropPhoto(src, frame) {
  return new Promise(resolve => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => openCropper(img, src, frame, resolve);
    img.src = src;
  });
}

function openCropper(img, src, frame, resolve) {
  const W = img.naturalWidth, H = img.naturalHeight, mn = Math.min(W, H);
  const MAXZ = 5, OUT = 600;
  const MINZ = mn / Math.max(W, H);              // zoomed out far enough to see the whole picture
  const start = { z: 1, cx: 0.5, cy: 0.5 };
  let f = { ...start, ...(frame || {}) };

  const w = document.createElement("div");
  w.className = "scrim confirm cropper";
  w.innerHTML = `<div class="sheet narrow" role="dialog" aria-modal="true" aria-label="Frame the photo">
    <div class="shead"><h3>Frame the photo</h3>
      <button class="pebble lg" data-x aria-label="Cancel">${ICON.close}</button></div>
    <div class="sbody">
      <div class="cropbox"><img alt="" draggable="false"></div>
      <div class="cropzoom">
        <button class="xbtn" data-zo aria-label="Zoom out">−</button>
        <input type="range" min="${MINZ}" max="${MAXZ}" step="0.01" aria-label="Zoom">
        <button class="xbtn" data-zi aria-label="Zoom in">+</button>
      </div>
      <p class="note cropnote">Drag to move the picture, pinch or use the slider to zoom. What's in the square is what the card shows.</p>
    </div>
    <div class="sfoot stack">
      <button class="btn sec" data-all>Show it all</button>
      <button class="btn sec" data-reset>Fill the square</button>
      <button class="btn" data-use>Use this</button>
    </div>
  </div>`;
  document.body.appendChild(w);
  const box = w.querySelector(".cropbox"), el = box.querySelector("img"), zr = w.querySelector("input[type=range]");
  el.src = src;

  const V = () => box.clientWidth || 300;
  const scale = () => f.z * V() / mn;           // screen px per picture px
  const clamp = () => {
    f.z = Math.min(MAXZ, Math.max(MINZ, f.z));
    const half = mn / f.z / 2;                    // half the square's side, in picture px
    // an edge of the picture can't come inside the square — unless the picture
    // is narrower than the square that way, and then it just sits in the middle
    f.cx = half * 2 >= W ? 0.5 : Math.min(1 - half / W, Math.max(half / W, f.cx));
    f.cy = half * 2 >= H ? 0.5 : Math.min(1 - half / H, Math.max(half / H, f.cy));
  };
  const paint = () => {
    clamp();
    const s = scale(), v = V();
    el.style.width = W * s + "px"; el.style.height = H * s + "px";
    el.style.transform = `translate(${v / 2 - f.cx * W * s}px, ${v / 2 - f.cy * H * s}px)`;
    zr.value = f.z;
  };
  // zoom keeping the picture point under (px,py) — box coords — where it is
  const zoomAt = (nz, px, py) => {
    const v = V(), s0 = scale();
    const ix = f.cx * W + (px - v / 2) / s0, iy = f.cy * H + (py - v / 2) / s0;
    f.z = Math.min(MAXZ, Math.max(MINZ, nz));
    const s1 = scale();
    f.cx = (ix - (px - v / 2) / s1) / W; f.cy = (iy - (py - v / 2) / s1) / H;
    paint();
  };

  const pts = new Map();
  let g = null;   // gesture start
  const snap = () => {
    const r = box.getBoundingClientRect(), a = [...pts.values()];
    const mx = a.reduce((t, p) => t + p.x, 0) / a.length - r.left;
    const my = a.reduce((t, p) => t + p.y, 0) / a.length - r.top;
    const d = a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
    return { mx, my, d };
  };
  const begin = () => { g = { ...snap(), f: { ...f } }; };
  box.addEventListener("pointerdown", e => {
    box.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); begin();
  });
  box.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = snap();
    f = { ...g.f };
    if (now.d && g.d) zoomAt(g.f.z * now.d / g.d, g.mx, g.my);
    const s = scale();
    f.cx -= (now.mx - g.mx) / s / W; f.cy -= (now.my - g.my) / s / H;
    paint();
  });
  const lift = e => { pts.delete(e.pointerId); if (pts.size) begin(); else g = null; };
  box.addEventListener("pointerup", lift);
  box.addEventListener("pointercancel", lift);
  box.addEventListener("wheel", e => {
    e.preventDefault();
    const r = box.getBoundingClientRect();
    zoomAt(f.z * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  zr.oninput = () => zoomAt(+zr.value, V() / 2, V() / 2);
  w.querySelector("[data-zo]").onclick = () => zoomAt(f.z / 1.25, V() / 2, V() / 2);
  w.querySelector("[data-zi]").onclick = () => zoomAt(f.z * 1.25, V() / 2, V() / 2);
  w.querySelector("[data-reset]").onclick = () => { f = { ...start }; paint(); };
  w.querySelector("[data-all]").onclick = () => { f = { z: MINZ, cx: 0.5, cy: 0.5 }; paint(); };

  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); done(null); } };
  const onResize = () => paint();
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  function done(result) {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    w.remove(); resolve(result);
  }
  w.querySelector("[data-x]").onclick = () => done(null);
  w.addEventListener("click", e => { if (e.target === w) done(null); });
  w.querySelector("[data-use]").onclick = () => {
    clamp();
    const side = mn / f.z, o = Math.max(1, Math.min(OUT, Math.round(side)));
    const c = document.createElement("canvas");
    c.width = c.height = o;
    const k = o / side, x = c.getContext("2d");
    x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--sand").trim() || "#f3efe6";
    x.fillRect(0, 0, o, o);                     // shows around a zoomed-out picture
    x.drawImage(img, (side / 2 - f.cx * W) * k, (side / 2 - f.cy * H) * k, W * k, H * k);
    const r4 = n => Math.round(n * 10000) / 10000;
    done({ photo: c.toDataURL("image/jpeg", 0.82), frame: { z: r4(f.z), cx: r4(f.cx), cy: r4(f.cy) } });
  };
  requestAnimationFrame(paint);
  if (el.complete) paint(); else el.onload = paint;
}

/* ---------------------------- sheet + toast ---------------------------- */
function sheet(title, body, buttons, opts) {
  opts = opts || {};
  closeSheet();
  $("#toasts").innerHTML = "";
  const foot = opts.foot
    ? `<div class="sfoot">
         <span class="lt"><span class="k">That's</span><span class="v" id="footValue">—</span>
           <span class="n" id="footNote" style="font-size:13px;color:var(--ink-mute)"></span></span>
         ${(opts.extra || []).map(b => `<button class="${b.cls}" id="${b.id}">${b.label}</button>`).join("")}
         ${(buttons || []).map(b => `<button class="${b.cls}" id="${b.id}">${b.label}</button>`).join("")}
       </div>`
    : (buttons && buttons.length
        ? `<div class="sfoot stack">${buttons.map(b => `<button class="${b.cls}" id="${b.id}">${b.label}</button>`).join("")}</div>`
        : "");
  const w = document.createElement("div");
  w.className = "scrim";
  w.innerHTML = `<div class="sheet ${opts.narrow ? "narrow" : ""}" role="dialog" aria-modal="true">
    <div class="shead">
      ${opts.thumb ? thumb(opts.thumb, "sw") : ""}
      <h3>${title}</h3>
      <button class="pebble lg" data-close aria-label="Close">${ICON.close}</button>
    </div>
    <div class="sbody">${body}</div>
    ${foot}
  </div>`;
  w.addEventListener("click", e => { if (e.target === w) closeSheet(); });
  w.querySelector("[data-close]").onclick = closeSheet;
  $("#modals").appendChild(w);
}
function closeSheet() { $("#modals").innerHTML = ""; }

let toastTimer = null;
function toast(msg, actionLabel, action) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (actionLabel) {
    const b = document.createElement("button");
    b.textContent = actionLabel;
    b.onclick = () => { t.remove(); action(); };
    t.appendChild(b);
  }
  clearTimeout(toastTimer);
  $("#toasts").innerHTML = "";
  $("#toasts").appendChild(t);
  toastTimer = setTimeout(() => t.remove(), actionLabel ? 6000 : 2200);
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
