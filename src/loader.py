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

BATCH_ROWS = 1000
BATCH_SECONDS = 0.5

# dimension -> (table, id column, key column); time uses time_key as both
DIMENSIONS = {
    "customer": ("dim_customer", "customer_id", "customer_key"),
    "product": ("dim_product", "product_id", "product_key"),
    "supplier": ("dim_supplier", "supplier_id", "supplier_key"),
    "store": ("dim_store", "store_id", "store_key"),
    "time": ("dim_time", "time_key", "time_key"),
}
FACT_COLUMNS = ["transaction_id", "customer_key", "product_key", "supplier_key", "store_key",
                "time_key", "quantity", "revenue", "sales_mode", "processing_mode"]


def insert_sql(table, columns):
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})"


class LoaderThread(threading.Thread):
    def __init__(self, output, stop_event, db_params, settings):
        super().__init__(name="LoaderThread", daemon=True)
        self.output = output
        self.stop_event = stop_event
        self.db_params = db_params
        self.settings = settings                         # hour_seconds
        self.waiting = []                                # periodic sales waiting for the hour
        self.hourly_loads = []                           # (hour tick, rows loaded)
        self.keys = {name: {} for name in DIMENSIONS}   # id -> surrogate key, per dimension
        self.received = 0
        self.loaded = 0                                  # fact rows committed
        self.stores = Counter()
        self.by_processing_mode = Counter()              # Live / Periodic / Shed
        self.unmatched = 0

    def run(self):
        conn = db.connect(*self.db_params)
        conn.autocommit = False             # one commit per batch: dimensions + facts together
        batch = []                          # online sales, loaded at once
        last_flush = time.time()
        next_hour = time.time() + self.settings.hour_seconds
        while not self.stop_event.is_set() or not self.output.empty():
            try:
                t = self.output.get(timeout=0.1)
                self.count(t)
                if t["sales_mode"] == "Online":
                    batch.append(t)
                else:
                    self.waiting.append(t)  # periodic: wait for the hour
            except queue.Empty:
                pass
            if batch and (len(batch) >= BATCH_ROWS or time.time() - last_flush >= BATCH_SECONDS):
                self.load(conn, batch)
                batch = []
                last_flush = time.time()
            if time.time() >= next_hour:    # hour tick: load the periodic sales together
                self.load_waiting(conn)
                next_hour += self.settings.hour_seconds
        if batch:                           # quit: load what is left
            self.load(conn, batch)
        self.load_waiting(conn)
        conn.close()

    def load_waiting(self, conn):
        rows, self.waiting = self.waiting, []
        for i in range(0, len(rows), BATCH_ROWS):
            self.load(conn, rows[i:i + BATCH_ROWS])
        self.hourly_loads.append((len(self.hourly_loads) + 1, len(rows)))

    def count(self, t):
        self.received += 1
        self.stores[t["store_id"]] += 1
        self.by_processing_mode[t["processing_mode"]] += 1
        self.unmatched += not (t["customer_matched"] and t["product_matched"])

    def dimension_key(self, cur, name, row):
        """Key of this dimension value; inserts the dimension row first if it is new."""
        table, id_col, key_col = DIMENSIONS[name]
        known = self.keys[name]
        value = row[id_col]
        if value not in known:
            cur.execute(insert_sql(table, list(row)), list(row.values()))
            known[value] = value if name == "time" else cur.lastrowid
        return known[value]

    def load(self, conn, transactions):
        cur = conn.cursor()
        facts = []
        for t in transactions:
            dims, fact = consolidate(t)
            for name, row in dims.items():                       # 1. dimensions first
                fact[DIMENSIONS[name][2]] = self.dimension_key(cur, name, row)
            facts.append([fact[c] for c in FACT_COLUMNS])
        cur.executemany(insert_sql("fact_sales", FACT_COLUMNS), facts)   # 2. then the facts
        conn.commit()                                            # 3. both in one commit
        cur.close()
        self.loaded += len(facts)
