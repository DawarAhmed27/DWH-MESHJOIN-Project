"""Steps 8.1 and 9.2: the LoaderThread loads finished transactions into the DW.

It takes transactions out of the output queue in batches (up to 1,000, or
whatever arrived in 0.5 s). For each batch, in one database transaction:
1. consolidate each transaction (revenue, dimension rows, fact row; step 9.1)
2. insert every dimension row that is not in its dimension table yet
3. insert the fact rows with their five keys
4. commit
So a dimension row is always in the DW before the fact that points to it (PDF 7).

Step 9.3: online sales (sales_mode Online) are loaded as soon as they are
joined. Periodic sales (sales_mode Periodic, also the ones read back from the
shed table) wait in a list and are loaded together once every simulated hour
(PDF 7: "the periodic sales data must be loaded periodically using the same
interval"). A group extracted at hour k is joined during hour k and loaded at
the next hour tick.

Bonus (cache load): Live results are not inserted into fact_sales straight away.
They go into the table live_cache first, and in a slow period (non-peak mode)
the loader copies the cached rows into fact_sales and deletes the copied rows
from the cache, both in one commit. Periodic results are never cached.

Which dimension values are already loaded is kept in small maps
(customer_id -> customer_key, ...). These are DW keys, not the Master Data;
the Master Data stays on disk and is only read by MESHJOIN.
"""

import queue
import threading
import time
from collections import Counter

import db
from consolidation import consolidate

#online batch: up to 1,000 rows or 0.5 seconds, whichever comes first
BATCH_ROWS = 1000
BATCH_SECONDS = 0.5
#bonus: in non-peak the cache is copied into the DW in chunks of 5,000 rows, one chunk per loop,
#so the loader keeps taking new sales between chunks and no transaction gets too big for MySQL
CACHE_CHUNK = 5000
CACHE_SECONDS = 1.0

#dimension -> (table, id column, key column); time uses time_key as both
DIMENSIONS = {
    "customer": ("dim_customer", "customer_id", "customer_key"),
    "product": ("dim_product", "product_id", "product_key"),
    "supplier": ("dim_supplier", "supplier_id", "supplier_key"),
    "store": ("dim_store", "store_id", "store_key"),
    "time": ("dim_time", "time_key", "time_key"),
}
#columns of fact_sales in insert order
FACT_COLUMNS = ["transaction_id", "customer_key", "product_key", "supplier_key", "store_key",
                "time_key", "quantity", "revenue", "sales_mode", "processing_mode"]


#builds an INSERT statement with %s placeholders
def insert_sql(table, columns):
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})"


#thread 4: loads finished sales into the star schema
class LoaderThread(threading.Thread):
    def __init__(self, output, stop_event, db_params, settings):
        super().__init__(name="LoaderThread", daemon=True)
        self.output = output
        self.stop_event = stop_event
        self.db_params = db_params
        self.settings = settings                         #hour_seconds
        self.waiting = []                                #periodic sales waiting for the hour
        self.hourly_loads = []                           #(hour tick, rows loaded)
        self.keys = {name: {} for name in DIMENSIONS}   #id -> surrogate key, per dimension
        self.received = 0
        self.loaded = 0                                  #fact rows committed
        self.cached = 0                                  #Live rows written to live_cache
        self.in_cache = 0                                #Live rows still waiting in live_cache
        self.cache_copies = []                           #(copy number, rows copied to the DW)
        self.stores = Counter()
        self.by_processing_mode = Counter()              #Live / Periodic / Shed
        self.unmatched = 0

    #main loop: online loaded every 0.5 s, periodic at each hour tick, leftovers on quit
    def run(self):
        conn = db.connect(*self.db_params)
        conn.autocommit = False             #one commit per batch: dimensions + facts together
        batch = []                          #online sales, loaded at once
        last_flush = time.time()
        next_hour = time.time() + self.settings.hour_seconds
        next_copy = time.time()
        while not self.stop_event.is_set() or not self.output.empty():
            try:
                #take the next finished sale: online to the batch, periodic to the waiting list
                t = self.output.get(timeout=0.1)
                self.count(t)
                if t["sales_mode"] == "Online":
                    batch.append(t)
                else:
                    self.waiting.append(t)  #periodic: wait for the hour
            except queue.Empty:
                pass
            #load the online batch when it has 1,000 rows or 0.5 s has passed
            if batch and (len(batch) >= BATCH_ROWS or time.time() - last_flush >= BATCH_SECONDS):
                self.load(conn, batch)
                batch = []
                last_flush = time.time()
            if time.time() >= next_hour:    #hour tick: load the periodic sales together
                self.load_waiting(conn)
                next_hour += self.settings.hour_seconds
            #bonus: in a slow period (non-peak) copy the cached Live rows into the DW
            if self.in_cache and self.settings.mode == "non-peak" and time.time() >= next_copy:
                self.copy_cache(conn)
                #while the cache still holds rows, copy the next chunk on the next loop
                next_copy = time.time() + (0 if self.in_cache else CACHE_SECONDS)
        if batch:                           #quit: load what is left
            self.load(conn, batch)
        self.load_waiting(conn)
        while self.in_cache and self.settings.mode == "non-peak":
            if not self.copy_cache(conn):   #quit in peak: the cached rows stay safe in live_cache
                break
        conn.close()

    #bonus: the oldest chunk of cached Live rows -> fact_sales, then delete them from the cache, in one commit
    def copy_cache(self, conn):
        cols = ", ".join(FACT_COLUMNS)
        cur = conn.cursor()
        try:
            #the last cache_id of the oldest chunk (or of the whole cache when it is smaller)
            cur.execute("SELECT MAX(cache_id) FROM (SELECT cache_id FROM live_cache "
                        "ORDER BY cache_id LIMIT %s) AS chunk", (CACHE_CHUNK,))
            last = cur.fetchone()[0]
            if last is None:
                self.in_cache = 0
                return False
            cur.execute(f"INSERT INTO fact_sales ({cols}) SELECT {cols} FROM live_cache "
                        f"WHERE cache_id <= %s ORDER BY cache_id", (last,))
            copied = cur.rowcount
            cur.execute("DELETE FROM live_cache WHERE cache_id <= %s", (last,))
            conn.commit()
        except Exception as e:
            #undo this chunk; the rows stay in the cache and the next loop tries again
            conn.rollback()
            print(f"\nCache copy failed, will retry: {e}\n> ", end="", flush=True)
            return False
        finally:
            cur.close()
        self.loaded += copied
        self.in_cache -= copied
        self.cache_copies.append((len(self.cache_copies) + 1, copied))
        return True

    #hour tick: load all waiting periodic sales in batches of 1,000
    def load_waiting(self, conn):
        rows, self.waiting = self.waiting, []
        for i in range(0, len(rows), BATCH_ROWS):
            self.load(conn, rows[i:i + BATCH_ROWS])
        self.hourly_loads.append((len(self.hourly_loads) + 1, len(rows)))

    #counters for status and the summary
    def count(self, t):
        self.received += 1
        self.stores[t["store_id"]] += 1
        self.by_processing_mode[t["processing_mode"]] += 1
        self.unmatched += not (t["customer_matched"] and t["product_matched"])

    #returns the surrogate key; inserts the dimension row first if it is new
    def dimension_key(self, cur, name, row):
        """Key of this dimension value; inserts the dimension row first if it is new."""
        table, id_col, key_col = DIMENSIONS[name]
        known = self.keys[name]
        value = row[id_col]
        if value not in known:
            cur.execute(insert_sql(table, list(row)), list(row.values()))
            known[value] = value if name == "time" else cur.lastrowid
        return known[value]

    #one batch: dimensions first, then facts, then one commit
    def load(self, conn, transactions):
        cur = conn.cursor()
        facts = []
        for t in transactions:
            dims, fact = consolidate(t)
            for name, row in dims.items():                       #1. dimensions first
                fact[DIMENSIONS[name][2]] = self.dimension_key(cur, name, row)
            facts.append([fact[c] for c in FACT_COLUMNS])
        #2. then the facts: Live results go to the cache (bonus), the rest straight into fact_sales
        live = [f for f in facts if f[FACT_COLUMNS.index("processing_mode")] == "Live"]
        rest = [f for f in facts if f[FACT_COLUMNS.index("processing_mode")] != "Live"]
        if live:
            cur.executemany(insert_sql("live_cache", FACT_COLUMNS), live)
        if rest:
            cur.executemany(insert_sql("fact_sales", FACT_COLUMNS), rest)
        conn.commit()                                            #3. all in one commit
        cur.close()
        self.cached += len(live)
        self.in_cache += len(live)
        self.loaded += len(rest)
