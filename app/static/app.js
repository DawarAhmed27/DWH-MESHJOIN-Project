/* MESHJOIN Control Room - front end. Talks to app/server.py. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? "—" :
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const C = { online: "#2F6FD6", periodic: "#D98419", shed: "#C2453A", accent: "#155263", ok: "#2B8A57", line: "#DDE2E0", muted: "#5D6975", ink: "#16202A" };

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(text) {
  const t = $("#toast"); t.textContent = text; t.classList.add("on");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2600);
}
function setSeg(el, v) { $$("button", el).forEach(b => b.classList.toggle("on", b.dataset.v === v)); }

let ST = null;          // last status
let charts = {};

/* ================= navigation ================= */
const PAGES = {
  overview: ["Overview", "Online Retail, 1 Dec 2010 – 9 Dec 2011"],
  setup: ["Setup", "Connection, settings and data preparation (PDF Section 9, steps 1–2)"],
  live: ["Live run", "OnlineThread, PeriodicThread, MeshJoinThread and the loader (steps 3–5)"],
  dw: ["Data warehouse", "Star schema and working tables"],
  analysis: ["Analysis", "Queries-DW.sql: slicing, dicing, drill-down, ROLLUP, view, materialized view"],
  checks: ["Checks", "Independent verification of the load"],
};
function go(page) {
  $$(".page").forEach(p => p.classList.toggle("on", p.id === "p-" + page));
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.page === page));
  $("#pageTitle").textContent = PAGES[page][0];
  $("#pageSub").textContent = PAGES[page][1];
  $("#view").scrollTop = 0;
  go.current = page;
  try { localStorage.setItem("page", page); } catch (e) {}
  if (page === "overview") loadOverview();
  if (page === "dw") loadSchema();
  if (page === "analysis" && !QUERIES.length) loadQueries();
}
$$("#nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });

/* ================= overview: metro map ================= */
function drawMetro() {
  const svg = $("#metro");
  // pos: "above" | "below" | "below-l" (text ends at the station) | "below-r" (text starts at the station)
  const st = (x, y, label, sub, page, pos, color = C.accent, r = 11) => {
    const up = pos === "above";
    const anchor = pos === "below-l" ? "end" : (pos === "below-r" ? "start" : "middle");
    const tx = pos === "below-l" ? x + 14 : (pos === "below-r" ? x - 14 : x);
    const y1 = up ? y - 36 : y + 34, y2 = up ? y - 20 : y + 50;
    return `<g class="st" data-go="${page}" tabindex="0"><circle class="o" cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${color}" stroke-width="4"/>
     <circle cx="${x}" cy="${y}" r="${r - 6}" fill="${color}"/>
     <text x="${tx}" y="${y1}" text-anchor="${anchor}" font-size="14" font-weight="600" fill="${C.ink}">${label}</text>
     <text x="${tx}" y="${y2}" text-anchor="${anchor}" font-size="12" fill="${C.muted}">${sub}</text></g>`;
  };
  svg.setAttribute("viewBox", "0 0 1200 250");
  svg.innerHTML = `
    <path d="M60 115 H300" stroke="${C.accent}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M300 115 C340 115 340 55 380 55 H520 C560 55 560 115 600 115" stroke="${C.online}" stroke-width="7" fill="none"/>
    <path d="M300 115 C340 115 340 175 380 175 H520 C560 175 560 115 600 115" stroke="${C.periodic}" stroke-width="7" fill="none"/>
    <path d="M600 115 H1140" stroke="${C.accent}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M500 175 C560 205 600 222 650 222 H680 C722 222 734 170 736 130" stroke="${C.shed}" stroke-width="4" fill="none" stroke-dasharray="7 6"/>
    <text x="590" y="244" text-anchor="middle" font-size="12" fill="${C.shed}" font-weight="600">shed_table: peak &rarr; read back in non-peak</text>
    <path d="M818 178 C812 150 790 128 754 120" stroke="#7D8A96" stroke-width="4" fill="none" stroke-dasharray="2 7" stroke-linecap="round"/>
    <rect x="790" y="178" width="56" height="22" rx="5" fill="#EEF1EF" stroke="#C7CFCD"/>
    <text x="818" y="193" text-anchor="middle" font-size="11" fill="${C.muted}" font-weight="600">disk</text>
    <text x="818" y="218" text-anchor="middle" font-size="12" fill="${C.muted}">Master Data</text>
    <text x="818" y="234" text-anchor="middle" font-size="12" fill="${C.muted}">9 + 8 partitions of 500</text>
    ${st(60, 115, "Online Retail.xlsx", "541,909 rows", "setup", "below")}
    ${st(165, 115, "Cleaning", "4 rules → 397,884", "setup", "below")}
    ${st(300, 115, "sales_mode", "MD5 per cart", "setup", "below-l")}
    ${st(450, 55, "Online stream", "278,740 · 80/s", "live", "above", C.online)}
    ${st(450, 175, "48 hourly groups", "119,144 · 1 per hour", "live", "below-l", C.periodic)}
    ${st(600, 115, "Stream buffer", "≤ 1,000, online first", "live", "below-r")}
    ${st(740, 115, "MESHJOIN", "chunk 500 · cycle 9", "live", "above", C.accent, 15)}
    ${st(900, 115, "Loader", "dimensions first", "live", "above")}
    ${st(1020, 115, "Star schema", "5 dims + fact", "dw", "below")}
    ${st(1140, 115, "Q1–Q20", "OLAP + view + MV", "analysis", "above")}`;
  $$("#metro .st").forEach(g => g.addEventListener("keydown", e => { if (e.key === "Enter") go(g.dataset.go); }));
}

async function loadOverview() {
  if (!ST || !ST.connected) return;
  let o;
  try { o = await api("/api/overview"); } catch (e) { return; }
  if (o.error || !o.kpi) { $("#k-rows-s").textContent = "the DW is not loaded yet"; return; }
  $("#k-rows").textContent = fmt(o.kpi.rows);
  $("#k-rows-s").textContent = "one row per transaction line";
  $("#k-rev").textContent = fmt(o.kpi.revenue, 0);
  $("#k-carts").textContent = fmt(o.kpi.carts);
  $("#k-dates").innerHTML = o.dates[0] ? `${o.dates[0].slice(0, 10)}<br>→ ${o.dates[1].slice(0, 10)}` : "—";
  chart("c-month", "bar", o.monthly.map(m => m.label), [{ data: o.monthly.map(m => m.value), backgroundColor: C.accent, borderRadius: 4 }]);
  const tot = Object.values(o.modes).reduce((a, b) => a + b, 0) || 1;
  const col = { Live: C.online, Periodic: C.periodic, Shed: C.shed };
  $("#modeSplit").innerHTML = `<div class="bar" style="height:18px">${["Live", "Periodic", "Shed"].map(k =>
      `<i style="width:${100 * (o.modes[k] || 0) / tot}%;background:${col[k]}"></i>`).join("")}</div>
    <div class="legend" style="margin-top:8px">${["Live", "Periodic", "Shed"].map(k =>
      `<span><i style="background:${col[k]}"></i>${k} <b class="num">${fmt(o.modes[k] || 0)}</b></span>`).join("")}</div>`;
  const max = Math.max(...o.stores.map(s => s.value), 1);
  $("#storeBars").innerHTML = o.stores.map(s => `<div><div class="row small" style="justify-content:space-between"><span>${s.label}</span><b class="num">${fmt(s.value)}</b></div>
      <div class="bar"><i style="width:${100 * s.value / max}%;background:${s.label === "Online" ? C.online : C.periodic}"></i></div></div>`).join("");
}

function chart(id, type, labels, datasets, extra = {}) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($("#" + id), {
    type, data: { labels, datasets },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 10, color: C.muted } } },
      scales: { x: { grid: { display: false }, ticks: { color: C.muted, maxRotation: 0, autoSkip: true } },
                y: { grid: { color: "#EEF1EF" }, ticks: { color: C.muted, callback: v => fmt(v) } } },
    }, extra),
  });
}

/* ================= setup ================= */
const PRESETS = {
  pdf: [80, 10, 60, "The settings of the project statement. A full run takes more than an hour."],
  demo: [300, 30, 10, "For a live demo: a group every 10 s, big enough to shed in peak, slow enough to watch."],
  quick: [5000, 2000, 2, "Loads everything in about 3–5 minutes (type non-peak after 48 groups to empty the shed table)."],
};
$$("[data-preset]").forEach(b => b.addEventListener("click", () => {
  const [p, n, h, note] = PRESETS[b.dataset.preset];
  $("#s-peak").value = p; $("#s-nonpeak").value = n; $("#s-hour").value = h; $("#presetNote").textContent = note;
}));
$$("#s-mode button").forEach(b => b.addEventListener("click", () => setSeg($("#s-mode"), b.dataset.v)));
$("#applyBtn").addEventListener("click", async () => {
  try {
    await api("/api/settings", { peak: +$("#s-peak").value, nonpeak: +$("#s-nonpeak").value, hour: +$("#s-hour").value,
      mode: $("#s-mode .on")?.dataset.v });
    toast("Settings applied"); poll();
  } catch (e) { toast(e.message); }
});
$("#connectBtn").addEventListener("click", async () => {
  $("#connectMsg").textContent = "connecting…";
  try {
    const r = await api("/api/connect", { host: $("#f-host").value, port: $("#f-port").value, database: $("#f-db").value,
      user: $("#f-user").value, password: $("#f-pass").value, data_file: $("#f-file").value });
    $("#connectMsg").innerHTML = `<span style="color:${C.ok}">Connected to MySQL ${r.version}.</span> ` +
      (r.file_exists ? "File found." : `<span style="color:${C.shed}">File not found.</span>`);
    $("#f-pass").value = "";
    await poll(); loadOverview();
  } catch (e) { $("#connectMsg").innerHTML = `<span style="color:${C.shed}">${e.message}</span>`; }
});
$("#prepBtn").addEventListener("click", async () => {
  try { await api("/api/prepare", {}); toast("Preparing the data…"); poll(); } catch (e) { toast(e.message); }
});
$("#toLive").addEventListener("click", () => go("live"));

const STEP_NAMES = [
  ["schema", "Create the tables", "Create-DW.sql drops the old view and tables, then creates the working tables and the star schema."],
  ["clean", "Clean the file", "CustomerID present, no C invoices, quantity > 0, unit price > 0."],
  ["split", "Online or periodic", "n = first 8 hex digits of MD5(InvoiceNo); n mod 10: 0–6 online, 7–9 periodic, per cart."],
  ["master", "Master Data", "Customers and products from the cleaned data, attributes from stable(text, n), loaded in 500-row partitions."],
  ["working", "Online file and 48 groups", "online_sales_stream.csv, and the periodic sales in 48 whole-cart groups in the staging table."],
];
function renderSteps(prep) {
  $("#steps").innerHTML = STEP_NAMES.map(([k, title, about], i) => {
    const s = prep.steps[k] || {};
    return `<div class="stepi ${s.state || ""}"><span class="n">${s.state === "done" ? "✓" : i + 1}</span>
      <div><b>${title}</b><div class="small muted">${about}</div>${s.lines && s.lines.length ? `<div class="out">${s.lines.join("\n")}</div>` : ""}</div>
      <span class="secs">${s.seconds !== undefined ? s.seconds + " s" : (s.state === "running" ? "running…" : "")}</span></div>`;
  }).join("") + (prep.error ? `<div class="msg err">${prep.error}</div>` : "");
  const sizes = prep.steps.working_sizes;
  if (sizes) {
    $("#groupsBox").style.display = "";
    const mx = Math.max(...sizes);
    $("#groups").innerHTML = sizes.map((v, i) => `<i style="height:${100 * v / mx}%" title="group ${i}: ${fmt(v)} rows"></i>`).join("");
    const mn = Math.min(...sizes);
    $("#groupsNote").textContent = `Smallest ${fmt(mn)} rows, largest ${fmt(mx)} rows.` +
      (mn > 1000 ? " Each group is bigger than the 1,000-row buffer, so in peak part of each group is shed." : "");
  }
}

/* ================= live: commands ================= */
$("#startBtn").addEventListener("click", async () => {
  try { await api("/api/start", {}); toast("Threads started"); THR.length = 0; poll(); } catch (e) { toast(e.message); }
});
$("#quitBtn").addEventListener("click", async () => { try { await api("/api/command", { cmd: "quit" }); toast("Stopping…"); } catch (e) { toast(e.message); } });
$$("#c-source button, #c-mode button").forEach(b => b.addEventListener("click", async () => {
  try { await api("/api/command", { cmd: b.dataset.v }); toast(`Command: ${b.dataset.v}`); poll(); } catch (e) { toast(e.message); }
}));
$$("[data-speed]").forEach(b => b.addEventListener("click", async () => {
  const v = +(b.dataset.speed === "peak" ? $("#sp-peak") : $("#sp-non")).value;
  try { await api("/api/command", { cmd: "speed", which: b.dataset.speed, value: v }); toast(`${b.dataset.speed} speed = ${v}/s`); poll(); } catch (e) { toast(e.message); }
}));

/* ================= live: drawings ================= */
function dial(el, n, k, label, color, readNow) {
  const cx = 75, cy = 75, r1 = 66, r2 = 46;
  let s = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.03, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.03;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    const cur = i === readNow;
    s += `<path class="seg-c" d="M${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r2, a1)} A${r2} ${r2} 0 0 0 ${p(r2, a0)} Z"
      fill="${cur ? color : "#EEF1EF"}" stroke="#fff" stroke-width="1"><title>${label} page ${i}</title></path>`;
    const am = (a0 + a1) / 2;
    s += `<text x="${cx + 56 * Math.cos(am)}" y="${cy + 56 * Math.sin(am) + 4}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${cur ? "#fff" : C.muted}">${i}</text>`;
  }
  s += `<text x="75" y="72" text-anchor="middle" font-size="12" font-weight="600" fill="${C.ink}">${label}</text>
        <text x="75" y="88" text-anchor="middle" font-size="10.5" fill="${C.muted}">${readNow === null ? n + " pages" : "page " + readNow}</text>`;
  el.innerHTML = s;
}
const hoursEl = $("#hours");
hoursEl.innerHTML = Array.from({ length: 48 }, (_, i) => `<i title="group ${i}"></i>`).join("");
const THR = [];   // [time, loaded]

function renderLive(s) {
  const L = s.live;
  const set = s.settings;
  setSeg($("#c-source"), set.source); setSeg($("#c-mode"), set.mode);
  if (document.activeElement !== $("#sp-peak")) $("#sp-peak").value = set.peak;
  if (document.activeElement !== $("#sp-non")) $("#sp-non").value = set.nonpeak;
  $("#startBtn").disabled = s.running || s.prep.state !== "done";
  $("#quitBtn").disabled = !s.running;
  $("#l-tps").textContent = fmt(set.tps);
  const total = s.prep.steps.split ? null : null;
  if (!L) { dial($("#dialC"), 9, null, "customers", C.accent, null); dial($("#dialP"), 8, null, "products", C.periodic, null); return; }
  const onTotal = s.expected - (s.prep.steps.working_sizes || []).reduce((a, b) => a + b, 0);
  $("#l-sent").textContent = fmt(L.online.sent);
  $("#l-total").textContent = onTotal > 0 ? fmt(onTotal) : "—";
  $("#l-sentbar").style.width = onTotal > 0 ? `${100 * (L.online.sent + L.online.shed) / onTotal}%` : "0";
  $("#l-shedon").textContent = fmt(L.online.shed);
  $("#l-groups").textContent = L.periodic.released;
  $$("#hours i").forEach((el, i) => { el.className = i < L.periodic.released - 1 ? "rel" : (i === L.periodic.released - 1 ? "cur" : ""); });
  $("#l-lastgroup").textContent = L.periodic.last ? `group ${L.periodic.last[0]}: ${fmt(L.periodic.last[1])} rows at ${L.periodic.last[2]} s` +
    (set.source === "online" ? " · groups held (source = online)" : "") : "no group released yet";
  const b = L.buffer;
  $("#l-buf").textContent = fmt(b.online + b.periodic);
  $("#b-on").style.width = `${100 * b.online / b.limit}%`; $("#b-per").style.width = `${100 * b.periodic / b.limit}%`;
  $("#b-onn").textContent = fmt(b.online); $("#b-pern").textContent = fmt(b.periodic);
  const m = L.mesh;
  if (m) {
    const lastC = (m.k_cust - 1 + m.n_cust) % m.n_cust, lastP = (m.k_prod - 1 + m.n_prod) % m.n_prod;
    dial($("#dialC"), m.n_cust, m.iterations ? lastC : null, "customers", C.accent, m.iterations ? lastC : null);
    dial($("#dialP"), m.n_prod, m.iterations ? lastP : null, "products", C.periodic, m.iterations ? lastP : null);
    $("#m-it").textContent = fmt(m.iterations); $("#m-h").textContent = fmt(m.in_memory);
    $("#m-kc").textContent = fmt(m.keys_cust); $("#m-kp").textContent = fmt(m.keys_prod); $("#m-cycle").textContent = m.cycle;
    $("#conveyor").innerHTML = m.chunks.length ? m.chunks.map(ch => {
      const f = Math.min(ch.age / m.cycle, 1), r = 13, len = 2 * Math.PI * r;
      return `<div class="chunk" title="${ch.size} sales, ${ch.age} of ${m.cycle} iterations"><svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="#EEF1EF" stroke-width="5"/>
        <circle cx="16" cy="16" r="${r}" fill="none" stroke="${C.accent}" stroke-width="5" stroke-dasharray="${len * f} ${len}" transform="rotate(-90 16 16)"/>
        <text x="16" y="20" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">${ch.age}</text></svg><b class="num">${ch.size}</b></div>`;
    }).join("") : `<span class="empty-note">empty: waiting for sales</span>`;
  }
  $("#s-disk").textContent = fmt(L.shed.disk); $("#s-per").textContent = fmt(L.shed.periodic);
  $("#s-on").textContent = fmt(L.shed.online); $("#s-back").textContent = fmt(L.shed.read_back);
  const lo = L.loader;
  $("#d-loaded").textContent = fmt(lo.loaded); $("#d-exp").textContent = fmt(s.expected);
  $("#d-bar").style.width = s.expected ? `${100 * lo.loaded / s.expected}%` : "0";
  $("#d-wait").textContent = fmt(lo.waiting);
  const mx = Math.max(...lo.hourly.map(h => h[1]), 1);
  $("#d-ticks").innerHTML = lo.hourly.map(h => `<i style="height:${Math.max(4, 100 * h[1] / mx)}%" title="hour tick ${h[0]}: ${fmt(h[1])} rows"></i>`).join("");
  const bm = lo.by_mode;
  $("#d-modes").innerHTML = `<span class="chip live">Live <b>${fmt(bm.Live || 0)}</b></span><span class="chip per">Periodic <b>${fmt(bm.Periodic || 0)}</b></span><span class="chip sh">Shed <b>${fmt(bm.Shed || 0)}</b></span>`;
  // throughput
  const now = L.elapsed;
  if (!THR.length || now > THR[THR.length - 1][0]) THR.push([now, lo.loaded]);
  while (THR.length > 90) THR.shift();
  const pts = THR.map((p, i) => {             // rows per second over the last 3 s
    let j = i; while (j > 0 && p[0] - THR[j - 1][0] <= 3) j--;
    return j === i ? 0 : Math.max(0, (p[1] - THR[j][1]) / (p[0] - THR[j][0]));
  }).slice(1);
  if (go.current === "live") {
    if (!charts["c-thr"]) chart("c-thr", "line", [], [{ data: [], borderColor: C.accent, backgroundColor: "rgba(21,82,99,.10)", fill: true, pointRadius: 0, tension: .3, borderWidth: 2 }],
      { animation: false, scales: { x: { display: false }, y: { grid: { color: "#EEF1EF" }, ticks: { color: C.muted, callback: v => fmt(v) }, beginAtZero: true } } });
    const c = charts["c-thr"]; c.data.labels = pts.map((_, i) => i); c.data.datasets[0].data = pts; c.update("none");
  }
  $("#doneBanner").classList.toggle("on", L.done);
  if (L.done) $("#doneText").innerHTML = `All <b>${fmt(s.expected)}</b> transactions are in the DW (Live ${fmt(bm.Live || 0)}, Periodic ${fmt(bm.Periodic || 0)}, Shed ${fmt(bm.Shed || 0)}). The program keeps running until Quit.`;
}

function renderConsole(log) {
  const el = $("#console");
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  const t0 = log.length ? log[0].t : 0;
  el.innerHTML = log.map(l => {
    const d = new Date(l.t * 1000);
    return `<div class="${l.kind}"><span class="t">${d.toTimeString().slice(0, 8)}</span>${l.text.replace(/</g, "&lt;")}</div>`;
  }).join("");
  if (atBottom) el.scrollTop = el.scrollHeight;
}

/* ================= status polling ================= */
let lastPrepState = null;
async function poll() {
  let s;
  try { s = await api("/api/status"); } catch (e) { return; }
  ST = s;
  // header pills
  const db = $("#pillDb");
  db.className = "pill" + (s.connected ? " ok" : "");
  db.lastElementChild.textContent = s.connected ? `${s.db.user}@${s.db.host}/${s.db.database}` : "Not connected";
  const pm = $("#pillMode");
  pm.className = "pill " + (s.settings.mode === "peak" ? "peak" : "nonpeak");
  pm.lastElementChild.textContent = `${s.settings.mode} · ${fmt(s.settings.tps)}/s · ${s.settings.source}`;
  const pr = $("#pillRun");
  const state = s.running ? (s.live && s.live.done ? "All loaded" : "Running") : (s.prep.state === "running" ? "Preparing" : (s.prep.state === "done" ? "Ready" : "Idle"));
  pr.className = "pill" + (s.running || s.prep.state === "running" ? " run" : (s.prep.state === "done" ? " ok" : ""));
  pr.lastElementChild.textContent = state + (s.running && s.live ? ` · ${fmt(s.live.elapsed, 0)} s` : "");
  // setup fields (first time)
  if (!poll.filled) {
    $("#s-peak").value = s.settings.peak; $("#s-nonpeak").value = s.settings.nonpeak; $("#s-hour").value = s.settings.hour;
    setSeg($("#s-mode"), s.settings.mode); $("#f-file").value = s.data_file; poll.filled = true;
  }
  renderSteps(s.prep);
  $("#prepBtn").disabled = !s.connected || s.running || s.prep.state === "running";
  if (lastPrepState === "running" && s.prep.state === "done") toast("Data prepared. Go to the live run.");
  lastPrepState = s.prep.state;
  renderLive(s);
  renderConsole(s.log);
}
function loop() {
  const fast = ST && (ST.running || ST.prep.state === "running");
  poll().finally(() => setTimeout(loop, fast ? 700 : 2500));
}

/* ================= DW ================= */
const STAR = ["fact_sales", "dim_customer", "dim_product", "dim_supplier", "dim_store", "dim_time"];
async function loadSchema() {
  if (!ST || !ST.connected) { $("#tables").innerHTML = `<div class="msg info">Connect in Setup to see the tables.</div>`; return; }
  let r; try { r = await api("/api/schema"); } catch (e) { $("#tables").innerHTML = `<div class="msg err">${e.message}</div>`; return; }
  const names = Object.keys(r.tables).sort((a, b) => (STAR.indexOf(a) < 0) - (STAR.indexOf(b) < 0) || STAR.indexOf(a) - STAR.indexOf(b) || a.localeCompare(b));
  $("#tables").innerHTML = names.map(t => `<div class="tcard ${STAR.includes(t) ? "star" : ""}"><button aria-expanded="false">
      <div class="th"><b>${t}</b><span class="num small">${r.counts[t] === null ? "view" : fmt(r.counts[t]) + " rows"}</span></div></button>
      <div class="cols">${r.tables[t].map(c => `<div class="${c.key === "PRI" ? "pk" : (c.name.endsWith("_key") && t === "fact_sales" ? "fk" : "")}"><span>${c.name}</span><span>${c.type}</span></div>`).join("")}</div></div>`).join("");
  $$("#tables .tcard button").forEach(b => b.addEventListener("click", () => { const c = b.parentElement; c.classList.toggle("open"); b.setAttribute("aria-expanded", c.classList.contains("open")); }));
}
$("#schemaRefresh").addEventListener("click", loadSchema);

/* ================= analysis ================= */
let QUERIES = [], GROUPS = [], CUR = null;
const QTAGS = {
  1: ["slice", "drill", "rank"], 2: ["dice"], 3: ["group"], 4: ["slice", "drill"], 5: ["rank"], 6: ["dice", "drill"],
  7: ["group"], 8: ["rank"], 9: ["slice", "lag"], 10: ["slice"], 11: ["slice", "drill", "rank"], 12: ["slice", "lag"],
  13: ["window"], 14: ["drill"], 15: ["lag"], 16: ["cart"], 17: ["rollup"], 18: ["slice", "drill"], 19: ["cte"], 20: ["view"],
};
const TAGCLASS = { slice: "t-slice", dice: "t-dice", drill: "t-drill", rollup: "t-rollup", rank: "t-rank", view: "t-view", mv: "t-view" };
async function loadQueries() {
  QUERIES = await api("/api/queries");
  GROUPS = [];
  for (const q of QUERIES) {
    const key = q.q !== null ? "Q" + q.q : q.title;
    let g = GROUPS.find(x => x.key === key);
    if (!g) GROUPS.push(g = { key, q: q.q, title: q.title, notes: [], ids: [], sql: [] });
    g.ids.push(q.id); g.sql.push(q.sql); g.notes.push(...q.notes.filter(n => !g.notes.includes(n)));
  }
  $("#qlist").innerHTML = GROUPS.map((g, i) => {
    const tags = g.q ? QTAGS[g.q] || [] : (g.title.startsWith("Materialized") ? ["mv"] : ["dates"]);
    const label = g.q ? "Q" + g.q : (g.title.startsWith("Materialized") ? "MV" : "D");
    const title = g.title.replace(/^Q\d+\.\s*/, "");
    return `<button class="qitem" data-i="${i}"><span class="qn">${label}</span><span><span class="qt">${title}</span>
      <span class="tags">${tags.map(t => `<span class="tag ${TAGCLASS[t] || ""}">${t}</span>`).join("")}</span></span></button>`;
  }).join("");
  $$("#qlist .qitem").forEach(b => b.addEventListener("click", () => pickQuery(+b.dataset.i)));
  pickQuery(Math.max(0, GROUPS.findIndex(g => g.q === 1)));
}
function hl(sql) {
  const esc = sql.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return esc.replace(/\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|JOIN|ON|AND|OR|AS|WITH|ROLLUP|CASE|WHEN|THEN|ELSE|END|LIMIT|HAVING|OVER|PARTITION BY|DISTINCT|CREATE|VIEW|TABLE|DROP|IF EXISTS|BETWEEN|IN|DESC)\b/g, '<span class="kw">$1</span>')
            .replace(/\b(SUM|COUNT|AVG|ROUND|LAG|RANK|ROW_NUMBER|GROUPING|MIN|MAX|CAST)\(/g, '<span class="fn">$1</span>(');
}
function pickQuery(i) {
  CUR = GROUPS[i];
  $$("#qlist .qitem").forEach((b, j) => b.classList.toggle("on", j === i));
  $("#q-num").textContent = CUR.q ? `Question ${CUR.q}` : (CUR.title.startsWith("Materialized") ? "Materialized view" : "Loaded dates");
  $("#q-title").textContent = CUR.title.replace(/^Q\d+\.\s*/, "");
  $("#q-notes").innerHTML = CUR.notes.map(n => n.replace(/</g, "&lt;")).join(" ");
  $("#q-sql").innerHTML = CUR.sql.map(hl).join(";\n\n") + ";";
  $("#q-result").style.display = "none";
}
let LAST = null;
$("#runQ").addEventListener("click", async () => {
  if (!CUR) return;
  const btn = $("#runQ"); btn.disabled = true; btn.textContent = "Running…";
  let res = null, secs = 0;
  try {
    for (const id of CUR.ids) { res = await api("/api/query", { id }); secs += res.seconds; }
    LAST = res;
    $("#q-result").style.display = "";
    $("#q-rows").textContent = `${fmt(res.total)} rows` + (res.total > res.rows.length ? ` (first ${fmt(res.rows.length)} shown)` : "");
    $("#q-time").textContent = `${secs.toFixed(2)} s on the DW`;
    renderTable(res); renderQChart(res);
    setSeg($("#q-view"), "table"); $("#q-table").style.display = ""; $("#q-chartbox").style.display = "none";
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.innerHTML = "&#9654; Run";
});
function isNum(v) { return typeof v === "number"; }
function renderTable(r) {
  if (!r.columns.length) { $("#q-table").innerHTML = `<div class="msg okm" style="margin:10px">Statement done (no rows to show).</div>`; return; }
  if (!r.rows.length) { $("#q-table").innerHTML = `<div class="msg info" style="margin:10px">The query ran and returned no rows.</div>`; return; }
  const numCol = r.columns.map((_, j) => r.rows.some(x => isNum(x[j])));
  $("#q-table").innerHTML = `<table class="res"><thead><tr>${r.columns.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${
    r.rows.map(row => `<tr>${row.map((v, j) => `<td class="${numCol[j] ? "n" : ""}">${v === null ? '<span class="muted">NULL</span>' :
      (isNum(v) ? (Number.isInteger(v) && !/year|month|quarter|rank|hour|half|id|key|no$/i.test(r.columns[j]) ? fmt(v) : (Number.isInteger(v) ? v : fmt(v, 2))) : String(v).replace(/</g, "&lt;"))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function renderQChart(r) {
  if (charts["c-q"]) { charts["c-q"].destroy(); delete charts["c-q"]; }
  if (!r.rows.length) return;
  const cols = r.columns;
  const numIdx = cols.map((c, j) => r.rows.every(x => x[j] === null || isNum(x[j])) && !/^(year|month|quarter|rank_no|half_year|city_rank|day)$/i.test(c) ? j : -1).filter(j => j >= 0);
  const labIdx = cols.map((_, j) => j).filter(j => !numIdx.includes(j));
  if (!numIdx.length) return;
  const y = numIdx[numIdx.length - 1];
  const rows = r.rows.slice(0, 40);
  const labels = rows.map(x => labIdx.map(j => x[j]).filter(v => v !== null).join(" · ").slice(0, 40));
  chart("c-q", "bar", labels, [{ label: cols[y], data: rows.map(x => x[y]), backgroundColor: C.accent, borderRadius: 3 }],
    { indexAxis: rows.length > 12 ? "y" : "x", plugins: { legend: { display: false } },
      scales: { x: { grid: { display: rows.length > 12 }, ticks: { color: C.muted, autoSkip: true, maxRotation: 0 } }, y: { grid: { display: rows.length <= 12, color: "#EEF1EF" }, ticks: { color: C.muted, autoSkip: false, font: { size: 10.5 } } } } });
}
$$("#q-view button").forEach(b => b.addEventListener("click", () => {
  setSeg($("#q-view"), b.dataset.v);
  $("#q-table").style.display = b.dataset.v === "table" ? "" : "none";
  $("#q-chartbox").style.display = b.dataset.v === "chart" ? "" : "none";
  if (b.dataset.v === "chart" && charts["c-q"]) charts["c-q"].resize();
}));

/* ================= checks ================= */
$("#checkBtn").addEventListener("click", async () => {
  $("#checks").innerHTML = `<div class="msg info">Computing the expected values from the working data…</div>`;
  try {
    const r = await api("/api/checks");
    const okAll = r.every(c => c.ok);
    $("#checks").innerHTML = `<div class="check" style="font-weight:600;color:var(--muted)"><span></span><span>Check</span><span class="v">expected</span><span class="v">in the DW</span></div>` +
      r.map(c => `<div class="check"><span class="ic ${c.ok ? "y" : "n"}">${c.ok ? "✓" : "!"}</span><span>${c.name}</span>
        <span class="v">${fmt(c.expected, c.name === "Total revenue" ? 3 : 0)}</span><span class="v">${fmt(c.actual, c.name === "Total revenue" ? 3 : 0)}</span></div>`).join("") +
      `<div class="msg ${okAll ? "okm" : "err"}" style="margin-top:14px">${okAll ? "All checks pass: every transaction is in the DW once, with the right revenue and dimensions." :
        "Some checks differ. If a run is still going (or stopped early), finish it with non-peak and wait for all rows to load."}</div>`;
  } catch (e) { $("#checks").innerHTML = `<div class="msg err">${e.message}</div>`; }
});

/* ================= presenter ================= */
const STEPS = [
  { title: "The project in one minute", page: "overview",
    show: ["The line map: file → cleaning → two streams → MESHJOIN → DW → queries.", "The KPIs and the month chart (if the DW is loaded)."],
    say: ["A retail chain sells online and in stores. Online sales arrive as a stream and must reach the DW in near real time; store sales arrive once an hour in groups.",
          "Each sale only has a customer id and a product id, so it is joined with the Master Data on disk using MESHJOIN, then loaded into a star schema."] },
  { title: "Connect and settings", page: "setup",
    show: ["Type the password: it stays in memory only.", "The settings: peak 80/s, non-peak 10/s, one hour = 60 s, buffer 1,000, chunk 500, partition 500."],
    say: ["The program takes the database credentials and the path of the file at run time, as the PDF asks.",
          "For the demo I use faster values so that a whole hour passes in a few seconds."] },
  { title: "Preparing the data", page: "setup", action: ["Prepare data", () => $("#prepBtn").click()],
    show: ["Create-DW.sql first drops everything.", "Cleaning: 541,909 → 397,884.", "sales_mode: 69.99 % online carts, 30.01 % periodic.", "Partitions: 9 customer, 8 product. 48 groups of 2,263 to 2,710 rows."],
    say: ["Only the four cleaning rules of the PDF: customer present, no C invoices, quantity and price above zero.",
          "The MD5 rule labels whole carts, so one cart is never split. The 48 groups also keep carts whole."] },
  { title: "Start: three threads", page: "live", action: ["Start threads", () => $("#startBtn").click()],
    show: ["OnlineThread sends at the peak speed.", "PeriodicThread releases one group per hour (the 48 squares).", "The buffer fills, MESHJOIN takes up to 500 per iteration."],
    say: ["Each thread has its own MySQL connection. The buffer has two lines; MESHJOIN always takes online first."] },
  { title: "Inside MESHJOIN", page: "live",
    show: ["The two dials: one customer page and one product page are read per iteration.", "The queue: each chunk shows how many iterations it has seen."],
    say: ["Two master tables: I scan both together. A chunk stays max(9, 8) = 9 iterations, so it meets every customer page once and every product page; one product page comes twice, so a matched flag stops double enrichment.",
          "The store comes from an in-memory list after MESHJOIN."] },
  { title: "Load shedding in peak", page: "live", action: ["Switch to peak", () => api("/api/command", { cmd: "peak" }).then(poll)],
    show: ["When a group of about 2,500 arrives, the buffer is full: watch the shed table grow.", "Shed online stays 0 at normal speed."],
    say: ["Periodic first, online last: an arriving cart that does not fit is shed whole, then periodic carts waiting in the buffer, and only then an online sale.",
          "Shed sales keep their flag and the time they were shed."] },
  { title: "Commands", page: "live", action: ["Source: online only", () => api("/api/command", { cmd: "online" }).then(poll)],
    show: ["online: no groups released (the squares stop).", "periodic: the online stream pauses.", "both: back to normal. Speeds can change while running."],
    say: ["Every command from the PDF is here: online, periodic, both, peak, non-peak, status and quit, and both speeds change while the program runs."] },
  { title: "Non-peak: shed sales come back", page: "live", action: ["Switch to non-peak", () => api("/api/command", { cmd: "both" }).then(() => api("/api/command", { cmd: "non-peak" })).then(poll)],
    show: ["The shed table goes down to 0; read back goes up.", "Those sales reach the DW with processing_mode = Shed."],
    say: ["In non-peak nothing is shed. Any chunk with free places is filled from the shed table, online-flagged first. Priority is online, periodic, shed."] },
  { title: "Loading the DW", page: "live",
    show: ["Loaded rises every 0.5 s (online).", "Periodic waits and is loaded at each hour tick (the small bars)."],
    say: ["The loader computes revenue = quantity × price, inserts any new dimension row first, then the facts, one commit per batch. Without the bonus, Live results go straight into the fact table."] },
  { title: "The star schema", page: "dw",
    show: ["Fact at the transaction-line grain, 5 dimensions with surrogate keys.", "dim_time at minute level with every time part as a column."],
    say: ["Supplier is its own dimension for the supplier questions. Revenue is DECIMAL(14,3) because some prices are 0.001."] },
  { title: "Queries", page: "analysis",
    show: ["Q16: product pairs from the same cart (546 carts for the jumbo bags).", "Q19: spikes, the ceramic storage jar at 109× its average.", "Q20 and the MV: 4.0 s through the view, 0.0 s from the stored table."],
    say: ["The loaded year is 2011 and the latest six months are July to December 2011, named in the SQL.",
          "MySQL has no materialized view, so I store the view's result in a table and refresh it after loads."] },
  { title: "Proof and shortcomings", page: "checks", action: ["Run the checks", () => $("#checkBtn").click()],
    show: ["All checks green: 397,884 rows, revenue 8,911,407.904."],
    say: ["Shortcomings of MESHJOIN: every sale waits a full cycle even when matched early; it reads hot and cold pages equally; and its cost grows with the Master Data while its settings stay fixed, which is why shedding is needed."] },
];
let PI = 0;
const seen = new Set();
function renderPresenter() {
  const s = STEPS[PI];
  seen.add(PI);
  $("#pr-count").textContent = `Step ${PI + 1} of ${STEPS.length}`;
  $("#pnav").innerHTML = STEPS.map((_, i) => `<button class="${i === PI ? "on" : (seen.has(i) ? "seen" : "")}" data-i="${i}" aria-label="step ${i + 1}">${i + 1}</button>`).join("");
  $$("#pnav button").forEach(b => b.addEventListener("click", () => { PI = +b.dataset.i; renderPresenter(); }));
  $("#pbody").innerHTML = `<h4>${s.title}</h4>
    <div><div class="eyebrow" style="margin-bottom:6px">Show</div><ul class="show" style="margin:0;padding-left:18px">${s.show.map(x => `<li>${x}</li>`).join("")}</ul></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Say</div><div class="say">${s.say.map(x => `<p>${x}</p>`).join("")}</div></div>
    ${s.action ? `<button class="btn primary" id="prAction">${s.action[0]}</button>` : ""}`;
  if (s.action) $("#prAction").addEventListener("click", () => { s.action[1](); toast(s.action[0]); });
  go(s.page);
  $("#prPrev").disabled = PI === 0; $("#prNext").textContent = PI === STEPS.length - 1 ? "Finish" : "Next →";
}
function presenter(on) { $("#presenter").classList.toggle("on", on); document.body.classList.toggle("presenting", on); setTimeout(() => Object.values(charts).forEach(c => c.resize()), 320); }
$("#presentBtn").addEventListener("click", () => { presenter(true); renderPresenter(); });
$("#prClose").addEventListener("click", () => presenter(false));
$("#prPrev").addEventListener("click", () => { if (PI > 0) { PI--; renderPresenter(); } });
$("#prNext").addEventListener("click", () => { if (PI < STEPS.length - 1) { PI++; renderPresenter(); } else presenter(false); });
document.addEventListener("keydown", e => {
  if (!$("#presenter").classList.contains("on") || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowRight") $("#prNext").click();
  if (e.key === "ArrowLeft") $("#prPrev").click();
  if (e.key === "Escape") $("#prClose").click();
});

/* ================= start ================= */
drawMetro();
let first = "overview";
try { first = localStorage.getItem("page") || "overview"; } catch (e) {}
go(PAGES[first] ? first : "overview");
loop();
