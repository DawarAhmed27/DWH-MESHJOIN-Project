"""Step 7.5 test: the MESHJOIN core on fixed data, no threads.

Takes the first 3,000 online transactions, feeds them as 6 chunks of 500
(one per iteration), then runs empty iterations until everything is out.
Checks: everything comes out, exactly once, fully enriched, with the same
attributes as a direct lookup in the master tables.

Run from the Project folder (after main.py):  python src/test_meshjoin_core.py
"""

import csv
import os
from getpass import getpass

import db
from meshjoin import CUSTOMER_FIELDS, PRODUCT_FIELDS, MeshJoin
from stream import to_transaction

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 3000

with open(os.path.join(PROJECT_DIR, "online_sales_stream.csv"), newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    transactions = [to_transaction(next(reader), "Live") for _ in range(N)]
chunks = [transactions[i:i + 500] for i in range(0, N, 500)]

conn = db.connect("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))
mj = MeshJoin(conn)
print(f"Customer partitions: {mj.n_cust}, product partitions: {mj.n_prod}, a chunk stays {mj.cycle} iterations\n")

example = transactions[0]
print("Before:", {k: example[k] for k in ["transaction_id", "customer_id", "product_id"]}, "\n")

print(" iter | added | cust page | prod page | matches | finished | in memory")
out = []
while chunks or mj.queue:
    finished = mj.iterate(chunks.pop(0) if chunks else [])
    out.extend(finished)
    s = mj.last
    print(f" {s['iteration']:4} | {s['added']:5} | {s['cust_page']:9} | {s['prod_page']:9} | "
          f"{s['matches']:7} | {s['finished']:8} | {s['in_memory']:9}")

print("\nAfter: ", {k: example[k] for k in ["transaction_id", "customer_id", "gender", "age_group",
                                            "product_id", "product_name", "supplier_name"]})

#checks
print(f"\nIn: {N:,}   Out: {len(out):,}   Out exactly once: {len({id(t) for t in out}) == N}")
print("All customer-matched:", all(t["customer_matched"] for t in out),
      "  All product-matched:", all(t["product_matched"] for t in out))

#compare with a direct lookup (only for this test)
cur = conn.cursor(dictionary=True)
cur.execute("SELECT * FROM customer_master_data")
cust = {r["customer_id"]: r for r in cur.fetchall()}
cur.execute("SELECT * FROM product_master_data")
prod = {r["product_id"]: r for r in cur.fetchall()}
wrong = sum(1 for t in out
            if any(t[f] != cust[t["customer_id"]][f] for f in CUSTOMER_FIELDS)
            or any(t[f] != prod[t["product_id"]][f] for f in PRODUCT_FIELDS))
print("Attributes different from a direct lookup:", wrong)
print("H empty at the end:", not mj.H_cust and not mj.H_prod)
conn.close()
