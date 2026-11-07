"""Step 7.6 test: MESHJOIN + store enrichment + output queue, no threads.

Feeds 1,500 online and 1,500 periodic transactions, sends every finished
transaction through add_store into the output queue, then checks the stores.

Run from the Project folder (after main.py):  python src/test_store.py
"""

import csv
import os
import queue
from collections import Counter
from getpass import getpass

import db
from meshjoin import MeshJoin, send_to_output
from splitting import md5_number
from stream import to_transaction

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def first_rows(name, n, mode):
    with open(os.path.join(PROJECT_DIR, name), newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [to_transaction(next(reader), mode) for _ in range(n)]


transactions = first_rows("online_sales_stream.csv", 1500, "Live") + \
               first_rows("periodic_sales_data.csv", 1500, "Periodic")
chunks = [transactions[i:i + 500] for i in range(0, len(transactions), 500)]

conn = db.connect("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))
mj = MeshJoin(conn)
output = queue.Queue()

while chunks or mj.queue:
    send_to_output(mj.iterate(chunks.pop(0) if chunks else []), output)
conn.close()

rows = []
while not output.empty():
    rows.append(output.get())

print(f"In: {len(transactions):,}   In the output queue: {len(rows):,}")
online = [t for t in rows if t["sales_mode"] == "Online"]
store = [t for t in rows if t["sales_mode"] == "Periodic"]
print("Online rows all in store 1:", all(t["store_id"] == 1 for t in online))
print("Periodic rows follow 2 + MD5 mod 4:",
      all(t["store_id"] == 2 + md5_number(t["transaction_id"]) % 4 for t in store))
carts = {t["transaction_id"]: t["store_id"] for t in rows}
print("Carts per store:", dict(sorted(Counter(carts.values()).items())))
print("\nOnline example:  ", {k: online[0][k] for k in ["transaction_id", "customer_id", "gender", "product_name", "store_id", "store_name", "city"]})
print("Periodic example:", {k: store[0][k] for k in ["transaction_id", "customer_id", "gender", "product_name", "store_id", "store_name", "city"]})
print("\nFields of one finished row:", list(rows[0].keys()))
