/* Step-through teaching simulators for the demo.
   MeshSim:   one MESHJOIN iteration at a time (src/meshjoin.py)
   ThreadSim: the threads around the stream buffer, one thread's turn at a time (src/stream.py, meshjoin.py, loader.py)
   Both are small models of the real code: same rules, smaller numbers. Mount with XSim.mount(element). */
(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const codeHTML = (lines, on) => lines.map(([t, tag]) => {
    const hit = on && tag.split(" ").some(x => on.includes(x));
    return `<span class="l ${hit ? "h" : ""}">${esc(t).replace(/(#[^"]*)$/, '<span class="c">$1</span>')}</span>`;
  }).join("");
  const fmt = n => n.toLocaleString("en-US");

  /* =====================================================================
     MESHJOIN
     ===================================================================== */
  const MeshSim = {
    mount(root) {
      const NC = 9, NP = 8, CYCLE = 9, W = 500, BUF = 1000, ON_PER_IT = 80, GROUP = 2482, TC = 6, TP = 3;
      const CODE = [
        ["def iterate(self, new_chunk):", "0"],
        ["    # 1. new chunk into H (both indexes) and the queue", "1"],
        ["    for t in new_chunk:", "1"],
        ["        t[\"customer_matched\"] = t[\"product_matched\"] = False", "1"],
        ["        self.H_cust.setdefault(t[\"customer_id\"], []).append(t)", "1"],
        ["        self.H_prod.setdefault(t[\"product_id\"], []).append(t)", "1"],
        ["    self.queue.append([new_chunk, 0])", "1"],
        ["    # 2. one page of each master table (disk buffer)", "2"],
        ["    cust_page = db.read_partition(conn, \"customer_master_data\", self.k_cust)", "2"],
        ["    prod_page = db.read_partition(conn, \"product_master_data\", self.k_prod)", "2"],
        ["    # 3. probe H with every row of the page", "3"],
        ["    for row in cust_page:", "3"],
        ["        for t in self.H_cust.get(row[\"customer_id\"], []):", "3"],
        ["            if not t[\"customer_matched\"]:", "3"],
        ["                copy 6 customer fields; customer_matched = True", "3"],
        ["    for row in prod_page:  ... same with product_matched ...", "3"],
        ["    # 4. next pages, wrap around; age; oldest leaves", "4"],
        ["    self.k_cust = (self.k_cust + 1) % self.n_cust", "4"],
        ["    self.k_prod = (self.k_prod + 1) % self.n_prod", "4"],
        ["    for entry in self.queue: entry[1] += 1", "4"],
        ["    if self.queue and self.queue[0][1] >= self.cycle:", "4"],
        ["        chunk, _ = self.queue.popleft(); self._remove_from_H(chunk)", "4"],
        ["        return chunk          # finished, fully enriched", "4"],
      ];
      root.classList.add("sx");
      root.innerHTML = `
        <div class="sx-bar">
          <button class="sx-btn primary" data-a="step">Next step</button>
          <button class="sx-btn" data-a="iter">Next iteration</button>
          <button class="sx-btn" data-a="play">Play</button>
          <button class="sx-btn" data-a="reset">Reset</button>
          <span class="sx-meta">Iteration <b data-r="it">0</b> &middot; customer pointer <b data-r="kc">0</b> &middot; product pointer <b data-r="kp">0</b></span>
        </div>
        <div class="sx-phases" data-r="phases">
          <div data-p="1"><b>1</b>Take a chunk into H and the queue</div>
          <div data-p="2"><b>2</b>Read one page of each table</div>
          <div data-p="3"><b>3</b>Match the pages against H</div>
          <div data-p="4"><b>4</b>Move pointers, age, oldest leaves</div>
        </div>
        <div class="mj-stage">
          <div class="sx-box" data-r="xBuf">
            <h4>Stream buffer</h4><div class="sx-sub">holds 1,000 &middot; online taken first</div>
            <div class="mj-tank"><div class="o" data-r="tO"></div><div class="p" data-r="tP"></div></div>
            <div class="sx-kv"><span>online</span><b class="on" data-r="bO">0</b></div>
            <div class="sx-kv"><span>periodic</span><b class="per" data-r="bP">0</b></div>
            <div class="sx-note" data-r="bW"></div>
          </div>
          <div class="sx-box" data-r="xQ">
            <div class="mj-qhead"><h4>Queue + hash table H</h4><span class="sx-sub">oldest on top &middot; at most 9 chunks of 500 = 4,500 sales</span></div>
            <div class="mj-qwrap"><div class="mj-qt" data-r="qt"></div></div>
            <div class="sx-note">Each row is one chunk. A filled square means the chunk has met that page, so every sale in it whose customer (or product) is on that page is now enriched.</div>
          </div>
          <div class="sx-box" data-r="xOut">
            <h4>Output queue</h4><div class="sx-sub">store added, then loader</div>
            <div class="mj-outn" data-r="outN">0</div><div class="sx-note" style="margin-top:0">sales enriched</div>
            <div class="sx-note" data-r="outL"></div>
          </div>
        </div>
        <div class="mj-disk">
          <div class="sx-box" data-r="xDB">
            <h4>Disk buffer</h4><div class="sx-sub">the 2 pages in memory now</div>
            <div class="mj-pg">customer page <b data-r="dbC">&ndash;</b></div>
            <div class="mj-pg">product page <b data-r="dbP">&ndash;</b></div>
          </div>
          <div class="sx-box" data-r="xDisk">
            <h4>Master Data on disk (MySQL)</h4><div class="sx-sub">read with <code>WHERE partition_no = k</code> &middot; 500 rows per page</div>
            <div class="mj-pages">
              <div class="lab">customer<br><span class="sx-faint">4,338 rows</span></div><div class="mj-prow" data-r="rowC"></div>
              <div class="lab">product<br><span class="sx-faint">3,665 rows</span></div><div class="mj-prow" data-r="rowP"></div>
            </div>
          </div>
          <div class="sx-box">
            <h4>Store</h4><div class="sx-sub">not on disk</div>
            <div class="sx-note" style="margin-top:0">Added after MESHJOIN from a list of 5 stores in memory: online &rarr; 1, periodic &rarr; 2 + n mod 4.</div>
          </div>
        </div>
        <div class="sx-legend">
          <span><i style="background:var(--online)"></i>online sales</span>
          <span><i style="background:var(--periodic)"></i>periodic sales</span>
          <span><i style="background:var(--accent)"></i>page met once</span>
          <span><i style="background:#083A46"></i>product page met twice</span>
          <span><i style="background:var(--panel);box-shadow:inset 0 0 0 2px var(--shed)"></i>traced sale's own pages</span>
          <span><i style="background:var(--panel);border:2px solid var(--ink)"></i>page being read now</span>
        </div>
        <div class="sx-say">
          <div class="sx-narr" data-r="narr" aria-live="polite"></div>
          <pre class="sx-code" data-r="code"></pre>
        </div>
        <p class="sx-foot">Simplified feed so you can follow it: 80 online sales arrive per iteration, and a 2,482-row hourly group arrives at iterations 1 and 13 and waits until the buffer has room (non-peak). The traced sale's pages (customer 6, product 3) are an example. In the real run an iteration takes a fraction of a second.</p>`;
      const r = n => root.querySelector(`[data-r="${n}"]`);
      let S, timer = null;
      const reset = () => {
        S = { it: 0, phase: 0, kc: 0, kp: 0, on: 0, per: 0, waiting: 0, queue: [], next: 1, newChunk: null, leaving: null,
              out: 0, lastOut: null, dbC: null, dbP: null, tr: { cust: null, prod: null, out: null } };
        render();
      };
      const arrive = () => {
        if (S.it === 1 || S.it === 13) S.waiting += GROUP;
        const room = () => BUF - S.on - S.per;
        S.on += Math.min(ON_PER_IT, room());
        const p = Math.min(S.waiting, room()); S.per += p; S.waiting -= p;
      };
      const step = () => {
        if (S.phase === 0 || S.phase === 4) {
          S.it++; S.phase = 1; S.leaving = null; arrive();
          const o = Math.min(S.on, W), p = Math.min(S.per, W - o);
          S.on -= o; S.per -= p; S.newChunk = null;
          if (o + p > 0) { const c = { id: S.next++, on: o, per: p, age: 0, cs: new Set(), ps: new Map() }; S.queue.push(c); S.newChunk = c; }
        } else if (S.phase === 1) { S.phase = 2; S.dbC = S.kc; S.dbP = S.kp; }
        else if (S.phase === 2) {
          S.phase = 3;
          S.queue.forEach(c => { c.cs.add(S.kc); c.ps.set(S.kp, (c.ps.get(S.kp) || 0) + 1);
            if (c.id === 1) { if (S.kc === TC && S.tr.cust == null) S.tr.cust = S.it; if (S.kp === TP && S.tr.prod == null) S.tr.prod = S.it; } });
        } else if (S.phase === 3) {
          S.phase = 4; S.kc = (S.kc + 1) % NC; S.kp = (S.kp + 1) % NP;
          S.queue.forEach(c => c.age++);
          if (S.queue.length && S.queue[0].age >= CYCLE) {
            const c = S.queue.shift(); S.leaving = c; S.out += c.on + c.per; S.lastOut = c;
            if (c.id === 1) S.tr.out = S.it;
          }
        }
        render();
      };
      const iter = () => { if (S.phase === 4 || S.phase === 0) step(); while (S.phase !== 4) step(); };
      const render = () => {
        r("it").textContent = S.it; r("kc").textContent = S.kc; r("kp").textContent = S.kp;
        root.querySelectorAll("[data-r=phases] div").forEach(d => { const p = +d.dataset.p; d.classList.toggle("on", p === S.phase); d.classList.toggle("past", p < S.phase); });
        ["xBuf", "xQ", "xDB", "xDisk", "xOut"].forEach(n => r(n).classList.remove("hl"));
        ({ 1: ["xBuf", "xQ"], 2: ["xDisk", "xDB"], 3: ["xDB", "xQ"], 4: ["xQ", "xOut"] }[S.phase] || []).forEach(n => r(n).classList.add("hl"));
        r("tO").style.flexBasis = (S.on / BUF * 100) + "%"; r("tP").style.flexBasis = (S.per / BUF * 100) + "%";
        r("bO").textContent = fmt(S.on); r("bP").textContent = fmt(S.per);
        r("bW").textContent = S.waiting ? `${fmt(S.waiting)} periodic waiting for room (non-peak, no shedding)` : "";
        const rows = [`<div class="hd l">chunk</div><div class="hd l">size</div><div class="hd grp9">customer pages</div><div></div><div class="hd grp8">product pages</div><div></div><div class="hd l">age</div>`,
          `<div></div><div></div>` + [...Array(9)].map((_, k) => `<div class="hd">${k}</div>`).join("") + `<div></div>` + [...Array(8)].map((_, k) => `<div class="hd">${k}</div>`).join("") + `<div></div><div></div>`];
        const list = (S.phase === 4 && S.leaving ? [S.leaving] : []).concat(S.queue);
        const cur = S.phase === 2 || S.phase === 3;
        list.forEach(c => {
          const cls = [c === S.leaving ? "leaving" : "", c === S.newChunk && S.phase === 1 ? "new" : "", c.id === 1 ? "traced" : ""].join(" ");
          const cc = [...Array(9)].map((_, k) => `<div class="cell ${c.cs.has(k) ? "m" : ""} ${c.id === 1 && k === TC ? "t" : ""} ${cur && k === S.dbC ? "cur" : ""}"></div>`).join("");
          const pc = [...Array(8)].map((_, k) => `<div class="cell ${(c.ps.get(k) || 0) >= 2 ? "m2" : (c.ps.has(k) ? "m" : "")} ${c.id === 1 && k === TP ? "t" : ""} ${cur && k === S.dbP ? "cur" : ""}"></div>`).join("");
          const ages = [...Array(CYCLE)].map((_, k) => `<i class="${k < c.age ? "f" : ""}"></i>`).join("");
          rows.push(`<div class="qrow ${cls}"><div class="id">#${c.id}</div><div class="szc">${c.on + c.per} sales<div class="sx-mix"><div class="o" style="width:${c.on / W * 100}%"></div><div class="p" style="width:${c.per / W * 100}%"></div></div></div>${cc}<div></div>${pc}<div></div><div class="agec"><div class="age">${ages}</div>${c === S.leaving ? "leaves" : c.age + "/9"}</div></div>`);
        });
        for (let i = S.queue.length; i < CYCLE; i++) rows.push(`<div class="emptyrow">empty place</div>`);
        r("qt").innerHTML = rows.join("");
        const pages = (n, now, t, total) => [...Array(n)].map((_, k) =>
          `<div class="mj-tile ${k === now ? "cur" : ""} ${S.queue.some(c => c.id === 1) && k === t ? "t" : ""}">${k}<small>${k === n - 1 ? total - 500 * (n - 1) : 500}</small></div>`).join("");
        r("rowC").innerHTML = pages(NC, cur ? S.dbC : -1, TC, 4338);
        r("rowP").innerHTML = pages(NP, cur ? S.dbP : -1, TP, 3665);
        r("dbC").textContent = S.dbC == null ? "–" : S.dbC; r("dbP").textContent = S.dbP == null ? "–" : S.dbP;
        r("outN").textContent = fmt(S.out);
        r("outL").innerHTML = S.lastOut ? `Last out: chunk #${S.lastOut.id}, ${S.lastOut.on} online + ${S.lastOut.per} periodic, all pages met.` : "Nothing yet. The first chunk leaves at the end of iteration 9.";
        r("code").innerHTML = codeHTML(CODE, S.phase ? [String(S.phase)] : null);
        narrate();
      };
      const narrate = () => {
        const n = S.newChunk, it = S.it; let h = "", b = "";
        if (S.phase === 0) { h = "Ready"; b = `<p>The queue is empty and the pointers are at page 0 of each table. Press <b>Next step</b> to start iteration 1.</p>`; }
        if (S.phase === 1) { h = `Iteration ${it} · step 1: take a chunk`;
          b = n ? `<p>The buffer gave <b>${n.on + n.per}</b> sales: <b class="on">${n.on} online</b> first, then <b class="per">${n.per} periodic</b>. Each gets <code>customer_matched = False</code> and <code>product_matched = False</code>, is added to <b>H_cust</b> and <b>H_prod</b>, and the chunk joins the end of the queue with age 0.</p>`
                : `<p>No new sales. MESHJOIN still iterates with an empty chunk so the chunks inside keep ageing and can leave.</p>`;
          if (it === 1 || it === 13) b += `<p>An hourly group of 2,482 periodic sales arrived. Only what fits in the 1,000-place buffer goes in; the rest waits.</p>`; }
        if (S.phase === 2) { h = `Iteration ${it} · step 2: read two pages`;
          b = `<p>One query per table: customer page <b>${S.dbC}</b> and product page <b>${S.dbP}</b>, 500 rows each (fewer on the last page). These two pages are the disk buffer. Nothing else is read from disk this iteration.</p>`; }
        if (S.phase === 3) { h = `Iteration ${it} · step 3: match`;
          b = `<p>For every row on customer page <b>${S.dbC}</b>, look up its customer_id in <b>H_cust</b>; every sale found that is not yet matched gets its 6 customer attributes. Same for product page <b>${S.dbP}</b> with <b>H_prod</b> and 4 product attributes.</p><p>All <b>${S.queue.length}</b> chunk${S.queue.length === 1 ? "" : "s"} in memory are checked at once by these two reads. That is the saving.</p>`; }
        if (S.phase === 4) { h = `Iteration ${it} · step 4: move on`;
          b = `<p>Pointers move to customer page <b>${S.kc}</b> and product page <b>${S.kp}</b> (after the last page they wrap to 0). Every chunk's age goes up by 1.</p>` +
            (S.leaving ? `<p><b class="ok">Chunk #${S.leaving.id} reached age 9 and leaves</b>: its ${S.leaving.on + S.leaving.per} sales are removed from H and sent to the output queue, fully enriched.</p>` : `<p>No chunk has reached age 9 yet, so nothing leaves.</p>`); }
        const t = S.tr, inQ = S.queue.some(c => c.id === 1) || t.out;
        const tr = !inQ ? "" : `<div class="sx-trace"><b>Traced sale</b> <span class="sx-faint">(in chunk #1; customer on page ${TC}, product on page ${TP})</span>
          <div class="tr-row"><span>customer attributes</span><span class="${t.cust ? "ok" : "wait"}">${t.cust ? "filled in iteration " + t.cust : "waiting for page " + TC}</span></div>
          <div class="tr-row"><span>product attributes</span><span class="${t.prod ? "ok" : "wait"}">${t.prod ? "filled in iteration " + t.prod : "waiting for page " + TP}</span></div>
          <div class="tr-row"><span>leaves MESHJOIN</span><span class="${t.out ? "ok" : "wait"}">${t.out ? "end of iteration " + t.out : "after 9 iterations"}</span></div></div>`;
        r("narr").innerHTML = `<h4>${h}</h4>${b}${tr}`;
      };
      const play = () => {
        const btn = root.querySelector("[data-a=play]");
        if (timer) { clearInterval(timer); timer = null; btn.textContent = "Play"; return; }
        btn.textContent = "Pause"; timer = setInterval(step, 900);
      };
      root.querySelector("[data-a=step]").onclick = step;
      root.querySelector("[data-a=iter]").onclick = iter;
      root.querySelector("[data-a=play]").onclick = play;
      root.querySelector("[data-a=reset]").onclick = () => { if (timer) play(); reset(); };
      reset();
      return { step, iter, reset, stop: () => { if (timer) play(); } };
    }
  };

  /* =====================================================================
     THREADS + STREAM BUFFER
     ===================================================================== */
  const ThreadSim = {
    mount(root) {
      const LIMIT = 20, CHUNK = 10, HOUR = 6, CYCLE = 9, GROUPS = 48;
      const CARTS = [[3, 2, 4, 1, 5, 2, 3, 4, 2, 4], [2, 5, 3, 1, 4, 3, 2, 5, 3, 2], [4, 1, 3, 3, 2, 5, 2, 4, 3, 3]];
      const LETTERS = "ABCDEFGHIJ";
      const ORDER = ["periodic", "online", "mesh", "loader"];
      const NAMES = { main: "Main thread", periodic: "PeriodicThread", online: "OnlineThread", mesh: "MeshJoinThread", loader: "LoaderThread" };
      const CODE = {
        periodic: [
          ["for k in range(self.groups):                       # 48 groups", "all"],
          ["    while time.time() < next_release or self.settings.source == \"online\":", "sleep held"],
          ["        time.sleep(0.05)", "sleep held"],
          ["    if time.time() - next_release > 1:               # held back by \"online\"", "restart"],
          ["        next_release = time.time()                   # restart the hour clock", "restart"],
          ["    next_release += self.settings.hour_seconds", "release"],
          ["    rows = db.release_group(conn, k)                 # sets released = 1", "release"],
          ["    carts = rows grouped by transaction_id", "release"],
          ["    for cart in carts.values():", "peak np"],
          ["        if self.settings.mode == \"peak\":", "peak"],
          ["            if self.buffer.try_put_cart(cart): self.sent += len(cart)", "peak"],
          ["            else: db.shed_rows(conn, cart)           # whole cart to shed_table", "shed"],
          ["        else:", "np"],
          ["            for t in cart:", "np"],
          ["                self.buffer.put_periodic(t, stop)   # wait() while full", "np"],
        ],
        online: [
          ["for row in csv.DictReader(f):                      # online_sales_stream.csv", "all"],
          ["    while self.settings.source == \"periodic\": time.sleep(0.05)", "paused"],
          ["    t = to_transaction(row, \"Live\")", "put"],
          ["    if self.settings.mode == \"peak\":", "peak"],
          ["        put, evicted = self.buffer.put_online_peak(t)  # never waits", "peak"],
          ["        if evicted: db.shed_rows(conn, evicted)     # newest periodic cart", "evict"],
          ["        if not put: db.shed_rows(conn, [t])         # last resort: online", "shedon"],
          ["    else:", "np"],
          ["        self.buffer.put_online(t, stop)             # wait() while full", "np"],
          ["    next_time += 1.0 / self.settings.tps()          # 80/s peak, 10/s non-peak", "put"],
          ["    delay = next_time - time.time()", "put"],
          ["    if delay > 0: time.sleep(delay)", "put"],
          ["    else: next_time = time.time()                   # held up: don't rush", "late"],
        ],
        mesh: [
          ["while not self.stop_event.is_set():", "all"],
          ["    chunk = self.buffer.take_chunk(500)    # online first, then whole carts", "take"],
          ["    #   ... inside take_chunk: self.lock.notify_all()  wakes waiting threads", "notify"],
          ["    if self.settings.mode == \"non-peak\" and len(chunk) < 500:", "back"],
          ["        back = db.read_shed(conn, 500 - len(chunk))   # online-flagged first", "back"],
          ["        chunk += [to_transaction(r, \"Shed\") for r in back]", "back"],
          ["    if chunk or self.mj.queue:", "iter"],
          ["        finished = self.mj.iterate(chunk)        # one MESHJOIN iteration", "iter"],
          ["        send_to_output(finished, self.output)    # + store, to the loader", "out"],
        ],
        loader: [
          ["t = self.output.get(timeout=0.1)                   # queue.Queue, thread-safe", "get"],
          ["if t[\"sales_mode\"] == \"Online\": batch.append(t)", "get"],
          ["else: self.waiting.append(t)                       # periodic waits for the hour", "get"],
          ["if batch and (len(batch) >= 1000 or 0.5 s passed):", "batch"],
          ["    self.load(conn, batch)        # dimensions first, then facts, one commit", "batch"],
          ["if time.time() >= next_hour:", "hour"],
          ["    self.load_waiting(conn)       # all periodic sales together", "hour"],
          ["    next_hour += self.settings.hour_seconds", "hour"],
        ],
        main: [
          ["while True:", "all"],
          ["    words = input(\"> \").strip().lower().split()   # blocks only the main thread", "all"],
          ["    cmd = words[0]", "all"],
          ["    if cmd in (\"online\", \"periodic\", \"both\"):", "source"],
          ["        settings.source = cmd", "source"],
          ["    elif cmd in (\"peak\", \"non-peak\"):", "mode"],
          ["        settings.mode = cmd", "mode"],
          ["    elif cmd == \"speed\" and words[1] == \"peak\":", "speed"],
          ["        settings.peak_tps = int(words[2])", "speed"],
          ["    elif cmd == \"status\": print_status(...)", "status"],
          ["    elif cmd == \"quit\": break     # then stop.set() and join the threads", "quit"],
        ],
      };
      root.classList.add("sx");
      root.innerHTML = `
        <div class="sx-bar">
          <button class="sx-btn primary" data-a="step">Next step</button>
          <button class="sx-btn" data-a="tick">Next tick</button>
          <button class="sx-btn" data-a="shedwalk">Show the shed path</button>
          <button class="sx-btn" data-a="play">Play</button>
          <button class="sx-btn" data-a="reset">Reset</button>
          <span class="sx-meta">Tick <b data-r="tick">0</b> &middot; simulated hour <b data-r="hour">0</b> &middot; next group <b data-r="grp">0</b> at tick <b data-r="nrel">0</b></span>
        </div>
        <div class="sx-phases" data-r="turns">
          <div data-p="periodic"><b>1</b>PeriodicThread</div>
          <div data-p="online"><b>2</b>OnlineThread</div>
          <div data-p="mesh"><b>3</b>MeshJoinThread</div>
          <div data-p="loader"><b>4</b>LoaderThread</div>
        </div>
        <div class="sx-box th-main" data-r="c-main">
          <div class="th-head"><h4>Main thread</h4><span class="th-state" data-r="s-main">reading commands</span></div>
          <div class="th-cmds">
            <span class="grp"><span class="lb">mode</span><span class="sx-seg" data-k="mode"><button data-v="peak">peak</button><button data-v="non-peak">non-peak</button></span></span>
            <span class="grp"><span class="lb">source</span><span class="sx-seg" data-k="source"><button data-v="online">online</button><button data-v="periodic">periodic</button><button data-v="both">both</button></span></span>
            <span class="grp"><span class="lb">speed peak</span><span class="sx-seg" data-k="peak"><button data-v="3">normal</button><button data-v="14">flood</button></span></span>
            <span class="th-settings" data-r="settings"></span>
          </div>
        </div>
        <div class="th-stage">
          <div class="th-col">
            <div class="sx-box" data-r="c-online">
              <div class="th-head"><h4>OnlineThread</h4><span class="th-state" data-r="s-online"></span></div>
              <div class="sx-sub">reads online_sales_stream.csv in time order</div>
              <div class="sx-kv"><span>speed now</span><b data-r="o-speed"></b></div>
              <div class="sx-kv"><span>sent to buffer</span><b data-r="o-sent">0</b></div>
              <div class="sx-kv"><span>held (waiting)</span><b data-r="o-held">&ndash;</b></div>
            </div>
            <div class="sx-box" data-r="c-periodic">
              <div class="th-head"><h4>PeriodicThread</h4><span class="th-state" data-r="s-periodic"></span></div>
              <div class="sx-sub">one group per hour from periodic_sales_data</div>
              <div class="th-groups" data-r="groups" aria-label="48 groups, released flag"></div>
              <div class="sx-kv"><span>sent to buffer</span><b data-r="p-sent">0</b></div>
              <div class="sx-kv"><span>waiting for room</span><b data-r="p-pend">0</b></div>
            </div>
          </div>
          <div class="sx-box th-buf" data-r="c-buf">
            <div class="th-head"><h4>StreamBuffer</h4><span class="th-lock" data-r="lock">lock free</span></div>
            <div class="sx-sub">two deques, one shared limit &middot; <code>threading.Condition</code></div>
            <div class="th-cap"><div class="th-capbar" data-r="capbar"></div><span data-r="cap"></span></div>
            <div class="th-lane"><div class="th-ll">online deque</div><div class="th-items" data-r="lo"></div></div>
            <div class="th-lane"><div class="th-ll">periodic deque <span class="sx-faint">(whole carts)</span></div><div class="th-items" data-r="lp"></div></div>
            <div class="sx-note" data-r="bufnote"></div>
          </div>
          <div class="th-col">
            <div class="sx-box" data-r="c-mesh">
              <div class="th-head"><h4>MeshJoinThread</h4><span class="th-state" data-r="s-mesh"></span></div>
              <div class="sx-sub">takes up to ${CHUNK} &middot; sales leave after ${CYCLE} iterations</div>
              <div class="th-mem" data-r="mem"></div>
              <div class="sx-kv"><span>last chunk</span><b data-r="m-last">&ndash;</b></div>
              <div class="th-chunk" data-r="chunkbar" aria-label="places in the last chunk"></div>
              <div class="sx-kv"><span>read back from shed</span><b data-r="m-back">0</b></div>
            </div>
            <div class="sx-box" data-r="c-loader">
              <div class="th-head"><h4>LoaderThread</h4><span class="th-state" data-r="s-loader"></span></div>
              <div class="sx-sub">output queue &rarr; DW</div>
              <div class="sx-kv"><span>loaded online</span><b data-r="l-on">0</b></div>
              <div class="sx-kv"><span>periodic waiting for the hour</span><b data-r="l-wait">0</b></div>
              <div class="sx-kv"><span>loaded periodic</span><b data-r="l-per">0</b></div>
              <div class="sx-kv"><span>of these, processing_mode Shed</span><b data-r="l-shed">0</b></div>
            </div>
          </div>
        </div>
        <div class="sx-box th-shed" data-r="c-shed">
          <div class="th-head"><h4>shed_table (disk)</h4><span class="sx-faint" data-r="shedcount"></span></div>
          <div class="th-lane"><div class="th-ll">flag Online</div><div class="th-items" data-r="so"></div></div>
          <div class="th-lane"><div class="th-ll">flag Periodic</div><div class="th-items" data-r="sp"></div></div>
          <div class="th-path" data-r="path"></div>
        </div>
        <div class="sx-legend">
          <span><i style="background:var(--online)"></i>online sale</span>
          <span><i style="background:var(--periodic)"></i>periodic sale (letter = its cart)</span>
          <span><i style="background:var(--panel);box-shadow:inset 0 0 0 2px var(--shed)"></i>just shed</span>
          <span><i style="background:var(--panel);box-shadow:inset 0 0 0 2px var(--accent)"></i>just added</span>
          <span><i class="th-legshed"></i>place filled from shed_table</span>
        </div>
        <div class="sx-say">
          <div class="sx-narr" data-r="narr" aria-live="polite"></div>
          <pre class="sx-code" data-r="code"></pre>
        </div>
        <p class="sx-foot">Same rules as the code, smaller numbers so every sale is visible: buffer 20 (real 1,000), chunk 10 (500), an hourly group of about 30 sales in carts (about 2,482), one hour = 6 ticks (60 s), online 3 per tick in peak and 1 in non-peak (80/s and 10/s). Here the threads take turns so you can follow them; in the program they run at the same time and the lock makes their buffer changes happen one at a time.</p>`;
      const r = n => root.querySelector(`[data-r="${n}"]`);
      let S, timer = null;

      const reset = () => {
        S = { tick: 0, turn: 0, set: { mode: "peak", source: "both", peak: 3, nonpeak: 1 },
              on: [], per: [], nextO: 1, held: null, k: 0, nextRel: 0, heldDue: false, pending: [],
              shed: [], shedId: 1, mem: [], output: [], wait: [], loadedOn: 0, loadedPer: 0, loadedShed: 0, hit: 0, guide: null,
              sentO: 0, sentP: 0, shedO: 0, shedP: 0, back: 0, lastChunk: null, fresh: new Set(), freshShed: new Set(),
              st: { main: "reading commands", online: "not started", periodic: "not started", mesh: "not started", loader: "not started" },
              acting: null, lockBy: null, tags: null, narr: null, released: new Set() };
        render();
      };
      const room = () => LIMIT - S.on.length - S.per.length;
      const shedRows = (rows, flag) => { if (rows.length) S.hit = 1; rows.forEach(x => { const s = { ...x, flag, at: S.tick, sid: S.shedId++ }; S.shed.push(s); S.freshShed.add(s.sid); }); };
      const group = k => {
        const sizes = CARTS[k % CARTS.length], rows = [];
        sizes.forEach((n, i) => { for (let j = 0; j < n; j++) rows.push({ id: `${k}${LETTERS[i]}${j + 1}`, cart: `${k}${LETTERS[i]}`, letter: LETTERS[i], mode: "Periodic", proc: "Periodic" }); });
        return rows;
      };
      const cartsOf = rows => { const m = new Map(); rows.forEach(x => { if (!m.has(x.cart)) m.set(x.cart, []); m.get(x.cart).push(x); }); return [...m.values()]; };
      const add = (lane, x) => { lane.push(x); S.fresh.add(x.id); };

      /* ---- one thread's turn ---- */
      function periodicTurn() {
        const out = { tags: [], text: "" }; S.lockBy = null;
        if (S.set.source === "online") {
          if (S.tick >= S.nextRel && S.k < GROUPS) S.heldDue = true;
          S.st.periodic = "held"; out.tags = ["held"];
          out.text = `<p>The source is <b>online</b>, so the PeriodicThread keeps sleeping in its while-loop and releases nothing${S.heldDue ? ` (group ${S.k} is due and waits)` : ""}.</p>`;
          return out;
        }
        let rows = null;
        if (S.pending.length) { rows = S.pending; S.pending = []; out.text = `<p>It is still feeding the last group: <b>${rows.length}</b> rows were waiting for room. The next group waits behind them.</p>`; }
        else if (S.k < GROUPS && S.tick >= S.nextRel) {
          let restart = "";
          if (S.heldDue && S.tick > S.nextRel) { S.nextRel = S.tick; restart = ` It was held back by the <b>online</b> command, so it releases at once and restarts the hour clock.`; out.tags.push("restart"); }
          S.heldDue = false;
          rows = group(S.k); S.released.add(S.k);
          out.text = `<p><b>Hour ${S.k}: group ${S.k} released.</b> <code>release_group(conn, ${S.k})</code> reads its ${rows.length} rows and sets <code>released = 1</code>, so it is never sent twice. The rows are grouped into ${cartsOf(rows).length} carts.${restart}</p>`;
          out.tags.push("release"); S.k++; S.nextRel += HOUR;
        } else {
          S.st.periodic = S.k >= GROUPS ? "finished" : "sleeping"; out.tags = ["sleep"];
          out.text = S.k >= GROUPS ? `<p>All 48 groups are released.</p>` : `<p>Nothing to do: it sleeps until tick <b>${S.nextRel}</b>, when hour ${S.k} starts.</p>`;
          return out;
        }
        S.lockBy = "periodic";
        if (S.set.mode === "peak") {
          let inn = 0, shed = 0, nIn = 0, nShed = 0;
          cartsOf(rows).forEach(c => {
            if (room() >= c.length) { c.forEach(x => add(S.per, x)); inn += c.length; nIn++; S.sentP += c.length; }
            else { shedRows(c, "Periodic"); shed += c.length; nShed++; S.shedP += c.length; }
          });
          out.tags.push("peak"); if (shed) out.tags.push("shed");
          S.st.periodic = "putting carts";
          out.text += `<p><b>Peak:</b> each cart goes in only if it fits whole (<code>try_put_cart</code>). <b>${nIn}</b> carts (${inn} sales) went in${shed ? `; <b class="shed">${nShed} carts (${shed} sales) did not fit and were shed whole</b> to shed_table with the flag Periodic` : ""}. It never waits in peak.</p>`;
        } else {
          let i = 0; while (i < rows.length && room() > 0) { add(S.per, rows[i]); i++; S.sentP++; }
          S.pending = rows.slice(i); out.tags.push("np");
          S.st.periodic = S.pending.length ? "waiting" : "putting rows";
          out.text += `<p><b>Non-peak:</b> rows go in one by one; nothing is shed. <b>${i}</b> went in.` +
            (S.pending.length ? ` The buffer is full, so the thread calls <code>wait()</code> on the Condition and sleeps with <b>${S.pending.length}</b> rows still to send.</p>` : `</p>`);
        }
        return out;
      }
      function onlineTurn() {
        const out = { tags: [], text: "" }; S.lockBy = null;
        if (S.set.source === "periodic") { S.st.online = "paused"; out.tags = ["paused"]; out.text = `<p>The source is <b>periodic</b>, so the OnlineThread pauses before reading its next row. Its clock restarts when it resumes.</p>`; return out; }
        S.lockBy = "online";
        const n = S.set.mode === "peak" ? S.set.peak : S.set.nonpeak;
        const next = () => { if (S.held) { const x = S.held; S.held = null; return x; } return { id: "o" + S.nextO++, mode: "Online", proc: "Live" }; };
        if (S.set.mode === "peak") {
          let put = 0, evC = 0, evR = 0, shedOn = 0;
          for (let i = 0; i < n; i++) {
            const t = next();
            if (room() <= 0 && S.per.length) {
              const id = S.per[S.per.length - 1].cart, ev = [];
              while (S.per.length && S.per[S.per.length - 1].cart === id) ev.unshift(S.per.pop());
              shedRows(ev, "Periodic"); evC++; evR += ev.length; S.shedP += ev.length;
            }
            if (room() > 0) { add(S.on, t); put++; S.sentO++; } else { shedRows([t], "Online"); shedOn++; S.shedO++; }
          }
          out.tags = ["put", "peak"]; if (evC) out.tags.push("evict"); if (shedOn) out.tags.push("shedon");
          S.st.online = "putting";
          out.text = `<p><b>Peak:</b> ${n} online sales this tick. <code>put_online_peak</code> never waits. <b>${put}</b> went into the online deque.</p>` +
            (evC ? `<p class="shed"><b>The buffer was full</b>, so the newest periodic cart in the buffer was taken out to make room: ${evC} cart${evC > 1 ? "s" : ""}, ${evR} sales, to shed_table. Periodic is shed before online.</p>` : "") +
            (shedOn ? `<p class="shed"><b>${shedOn} online sale${shedOn > 1 ? "s were" : " was"} shed</b>: the buffer held only online sales, so there was no periodic cart left to remove. This is the last resort.</p>` : "");
        } else {
          let put = 0, late = false;
          for (let i = 0; i < n; i++) {
            const t = next();
            if (room() > 0) { add(S.on, t); put++; S.sentO++; } else { S.held = t; late = true; break; }
          }
          out.tags = ["put", "np"]; if (late) out.tags.push("late");
          S.st.online = late ? "waiting" : "sleeping";
          out.text = late ? `<p><b>Non-peak:</b> the buffer is full, so <code>put_online</code> calls <code>wait()</code>. Sale <b>${S.held.id}</b> is held until MESHJOIN makes room. When it gets in, the thread does not rush to catch up: it restarts its clock.</p>`
                          : `<p><b>Non-peak:</b> ${put} online sale went in, then the thread sleeps until <code>next_time</code> (one sale every 1/10 s in the real run).</p>`;
        }
        return out;
      }
      function meshTurn() {
        const out = { tags: ["take"], text: "" }; S.lockBy = "mesh";
        const chunk = [];
        while (S.on.length && chunk.length < CHUNK) chunk.push(S.on.shift());
        const nOn = chunk.length;
        while (S.per.length && chunk.length < CHUNK) {
          const id = S.per[0].cart; let size = 0; while (size < S.per.length && S.per[size].cart === id) size++;
          if (chunk.length && chunk.length + size > CHUNK) break;
          for (let i = 0; i < Math.min(size, CHUNK - chunk.length); i++) chunk.push(S.per.shift());
        }
        const nPer = chunk.length - nOn;
        let back = [];
        if (S.set.mode === "non-peak" && chunk.length < CHUNK && S.shed.length) {
          const sorted = S.shed.slice().sort((a, b) => (a.flag === b.flag ? a.sid - b.sid : a.flag === "Online" ? -1 : 1));
          const max = CHUNK - chunk.length;
          back = sorted.slice(0, max);
          const nxt = sorted[max];
          if (nxt && nxt.flag === "Periodic" && back.length && nxt.cart === back[back.length - 1].cart) {
            const whole = back.filter(x => x.cart !== nxt.cart); if (whole.length) back = whole;
          }
          const ids = new Set(back.map(x => x.sid)); S.shed = S.shed.filter(x => !ids.has(x.sid));
          back = back.map(x => ({ ...x, proc: "Shed" })); S.back += back.length; out.tags.push("back");
        }
        const all = chunk.concat(back);
        S.lastChunk = { on: nOn, per: nPer, back: back.length, backOn: back.filter(x => x.flag === "Online").length };
        if (back.length) S.hit = 3;
        const woke = (S.pending.length || S.held) ? true : false;
        if (woke) { out.tags.push("notify"); if (S.held) S.st.online = "woken by notify_all"; if (S.pending.length) S.st.periodic = "woken by notify_all"; }
        let left = 0;
        if (all.length || S.mem.length) {
          out.tags.push("iter");
          if (all.length) S.mem.push({ rows: all, age: 0 });
          S.mem.forEach(c => c.age++);
          if (S.mem.length && S.mem[0].age >= CYCLE) { const c = S.mem.shift(); S.output.push(...c.rows); left = c.rows.length; out.tags.push("out"); }
        }
        S.st.mesh = all.length ? "iterating" : (S.mem.length ? "iterating (empty chunk)" : "idle");
        out.text = `<p><code>take_chunk</code> under the lock: <b class="on">${nOn} online</b> first, then <b class="per">${nPer} periodic</b> in whole carts${nPer || S.per.length ? "" : ""}.` +
          (S.per.length && chunk.length < CHUNK ? ` The next cart did not fit in the free places, so it waits for the next iteration.` : "") + `</p>` +
          (back.length ? `<p><b>Non-peak read-back:</b> the chunk had free places, so <b>${back.length}</b> sales came back from shed_table, Online-flagged first, and were deleted there. They will reach the DW with processing_mode <b>Shed</b>.</p>` : "") +
          (woke ? `<p><code>notify_all()</code> wakes the thread that was waiting for room; it continues on its next turn.</p>` : "") +
          `<p>One MESHJOIN iteration: ${S.mem.length} chunk${S.mem.length === 1 ? "" : "s"} in memory.${left ? ` <b class="ok">The oldest chunk finished its 9 iterations: ${left} sales go to the output queue.</b>` : ""}</p>`;
        return out;
      }
      function loaderTurn() {
        const out = { tags: [], text: "" }; S.lockBy = null;
        const got = S.output.splice(0);
        if (got.length) out.tags.push("get");
        const on = got.filter(x => x.mode === "Online"), per = got.filter(x => x.mode !== "Online");
        S.loadedOn += on.length; S.wait.push(...per);
        const shedNow = on.filter(x => x.proc === "Shed").length;
        S.loadedShed += shedNow; if (shedNow) S.hit = 4;
        if (on.length) out.tags.push("batch");
        let hourly = 0;
        if (S.tick > 0 && S.tick % HOUR === 0) { hourly = S.wait.length; S.loadedPer += hourly;
          const sh = S.wait.filter(x => x.proc === "Shed").length; S.loadedShed += sh; if (sh) S.hit = 4; S.wait = []; out.tags.push("hour"); }
        S.st.loader = got.length || hourly ? "loading" : "idle, queue empty";
        out.text = (got.length ? `<p>It took <b>${got.length}</b> finished sales from the output queue (a thread-safe <code>queue.Queue</code>, not the stream buffer). <b class="on">${on.length} online</b> are loaded at once (every 0.5 s in the real run); <b class="per">${per.length} periodic</b> wait for the hour.</p>`
                               : `<p>The output queue is empty. Nothing has finished its 9 MESHJOIN iterations yet.</p>`) +
          (S.tick > 0 && S.tick % HOUR === 0 ? (hourly ? `<p><b>Hour tick:</b> all <b>${hourly}</b> waiting periodic sales are loaded together. Each batch inserts new dimension rows first, then the facts, with one commit.</p>`
                                                        : `<p><b>Hour tick:</b> no periodic sales are waiting yet, so there is nothing to load this hour.</p>`) : "");
        return out;
      }

      function step() {
        S.fresh = new Set(); S.freshShed = new Set(); S.hit = 0;
        const who = ORDER[S.turn];
        const fn = { periodic: periodicTurn, online: onlineTurn, mesh: meshTurn, loader: loaderTurn }[who];
        const out = fn();
        S.acting = who; S.tags = out.tags;
        S.narr = `<h4>Tick ${S.tick} · ${NAMES[who]}</h4>${out.text}`;
        if (S.guide && S.hit) S.narr += guideNote(S.hit);
        S.turn = (S.turn + 1) % 4;
        if (S.turn === 0) S.tick++;
        render();
      }
      const tick = () => { do step(); while (S.turn !== 0); };
      function guideNote(h) {
        const t = {
          1: "Shed path, stage 1: the buffer was full in peak, so these rows went to shed_table on disk, each with its flag. Periodic is always shed first.",
          3: "Shed path, stage 3: MESHJOIN's chunk had free places, so it filled them straight from shed_table. The rows never go back into the stream buffer, and they are deleted from shed_table.",
          4: "Shed path, stage 4: these sales finished MESHJOIN and are loaded like any other sale, marked processing_mode = Shed. That is the end of the path."
        }[h];
        return t ? `<p class="th-guide">${t}</p>` : "";
      }
      function shedWalk() {
        if (timer) play();
        reset(); S.guide = true;
        S.set.mode = "peak";
        do step(); while (S.turn !== 0);           // tick 0 in peak: carts are shed
        S.set.mode = "non-peak";
        S.acting = "main"; S.tags = ["mode"]; S.lockBy = null; S.hit = 0;
        S.narr = `<h4>Shed path: tick 0 ran in peak, now non-peak</h4>
          <p><b>Stage 1 happened:</b> the hourly group did not fit, so <b>${S.shedP}</b> periodic sales are now in <b>shed_table</b> (bottom card, red outline). Some were whole carts that arrived too late, one was a cart pushed out of the buffer to make room for online sales.</p>
          <p><b>Stage 2:</b> in peak they just wait on disk. The main thread has now switched to <b>non-peak</b>.</p>
          <p><b>Next:</b> press <b>Next step</b> three times. At MeshJoinThread's turn, watch the chunk bar: the free places are filled from shed_table (stage 3). Then keep pressing to see them loaded as <b>Shed</b> (stage 4, after 9 iterations).</p>`;
        render();
      }
      function command(k, v) {
        if (k === "mode") S.set.mode = v;
        if (k === "source") S.set.source = v;
        if (k === "peak") S.set.peak = +v;
        S.acting = "main"; S.tags = [k === "peak" ? "speed" : k]; S.lockBy = null;
        S.fresh = new Set(); S.freshShed = new Set();
        const what = k === "peak" ? `speed peak → ${v} per tick` : `${v}`;
        S.narr = `<h4>Main thread · command "${what}"</h4><p>The main thread is blocked in <code>input()</code> waiting for a command, so it never slows the others. It only changes the shared <code>Settings</code> object; each thread reads <code>settings.${k === "peak" ? "peak_tps" : k}</code> on its next turn.</p>` +
          (k === "mode" && v === "non-peak" ? `<p>In non-peak, nothing is shed: full means wait. MESHJOIN fills free places in its chunk from shed_table.</p>` : "") +
          (k === "mode" && v === "peak" ? `<p>In peak, threads never wait: a periodic cart that does not fit is shed; an online sale makes room by shedding the newest periodic cart.</p>` : "") +
          (k === "source" && v === "online" ? `<p>The PeriodicThread will hold its next group until periodic or both is typed.</p>` : "") +
          (k === "source" && v === "periodic" ? `<p>The OnlineThread pauses before its next row.</p>` : "") +
          (k === "peak" && +v > CHUNK ? `<p>${v} online per tick is more than MESHJOIN takes per iteration (${CHUNK}), so in peak the buffer fills with online sales, and once no periodic cart is left, online sales are shed.</p>` : "");
        render();
      }

      const chip = (x, shedNow) => `<i class="th-it ${x.mode === "Online" ? "o" : "p"} ${S.fresh.has(x.id) ? "new" : ""} ${shedNow ? "sh" : ""}" title="${x.id}">${x.mode === "Online" ? "" : x.letter}</i>`;
      const lane = (rows, el, shed) => {
        if (!rows.length) { el.innerHTML = `<span class="th-empty">empty</span>`; return; }
        if (rows[0].mode === "Online" && !shed) { el.innerHTML = rows.map(x => chip(x)).join(""); return; }
        const html = []; let cur = null, buf = [];
        const flush = () => { if (buf.length) html.push(cur ? `<span class="th-cart">${buf.join("")}</span>` : buf.join("")); buf = []; };
        rows.forEach(x => { const key = x.mode === "Online" ? null : x.cart; if (key !== cur) { flush(); cur = key; } buf.push(chip(x, shed && S.freshShed.has(x.sid))); });
        flush(); el.innerHTML = html.join("");
      };
      function render() {
        r("tick").textContent = S.tick; r("hour").textContent = Math.floor(S.tick / HOUR);
        r("grp").textContent = S.k < GROUPS ? S.k : "–"; r("nrel").textContent = S.k < GROUPS ? S.nextRel : "–";
        root.querySelectorAll("[data-r=turns] div").forEach(d => { d.classList.toggle("on", d.dataset.p === S.acting); d.classList.toggle("next", d.dataset.p === ORDER[S.turn]); });
        root.querySelectorAll(".sx-seg").forEach(sg => { const v = String(S.set[sg.dataset.k]); sg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === v)); });
        r("settings").innerHTML = `Settings: mode=<b>${S.set.mode}</b> &middot; source=<b>${S.set.source}</b> &middot; peak_tps=<b>${S.set.peak}</b> &middot; nonpeak_tps=<b>${S.set.nonpeak}</b>`;
        ["main", "online", "periodic", "mesh", "loader", "buf", "shed"].forEach(n => r("c-" + n).classList.remove("hl"));
        if (S.acting) r("c-" + S.acting).classList.add("hl");
        if (S.lockBy) r("c-buf").classList.add("hl");
        if (S.freshShed.size || S.hit === 3) r("c-shed").classList.add("hl");
        const stCls = s => /woken/.test(s) ? "r" : /wait/.test(s) ? "w" : /paus|held|sleep|idle|not started|finished|reading/.test(s) ? "z" : "r";
        ["main", "online", "periodic", "mesh", "loader"].forEach(n => { const s = S.st[n]; const el = r("s-" + n); el.textContent = s; el.className = "th-state " + stCls(s); });
        r("lock").textContent = S.lockBy ? `lock held by ${NAMES[S.lockBy]}` : "lock free";
        r("lock").classList.toggle("on", !!S.lockBy);
        const used = S.on.length + S.per.length;
        r("cap").textContent = `${used} of ${LIMIT}`;
        r("capbar").innerHTML = [...Array(LIMIT)].map((_, i) => `<i class="${i < S.on.length ? "o" : i < used ? "p" : ""}"></i>`).join("");
        lane(S.on, r("lo")); lane(S.per, r("lp"));
        r("bufnote").textContent = used >= LIMIT ? "Full. Peak: shed. Non-peak: wait()." : "";
        r("o-speed").textContent = S.set.source === "periodic" ? "paused" : `${S.set.mode === "peak" ? S.set.peak : S.set.nonpeak} per tick (${S.set.mode})`;
        r("o-sent").textContent = S.sentO; r("o-held").textContent = S.held ? S.held.id : "–";
        r("groups").innerHTML = [...Array(GROUPS)].map((_, k) => `<i class="${S.released.has(k) ? "r" : ""} ${k === S.k ? "n" : ""}" title="group ${k}${S.released.has(k) ? ", released = 1" : ""}"></i>`).join("");
        r("p-sent").textContent = S.sentP; r("p-pend").textContent = S.pending.length;
        r("mem").innerHTML = [...Array(CYCLE)].map((_, i) => { const c = S.mem[i]; if (!c) return `<i></i>`;
          const o = c.rows.filter(x => x.mode === "Online").length; return `<i class="f" title="${c.rows.length} sales, age ${c.age}"><span class="o" style="height:${o / CHUNK * 100}%"></span><span class="p" style="height:${(c.rows.length - o) / CHUNK * 100}%"></span></i>`; }).join("");
        r("m-last").textContent = S.lastChunk ? `${S.lastChunk.on} on + ${S.lastChunk.per} per${S.lastChunk.back ? " + " + S.lastChunk.back + " shed" : ""}` : "–";
        r("m-back").textContent = S.back;
        const lc = S.lastChunk;
        r("chunkbar").innerHTML = [...Array(CHUNK)].map((_, i) => {
          if (!lc) return `<i></i>`;
          if (i < lc.on) return `<i class="o"></i>`;
          if (i < lc.on + lc.per) return `<i class="p"></i>`;
          if (i < lc.on + lc.per + lc.backOn) return `<i class="s so">S</i>`;
          if (i < lc.on + lc.per + lc.back) return `<i class="s sp">S</i>`;
          return `<i class="e"></i>`; }).join("");
        const inPipe = S.mem.reduce((n, c) => n + c.rows.filter(x => x.proc === "Shed").length, 0) + S.wait.filter(x => x.proc === "Shed").length + S.output.filter(x => x.proc === "Shed").length;
        const stage = (n, title, num, rule, extra = "") => `<div class="st ${S.hit === n ? "hit" : ""}"><div class="n">${n}</div><div><b>${title}</b><span class="v">${num}</span><p>${rule}</p>${extra}</div></div>`;
        r("path").innerHTML = `<div class="th-path-h">The shed path</div><div class="th-path-row">` +
          stage(1, "Shed in peak", S.shedO + S.shedP, "Buffer full: the row goes to shed_table with its flag. Periodic first, online last.") + `<span class="ar">&rarr;</span>` +
          stage(2, "Waiting on disk", S.shed.length, "Nobody reads shed_table in peak.", S.set.mode === "peak" && S.shed.length ? `<em>waits for non-peak</em>` : "") + `<span class="ar">&rarr;</span>` +
          stage(3, "Read back into MESHJOIN", S.back, "Non-peak only. Fills the free places of a chunk, Online flag first, then deleted from shed_table. Never back into the buffer.") + `<span class="ar">&rarr;</span>` +
          stage(4, "Loaded as Shed", S.loadedShed, "Joined like any sale; processing_mode = Shed.", inPipe ? `<em>${inPipe} still inside MESHJOIN or waiting</em>` : "") + `</div>`;
        r("l-on").textContent = S.loadedOn; r("l-wait").textContent = S.wait.length; r("l-per").textContent = S.loadedPer; r("l-shed").textContent = S.loadedShed;
        const so = S.shed.filter(x => x.flag === "Online"), sp = S.shed.filter(x => x.flag === "Periodic");
        lane(so, r("so"), true); lane(sp, r("sp"), true);
        r("shedcount").textContent = `${S.shed.length} on disk · shed so far: ${S.shedO} online, ${S.shedP} periodic`;
        r("narr").innerHTML = S.narr || `<h4>Ready</h4><p>Four threads share one stream buffer. Press <b>Next step</b> to give the next thread its turn. Tick 0 starts with the PeriodicThread, because group 0 is released as soon as the program starts.</p><p>Use the commands at the top at any time, as you would type them in the program.</p>`;
        r("code").innerHTML = codeHTML(CODE[S.acting || "periodic"], S.tags);
      }
      const play = () => {
        const btn = root.querySelector("[data-a=play]");
        if (timer) { clearInterval(timer); timer = null; btn.textContent = "Play"; return; }
        btn.textContent = "Pause"; timer = setInterval(step, 900);
      };
      root.querySelector("[data-a=step]").onclick = step;
      root.querySelector("[data-a=tick]").onclick = tick;
      root.querySelector("[data-a=shedwalk]").onclick = shedWalk;
      root.querySelector("[data-a=play]").onclick = play;
      root.querySelector("[data-a=reset]").onclick = () => { if (timer) play(); reset(); };
      root.querySelectorAll(".sx-seg").forEach(sg => sg.querySelectorAll("button").forEach(b => b.onclick = () => command(sg.dataset.k, b.dataset.v)));
      reset();
      return { step, tick, reset, command, shedWalk, stop: () => { if (timer) play(); } };
    }
  };


  /* =====================================================================
     THE LOCK: one Condition shared by the threads (StreamBuffer.lock)
     ===================================================================== */
  const LockSim = {
    mount(root) {
      const PUT = [
        "def put_online(self, row, stop_event):",
        "    with self.lock:",
        "        while len(self.online) + len(self.periodic) >= self.limit:",
        "            if stop_event.is_set():",
        "                return False",
        "            self.lock.wait(timeout=0.2)   # sleep until MESHJOIN takes some out",
        "        self.online.append(row)",
        "        self.lock.notify_all()",
        "        return True                       # leaving 'with' frees the lock",
      ];
      const TAKE = [
        "def take_chunk(self, max_rows=500):",
        "    chunk = []",
        "    with self.lock:",
        "        while self.online and len(chunk) < max_rows:",
        "            chunk.append(self.online.popleft())",
        "        ... then whole periodic carts ...",
        "        self.lock.notify_all()            # wake a thread waiting for space",
        "    return chunk                          # left 'with': lock is free",
      ];
      const ST = [
        { h: null, fill: 1000, on: ["running", "has sale o501 to put"], me: ["running", "busy with a MESHJOIN iteration"], wait: false, put: [], take: [],
          t: "The buffer is full", x: "Two threads want the buffer. It has one lock, like a single key to a storeroom: whoever holds it is the only one allowed to touch the two lines. Mode is non-peak, so nothing may be shed." },
        { h: "on", fill: 1000, on: ["holds the lock", "has sale o501 to put"], me: ["running", "busy with a MESHJOIN iteration"], wait: false, put: [1], take: [],
          t: "OnlineThread takes the lock", x: "<code>with self.lock:</code> If another thread held it, the OnlineThread would stop on this line until it was free." },
        { h: "on", fill: 1000, on: ["holds the lock", "checks: is it full?"], me: ["running", "busy with a MESHJOIN iteration"], wait: false, put: [2], take: [],
          t: "It checks: is there room?", x: "1,000 of 1,000. Full. In non-peak it may not shed the sale, so it has to wait for MESHJOIN to take some out." },
        { h: null, fill: 1000, on: ["asleep in wait()", "still holding o501"], me: ["running", "busy with a MESHJOIN iteration"], wait: true, put: [5], take: [],
          t: "wait() gives the lock back, then sleeps", x: "<b>This is the key idea.</b> While it sleeps it does <b>not</b> hold the lock, so the buffer is free for others. It also wakes every 0.2 s to check whether quit was typed." },
        { h: "me", fill: 1000, on: ["asleep in wait()", "still holding o501"], me: ["holds the lock", "take_chunk(500)"], wait: true, put: [5], take: [2],
          t: "MESHJOIN takes the lock", x: "This is only possible because the OnlineThread let go. If <code>wait()</code> kept the lock, each thread would wait for the other forever. That is called a deadlock." },
        { h: "me", fill: 500, on: ["asleep in wait()", "still holding o501"], me: ["holds the lock", "took 500 sales"], wait: true, put: [5], take: [3, 4, 5],
          t: "It takes a chunk of 500", x: "Online first, then whole periodic carts. The buffer now has room: 500 of 1,000." },
        { h: "me", fill: 500, on: ["woken: wants the lock", "still holding o501"], me: ["holds the lock", "notify_all()"], wait: false, put: [5], take: [6],
          t: "notify_all() wakes the sleeper", x: "The OnlineThread wakes up, but it cannot run yet: MESHJOIN still holds the lock. It waits for it." },
        { h: null, fill: 500, on: ["woken: wants the lock", "still holding o501"], me: ["running", "joins the chunk"], wait: false, put: [5], take: [7],
          t: "MESHJOIN lets go of the lock", x: "Leaving the <code>with</code> block frees the lock. MESHJOIN goes back to its iteration with its 500 sales." },
        { h: "on", fill: 500, on: ["holds the lock", "checks again"], me: ["running", "joins the chunk"], wait: false, put: [2], take: [],
          t: "The OnlineThread gets the lock back and checks again", x: "<code>wait()</code> returns only after the thread holds the lock again. The <code>while</code> loop checks again, because another thread could have filled the space first. 500 of 1,000: not full." },
        { h: "on", fill: 501, on: ["holds the lock", "puts o501"], me: ["running", "joins the chunk"], wait: false, put: [6, 7], take: [],
          t: "It puts its sale in and notifies", x: "The sale goes into the online line. <code>notify_all()</code> wakes anyone else who might be waiting." },
        { h: null, fill: 501, on: ["running", "sleeps until the next sale is due"], me: ["running", "joins the chunk"], wait: false, put: [8], take: [],
          t: "Done: the lock is free", x: "Remember three words. <b>with</b>: one thread at a time. <b>wait</b>: give the lock back and sleep. <b>notify_all</b>: wake the sleepers. In peak the same lock is used, but nobody waits: a sale that does not fit is shed." },
      ];
      const pad = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
      root.classList.add("sx");
      root.innerHTML = `
        <div class="sx-bar">
          <button class="sx-btn" data-a="prev">Back</button>
          <button class="sx-btn primary" data-a="next">Next</button>
          <button class="sx-btn" data-a="reset">Start again</button>
          <div class="lk-dots" data-r="dots"></div>
          <span class="sx-meta">Step <b data-r="n">1</b> of ${ST.length}</span>
        </div>
        <div class="lk-stage">
          <div class="sx-box lk-th" data-r="on"><h4>OnlineThread</h4><span class="th-state" data-r="on-s"></span><div class="lk-do" data-r="on-d"></div><div class="lk-key" data-r="on-k">${pad} lock</div></div>
          <div class="sx-box lk-buf" data-r="buf">
            <div class="th-head"><h4>StreamBuffer</h4><span class="lk-free" data-r="free">${pad} lock is free</span></div>
            <div class="sx-sub">online line + periodic line &middot; limit 1,000</div>
            <div class="lk-bar"><div data-r="fill"></div></div>
            <div class="sx-kv"><span>in the buffer</span><b data-r="cnt"></b></div>
            <div class="lk-room" data-r="room"><span class="lb">Waiting room of the Condition</span><span data-r="sleepers"></span></div>
          </div>
          <div class="sx-box lk-th" data-r="me"><h4>MeshJoinThread</h4><span class="th-state" data-r="me-s"></span><div class="lk-do" data-r="me-d"></div><div class="lk-key" data-r="me-k">${pad} lock</div></div>
        </div>
        <div class="lk-say"><h4 data-r="t"></h4><p data-r="x"></p></div>
        <div class="lk-code">
          <div><div class="lk-cap">OnlineThread runs <code>put_online</code></div><pre class="sx-code" data-r="put"></pre></div>
          <div><div class="lk-cap">MeshJoinThread runs <code>take_chunk</code></div><pre class="sx-code" data-r="take"></pre></div>
        </div>`;
      const r = n => root.querySelector(`[data-r="${n}"]`);
      let i = 0;
      const lines = (src, on) => src.map((t, k) => `<span class="l ${on.includes(k) ? "h" : ""}">${esc(t).replace(/(#.*)$/, '<span class="c">$1</span>')}</span>`).join("");
      const cls = s => /holds/.test(s) ? "r" : /asleep/.test(s) ? "w" : /woken/.test(s) ? "k" : "z";
      function render() {
        const s = ST[i];
        r("n").textContent = i + 1;
        r("dots").innerHTML = ST.map((_, k) => `<i class="${k === i ? "on" : k < i ? "past" : ""}"></i>`).join("");
        [["on", s.on], ["me", s.me]].forEach(([k, v]) => {
          r(k + "-s").textContent = v[0]; r(k + "-s").className = "th-state " + cls(v[0]);
          r(k + "-d").textContent = v[1];
          r(k + "-k").classList.toggle("on", s.h === k);
          r(k).classList.toggle("hl", s.h === k);
          r(k).classList.toggle("asleep", k === "on" && s.wait);
        });
        r("free").classList.toggle("on", !s.h);
        r("free").innerHTML = s.h ? `${pad} lock held by ${s.h === "on" ? "OnlineThread" : "MeshJoinThread"}` : `${pad} lock is free`;
        r("buf").classList.toggle("full", s.fill >= 1000);
        r("fill").style.width = (s.fill / 10) + "%";
        r("cnt").textContent = `${s.fill.toLocaleString("en-US")} of 1,000${s.fill >= 1000 ? " (full)" : ""}`;
        r("sleepers").innerHTML = s.wait ? `<span class="lk-zz">OnlineThread (asleep, lock given back)</span>` : `<span class="sx-faint">empty</span>`;
        r("room").classList.toggle("busy", s.wait);
        r("t").textContent = s.t; r("x").innerHTML = s.x;
        r("put").innerHTML = lines(PUT, s.put); r("take").innerHTML = lines(TAKE, s.take);
        root.querySelector("[data-a=prev]").disabled = i === 0;
        root.querySelector("[data-a=next]").disabled = i === ST.length - 1;
      }
      const next = () => { if (i < ST.length - 1) { i++; render(); } };
      const prev = () => { if (i > 0) { i--; render(); } };
      const reset = () => { i = 0; render(); };
      root.querySelector("[data-a=next]").onclick = next;
      root.querySelector("[data-a=prev]").onclick = prev;
      root.querySelector("[data-a=reset]").onclick = reset;
      render();
      return { next, prev, reset, stop: () => {} };
    }
  };

  window.LockSim = LockSim;

  /* =====================================================================
     KEEPING THE SPEED: the OnlineThread's timetable (next_time)
     ===================================================================== */
  const SpeedSim = {
    mount(root) {
      const GAP = 100, WORK = 20, END = 1000, B0 = 300, B1 = 650;   // 10 TPS, drawn in ms
      const CODE = [
        ["next_time = time.time()                      # before the first sale", "start"],
        ["for row in csv.DictReader(f):", "all"],
        ["    ... put the sale in the buffer (may wait if full) ...", "put"],
        ["    next_time += 1.0 / self.settings.tps()   # when the next sale is due", "tt"],
        ["    delay = next_time - time.time()", "tt"],
        ["    if delay > 0:", "tt"],
        ["        time.sleep(delay)                    # sleep only the time that is left", "tt"],
        ["    else:", "late"],
        ["        next_time = time.time()              # held up: don't rush to catch up", "late"],
      ];
      // run the loop the way the code does; returns send times (ms)
      function run(kind, blocked) {
        let now = 0, next = 0; const sent = [];
        while (now < END) {
          if (blocked && now >= B0 && now < B1) now = B1;          // put_online waits for room
          if (now >= END) break;
          sent.push(now); now += WORK;
          if (kind === "naive") { now += GAP; continue; }         // time.sleep(1 / tps)
          next += GAP;
          const delay = next - now;
          if (delay > 0) now += delay; else if (kind === "ours") next = now;
        }
        return sent;
      }
      const SCENES = {
        why: { rows: [["due", "Due times at 10 TPS", null], ["naive", "If it slept 1/tps after each sale", run("naive", false)], ["ours", "Our timetable (next_time)", run("ours", false)]],
               blocked: false, tags: ["start", "tt"],
               t: "Why keep a timetable?",
               x: "At 10 TPS a sale is due every 100 ms (at 80 TPS, every 12.5 ms). Putting a sale in the buffer, and maybe writing to MySQL, also takes time. If the thread simply slept 100 ms after each sale, that work would be added every time and the stream would run slower than asked. Our thread remembers <b>when the next sale is due</b> and sleeps only the time that is left, so it stays on time." },
        late: { rows: [["due", "Due times at 10 TPS", null], ["rush", "If it rushed to catch up", run("rush", true)], ["ours", "Ours: restart the clock", run("ours", true)]],
               blocked: true, tags: ["put", "late"],
               t: "What if the buffer is full?",
               x: "In non-peak the buffer can be full, so <code>put_online</code> waits (shaded). When it finally gets in, it is late and <code>delay</code> is negative. If it kept the old timetable, it would send all the missed sales at once, a burst far above 10 TPS. Instead it sets <code>next_time = time.time()</code>: the next sale goes right away, then it is back to one every 100 ms. No burst." },
      };
      root.classList.add("sx");
      root.innerHTML = `
        <div class="sx-bar">
          <span class="sx-seg" data-r="scene"><button data-v="why">1. Why a timetable</button><button data-v="late">2. When it is held up</button></span>
          <button class="sx-btn primary" data-a="play">Play</button>
          <span class="sx-meta">1 second shown at 10 TPS so each sale is visible</span>
        </div>
        <div class="sp-chart"><svg data-r="svg" viewBox="0 0 940 256" role="img" aria-label="Send times of online sales on a one-second time line"></svg></div>
        <div class="lk-say"><h4 data-r="t"></h4><p data-r="x"></p></div>
        <pre class="sx-code" data-r="code"></pre>`;
      const r = n => root.querySelector(`[data-r="${n}"]`);
      const X = ms => 250 + ms / END * 610;
      let scene = "why", head = END, timer = null;
      function draw() {
        const sc = SCENES[scene], rowH = 62, top = 30;
        let g = `<g font-family="var(--mono)" font-size="13" fill="var(--ink-3)">`;
        for (let ms = 0; ms <= END; ms += 100) g += `<line x1="${X(ms)}" y1="${top - 6}" x2="${X(ms)}" y2="${top + rowH * 3 - 8}" stroke="var(--hair)" stroke-dasharray="${ms % 500 ? "2 4" : ""}"/><text x="${X(ms)}" y="${top - 12}" text-anchor="middle">${ms === END ? "1000 ms" : ms + " ms"}</text>`;
        g += `</g>`;
        if (sc.blocked) g += `<rect x="${X(B0)}" y="${top + rowH - 6}" width="${X(B1) - X(B0)}" height="${rowH * 2 - 4}" fill="#F3DFC0" opacity=".75"/><text x="${(X(B0) + X(B1)) / 2}" y="${top + rowH * 3 + 8}" text-anchor="middle" font-size="14" fill="#6B4206" font-family="var(--font)">buffer full: put_online waits</text>`;
        sc.rows.forEach(([kind, label, sent], i) => {
          const y = top + i * rowH + 18;
          g += `<text x="0" y="${y + 5}" font-size="15" font-family="var(--font)" fill="var(--ink)" font-weight="${kind === "ours" ? 600 : 400}">${label}</text>`;
          g += `<line x1="${X(0)}" y1="${y}" x2="${X(END)}" y2="${y}" stroke="var(--hair-2)"/>`;
          if (!sent) {
            for (let ms = 0; ms < END; ms += GAP) g += `<circle cx="${X(ms)}" cy="${y}" r="4" fill="none" stroke="var(--ink-3)" stroke-width="1.5"/>`;
            g += `<text x="${X(END) + 46}" y="${y + 4}" text-anchor="middle" font-size="13.5" fill="var(--ink-3)" font-family="var(--font)">10</text>`;
            return;
          }
          const col = kind === "ours" ? "var(--online)" : kind === "naive" ? "var(--ink-3)" : "var(--shed)";
          const shown = sent.filter(ms => ms <= head);
          shown.forEach(ms => { g += `<rect x="${X(ms)}" y="${y - 11}" width="${X(ms + WORK) - X(ms)}" height="22" fill="${col}" opacity=".18"/><rect x="${X(ms) - 2}" y="${y - 11}" width="4" height="22" rx="1" fill="${col}"/>`; });
          g += `<text x="${X(END) + 46}" y="${y + 4}" text-anchor="middle" font-size="13.5" font-weight="600" fill="${col}" font-family="var(--font)">${shown.length}</text>`;
          if (kind === "rush" && head >= B1 + 100) {
            const burst = sent.filter(ms => ms >= B1 && ms < B1 + 100).length;
            g += `<text x="${X(B1 + 50)}" y="${y + 28}" text-anchor="middle" font-size="13.5" fill="var(--shed)" font-family="var(--font)">${burst} sales in 100 ms = ${burst * 10} TPS burst</text>`;
          }
          if (kind === "naive" && head >= END) g += `<text x="${X(END)}" y="${y + 28}" text-anchor="end" font-size="13.5" fill="var(--ink-3)" font-family="var(--font)">only ${shown.length} sales in 1 s instead of 10: too slow</text>`;
          if (kind === "ours" && head >= END) g += `<text x="${X(END)}" y="${y + 28}" text-anchor="end" font-size="13.5" fill="var(--online)" font-family="var(--font)">${sc.blocked ? "one sale right away, then one every 100 ms again" : "exactly one every 100 ms"}</text>`;
        });
        g += `<line x1="${X(head)}" y1="${top - 4}" x2="${X(head)}" y2="${top + rowH * 3 - 8}" stroke="var(--accent)" stroke-width="1.5" opacity="${head < END ? 1 : 0}"/>`;
        g += `<text x="${X(END) + 46}" y="${top - 12}" font-size="13" fill="var(--ink-3)" font-family="var(--font)" text-anchor="middle">sent</text>`;
        r("svg").innerHTML = g;
      }
      function render() {
        const sc = SCENES[scene];
        r("scene").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === scene));
        r("t").textContent = sc.t; r("x").innerHTML = sc.x;
        r("code").innerHTML = codeHTML(CODE, sc.tags);
        draw();
      }
      function play() {
        const btn = root.querySelector("[data-a=play]");
        if (timer) { clearInterval(timer); timer = null; btn.textContent = "Play"; return; }
        head = 0; btn.textContent = "Pause";
        timer = setInterval(() => { head += 10; if (head >= END) { head = END; clearInterval(timer); timer = null; btn.textContent = "Play"; } draw(); }, 30);
      }
      const setScene = v => { scene = v; if (timer) play(); head = END; render(); };
      r("scene").querySelectorAll("button").forEach(b => b.onclick = () => setScene(b.dataset.v));
      root.querySelector("[data-a=play]").onclick = play;
      render();
      return { play, scene: setScene, stop: () => { if (timer) play(); } };
    }
  };

  window.SpeedSim = SpeedSim;

  /* =====================================================================
     LOADING THE DW: LoaderThread + consolidate() (src/loader.py, consolidation.py)
     ===================================================================== */
  const LoadSim = {
    mount(root) {
      // real rows from the cleaned data and the Master Data
      const SALES = [
        { L: "A", tid: "536365", pid: "85123A", pname: "WHITE HANGING HEART T-LIGHT HOLDER", cat: "Garden", sup: "SUP01", supn: "Northwind Supplies", cid: "17850", g: "Female", age: "51-55", qty: 6, price: "2.55", rev: "15.30", flt: "15.299999999999999", t: "2010-12-01 08:26", mode: "Online", proc: "Live", store: 1 },
        { L: "B", tid: "536365", pid: "71053", pname: "WHITE MOROCCAN METAL LANTERN", cat: "Garden", sup: "SUP05", supn: "EuroPack Partners", cid: "17850", g: "Female", age: "51-55", qty: 6, price: "3.39", rev: "20.34", flt: "20.34", t: "2010-12-01 08:26", mode: "Online", proc: "Live", store: 1 },
        { L: "C", tid: "536366", pid: "22633", pname: "HAND WARMER UNION JACK", cat: "Kitchen", sup: "SUP03", supn: "Midlands Wholesale", cid: "17850", g: "Female", age: "51-55", qty: 6, price: "1.85", rev: "11.10", flt: "11.100000000000001", t: "2010-12-01 08:28", mode: "Online", proc: "Live", store: 1 },
        { L: "D", tid: "536370", pid: "22728", pname: "ALARM CLOCK BAKELIKE PINK", cat: "Home Decor", sup: "SUP01", supn: "Northwind Supplies", cid: "12583", g: "Female", age: "36-45", qty: 24, price: "3.75", rev: "90.00", flt: "90.0", t: "2010-12-01 08:45", mode: "Periodic", proc: "Periodic", store: 3 },
        { L: "E", tid: "536370", pid: "22727", pname: "ALARM CLOCK BAKELIKE RED", cat: "Party", sup: "SUP02", supn: "Atlantic Gifts Ltd", cid: "12583", g: "Female", age: "36-45", qty: 24, price: "3.75", rev: "90.00", flt: "90.0", t: "2010-12-01 08:45", mode: "Periodic", proc: "Periodic", store: 3 },
      ];
      const STORE = { 1: ["Online", "Web"], 3: ["Manchester Arndale", "Manchester"] };
      const DIMS = [["customer", "dim_customer", s => s.cid], ["product", "dim_product", s => s.pid], ["supplier", "dim_supplier", s => s.sup],
                    ["store", "dim_store", s => String(s.store)], ["time", "dim_time", s => s.t.replace(/\D/g, "")]];
      const EVENTS = [{ k: "ready" }, { k: "read" }, { k: "row", i: 0 }, { k: "row", i: 1 }, { k: "row", i: 2 }, { k: "facts" }, { k: "commit" },
                      { k: "hour" }, { k: "row", i: 3 }, { k: "row", i: 4 }, { k: "facts" }, { k: "commit" }, { k: "done" }];
      const CODE = [
        ["# LoaderThread.run()", "c"],
        ["t = self.output.get(timeout=0.1)", "read"],
        ["if t[\"sales_mode\"] == \"Online\": batch.append(t)        # loaded at once", "read"],
        ["else: self.waiting.append(t)                           # periodic waits for the hour", "read"],
        ["if batch and (len(batch) >= 1000 or 0.5 s passed): self.load(conn, batch)", "flush"],
        ["if time.time() >= next_hour: self.load_waiting(conn)   # same load(), all periodic", "hour"],
        ["", ""],
        ["def load(self, conn, transactions):", "row facts commit"],
        ["    for t in transactions:", "row"],
        ["        dims, fact = consolidate(t)       # revenue, 5 dimension rows, fact row", "row"],
        ["        for name, row in dims.items():    # 1. dimensions first", "row"],
        ["            fact[key_col] = self.dimension_key(cur, name, row)", "row"],
        ["    cur.executemany(\"INSERT INTO fact_sales ...\", facts)   # 2. then the facts", "facts"],
        ["    conn.commit()                         # 3. dimensions + facts in one commit", "commit"],
        ["", ""],
        ["def dimension_key(self, cur, name, row):", "row"],
        ["    known = self.keys[name]               # id -> surrogate key, in memory", "row"],
        ["    if row[id_col] not in known:          # a new value", "miss"],
        ["        cur.execute(\"INSERT INTO dim_...\")  # insert the dimension row", "miss"],
        ["        known[value] = cur.lastrowid      # its new AUTO_INCREMENT key", "miss"],
        ["    return known[value]                   # known value: no SQL at all", "hit"],
      ];
      root.classList.add("sx");
      root.innerHTML = `
        <div class="sx-bar">
          <button class="sx-btn" data-a="prev">Back</button>
          <button class="sx-btn primary" data-a="next">Next</button>
          <button class="sx-btn" data-a="reset">Start again</button>
          <div class="lk-dots" data-r="dots"></div>
          <span class="sx-meta">Step <b data-r="n">1</b> of ${EVENTS.length}</span>
        </div>
        <div class="ld-flow">
          <div class="sx-box" data-r="b-q"><h4>Output queue</h4><div class="sx-sub">joined sales from MESHJOIN, with their store</div><div class="ld-chips" data-r="q"></div></div>
          <div class="ld-ar">&rarr;</div>
          <div class="sx-box" data-r="b-batch"><h4>batch</h4><div class="sx-sub">Online: loaded every 0.5 s (or 1,000 rows)</div><div class="ld-chips" data-r="batch"></div></div>
          <div class="sx-box" data-r="b-wait"><h4>waiting</h4><div class="sx-sub">Periodic: loaded together at the hour tick</div><div class="ld-chips" data-r="wait"></div></div>
        </div>
        <div class="ld-mid">
          <div class="sx-box" data-r="b-now"><h4>Now loading</h4><div data-r="now"></div></div>
          <div class="sx-box" data-r="b-keys"><h4>Key maps <span class="sx-faint">(in the loader's memory)</span></h4><div class="sx-sub">id &rarr; surrogate key of values already in the DW</div><div class="ld-maps" data-r="maps"></div></div>
        </div>
        <div class="sx-box" data-r="b-dw">
          <div class="th-head"><h4>The DW in MySQL</h4><span class="ld-tx" data-r="tx"></span></div>
          <div class="ld-dims" data-r="dims"></div>
          <div class="ld-fact"><table><thead><tr><th>sale_key</th><th>transaction_id</th><th>customer_key</th><th>product_key</th><th>supplier_key</th><th>store_key</th><th>time_key</th><th>quantity</th><th>revenue</th><th>sales_mode</th><th>processing_mode</th></tr></thead><tbody data-r="facts"></tbody></table></div>
        </div>
        <div class="lk-say"><h4 data-r="t"></h4><p data-r="x"></p></div>
        <pre class="sx-code" data-r="code"></pre>
        <p class="sx-foot">Five real sales from the first minutes of the data, loaded into an empty DW, so the surrogate keys start at 1. Real batches hold up to 1,000 sales.</p>`;
      const r = n => root.querySelector(`[data-r="${n}"]`);
      let i = 0;
      function build(upto) {
        const S = { queue: SALES.map(x => x.L), batch: [], wait: [], maps: {}, next: {}, dimRows: {}, facts: [], cur: null, pendingFacts: [], hourly: false, tags: [], hl: [], t: "", x: "" };
        DIMS.forEach(([n]) => { S.maps[n] = []; S.next[n] = 1; S.dimRows[n] = []; });
        let loading = [];
        for (let e = 0; e <= upto; e++) {
          const ev = EVENTS[e]; S.cur = null; S.tags = []; S.hl = [];
          if (ev.k === "ready") {
            S.t = "Five joined sales are waiting"; S.hl = ["b-q"];
            S.x = "MESHJOIN has finished these sales: each has its customer and product attributes and its store. The DW is empty. The LoaderThread has its own MySQL connection with <code>autocommit = False</code>, so nothing it writes is visible until it commits.";
          }
          if (ev.k === "read") {
            S.queue = []; S.batch = SALES.filter(x => x.mode === "Online").map(x => x.L); S.wait = SALES.filter(x => x.mode !== "Online").map(x => x.L);
            S.tags = ["read"]; S.hl = ["b-q", "b-batch", "b-wait"];
            S.t = "Sort them by sales_mode";
            S.x = "<b>Online</b> sales (A, B, C) go into the batch and are loaded within 0.5 s: near real time. <b>Periodic</b> sales (D, E, from store 3) wait in a list until the hour tick, because the PDF says periodic data is loaded periodically. Shed sales follow their flag in the same way.";
          }
          if (ev.k === "row") {
            const sale = SALES[ev.i];
            if (!loading.length || (ev.i === 0 || ev.i === 3)) loading = [];
            if (sale.mode === "Online") S.batch = S.batch.filter(l => l !== sale.L); else S.wait = S.wait.filter(l => l !== sale.L);
            const look = DIMS.map(([n, tbl, f]) => {
              const id = f(sale); const m = S.maps[n].find(x => x[0] === id);
              if (m) return { n, tbl, id, hit: true, key: m[1] };
              const key = n === "time" ? id : S.next[n]++;
              S.maps[n].push([id, key]);
              S.dimRows[n].push({ key, id, pending: true, extra: n === "customer" ? sale.g + ", " + sale.age : n === "product" ? sale.pname : n === "supplier" ? sale.supn : n === "store" ? STORE[sale.store][0] : sale.t.slice(11) });
              return { n, tbl, id, hit: false, key };
            });
            const k = Object.fromEntries(look.map(l => [l.n, l.key]));
            loading.push(sale.L);
            S.pendingFacts.push({ tid: sale.tid, k, qty: sale.qty, rev: sale.rev, mode: sale.mode, proc: sale.proc, L: sale.L });
            S.cur = { sale, look };
            const misses = look.filter(l => !l.hit).length;
            S.tags = ["row", misses ? "miss" : "", misses < 5 ? "hit" : ""]; S.hl = ["b-now", "b-keys", "b-dw"];
            S.t = `Sale ${sale.L}: consolidate, then ${misses === 5 ? "5 new dimension rows" : misses ? misses + " new, " + (5 - misses) + " known" : "all 5 dimensions known"}`;
            S.x = `<code>consolidate()</code> computes revenue = ${sale.qty} &times; ${sale.price} = <b>${sale.rev}</b> as a Decimal, builds the 5 dimension rows and the fact row. Then for each dimension the key map is checked: ` +
              (misses ? `${misses === 5 ? "every value is new, so each one is <b>inserted first</b> and its new key is taken from <code>lastrowid</code>" : "new values are <b>inserted first</b>; known ones reuse their key with <b>no SQL at all</b>"}` : "every value is already in the DW, so <b>no dimension SQL</b> runs; only the keys are copied") +
              `. The fact row now has all five keys.` + (ev.i === 3 ? ` Note store <b>3</b> gets surrogate key <b>2</b>: the key is the DW's own number, not the source id.` : "");
          }
          if (ev.k === "facts") {
            S.facts.push(...S.pendingFacts.map(f => ({ ...f, key: S.facts.length + S.pendingFacts.indexOf(f) + 1, pending: true }))); S.pendingFacts = [];
            S.tags = ["facts"]; S.hl = ["b-dw"];
            S.t = "Insert the facts in one go";
            S.x = "All fact rows of the batch go in with one <code>executemany</code>. The dimension rows they point to are already there, so every foreign key is satisfied. But nothing is committed yet: other connections still see an empty DW.";
          }
          if (ev.k === "commit") {
            DIMS.forEach(([n]) => S.dimRows[n].forEach(d => d.pending = false)); S.facts.forEach(f => f.pending = false);
            S.tags = ["commit"]; S.hl = ["b-dw"];
            S.t = "Commit: dimensions and facts together";
            S.x = "One commit per batch. The dimension rows and the facts appear in the DW <b>at the same moment</b>, so nobody can ever see a fact without its dimension row, and a failure in the middle leaves nothing half-written.";
          }
          if (ev.k === "hour") {
            S.tags = ["hour"]; S.hl = ["b-wait"]; S.hourly = true;
            S.t = "Hour tick: load the waiting periodic sales";
            S.x = "When the hour comes, <code>load_waiting()</code> loads every waiting periodic sale with the same <code>load()</code>, in batches of 1,000. A group extracted at hour k is joined during hour k and loaded at the next tick.";
          }
          if (ev.k === "done") {
            S.t = "Done: 5 facts, every dimension value once";
            S.x = `The DW now has 5 fact rows. Customer 17850 bought 3 times but is stored <b>once</b>; SUP01 supplies two products but is stored once; 08:26 is one dim_time row for two sales. The loader counts what it loaded by processing_mode (Live, Periodic, Shed) and how many sales were not fully enriched (0).`;
          }
        }
        return S;
      }
      const chips = ls => ls.length ? ls.map(L => { const s = SALES.find(x => x.L === L); return `<span class="ld-chip ${s.mode === "Online" ? "o" : "p"}" title="${s.tid} · ${s.pid}"><b>${L}</b>${s.tid} · ${s.pid}</span>`; }).join("") : `<span class="th-empty">empty</span>`;
      function render() {
        const S = build(i);
        r("n").textContent = i + 1;
        r("dots").innerHTML = EVENTS.map((_, k) => `<i class="${k === i ? "on" : k < i ? "past" : ""}"></i>`).join("");
        r("q").innerHTML = chips(S.queue); r("batch").innerHTML = chips(S.batch); r("wait").innerHTML = chips(S.wait);
        ["b-q", "b-batch", "b-wait", "b-now", "b-keys", "b-dw"].forEach(n => r(n).classList.toggle("hl", S.hl.includes(n)));
        if (S.cur) {
          const s = S.cur.sale;
          r("now").innerHTML = `<div class="ld-sale"><span class="ld-chip ${s.mode === "Online" ? "o" : "p"}"><b>${s.L}</b>${s.tid}</span> customer <b>${s.cid}</b> &middot; product <b>${s.pid}</b> &middot; store <b>${s.store}</b> &middot; ${s.t}</div>
            <div class="ld-rev"><span>revenue = ${s.qty} &times; ${s.price}</span><b>Decimal: ${s.rev}</b><span class="sx-faint">float would give ${s.flt}</span></div>
            <table class="ld-look"><thead><tr><th>dimension</th><th>value</th><th>in the key map?</th><th>key</th></tr></thead><tbody>${S.cur.look.map(l =>
              `<tr><td>${l.tbl}</td><td class="m">${l.id}</td><td>${l.hit ? `<span class="ld-hit">known: reuse</span>` : `<span class="ld-miss">new: INSERT first</span>`}</td><td class="m"><b>${l.key}</b></td></tr>`).join("")}</tbody></table>`;
        } else r("now").innerHTML = `<div class="th-empty" style="padding:8px 0">${i === 0 ? "Waiting for the first batch." : i >= EVENTS.length - 1 ? "Nothing left to load." : "Between sales."}</div>`;
        r("maps").innerHTML = DIMS.map(([n]) => `<div class="ld-map"><div class="hd">${n}</div>${S.maps[n].length ? S.maps[n].map(([id, k]) => n === "time" ? `<div><b>${k}</b></div>` : `<div><span>${id}</span><b>${k}</b></div>`).join("") : `<div class="th-empty">empty</div>`}</div>`).join("");
        r("dims").innerHTML = DIMS.map(([n, tbl]) => `<div class="ld-dim"><div class="hd">${tbl} <span>${S.dimRows[n].length}</span></div>${S.dimRows[n].map(d => n === "time" ? `<div class="tk ${d.pending ? "pend" : ""}"><b>${d.key}</b><em>${d.extra}</em></div>` : `<div class="${d.pending ? "pend" : ""}"><b>${d.key}</b><span>${d.id}</span><em>${d.extra}</em></div>`).join("") || `<div class="th-empty">empty</div>`}</div>`).join("");
        const facts = S.facts.concat(S.pendingFacts.map(f => ({ ...f, key: "", building: true })));
        r("facts").innerHTML = facts.length ? facts.map(f => `<tr class="${f.building ? "bld" : f.pending ? "pend" : ""}"><td>${f.key || "&ndash;"}</td><td>${f.tid}</td><td>${f.k.customer}</td><td>${f.k.product}</td><td>${f.k.supplier}</td><td>${f.k.store}</td><td>${f.k.time}</td><td>${f.qty}</td><td>${f.rev}</td><td>${f.mode}</td><td>${f.proc}</td></tr>`).join("")
          : `<tr><td colspan="11" class="th-empty">no fact rows yet</td></tr>`;
        const pend = DIMS.some(([n]) => S.dimRows[n].some(d => d.pending)) || S.facts.some(f => f.pending);
        r("tx").textContent = pend ? "not committed yet: only the loader sees these rows" : "everything committed";
        r("tx").classList.toggle("pend", pend);
        r("t").textContent = S.t; r("x").innerHTML = S.x;
        r("code").innerHTML = codeHTML(CODE, S.tags.filter(Boolean));
        root.querySelector("[data-a=prev]").disabled = i === 0;
        root.querySelector("[data-a=next]").disabled = i === EVENTS.length - 1;
      }
      const next = () => { if (i < EVENTS.length - 1) { i++; render(); } };
      const prev = () => { if (i > 0) { i--; render(); } };
      const reset = () => { i = 0; render(); };
      root.querySelector("[data-a=next]").onclick = next;
      root.querySelector("[data-a=prev]").onclick = prev;
      root.querySelector("[data-a=reset]").onclick = reset;
      render();
      return { next, prev, reset, stop: () => {} };
    }
  };

  window.LoadSim = LoadSim;
  window.MeshSim = MeshSim;
  window.ThreadSim = ThreadSim;
})();
