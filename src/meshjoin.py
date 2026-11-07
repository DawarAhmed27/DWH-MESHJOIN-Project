"""Step 7.5: the MESHJOIN core (PDF 4.2), without threads.

The room in the phone book story:
- H (two hash tables): the people in the room, found by customer_id or product_id
- queue: the groups (chunks) in the order they came in
- each iteration: one page of the customer book + one page of the product book

Option A: both master tables are scanned together, one partition of each per
iteration. A chunk stays for `cycle` = max(9, 8) = 9 iterations, so it meets
every customer partition once and every product partition at least once.
"""

from collections import deque

import db

CUSTOMER_FIELDS = ["gender", "age_group", "occupation", "city_category",
                   "stay_in_current_city_years", "marital_status"]
PRODUCT_FIELDS = ["product_name", "product_category", "supplier_id", "supplier_name"]


class MeshJoin:
    def __init__(self, conn):
        self.conn = conn
        self.n_cust = db.partition_count(conn, "customer_master_data")   # 9
        self.n_prod = db.partition_count(conn, "product_master_data")    # 8
        self.cycle = max(self.n_cust, self.n_prod)                       # 9
        self.k_cust = 0               # next customer page to read
        self.k_prod = 0               # next product page to read
        self.H_cust = {}              # customer_id -> list of transactions in memory
        self.H_prod = {}              # product_id  -> list of transactions in memory
        self.queue = deque()          # [chunk, iterations seen], oldest on the left
        self.iterations = 0

    def in_memory(self):
        return sum(len(chunk) for chunk, _ in self.queue)

    def iterate(self, new_chunk):
        """One MESHJOIN iteration. Returns the transactions that are finished
        (their chunk has seen a full cycle), fully enriched."""
        self.iterations += 1

        # 1. new chunk enters the room: into H (both tables) and the queue
        if new_chunk:
            for t in new_chunk:
                t["customer_matched"] = False
                t["product_matched"] = False
                self.H_cust.setdefault(t["customer_id"], []).append(t)
                self.H_prod.setdefault(t["product_id"], []).append(t)
            self.queue.append([new_chunk, 0])

        # 2. take one page of each book out of the cupboard (disk buffer)
        cust_page = db.read_partition(self.conn, "customer_master_data", self.k_cust)
        prod_page = db.read_partition(self.conn, "product_master_data", self.k_prod)

        # 3. read every name on the page out loud: look it up in H
        matches = 0
        for row in cust_page:
            for t in self.H_cust.get(row["customer_id"], []):
                if not t["customer_matched"]:
                    for f in CUSTOMER_FIELDS:
                        t[f] = row[f]
                    t["customer_matched"] = True
                    matches += 1
        for row in prod_page:
            for t in self.H_prod.get(row["product_id"], []):
                if not t["product_matched"]:        # products: one page can come twice in 9 rounds
                    for f in PRODUCT_FIELDS:
                        t[f] = row[f]
                    t["product_matched"] = True
                    matches += 1

        # next pages, looping back to 0 after the last
        self.k_cust = (self.k_cust + 1) % self.n_cust
        self.k_prod = (self.k_prod + 1) % self.n_prod

        # 4. every chunk has now seen one more iteration; the oldest leaves after a full cycle
        for entry in self.queue:
            entry[1] += 1
        finished = []
        if self.queue and self.queue[0][1] >= self.cycle:
            chunk, _ = self.queue.popleft()
            self._remove_from_H(chunk)
            finished = chunk

        self.last = {"iteration": self.iterations, "added": len(new_chunk or []),
                     "cust_page": (self.k_cust - 1) % self.n_cust,
                     "prod_page": (self.k_prod - 1) % self.n_prod,
                     "matches": matches, "finished": len(finished),
                     "in_memory": self.in_memory()}
        return finished

    def _remove_from_H(self, chunk):
        leaving = {id(t) for t in chunk}
        for H, key in ((self.H_cust, "customer_id"), (self.H_prod, "product_id")):
            for k in {t[key] for t in chunk}:
                rest = [t for t in H[k] if id(t) not in leaving]
                if rest:
                    H[k] = rest
                else:
                    del H[k]


# ---------------------------------------------------------------------------
# Step 7.6: store enrichment (outside MESHJOIN) and the output queue
# ---------------------------------------------------------------------------

from splitting import md5_number

# Store list kept in memory (PDF 5.4.2), not a file or a disk table
STORES = {
    1: ("Online", "Web"),
    2: ("London Bridge", "London"),
    3: ("Manchester Arndale", "Manchester"),
    4: ("Birmingham Bullring", "Birmingham"),
    5: ("Edinburgh Princes", "Edinburgh"),
}


def add_store(t):
    """Online cart -> store 1. Store cart -> 2 + (MD5 number mod 4), using the
    same MD5 number as the sales_mode rule. Joined from the in-memory list."""
    if t["sales_mode"] == "Online":
        store_id = 1
    else:
        store_id = 2 + md5_number(t["transaction_id"]) % 4
    t["store_id"] = store_id
    t["store_name"], t["city"] = STORES[store_id]
    return t


def send_to_output(finished, output):
    """Finished transactions from MESHJOIN: add the store, then put them in
    the output queue, ready to be loaded into the DW (Phase 9)."""
    for t in finished:
        output.put(add_store(t))
    return len(finished)
