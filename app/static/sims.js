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

  window.MeshSim = MeshSim;
  window.ThreadSim = ThreadSim;
})();
