/* MESHJOIN Control Room - front end. Talks to app/server.py. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? "—" :
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (a, b) => b ? (100 * a / b) : 0;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const C = { online: "#2F6FD6", periodic: "#C77A12", shed: "#B9443A", accent: "#0E5A6B", ok: "#2E7D53",
            hair: "#E6E8E4", grid: "#EEF0EC", ink: "#1A2129", ink2: "#4D5863", ink3: "#85909A", tint: "#A9C3C9" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = iso => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const icon = id => `<svg class="i"><use href="#i-${id}"/></svg>`;

Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.font.size = 11;
Chart.defaults.color = C.ink3;

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(text) {
  const t = $("#toast"); t.textContent = text; t.classList.add("on");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2400);
}
function setSeg(el, v) { $$("button", el).forEach(b => b.classList.toggle("on", b.dataset.v === v)); }

let ST = null;
const charts = {};
function chart(id, type, labels, datasets, opts = {}) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($("#" + id), {
    type, data: { labels, datasets },
    options: Object.assign({
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: C.ink, padding: 8, cornerRadius: 4, displayColors: false,
        callbacks: { label: c => fmt(c.parsed.y ?? c.parsed.x, 2) } } },
      scales: { x: { grid: { display: false }, border: { color: C.hair }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                y: { grid: { color: C.grid }, border: { display: false }, ticks: { callback: v => compact(v) } } },
    }, opts),
  });
  return charts[id];
}
const compact = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(0) + "k" : fmt(v);

/* ================= navigation ================= */
const PAGES = {
  overview: ["Overview", "Online Retail, 1 Dec 2010 – 9 Dec 2011"],
  setup: ["Setup", "Connection, settings and data preparation"],
  live: ["Live run", "The three threads, MESHJOIN, load shedding and the loader"],
  dw: ["Data warehouse", "Star schema and working tables"],
  analysis: ["Analysis", "Queries-DW.sql"],
  checks: ["Checks", "The load against the working data"],
};
function go(page) {
  $$(".page").forEach(p => p.classList.toggle("on", p.id === "p-" + page));
  $$("#nav button").forEach(b => { b.classList.toggle("on", b.dataset.page === page); b.setAttribute("aria-current", b.dataset.page === page ? "page" : "false"); });
  $("#pageTitle").textContent = PAGES[page][0];
  $("#pageSub").textContent = PAGES[page][1];
  $("#view").scrollTop = 0;
  go.current = page;
  try { localStorage.setItem("page", page); } catch (e) {}
  if (page === "overview") loadOverview();
  if (page === "dw") loadSchema();
  if (page === "analysis" && !QUERIES.length) loadQueries();
  if (page === "live" && charts["c-thr"]) charts["c-thr"].resize();
}
$$("#nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });

/* ================= overview ================= */
function drawMetro() {
  const svg = $("#metro");
  const st = (x, y, label, sub, page, pos, color = C.accent, r = 10) => {
    const up = pos === "above";
    const anchor = pos === "below-l" ? "end" : (pos === "below-r" ? "start" : "middle");
    const tx = pos === "below-l" ? x + 12 : (pos === "below-r" ? x - 12 : x);
    const y1 = up ? y - 34 : y + 32, y2 = up ? y - 19 : y + 47;
    return `<g class="st" data-go="${page}" tabindex="0" role="link" aria-label="${label}: ${sub}">
      <circle class="o" cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${color}" stroke-width="3.5"/>
      <circle cx="${x}" cy="${y}" r="${r - 5.5}" fill="${color}"/>
      <text x="${tx}" y="${y1}" text-anchor="${anchor}" font-size="13" font-weight="600" fill="${C.ink}">${label}</text>
      <text x="${tx}" y="${y2}" text-anchor="${anchor}" font-size="11.5" fill="${C.ink3}">${sub}</text></g>`;
  };
  svg.innerHTML = `
    <path d="M60 115 H300" stroke="${C.accent}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M300 115 C340 115 340 55 380 55 H520 C560 55 560 115 600 115" stroke="${C.online}" stroke-width="6" fill="none"/>
    <path d="M300 115 C340 115 340 175 380 175 H520 C560 175 560 115 600 115" stroke="${C.periodic}" stroke-width="6" fill="none"/>
    <path d="M600 115 H1140" stroke="${C.accent}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M500 175 C560 205 600 222 650 222 H680 C722 222 734 170 736 130" stroke="${C.shed}" stroke-width="3" fill="none" stroke-dasharray="6 5"/>
    <text x="590" y="244" text-anchor="middle" font-size="11.5" fill="${C.shed}">shed in peak, read back in non-peak</text>
    <path d="M818 178 C812 150 790 128 754 120" stroke="${C.ink3}" stroke-width="3" fill="none" stroke-dasharray="1.5 6" stroke-linecap="round"/>
    <rect x="792" y="178" width="52" height="20" rx="3" fill="#F4F5F3" stroke="#D5D9D4"/>
    <text x="818" y="192" text-anchor="middle" font-size="10.5" fill="${C.ink2}">disk</text>
    <text x="818" y="216" text-anchor="middle" font-size="11.5" fill="${C.ink3}">Master Data</text>
    <text x="818" y="231" text-anchor="middle" font-size="11.5" fill="${C.ink3}">9 + 8 partitions of 500</text>
    ${st(60, 115, "Online Retail.xlsx", "541,909 rows", "setup", "below")}
    ${st(165, 115, "Cleaning", "4 rules → 397,884", "setup", "below")}
    ${st(300, 115, "sales_mode", "MD5 per cart", "setup", "below-l")}
    ${st(450, 55, "Online stream", "278,740 · 80/s", "live", "above", C.online)}
    ${st(450, 175, "48 hourly groups", "119,144 · 1 per hour", "live", "below-l", C.periodic)}
    ${st(600, 115, "Stream buffer", "≤ 1,000, online first", "live", "below-r")}
    ${st(740, 115, "MESHJOIN", "chunk 500 · cycle 9", "live", "above", C.accent, 13)}
    ${st(900, 115, "Loader", "dimensions first", "live", "above")}
    ${st(1020, 115, "Star schema", "5 dimensions + fact", "dw", "below")}
    ${st(1140, 115, "Q1–Q20", "OLAP, view, MV", "analysis", "above")}`;
  $$("#metro .st").forEach(g => g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(g.dataset.go); } }));
  metroTips(svg);
}
/* hover notes on each station: what was done in that phase */
const METRO_TIPS = {
  "Online Retail.xlsx": ["Source data", "UCI Online Retail file, read with pandas. IDs read as text so codes like 85123A keep their letters. Dates 1 Dec 2010 to 9 Dec 2011."],
  "Cleaning": ["Phase: cleaning", "Only the 4 PDF rules: CustomerID present, no C (cancelled) invoice, quantity > 0, price > 0. Removed 135,080 + 8,905 + 0 + 40 rows. 18,532 carts left."],
  "sales_mode": ["Phase: splitting", "n = first 8 hex digits of MD5(InvoiceNo). n mod 10 = 0-6 Online, 7-9 Periodic. Hashed per cart, so a cart is never split. Store: online = 1, periodic = 2 + n mod 4."],
  "Online stream": ["Phase: OnlineThread", "online_sales_stream.csv sent row by row in time order at the chosen speed (80/s peak, 10/s non-peak). Online sales go into the buffer first."],
  "48 hourly groups": ["Phase: PeriodicThread", "Store carts cut into 48 groups of whole carts (2,263-2,710 rows). One group released per hour from periodic_sales_data; released = 1 so it is never sent twice."],
  "Stream buffer": ["Stream buffer", "Holds up to 1,000 sales. Online line taken first, then whole periodic carts. Threads wait on a Condition when it is full; in peak, sales that don't fit are shed."],
  "MESHJOIN": ["Phase: MESHJOIN", "Each iteration: take a chunk of 500 into H, read one customer page and one product page from disk, fill the matching sales. A chunk leaves after max(9, 8) = 9 iterations."],
  "Loader": ["Phase: loading", "revenue = unit price x quantity (Decimal). New dimension rows inserted first, then facts, one commit per batch. Online loaded every 0.5 s, periodic at each hour tick."],
  "Star schema": ["Phase: DW design", "fact_sales at transaction-line grain + 5 dimensions (customer, product, supplier, store, time per minute). Surrogate keys, foreign keys, CHECKs. 397,884 rows."],
  "Q1–Q20": ["Phase: OLAP queries", "20 queries on the loaded year 2011: ranking (ROW_NUMBER, RANK), growth (LAG), pivots (SUM CASE), ROLLUP, CTEs, a view and a materialized table."],
};
function metroTips(svg) {
  let tip = document.querySelector(".metro-tip");
  if (!tip) { tip = document.createElement("div"); tip.className = "metro-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
  const show = g => {
    const d = METRO_TIPS[g.querySelector("text").textContent]; if (!d) return;
    tip.innerHTML = `<b>${d[0]}</b>${d[1]}`;
    tip.classList.add("on");
    const c = g.querySelector(".o").getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = c.left + c.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = c.top - th - 10;
    if (top < 8) top = c.bottom + 10;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  };
  const hide = () => tip.classList.remove("on");
  $$("#metro .st").forEach(g => {
    g.addEventListener("mouseenter", () => show(g)); g.addEventListener("mouseleave", hide);
    g.addEventListener("focus", () => show(g)); g.addEventListener("blur", hide);
  });
  $("#view").addEventListener("scroll", hide, { passive: true });
}

async function loadOverview() {
  if (!ST || !ST.connected) return;
  let o;
  try { o = await api("/api/overview"); } catch (e) { return; }
  if (o.error || !o.kpi || !o.kpi.rows) { $("#k-rows-s").textContent = "The DW is not loaded yet"; return; }
  $("#k-rows").textContent = fmt(o.kpi.rows);
  $("#k-rows-s").textContent = "one per transaction line";
  $("#k-rev").textContent = fmt(o.kpi.revenue, 0);
  $("#k-carts").textContent = fmt(o.kpi.carts);
  $("#k-dates").textContent = o.dates[0] ? `${nice(o.dates[0])} – ${nice(o.dates[1])}` : "—";
  // month chart: the first and last month are partial (lighter)
  const n = o.monthly.length;
  const lab = o.monthly.map(m => { const [y, mm] = m.label.split("-"); return `${MONTHS[+mm - 1]} ${y.slice(2)}`; });
  chart("c-month", "bar", lab, [{ data: o.monthly.map(m => m.value), borderRadius: 2, maxBarThickness: 34,
    backgroundColor: o.monthly.map((_, i) => (i === n - 1 && n > 1) ? C.tint : C.accent) }],
    { plugins: { legend: { display: false }, tooltip: { backgroundColor: C.ink, displayColors: false,
      callbacks: { label: c => "GBP " + fmt(c.parsed.y) + (c.dataIndex === n - 1 && n > 1 ? " (partial month)" : "") } } } });
  const tot = o.stores.reduce((a, s) => a + s.value, 0) || 1;
  $("#storeBars").innerHTML = o.stores.map(s => `<tr><td>${esc(s.label)}</td><td class="r">${fmt(s.value)}</td>
    <td><div class="share"><div class="meter"><i style="width:${pct(s.value, tot)}%;background:${s.label === "Online" ? C.online : C.periodic}"></i></div><span>${pct(s.value, tot).toFixed(1)}%</span></div></td></tr>`).join("");
  const mt = Object.values(o.modes).reduce((a, b) => a + b, 0) || 1;
  const col = { Live: C.online, Periodic: C.periodic, Shed: C.shed };
  $("#modeSplit").className = "";
  $("#modeSplit").innerHTML = `<div class="meter thick">${["Live", "Periodic", "Shed"].map(k => `<i style="width:${pct(o.modes[k] || 0, mt)}%;background:${col[k]}"></i>`).join("")}</div>
    <div class="row" style="gap:20px;margin-top:10px">${["Live", "Periodic", "Shed"].map(k =>
      `<span class="key" style="--c:${col[k]}">${k} <b class="num" style="color:var(--ink);font-weight:500">${fmt(o.modes[k] || 0)}</b> <span class="faint">${pct(o.modes[k] || 0, mt).toFixed(1)}%</span></span>`).join("")}</div>`;
}

/* ================= setup ================= */
const PRESETS = {
  pdf: [80, 10, 60, "Project settings. A full run takes more than an hour."],
  demo: [300, 30, 10, "A group every 10 s, large enough to shed in peak."],
  quick: [5000, 2000, 2, "Loads everything in about 3–5 minutes."],
};
$$("#presets button").forEach(b => b.addEventListener("click", () => {
  const [p, n, h, note] = PRESETS[b.dataset.preset];
  $("#s-peak").value = p; $("#s-nonpeak").value = n; $("#s-hour").value = h; $("#presetNote").textContent = note + " Apply to use it.";
  $$("#presets button").forEach(x => x.classList.toggle("on", x === b));
}));
$$("#s-mode button").forEach(b => b.addEventListener("click", () => setSeg($("#s-mode"), b.dataset.v)));
$("#applyBtn").addEventListener("click", async () => {
  try {
    await api("/api/settings", { peak: +$("#s-peak").value, nonpeak: +$("#s-nonpeak").value, hour: +$("#s-hour").value, mode: $("#s-mode .on")?.dataset.v });
    toast("Settings applied"); $("#presetNote").textContent = ""; poll();
  } catch (e) { toast(e.message); }
});
$("#connectBtn").addEventListener("click", async () => {
  $("#connectMsg").textContent = "Connecting…";
  try {
    const r = await api("/api/connect", { host: $("#f-host").value, port: $("#f-port").value, database: $("#f-db").value,
      user: $("#f-user").value, password: $("#f-pass").value, data_file: $("#f-file").value });
    $("#connectMsg").innerHTML = `<span style="color:${C.ok}">Connected, MySQL ${esc(r.version.split("-")[0])}.</span> ` +
      (r.file_exists ? "File found." : `<span style="color:${C.shed}">File not found.</span>`);
    $("#f-pass").value = "";
    await poll(); loadOverview();
  } catch (e) { $("#connectMsg").innerHTML = `<span style="color:${C.shed}">${esc(e.message)}</span>`; }
});
$("#prepBtn").addEventListener("click", async () => { try { await api("/api/prepare", {}); toast("Preparing the data"); poll(); } catch (e) { toast(e.message); } });
$("#toLive").addEventListener("click", () => go("live"));

const STEP_NAMES = [
  ["schema", "Create the tables", "Create-DW.sql drops the old view and tables, then creates everything."],
  ["clean", "Clean the file", "CustomerID present, no C invoices, quantity > 0, unit price > 0."],
  ["split", "Online or periodic", "n = first 8 hex digits of MD5(InvoiceNo); n mod 10: 0–6 online, 7–9 periodic, per cart."],
  ["master", "Master Data", "Customers and products from the cleaned data, attributes from stable(text, n), 500-row partitions."],
  ["working", "Online file and hourly groups", "online_sales_stream.csv, and the periodic sales in 48 whole-cart groups."],
];
function renderSteps(prep) {
  $("#steps").innerHTML = STEP_NAMES.map(([k, title, about], i) => {
    const s = prep.steps[k] || {};
    return `<div class="stepi ${s.state || ""}"><span class="n">${s.state === "done" ? `<svg class="i" style="width:11px;height:11px;stroke-width:2.6"><use href="#i-check"/></svg>` : i + 1}</span>
      <div><b>${title}</b><div class="about">${about}</div>${s.lines && s.lines.length ? `<div class="out">${esc(s.lines.join("\n"))}</div>` : ""}</div>
      <span class="secs">${s.seconds !== undefined ? s.seconds + " s" : (s.state === "running" ? "…" : "")}</span></div>`;
  }).join("") + (prep.error ? `<div class="note-box err" style="margin:8px 0">${esc(prep.error)}</div>` : "");
  const sizes = prep.steps.working_sizes;
  if (sizes) {
    $("#groupsBox").style.display = "";
    const mx = Math.max(...sizes), mn = Math.min(...sizes);
    $("#groups").innerHTML = sizes.map((v, i) => `<i style="height:${100 * v / mx}%" title="Group ${i}: ${fmt(v)} rows"></i>`).join("");
    $("#groupsNote").textContent = `${fmt(mn)} to ${fmt(mx)} rows` + (mn > 1000 ? " · each larger than the 1,000-row buffer" : "");
  }
}

/* ================= live ================= */
$("#startBtn").addEventListener("click", async () => { try { await api("/api/start", {}); toast("Threads started"); THR.length = 0; poll(); } catch (e) { toast(e.message); } });
$("#quitBtn").addEventListener("click", async () => { try { await api("/api/command", { cmd: "quit" }); toast("Stopping"); } catch (e) { toast(e.message); } });
$$("#c-source button, #c-mode button").forEach(b => b.addEventListener("click", async () => {
  try { await api("/api/command", { cmd: b.dataset.v }); toast(`Command: ${b.dataset.v}`); poll(); } catch (e) { toast(e.message); }
}));
$$("[data-speed]").forEach(b => b.addEventListener("click", async () => {
  const v = +(b.dataset.speed === "peak" ? $("#sp-peak") : $("#sp-non")).value;
  try { await api("/api/command", { cmd: "speed", which: b.dataset.speed, value: v }); toast(`${b.dataset.speed} speed: ${v}/s`); poll(); } catch (e) { toast(e.message); }
}));
$("#hours").innerHTML = Array.from({ length: 48 }, (_, i) => `<i title="Group ${i}"></i>`).join("");

function pageStrip(el, n, now, color) {
  el.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  if (el.children.length !== n) el.innerHTML = Array.from({ length: n }, (_, i) => `<i>${i}</i>`).join("");
  [...el.children].forEach((c, i) => { const on = i === now; c.classList.toggle("on", on); c.style.background = on ? color : ""; });
}
function slots(m) {
  const el = $("#conveyor");
  el.style.setProperty("--cycle", m.cycle);
  const chunks = m.chunks.slice(0, m.cycle);
  el.innerHTML = Array.from({ length: m.cycle }, (_, i) => {
    const ch = chunks[i];
    return ch ? `<div class="sl f" style="--age:${pct(ch.age, m.cycle)}%" title="${ch.size} sales, ${ch.age} of ${m.cycle} iterations">${ch.size}</div>` : `<div class="sl"></div>`;
  }).join("");
}
const THR = [];
function renderLive(s) {
  const L = s.live, set = s.settings;
  setSeg($("#c-source"), set.source); setSeg($("#c-mode"), set.mode);
  if (document.activeElement !== $("#sp-peak")) $("#sp-peak").value = set.peak;
  if (document.activeElement !== $("#sp-non")) $("#sp-non").value = set.nonpeak;
  $("#startBtn").disabled = s.running || s.prep.state !== "done";
  $("#quitBtn").disabled = !s.running;
  $("#l-tps").textContent = fmt(set.tps);
  $("#d-exp").textContent = s.expected ? fmt(s.expected) : "—";

  // headline
  let title = "Not started", state = "Connect and prepare the data in Setup, then start the threads.";
  if (s.prep.state === "running") { title = "Preparing data"; state = "Cleaning, Master Data and the hourly groups are being built."; }
  else if (s.prep.state === "done" && !L) { title = "Ready"; state = `${fmt(s.expected)} transactions prepared. Start the threads.`; }
  if (L) {
    const shedding = set.mode === "peak";
    if (L.done) { title = "All loaded"; state = `Every transaction is in the DW after ${fmt(L.elapsed, 0)} s. The program runs until Quit.`; }
    else if (s.running) {
      title = `Running in ${set.mode}`;
      state = `${fmt(set.tps)} sales/s · source: ${set.source} · ` + (shedding ? `shedding allowed, ${fmt(L.shed.disk)} on the shed disk` :
        `no shedding, ${L.shed.disk ? "reading back " + fmt(L.shed.disk) + " shed sales" : "shed table empty"}`) + ` · ${fmt(L.elapsed, 0)} s`;
    } else { title = "Stopped"; state = `Stopped after ${fmt(L.elapsed, 0)} s with ${fmt(L.loader.loaded)} fact rows loaded.`; }
  }
  $("#lv-title").textContent = title; $("#lv-state").textContent = state;
  if (!L) {
    pageStrip($("#dialC"), 9, null, C.accent); pageStrip($("#dialP"), 8, null, C.periodic);
    slots({ cycle: 9, chunks: [] }); return;
  }
  const onTotal = s.expected - (s.prep.steps.working_sizes || []).reduce((a, b) => a + b, 0);
  $("#l-sent").textContent = fmt(L.online.sent);
  $("#l-total").textContent = onTotal > 0 ? fmt(onTotal) : "—";
  $("#l-sentbar").style.width = onTotal > 0 ? `${pct(L.online.sent + L.online.shed, onTotal)}%` : "0";
  $("#l-shedon").textContent = fmt(L.online.shed);
  $("#l-groups").textContent = L.periodic.released;
  $$("#hours i").forEach((el, i) => { el.className = i < L.periodic.released - 1 ? "rel" : (i === L.periodic.released - 1 ? "cur" : ""); });
  $("#l-lastgroup").textContent = L.periodic.last ? `Group ${L.periodic.last[0]}: ${fmt(L.periodic.last[1])} rows at ${L.periodic.last[2]} s` +
    (set.source === "online" ? " · held (source: online)" : "") : "No group released yet";
  const b = L.buffer;
  $("#l-buf").textContent = fmt(b.online + b.periodic);
  $("#b-on").style.height = `${pct(b.online, b.limit)}%`; $("#b-per").style.height = `${pct(b.periodic, b.limit)}%`;
  $("#b-onn").textContent = fmt(b.online); $("#b-pern").textContent = fmt(b.periodic);
  const m = L.mesh;
  if (m) {
    const it = m.iterations > 0;
    pageStrip($("#dialC"), m.n_cust, it ? (m.k_cust - 1 + m.n_cust) % m.n_cust : null, C.accent);
    pageStrip($("#dialP"), m.n_prod, it ? (m.k_prod - 1 + m.n_prod) % m.n_prod : null, C.periodic);
    $("#m-it").textContent = fmt(m.iterations); $("#m-h").textContent = fmt(m.in_memory);
    $("#m-kc").textContent = fmt(m.keys_cust); $("#m-kp").textContent = fmt(m.keys_prod); $("#m-cycle").textContent = m.cycle;
    slots(m);
  }
  $("#s-disk").textContent = fmt(L.shed.disk); $("#s-per").textContent = fmt(L.shed.periodic);
  $("#s-on").textContent = fmt(L.shed.online); $("#s-back").textContent = fmt(L.shed.read_back);
  const lo = L.loader;
  $("#d-loaded").textContent = fmt(lo.loaded);
  $("#d-bar").style.width = s.expected ? `${pct(lo.loaded, s.expected)}%` : "0";
  $("#d-wait").textContent = fmt(lo.waiting);
  const mx = Math.max(...lo.hourly.map(h => h[1]), 1);
  $("#d-ticks").innerHTML = lo.hourly.map(h => `<i style="height:${Math.max(6, pct(h[1], mx))}%" title="Hour tick ${h[0]}: ${fmt(h[1])} rows"></i>`).join("");
  const bm = lo.by_mode;
  $("#d-modes").innerHTML = [["Live", C.online], ["Periodic", C.periodic], ["Shed", C.shed]].map(([k, c]) =>
    `<div><span style="--c:${c}">${k}</span><b>${fmt(bm[k] || 0)}</b></div>`).join("");
  // throughput: rows per second over the last 3 s
  const now = L.elapsed;
  if (!THR.length || now > THR[THR.length - 1][0]) THR.push([now, lo.loaded]);
  while (THR.length > 150) THR.shift();
  if (go.current === "live") {
    const pts = THR.map((p, i) => { let j = i; while (j > 0 && p[0] - THR[j - 1][0] <= 3) j--; return { x: p[0], y: j === i ? 0 : Math.max(0, (p[1] - THR[j][1]) / (p[0] - THR[j][0])) }; });
    if (!charts["c-thr"]) chart("c-thr", "line", [], [{ data: [], borderColor: C.accent, borderWidth: 1.75, pointRadius: 0, tension: .25 }],
      { animation: false, parsing: false, plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { type: "linear", grid: { display: false }, border: { color: C.hair }, ticks: { callback: v => v + " s", maxTicksLimit: 8 } },
                  y: { beginAtZero: true, grid: { color: C.grid }, border: { display: false }, ticks: { callback: v => compact(v), maxTicksLimit: 5 } } } });
    const c = charts["c-thr"]; c.data.datasets[0].data = pts; c.update("none");
  }
  $("#doneBanner").classList.toggle("on", L.done);
  if (L.done) $("#doneText").innerHTML = `All <b>${fmt(s.expected)}</b> transactions are in the DW: Live ${fmt(bm.Live || 0)}, Periodic ${fmt(bm.Periodic || 0)}, Shed ${fmt(bm.Shed || 0)}.`;
}
function renderConsole(log) {
  const el = $("#console");
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  el.innerHTML = log.length ? log.map(l => `<div class="${l.kind}"><span class="t">${new Date(l.t * 1000).toTimeString().slice(0, 8)}</span>${esc(l.text)}</div>`).join("")
    : `<div class="faint">Nothing yet.</div>`;
  if (atBottom) el.scrollTop = el.scrollHeight;
}

/* ================= status polling ================= */
let lastPrep = null;
function seg(el, dotClass, html) { $(".dot", el).className = "dot " + dotClass; el.lastElementChild.innerHTML = html; }
async function poll() {
  let s;
  try { s = await api("/api/status"); } catch (e) { return; }
  ST = s;
  seg($("#pillDb"), s.connected ? "ok" : "", s.connected ? `<b>${esc(s.db.database)}</b> on ${esc(s.db.host)}` : "Not connected");
  seg($("#pillMode"), s.settings.mode === "peak" ? "peak" : "nonpeak", `<b>${s.settings.mode === "peak" ? "Peak" : "Non-peak"}</b> ${fmt(s.settings.tps)}/s · ${s.settings.source}`);
  const L = s.live;
  const state = s.running ? (L && L.done ? "All loaded" : "Running") : (s.prep.state === "running" ? "Preparing" : (s.prep.state === "done" ? (L ? "Stopped" : "Ready") : "Idle"));
  seg($("#pillRun"), s.running && !(L && L.done) || s.prep.state === "running" ? "live" : (s.prep.state === "done" ? "ok" : ""),
      `<b>${state}</b>${s.running && L ? " · " + fmt(L.elapsed, 0) + " s" : ""}`);
  if (!poll.filled) {
    $("#s-peak").value = s.settings.peak; $("#s-nonpeak").value = s.settings.nonpeak; $("#s-hour").value = s.settings.hour;
    setSeg($("#s-mode"), s.settings.mode); $("#f-file").value = s.data_file; poll.filled = true;
  }
  renderSteps(s.prep);
  $("#prepBtn").disabled = !s.connected || s.running || s.prep.state === "running";
  if (lastPrep === "running" && s.prep.state === "done") toast("Data prepared");
  lastPrep = s.prep.state;
  renderLive(s);
  renderConsole(s.log);
}
function loop() { const fast = ST && (ST.running || ST.prep.state === "running"); poll().finally(() => setTimeout(loop, fast ? 700 : 2500)); }

/* ================= DW ================= */
const STAR = ["fact_sales", "dim_customer", "dim_product", "dim_supplier", "dim_store", "dim_time"];
const ROLE = t => t === "fact_sales" ? ["fact", "Fact"] : t.startsWith("dim_") ? ["dim", "Dimension"] :
  t.startsWith("mv_") ? ["", "Materialized view"] : t === "store_quarterly_sales" ? ["", "View"] :
  t === "shed_table" ? ["", "Shed table"] : t === "periodic_sales_data" ? ["", "Staging"] : ["", "Master Data"];
async function loadSchema() {
  if (!ST || !ST.connected) { $("#tables").innerHTML = `<div class="note-box" style="margin:16px">Connect in Setup to see the tables.</div>`; return; }
  let r; try { r = await api("/api/schema"); } catch (e) { $("#tables").innerHTML = `<div class="note-box err" style="margin:16px">${esc(e.message)}</div>`; return; }
  const names = Object.keys(r.tables).sort((a, b) => ((STAR.indexOf(a) < 0) - (STAR.indexOf(b) < 0)) || (STAR.indexOf(a) - STAR.indexOf(b)) || a.localeCompare(b));
  $("#tables").innerHTML = `<table class="tbl"><thead><tr><th>Table</th><th>Role</th><th class="r">Rows</th><th class="r">Columns</th></tr></thead><tbody>${
    names.map(t => { const [cls, label] = ROLE(t); return `<tr class="clk" data-t="${t}" tabindex="0"><td class="mono">${t}</td><td><span class="role ${cls}">${label}</span></td>
      <td class="r">${r.counts[t] === null ? "—" : fmt(r.counts[t])}</td><td class="r">${r.tables[t].length}</td></tr>
      <tr class="exp" hidden><td colspan="4"><div class="cols">${r.tables[t].map(c => `<div class="${c.key === "PRI" ? "pk" : (t === "fact_sales" && c.name.endsWith("_key") ? "fk" : "")}"><span>${c.name}</span><span>${c.type}</span></div>`).join("")}</div></td></tr>`; }).join("")}</tbody></table>`;
  $$("#tables tr.clk").forEach(tr => {
    const toggle = () => { tr.nextElementSibling.hidden = !tr.nextElementSibling.hidden; };
    tr.addEventListener("click", toggle); tr.addEventListener("keydown", e => { if (e.key === "Enter") toggle(); });
  });
}
$("#schemaRefresh").addEventListener("click", loadSchema);

/* ================= analysis ================= */
let QUERIES = [], GROUPS = [], CUR = null, LAST = null;
const QKIND = {
  1: "Slice · drill-down · top-N", 2: "Dice", 3: "Group", 4: "Slice · drill-down", 5: "Top-N", 6: "Dice · drill-down", 7: "Average",
  8: "Rank", 9: "Slice · growth", 10: "Slice", 11: "Slice · drill-down · top-N", 12: "Slice · growth", 13: "Share of total",
  14: "Drill-down", 15: "Volatility", 16: "Shopping cart", 17: "ROLLUP", 18: "Slice · drill-down", 19: "Spikes", 20: "View",
};
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
    const mv = g.title.startsWith("Materialized");
    const label = g.q ? "Q" + g.q : (mv ? "MV" : "D");
    const kind = g.q ? QKIND[g.q] : (mv ? "Materialized view" : "Loaded dates");
    return `<button class="qitem" role="option" data-i="${i}"><span class="qn">${label}</span><span><span class="qt">${esc(g.title.replace(/^Q\d+\.\s*/, ""))}</span><span class="qk">${kind}</span></span></button>`;
  }).join("");
  $$("#qlist .qitem").forEach(b => b.addEventListener("click", () => pickQuery(+b.dataset.i)));
  pickQuery(Math.max(0, GROUPS.findIndex(g => g.q === 1)));
}
function hl(sql) {
  return esc(sql).replace(/\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|JOIN|ON|AND|OR|AS|WITH|ROLLUP|CASE|WHEN|THEN|ELSE|END|LIMIT|HAVING|OVER|PARTITION BY|DISTINCT|CREATE|VIEW|TABLE|DROP|IF EXISTS|BETWEEN|IN|DESC)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(SUM|COUNT|AVG|ROUND|LAG|RANK|ROW_NUMBER|GROUPING|MIN|MAX|CAST)\(/g, '<span class="fn">$1</span>(');
}
function pickQuery(i) {
  CUR = GROUPS[i];
  $$("#qlist .qitem").forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-selected", j === i); });
  const mv = CUR.title.startsWith("Materialized");
  $("#q-num").textContent = CUR.q ? `Q${CUR.q} · ${QKIND[CUR.q]}` : (mv ? "Materialized view" : "Loaded dates");
  // titles that run over two comment lines continue in the first note
  let title = CUR.title.replace(/^Q\d+\.\s*/, ""), notes = [...CUR.notes];
  while (notes.length && /[,(]$|\b(by|for|and|the|of|per|than|twice)$/i.test(title.trim())) title += " " + notes.shift();
  $("#q-title").textContent = title;
  $("#q-notes").textContent = notes.join(" ");
  $("#q-sql").innerHTML = CUR.sql.map(hl).join(";\n\n") + ";";
  $("#q-result").style.display = "none";
}
$("#runQ").addEventListener("click", async () => {
  if (!CUR) return;
  const btn = $("#runQ"); btn.disabled = true; btn.innerHTML = "Running…";
  let res = null, secs = 0;
  try {
    for (const id of CUR.ids) { res = await api("/api/query", { id }); secs += res.seconds; }
    LAST = res;
    $("#q-result").style.display = "";
    $("#q-rows").textContent = `${fmt(res.total)} rows` + (res.total > res.rows.length ? ` · first ${fmt(res.rows.length)} shown` : "");
    $("#q-time").textContent = `${secs.toFixed(2)} s`;
    renderTable(res); setupMeasures(res);
    const v = $("#q-view .on")?.dataset.v || "table"; showView(v);
  } catch (e) { toast(e.message); }
  btn.disabled = false; btn.innerHTML = `${icon("play")}Run`;
});
const isNum = v => typeof v === "number";
const CODE_COL = /(^|_)(year|month|quarter|rank|rank_no|half|hour|id|key|no|day)$/i;
function cell(v, col) {
  if (v === null) return `<span class="faint">NULL</span>`;
  if (!isNum(v)) return esc(v);
  if (CODE_COL.test(col)) return String(v);
  return Number.isInteger(v) ? fmt(v) : fmt(v, 2);
}
function renderTable(r) {
  if (!r.columns.length) { $("#q-table").innerHTML = `<div class="note-box ok" style="margin:16px">Statement done.</div>`; return; }
  if (!r.rows.length) { $("#q-table").innerHTML = `<div class="note-box" style="margin:16px">The query returned no rows.</div>`; return; }
  const numCol = r.columns.map((c, j) => r.rows.some(x => isNum(x[j])) && !CODE_COL.test(c));
  $("#q-table").innerHTML = `<table class="tbl"><thead><tr>${r.columns.map((c, j) => `<th class="${numCol[j] ? "r" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${
    r.rows.map(row => `<tr>${row.map((v, j) => `<td class="${numCol[j] ? "r" : ""}">${cell(v, r.columns[j])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function measures(r) { return r.columns.map((c, j) => j).filter(j => r.rows.length && r.rows.every(x => x[j] === null || isNum(x[j])) && !CODE_COL.test(r.columns[j])); }
function setupMeasures(r) {
  const ms = measures(r);
  const sel = $("#q-measure");
  sel.innerHTML = ms.map(j => `<option value="${j}">${esc(r.columns[j])}</option>`).join("");
  if (ms.length) sel.value = ms[ms.length - 1];
  $("#q-view button[data-v=chart]").disabled = !ms.length;
  if (!ms.length) setSeg($("#q-view"), "table");
}
function renderQChart() {
  const r = LAST; if (!r || !r.rows.length) return;
  const y = +$("#q-measure").value;
  // label: text columns that change between rows (ids only if nothing else)
  let labs = r.columns.map((c, j) => j).filter(j => !measures(r).includes(j) && !/rank/i.test(r.columns[j]) && new Set(r.rows.map(x => x[j])).size > 1);
  const named = labs.filter(j => !/(^|_)(id|key)$/i.test(r.columns[j]));
  if (named.length) labs = named;
  let rows = r.rows.filter(x => x[y] !== null);
  let note = "";
  if (rows.length > 20) { rows = [...rows].sort((a, b) => b[y] - a[y]).slice(0, 20); note = " (top 20)"; }
  const labels = rows.map(x => labs.map(j => x[j]).join(" · ").slice(0, 48));
  const horiz = rows.length > 8 || labels.some(l => l.length > 14);
  const box = $("#q-chartbox"); box.style.height = horiz ? `${Math.max(240, rows.length * 22 + 60)}px` : "320px";
  chart("c-q", "bar", labels, [{ data: rows.map(x => x[y]), backgroundColor: rows.map(x => x[y] < 0 ? C.shed : C.accent), borderRadius: 2, maxBarThickness: 28 }], {
    indexAxis: horiz ? "y" : "x",
    plugins: { legend: { display: false }, title: { display: true, text: r.columns[y] + note, align: "start", color: C.ink2, font: { weight: 500, size: 12 }, padding: { bottom: 12 } },
      tooltip: { backgroundColor: C.ink, displayColors: false, callbacks: { label: c => fmt(horiz ? c.parsed.x : c.parsed.y, 2) } } },
    scales: horiz ? { x: { grid: { color: C.grid }, border: { display: false }, ticks: { callback: v => compact(v) } }, y: { grid: { display: false }, border: { color: C.hair }, ticks: { autoSkip: false, color: C.ink2 } } }
                  : { x: { grid: { display: false }, border: { color: C.hair }, ticks: { color: C.ink2 } }, y: { grid: { color: C.grid }, border: { display: false }, ticks: { callback: v => compact(v) } } },
  });
}
function showView(v) {
  setSeg($("#q-view"), v);
  $("#q-table").style.display = v === "table" ? "" : "none";
  $("#q-chartbox").style.display = v === "chart" ? "" : "none";
  $("#q-measure-wrap").style.display = v === "chart" ? "" : "none";
  if (v === "chart") renderQChart();
}
$$("#q-view button").forEach(b => b.addEventListener("click", () => showView(b.dataset.v)));
$("#q-measure").addEventListener("change", renderQChart);

/* ================= checks ================= */
$("#checkBtn").addEventListener("click", async () => {
  $("#checks").innerHTML = `<div class="note-box">Computing the expected values from the working data…</div>`;
  try {
    const r = await api("/api/checks");
    const okAll = r.every(c => c.ok);
    const d = n => n === "Total revenue" ? 3 : 0;
    $("#checks").innerHTML = `<div class="note-box ${okAll ? "ok" : "err"}" style="margin-bottom:16px">${okAll ? "All checks pass: every transaction is in the DW once, with the right revenue and dimensions." :
        "Some checks differ. If a run is still going or stopped early, finish it in non-peak and wait until everything is loaded."}</div>
      <div class="panel"><table class="tbl"><thead><tr><th style="width:36px"></th><th>Check</th><th class="r">Expected</th><th class="r">In the DW</th></tr></thead><tbody>${
      r.map(c => `<tr><td><span class="ck ${c.ok ? "y" : "n"}">${c.ok ? `<svg><use href="#i-check"/></svg>` : `<svg><use href="#i-x"/></svg>`}</span></td><td>${c.name}</td>
        <td class="r">${fmt(c.expected, d(c.name))}</td><td class="r">${fmt(c.actual, d(c.name))}</td></tr>`).join("")}</tbody></table></div>`;
  } catch (e) { $("#checks").innerHTML = `<div class="note-box err">${esc(e.message)}</div>`; }
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
function presenter(on) { $("#presenter").classList.toggle("on", on); document.body.classList.toggle("presenting", on); setTimeout(() => Object.values(charts).forEach(c => c.resize()), 300); }
function renderPresenter() {
  const s = STEPS[PI];
  seen.add(PI);
  $("#pr-count").textContent = `Step ${PI + 1} of ${STEPS.length}`;
  $("#pnav").style.gridTemplateColumns = `repeat(${STEPS.length}, 1fr)`;
  $("#pnav").innerHTML = STEPS.map((x, i) => `<button class="${i === PI ? "on" : (seen.has(i) ? "seen" : "")}" data-i="${i}" aria-label="Step ${i + 1}: ${x.title}" title="${x.title}"></button>`).join("");
  $$("#pnav button").forEach(b => b.addEventListener("click", () => { PI = +b.dataset.i; renderPresenter(); }));
  $("#pbody").innerHTML = `<h4>${s.title}</h4>
    <div><div class="lab">Show</div><ul>${s.show.map(x => `<li>${x}</li>`).join("")}</ul></div>
    <div><div class="lab">Say</div><div class="say">${s.say.map(x => `<p>${x}</p>`).join("")}</div></div>
    ${s.action ? `<div><button class="btn primary" id="prAction">${icon("play")}${s.action[0]}</button></div>` : ""}`;
  if (s.action) $("#prAction").addEventListener("click", () => { s.action[1](); toast(s.action[0]); });
  go(s.page);
  $("#prPrev").disabled = PI === 0; $("#prNext").textContent = PI === STEPS.length - 1 ? "Finish" : "Next";
}
$("#presentBtn").addEventListener("click", () => { presenter(true); renderPresenter(); });
$("#prClose").addEventListener("click", () => presenter(false));
$("#prPrev").addEventListener("click", () => { if (PI > 0) { PI--; renderPresenter(); } });
$("#prNext").addEventListener("click", () => { if (PI < STEPS.length - 1) { PI++; renderPresenter(); } else presenter(false); });
document.addEventListener("keydown", e => {
  if (!$("#presenter").classList.contains("on") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
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
