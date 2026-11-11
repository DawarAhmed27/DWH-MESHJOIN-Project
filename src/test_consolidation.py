"""Step 9.1 test: consolidation of one transaction, and the time rules.

No database needed. Takes the first online transaction, enriches it from
the Master Data CSV files (only for this test; MESHJOIN does this in the
program), adds the store, and prints its dimension rows and fact row.
Then checks the time parts on dates chosen at the edges of the rules.

Run from the Project folder (after main.py):  python src/test_consolidation.py
"""

import csv
import os

from consolidation import consolidate, time_row
from meshjoin import CUSTOMER_FIELDS, PRODUCT_FIELDS, add_store
from stream import to_transaction

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_csv(name, key):
    with open(os.path.join(PROJECT_DIR, name), newline="", encoding="utf-8") as f:
        return {r[key]: r for r in csv.DictReader(f)}


customers = read_csv("customer_master_data.csv", "customer_id")
products = read_csv("product_master_data.csv", "product_id")
with open(os.path.join(PROJECT_DIR, "online_sales_stream.csv"), newline="", encoding="utf-8") as f:
    t = to_transaction(next(csv.DictReader(f)), "Live")

for field in CUSTOMER_FIELDS:
    t[field] = customers[t["customer_id"]][field]
for field in PRODUCT_FIELDS:
    t[field] = products[t["product_id"]][field]
add_store(t)

dims, fact = consolidate(t)
print(f"Transaction: {t['transaction_id']}  product {t['product_id']}  "
      f"quantity {t['quantity']} x price {t['unit_price']}  at {t['event_time']}\n")
for name, row in dims.items():
    print(f"dim_{name}: {row}")
print(f"\nfact_sales: {fact}")
print(f"revenue = {t['quantity']} x {t['unit_price']} = {fact['revenue']}")

#time rules at their edges
print("\n event_time           | key          | Q | half | day       | type    | season")
cases = [
    ("2010-12-01 08:26:00", 4, 2, "Wednesday", "Weekday", "Winter"),
    ("2010-12-05 10:00:00", 4, 2, "Sunday",    "Weekend", "Winter"),
    ("2011-02-28 12:00:00", 1, 1, "Monday",    "Weekday", "Winter"),
    ("2011-03-01 09:00:00", 1, 1, "Tuesday",   "Weekday", "Spring"),
    ("2011-05-31 09:00:00", 2, 1, "Tuesday",   "Weekday", "Spring"),
    ("2011-06-30 15:30:00", 2, 1, "Thursday",  "Weekday", "Summer"),
    ("2011-07-01 15:30:00", 3, 2, "Friday",    "Weekday", "Summer"),
    ("2011-09-03 11:00:00", 3, 2, "Saturday",  "Weekend", "Fall"),
    ("2011-11-30 17:00:00", 4, 2, "Wednesday", "Weekday", "Fall"),
    ("2011-12-09 12:50:00", 4, 2, "Friday",    "Weekday", "Winter"),
]
all_ok = True
for when, q, half, day, kind, season in cases:
    r = time_row(when)
    ok = (r["quarter"], r["half_year"], r["day_of_week"], r["day_type"], r["season"]) == (q, half, day, kind, season)
    all_ok &= ok
    print(f" {when} | {r['time_key']} | {r['quarter']} | {r['half_year']:4} | {r['day_of_week']:9} | "
          f"{r['day_type']:7} | {r['season']:6} {'ok' if ok else 'WRONG'}")
print("\nAll time rules correct:", all_ok)
