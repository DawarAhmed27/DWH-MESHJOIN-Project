"""Control room: a local web front end for the project.

It runs the same modules as src/main.py (cleaning, Master Data, the three
MESHJOIN threads, the loader) and lets the browser start, steer and watch
them, run the queries and present the demo.

Run from the project folder:   python app/server.py
Then open http://localhost:5000  (the browser opens by itself).
The MySQL password is typed in the page and kept only in memory.
"""

import contextlib
import io
import os
import queue
import re
import sys
import threading
import time
import webbrowser
from collections import Counter
from decimal import Decimal

from flask import Flask, jsonify, request, send_from_directory

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(APP_DIR)
sys.path.insert(0, os.path.join(PROJECT_DIR, "src"))

import cleaning          #noqa: E402
import db                #noqa: E402
import master_data       #noqa: E402
import meshjoin          #noqa: E402
import splitting         #noqa: E402
import stream            #noqa: E402
import working_data      #noqa: E402
from loader import LoaderThread  #noqa: E402
import main as cli        #noqa: E402  (HELP and print_status, same text as the terminal)

app = Flask(__name__, static_folder=os.path.join(APP_DIR, "static"), static_url_path="/static")


#default location of Online Retail.xlsx
def default_data_file():
    return db.find_file(PROJECT_DIR, "Online Retail.xlsx", "data", ".", "../Data") \
        or os.path.join(PROJECT_DIR, "Online Retail.xlsx")


#turns MySQL values (Decimal, dates) into plain JSON values
def plain(v):
    """Database values -> JSON-friendly values."""
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return str(v)
    if isinstance(v, (bytes, bytearray)):
        return v.decode(errors="replace")
    return v


#the control room's engine: same modules and threads as main.py
class Engine:
    """Everything the page can see and do: connection, settings,
    preparation, the threads and the commands."""

    def __init__(self):
        self.conn_params = None                    #(host, port, database, user, password)
        self.data_file = default_data_file()
        self.settings = stream.Settings(80, 10, 60, "peak")
        self.log = []                              #(time, kind, text)
        self.prep = {"state": "idle", "step": None, "steps": {}, "error": None}
        self.expected = 0
        self.online_file = None
        self.running = False
        self.threads = None
        self.started_at = None
        self.lock = threading.Lock()

    #---------- log ----------
    def say(self, text, kind="info"):
        with self.lock:
            self.log.append((time.time(), kind, text))
            del self.log[:-1500]

    #---------- connection ----------
    def connect(self):
        return db.connect(*self.conn_params)

    #---------- preparation (PDF Section 9, steps 1 and 2) ----------
    def prepare(self):
        steps = self.prep["steps"]

        def step(name, fn):
            self.prep["step"] = name
            steps[name] = {"state": "running", "lines": [], "t": time.time()}
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                result = fn()
            lines = [l for l in buf.getvalue().splitlines() if l.strip()]
            steps[name].update(state="done", lines=lines, seconds=round(time.time() - steps[name]["t"], 1))
            for l in lines:
                self.say(l)
            return result

        try:
            self.prep.update(state="running", error=None)
            steps.clear()
            conn = self.connect()
            out_dir = os.path.dirname(os.path.abspath(self.data_file))
            step("schema", lambda: (db.run_sql_file(conn, db.find_file(PROJECT_DIR, "Create-DW.sql", "sql", "../Create-DW")),
                                    print("Create-DW.sql: old view and tables dropped, all tables created")))
            df = step("clean", lambda: cleaning.clean(self.data_file))
            df = step("split", lambda: splitting.split(df))

            def master():
                cust = master_data.build_customers(df)
                prod = master_data.build_products(df)
                cust.to_csv(os.path.join(out_dir, "customer_master_data.csv"), index=False)
                prod.to_csv(os.path.join(out_dir, "product_master_data.csv"), index=False)
                db.insert_rows(conn, "customer_master_data", master_data.with_partition_no(cust))
                db.insert_rows(conn, "product_master_data", master_data.with_partition_no(prod))
            step("master", master)

            def working():
                online = working_data.build_online(df)
                self.online_file = os.path.join(out_dir, "online_sales_stream.csv")
                online.to_csv(self.online_file, index=False)
                periodic = working_data.build_periodic(df)
                t_stage = time.time()
                db.insert_rows(conn, "periodic_sales_data", periodic)
                print(f"Staging table filled in {time.time() - t_stage:.1f} s ({len(periodic):,} rows)")
                self.expected = len(online) + len(periodic)
                sizes = periodic.groupby("release_hour").size()
                steps["working_sizes"] = [int(x) for x in sizes.tolist()]
            step("working", working)
            conn.close()
            self.prep.update(state="done", step=None)
            self.say(f"Data prepared: {self.expected:,} transactions ready", "ok")
        except Exception as e:                      #shown in the page
            self.prep.update(state="error", error=str(e))
            if self.prep["step"]:
                steps[self.prep["step"]]["state"] = "error"
            self.say(f"Preparation failed: {e}", "error")

    #---------- threads (PDF Section 9, steps 3 to 5) ----------
    def start(self):
        s = self.settings
        buffer = stream.StreamBuffer(1000)
        output = queue.Queue()
        stop = threading.Event()
        online = stream.OnlineThread(self.online_file, buffer, s, stop, self.conn_params)
        periodic = stream.PeriodicThread(self.conn_params, buffer, s, stop)
        mesh = meshjoin.MeshJoinThread(self.conn_params, buffer, output, stop, [online, periodic], s)
        loader = LoaderThread(output, stop, self.conn_params, s)
        self.threads = dict(buffer=buffer, output=output, stop=stop, online=online,
                            periodic=periodic, mesh=mesh, loader=loader, done_at=None)
        for t in (online, periodic, mesh, loader):
            t.start()
        self.running = True
        self.started_at = time.time()
        self.say(f"Threads started in {s.mode} mode ({s.tps()}/s, hour = {s.hour_seconds} s)", "ok")
        for line in self.settings_lines():
            self.say(line, "out")

    #the settings, printed like the terminal program
    def settings_lines(self):
        s = self.settings
        return [f"Stream arrival mode:   {s.mode}",
                f"Peak speed:            {s.peak_tps} transactions/second",
                f"Non-peak speed:        {s.nonpeak_tps} transactions/second",
                f"One simulated hour:    {s.hour_seconds} seconds",
                f"Stream buffer limit:   {cli.STREAM_BUFFER_LIMIT:,} transactions"]

    #one command typed in the Console page; same answers as main.py
    def console(self, line):
        """One line typed in the Console page: the same commands and the same
        answers as the terminal program (src/main.py)."""
        self.say(line, "in")
        words = line.strip().lower().split()
        s = self.settings
        out, kind = [], "out"
        if not words:
            return
        cmd = words[0]
        if cmd in ("online", "periodic", "both"):
            s.source = cmd
            out = [f"Source is now: {cmd}"]
        elif cmd in ("peak", "non-peak"):
            s.mode = cmd
            out = [f"Mode is now: {cmd} ({s.tps()} transactions/second)"]
        elif cmd == "speed" and len(words) == 3 and words[1] in ("peak", "non-peak") \
                and words[2].isdigit() and int(words[2]) > 0:
            if words[1] == "peak":
                s.peak_tps = int(words[2])
            else:
                s.nonpeak_tps = int(words[2])
            out = [f"{words[1]} speed is now {words[2]} transactions/second"]
        elif cmd == "status":
            if not self.threads:
                out = ["The threads have not been started (Live run > Start threads)."] + self.settings_lines()
            else:
                t = self.threads
                buf = io.StringIO()
                try:
                    c = self.connect()
                    with contextlib.redirect_stdout(buf):
                        cli.print_status(s, t["buffer"], t["mesh"], t["online"], t["periodic"], t["loader"], c)
                    c.close()
                    out = buf.getvalue().splitlines()
                    if not self.running:
                        out.insert(0, "(threads stopped)")
                except Exception as e:
                    out, kind = [f"Status failed: {e}"], "error"
        elif cmd == "help":
            out = cli.HELP.splitlines()
        elif cmd == "quit":
            if not self.running:
                out, kind = ["The threads are not running."], "error"
            else:
                out = ["Stopping the threads ..."]
                threading.Thread(target=self.stop, daemon=True).start()
        else:
            out, kind = ["Unknown command. Type help for the list."], "error"
        for l in out:
            self.say(l, kind)

    #quit: stop the threads and print the summary
    def stop(self):
        t = self.threads
        t["stop"].set()
        for th in (t["online"], t["periodic"], t["mesh"]):
            th.join(timeout=5)
        t["loader"].join(timeout=60)
        self.running = False
        self.say(f"Stopped. Loaded into the DW: {t['loader'].loaded:,} fact rows", "ok")

    #live numbers for the Live page, polled by the browser
    def status(self):
        s = self.settings
        out = {"settings": {"peak": s.peak_tps, "nonpeak": s.nonpeak_tps, "hour": s.hour_seconds,
                            "mode": s.mode, "source": s.source, "tps": s.tps()},
               "connected": self.conn_params is not None,
               "db": None if not self.conn_params else {"host": self.conn_params[0], "port": self.conn_params[1],
                                                        "database": self.conn_params[2], "user": self.conn_params[3]},
               "data_file": self.data_file, "prep": self.prep, "expected": self.expected,
               "running": self.running, "log": [{"t": round(t, 2), "kind": k, "text": x} for t, k, x in self.log[-80:]]}
        t = self.threads
        if not t:
            return out
        mj = t["mesh"].mj
        chunks = []
        if mj:
            try:
                chunks = [{"size": len(c), "age": a} for c, a in list(mj.queue)]
            except RuntimeError:            #queue changed while copying; next poll will show it
                chunks = []
        on, pe, lo = t["online"], t["periodic"], t["loader"]
        with t["buffer"].lock:
            b_online, b_periodic = len(t["buffer"].online), len(t["buffer"].periodic)
        shed_disk = None
        try:
            c = self.connect()
            shed_disk = db.count(c, "shed_table")
            c.close()
        except Exception:
            pass
        loaded = lo.loaded
        if self.running and t["done_at"] is None and self.expected and loaded >= self.expected:
            t["done_at"] = time.time()
            self.say(f"All {self.expected:,} transactions loaded into the DW", "ok")
        out["live"] = {
            "elapsed": round(time.time() - self.started_at, 1),
            "buffer": {"online": b_online, "periodic": b_periodic, "limit": t["buffer"].limit},
            "mesh": None if not mj else {
                "n_cust": mj.n_cust, "n_prod": mj.n_prod, "cycle": mj.cycle,
                "k_cust": mj.k_cust, "k_prod": mj.k_prod, "iterations": mj.iterations,
                "in_memory": sum(ch["size"] for ch in chunks), "chunks": chunks,
                "keys_cust": len(mj.H_cust), "keys_prod": len(mj.H_prod)},
            "online": {"sent": on.sent, "shed": on.shed_online, "evicted": on.shed_periodic, "finished": on.finished},
            "periodic": {"released": len(periodic_log := pe.log), "groups": pe.groups, "sent": pe.sent,
                         "shed": pe.shed, "last": periodic_log[-1] if periodic_log else None, "finished": pe.finished},
            "shed": {"disk": shed_disk, "online": on.shed_online, "periodic": on.shed_periodic + pe.shed,
                     "read_back": t["mesh"].read_back},
            "loader": {"received": lo.received, "loaded": loaded, "waiting": len(lo.waiting),
                       "hourly": lo.hourly_loads[-12:], "hourly_count": len(lo.hourly_loads),
                       "by_mode": dict(lo.by_processing_mode), "stores": {str(k): v for k, v in sorted(lo.stores.items())},
                       "unmatched": lo.unmatched},
            "done": t["done_at"] is not None,
        }
        return out


E = Engine()


#answers with an error if Setup has not connected yet
def need_connection():
    if not E.conn_params:
        return jsonify(error="Connect to MySQL first (Setup)."), 400
    return None


#---------------- pages ----------------
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


#serves the report files
@app.get("/report/<path:name>")
def report_file(name):
    folder = os.path.dirname(db.find_file(PROJECT_DIR, name, "report", "../Project-Report") or
                             os.path.join(PROJECT_DIR, "report", name))
    return send_from_directory(folder, os.path.basename(name))


#---------------- setup ----------------
@app.post("/api/connect")
def api_connect():
    d = request.get_json()
    params = (d.get("host") or "localhost", int(d.get("port") or 3306), d.get("database") or "dwh_project",
              d.get("user") or "root", d.get("password") or "")
    try:
        c = db.connect(*params)
        cur = c.cursor()
        cur.execute("SELECT VERSION()")
        version = cur.fetchone()[0]
        c.close()
    except Exception as e:
        return jsonify(error=f"Could not connect: {e}"), 400
    E.conn_params = params
    if d.get("data_file"):
        path = d["data_file"]
        E.data_file = os.path.join(path, "Online Retail.xlsx") if os.path.isdir(path) else path
    E.say(f"Connected to {params[0]}:{params[1]}/{params[2]} (MySQL {version})", "ok")
    return jsonify(ok=True, version=version, data_file=E.data_file, file_exists=os.path.exists(E.data_file))


#Setup: speeds, hour length and mode
@app.post("/api/settings")
def api_settings():
    d = request.get_json()
    s = E.settings
    for key, attr in (("peak", "peak_tps"), ("nonpeak", "nonpeak_tps"), ("hour", "hour_seconds")):
        if key in d and int(d[key]) > 0:
            setattr(s, attr, int(d[key]))
    if d.get("mode") in ("peak", "non-peak"):
        s.mode = d["mode"]
    E.say(f"Settings: peak {s.peak_tps}/s, non-peak {s.nonpeak_tps}/s, hour {s.hour_seconds} s, mode {s.mode}")
    return jsonify(ok=True)


#Setup: run the preparation in the background
@app.post("/api/prepare")
def api_prepare():
    if (r := need_connection()):
        return r
    if E.running:
        return jsonify(error="Stop the running threads first."), 400
    if E.prep["state"] == "running":
        return jsonify(error="Preparation is already running."), 400
    if not os.path.exists(E.data_file):
        return jsonify(error=f"File not found: {E.data_file}"), 400
    threading.Thread(target=E.prepare, daemon=True).start()
    return jsonify(ok=True)


#---------------- run ----------------
@app.post("/api/start")
def api_start():
    if (r := need_connection()):
        return r
    if E.running:
        return jsonify(error="Already running."), 400
    if E.prep["state"] != "done":
        return jsonify(error="Prepare the data first."), 400
    E.start()
    return jsonify(ok=True)


#Live run buttons: the same commands as the terminal
@app.post("/api/command")
def api_command():
    d = request.get_json()
    cmd, s = d.get("cmd"), E.settings
    if cmd in ("online", "periodic", "both"):
        s.source = cmd
        E.say(f"Command: {cmd} (source is now {cmd})", "cmd")
    elif cmd in ("peak", "non-peak"):
        s.mode = cmd
        E.say(f"Command: {cmd} ({s.tps()} transactions/second)", "cmd")
    elif cmd == "speed" and d.get("which") in ("peak", "non-peak") and int(d.get("value", 0)) > 0:
        if d["which"] == "peak":
            s.peak_tps = int(d["value"])
        else:
            s.nonpeak_tps = int(d["value"])
        E.say(f"Command: speed {d['which']} {d['value']}", "cmd")
    elif cmd == "quit":
        if not E.running:
            return jsonify(error="Not running."), 400
        threading.Thread(target=E.stop, daemon=True).start()
        E.say("Command: quit (stopping the threads, loading what is left)", "cmd")
    else:
        return jsonify(error="Unknown command."), 400
    return jsonify(ok=True)


#Console page: run one typed command
@app.post("/api/console")
def api_console():
    E.console((request.get_json() or {}).get("line", ""))
    return jsonify(ok=True)


#Console page: the full log
@app.get("/api/log")
def api_log():
    with E.lock:
        log = list(E.log)
    return jsonify([{"t": round(t, 2), "kind": k, "text": x} for t, k, x in log])


#Live page: current numbers
@app.get("/api/status")
def api_status():
    return jsonify(E.status())


#---------------- DW ----------------
@app.get("/api/schema")
def api_schema():
    if (r := need_connection()):
        return r
    c = E.connect()
    cur = c.cursor()
    cur.execute("""SELECT table_name, column_name, column_type, column_key
                   FROM information_schema.columns WHERE table_schema = DATABASE()
                   ORDER BY table_name, ordinal_position""")
    tables = {}
    for t, col, typ, key in cur.fetchall():
        tables.setdefault(t, []).append({"name": col, "type": typ, "key": key})
    counts = {}
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM `{t}`")
            counts[t] = cur.fetchone()[0]
        except Exception:
            counts[t] = None
    c.close()
    return jsonify(tables=tables, counts=counts)


#Overview page: totals, months, stores and modes
@app.get("/api/overview")
def api_overview():
    if (r := need_connection()):
        return r
    c = E.connect()
    cur = c.cursor()
    out = {}
    try:
        cur.execute("SELECT COUNT(*), COALESCE(SUM(revenue), 0), COUNT(DISTINCT transaction_id) FROM fact_sales")
        rows, revenue, carts = cur.fetchone()
        out["kpi"] = {"rows": rows, "revenue": float(revenue), "carts": carts}
        cur.execute("""SELECT t.year, t.month, SUM(f.revenue) FROM fact_sales f
                       JOIN dim_time t ON t.time_key = f.time_key GROUP BY t.year, t.month ORDER BY t.year, t.month""")
        out["monthly"] = [{"label": f"{y}-{m:02d}", "value": float(v)} for y, m, v in cur.fetchall()]
        cur.execute("""SELECT s.store_name, SUM(f.revenue), COUNT(*) FROM fact_sales f
                       JOIN dim_store s ON s.store_key = f.store_key GROUP BY s.store_name ORDER BY SUM(f.revenue) DESC""")
        out["stores"] = [{"label": n, "value": float(v), "rows": r} for n, v, r in cur.fetchall()]
        cur.execute("SELECT processing_mode, COUNT(*) FROM fact_sales GROUP BY processing_mode")
        out["modes"] = {m: n for m, n in cur.fetchall()}
        cur.execute("""SELECT MIN(t.event_time), MAX(t.event_time) FROM fact_sales f JOIN dim_time t ON t.time_key = f.time_key""")
        a, b = cur.fetchone()
        out["dates"] = [plain(a), plain(b)]
    except Exception as e:
        out["error"] = str(e)
    c.close()
    return jsonify(out)


#reads Queries-DW.sql: each query with its title and comment lines
def read_queries():
    """Statements of sql/Queries-DW.sql. Each gets the title comment above it
    ("-- Q1. ...", "-- Check ...", "-- Materialized ...") and its other comment lines."""
    with open(db.find_file(PROJECT_DIR, "Queries-DW.sql", "sql", "../Queries-DW"), encoding="utf-8") as f:
        text = f.read()
    items, lines, title, notes = [], [], "", []
    for line in text.splitlines():
        if line.startswith("--") and not lines:
            c = line[2:].strip()
            if re.match(r"(Q\d+\.|Check|Materialized)", c):
                title, notes = c, []
            elif title and c:
                notes.append(c)
            continue
        if line.strip():
            lines.append(line)
            if line.rstrip().endswith(";"):
                m = re.match(r"Q(\d+)\.", title)
                items.append({"id": len(items), "q": int(m.group(1)) if m else None, "title": title,
                              "notes": list(notes), "sql": "\n".join(lines).strip().rstrip(";")})
                lines = []
    return items


#Analysis page: the list of queries
@app.get("/api/queries")
def api_queries():
    return jsonify(read_queries())


#Analysis page: run one query and time it
@app.post("/api/query")
def api_query():
    if (r := need_connection()):
        return r
    i = int(request.get_json()["id"])
    q = read_queries()[i]
    c = E.connect()
    cur = c.cursor()
    t0 = time.time()
    try:
        cur.execute(q["sql"])
        if cur.with_rows:
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
        else:
            cols, rows = [], []
    except Exception as e:
        c.close()
        return jsonify(error=str(e)), 400
    secs = round(time.time() - t0, 2)
    c.close()
    return jsonify(columns=cols, rows=[[plain(v) for v in r] for r in rows[:1000]],
                   total=len(rows), seconds=secs)


#enrichment checks: every count should be 0
ENRICH_CUSTOMER = """SELECT COUNT(*) FROM dim_customer c
    LEFT JOIN customer_master_data m ON m.customer_id = c.customer_id
    WHERE m.customer_id IS NULL OR NOT (m.gender = c.gender AND m.age_group = c.age_group
      AND m.occupation = c.occupation AND m.city_category = c.city_category
      AND m.stay_in_current_city_years = c.stay_in_current_city_years AND m.marital_status = c.marital_status)"""
ENRICH_PRODUCT = """SELECT COUNT(*) FROM dim_product p
    LEFT JOIN product_master_data m ON m.product_id = p.product_id
    WHERE m.product_id IS NULL OR NOT (m.product_name = p.product_name AND m.product_category = p.product_category)"""
ENRICH_SUPPLIER = """SELECT COUNT(*) FROM fact_sales f
    JOIN dim_product p ON p.product_key = f.product_key
    JOIN dim_supplier s ON s.supplier_key = f.supplier_key
    JOIN product_master_data m ON m.product_id = p.product_id
    WHERE s.supplier_id <> m.supplier_id"""
MD5_N = "CONV(LEFT(MD5(f.transaction_id), 8), 16, 10)"
RULE_MODE = f"""SELECT COUNT(*) FROM fact_sales f
    WHERE f.sales_mode <> IF({MD5_N} % 10 < 7, 'Online', 'Periodic')"""
RULE_STORE = f"""SELECT COUNT(*) FROM fact_sales f JOIN dim_store st ON st.store_key = f.store_key
    WHERE st.store_id <> IF(f.sales_mode = 'Online', 1, 2 + {MD5_N} % 4)"""

#latest fact rows with every dimension attribute, and whether they match the Master Data
ENRICHED = """SELECT f.sale_key, f.transaction_id, f.sales_mode, f.processing_mode, t.event_time,
       c.customer_id, c.gender, c.age_group, c.occupation, c.city_category,
       c.stay_in_current_city_years AS stay_years, c.marital_status,
       p.product_id, p.product_name, p.product_category, s.supplier_id, s.supplier_name,
       st.store_id, st.store_name, f.quantity, f.revenue,
       (cm.customer_id IS NOT NULL AND pm.product_id IS NOT NULL
        AND cm.gender = c.gender AND cm.age_group = c.age_group AND cm.occupation = c.occupation
        AND cm.city_category = c.city_category AND cm.marital_status = c.marital_status
        AND cm.stay_in_current_city_years = c.stay_in_current_city_years
        AND pm.product_name = p.product_name AND pm.product_category = p.product_category
        AND pm.supplier_id = s.supplier_id) AS matches_master_data
FROM {source} f
JOIN dim_customer c  ON c.customer_key = f.customer_key
JOIN dim_product p   ON p.product_key = f.product_key
JOIN dim_supplier s  ON s.supplier_key = f.supplier_key
JOIN dim_store st    ON st.store_key = f.store_key
JOIN dim_time t      ON t.time_key = f.time_key
LEFT JOIN customer_master_data cm ON cm.customer_id = c.customer_id
LEFT JOIN product_master_data pm  ON pm.product_id = p.product_id
{where}
ORDER BY f.sale_key DESC LIMIT %s"""


#Data warehouse page: the latest rows of one table, or the enriched sales
@app.get("/api/browse")
def api_browse():
    if (r := need_connection()):
        return r
    table = request.args.get("table", "enriched")
    find = request.args.get("find", "").strip()
    limit = max(1, min(int(request.args.get("limit", 20)), 200))
    c = E.connect()
    cur = c.cursor()
    try:
        if table == "enriched":
            cur.execute("SELECT COUNT(*) FROM fact_sales")
            total = cur.fetchone()[0]
            if find:
                sql = ENRICHED.format(source="fact_sales",
                                      where="WHERE f.transaction_id = %s OR c.customer_id = %s OR p.product_id = %s")
                cur.execute(sql, (find, find, find, limit))
            else:
                sql = ENRICHED.format(source="(SELECT * FROM fact_sales ORDER BY sale_key DESC LIMIT %s)", where="")
                cur.execute(sql, (limit, limit))
        else:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
            if table not in {t for (t,) in cur.fetchall()}:
                return jsonify(error=f"Unknown table {table}"), 400
            cur.execute("""SELECT column_name FROM information_schema.key_column_usage
                           WHERE table_schema = DATABASE() AND table_name = %s AND constraint_name = 'PRIMARY'
                           ORDER BY ordinal_position""", (table,))
            pk = [x for (x,) in cur.fetchall()]
            cur.execute(f"SELECT COUNT(*) FROM `{table}`")
            total = cur.fetchone()[0]
            order = f"ORDER BY {', '.join(f'`{k}` DESC' for k in pk)}" if pk else ""
            cur.execute(f"SELECT * FROM `{table}` {order} LIMIT %s", (limit,))
        cols = [d[0] for d in cur.description]
        rows = [[plain(v) for v in r] for r in cur.fetchall()]
        return jsonify(columns=cols, rows=rows, total=total, running=E.running)
    except Exception as e:
        return jsonify(error=str(e)), 400
    finally:
        c.close()


#Checks page: compare the DW with the working data
@app.get("/api/checks")
def api_checks():
    """The checks of test_dw.py: expected values from the working data."""
    if (r := need_connection()):
        return r
    import csv
    c = E.connect()
    cur = c.cursor()
    online_file = E.online_file or os.path.join(os.path.dirname(os.path.abspath(E.data_file)), "online_sales_stream.csv")
    rows, revenue, customers, products, minutes = 0, Decimal(0), set(), set(), set()
    if os.path.exists(online_file):
        with open(online_file, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows += 1
                revenue += Decimal(r["unit_price"]) * int(r["quantity"])
                customers.add(r["customer_id"]); products.add(r["product_id"]); minutes.add(r["event_time"][:16])
    cur.execute("SELECT customer_id, product_id, quantity, unit_price, event_time FROM periodic_sales_data")
    for cu, p, q, price, when in cur.fetchall():
        rows += 1
        revenue += price * q
        customers.add(cu); products.add(p); minutes.add(str(when)[:16])

    def one(sql):
        cur.execute(sql)
        return cur.fetchone()[0]
    checks = [
        ("Fact rows", rows, one("SELECT COUNT(*) FROM fact_sales")),
        ("Total revenue", float(revenue), float(one("SELECT COALESCE(SUM(revenue), 0) FROM fact_sales"))),
        ("Customers", len(customers), one("SELECT COUNT(*) FROM dim_customer")),
        ("Products", len(products), one("SELECT COUNT(*) FROM dim_product")),
        ("Suppliers", 5, one("SELECT COUNT(*) FROM dim_supplier")),
        ("Stores", 5, one("SELECT COUNT(*) FROM dim_store")),
        ("Minutes in dim_time", len(minutes), one("SELECT COUNT(*) FROM dim_time")),
        ("Facts with revenue <= 0", 0, one("SELECT COUNT(*) FROM fact_sales WHERE revenue <= 0")),
        ("Customers whose attributes differ from the Master Data", 0, one(ENRICH_CUSTOMER)),
        ("Products whose name or category differs from the Master Data", 0, one(ENRICH_PRODUCT)),
        ("Facts with a supplier that is not their product's supplier", 0, one(ENRICH_SUPPLIER)),
        ("Facts whose sales_mode breaks the MD5 rule", 0, one(RULE_MODE)),
        ("Facts whose store breaks the MD5 rule", 0, one(RULE_STORE)),
        ("Still on the shed disk", 0, one("SELECT COUNT(*) FROM shed_table")),
    ]
    c.close()
    return jsonify([{"name": n, "expected": w, "actual": g, "ok": abs(w - g) < 0.0005 if isinstance(w, float) else w == g}
                    for n, w, g in checks])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Control room: http://localhost:{port}   (Ctrl + C to stop)")
    if not os.environ.get("NO_BROWSER"):
        threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
