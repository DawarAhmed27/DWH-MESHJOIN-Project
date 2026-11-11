"""Step 9.2 / 9.4 test: check the DW after a run of main.py (run it until
"All ... transactions loaded into the DW", then quit).

Expected values are computed from the working data, not from the DW:
- the online file online_sales_stream.csv
- the staging table periodic_sales_data

Run from the Project folder:  python src/test_dw.py
"""

import csv
import os
from decimal import Decimal
from getpass import getpass

import db

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

conn = db.connect("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))
cur = conn.cursor()


def one(sql):
    cur.execute(sql)
    return cur.fetchone()[0]


#expected, from the working data
rows, revenue, customers, products, minutes = 0, Decimal(0), set(), set(), set()
with open(os.path.join(PROJECT_DIR, "online_sales_stream.csv"), newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rows += 1
        revenue += Decimal(r["unit_price"]) * int(r["quantity"])
        customers.add(r["customer_id"])
        products.add(r["product_id"])
        minutes.add(r["event_time"][:16])
cur.execute("SELECT customer_id, product_id, quantity, unit_price, event_time FROM periodic_sales_data")
for c, p, q, price, when in cur.fetchall():
    rows += 1
    revenue += price * q
    customers.add(c)
    products.add(p)
    minutes.add(str(when)[:16])

print("                 expected      in the DW")
checks = [
    ("fact rows", rows, one("SELECT COUNT(*) FROM fact_sales")),
    ("revenue", revenue, one("SELECT SUM(revenue) FROM fact_sales")),
    ("customers", len(customers), one("SELECT COUNT(*) FROM dim_customer")),
    ("products", len(products), one("SELECT COUNT(*) FROM dim_product")),
    ("suppliers", 5, one("SELECT COUNT(*) FROM dim_supplier")),
    ("stores", 5, one("SELECT COUNT(*) FROM dim_store")),
    ("time (minutes)", len(minutes), one("SELECT COUNT(*) FROM dim_time")),
    ("facts with revenue <= 0", 0, one("SELECT COUNT(*) FROM fact_sales WHERE revenue <= 0")),
]
all_ok = True
for name, want, got in checks:
    ok = want == got
    all_ok &= ok
    print(f"{name:24} {want:>14,} {got:>14,}  {'ok' if ok else 'DIFFERENT'}")

print("\nBy processing mode:")
cur.execute("SELECT processing_mode, sales_mode, COUNT(*) FROM fact_sales GROUP BY 1, 2 ORDER BY 1, 2")
for pm, sm, n in cur.fetchall():
    print(f"  {pm:8} {sm:8} {n:>9,}")

print("\nExample: transaction 536365, product 85123A")
cur.execute("""SELECT f.transaction_id, p.product_name, c.customer_id, c.gender, c.age_group,
                      s.supplier_name, st.store_name, t.time_key, t.day_of_week, t.season,
                      f.quantity, f.revenue, f.processing_mode
               FROM fact_sales f
               JOIN dim_customer c ON c.customer_key = f.customer_key
               JOIN dim_product  p ON p.product_key  = f.product_key
               JOIN dim_supplier s ON s.supplier_key = f.supplier_key
               JOIN dim_store   st ON st.store_key   = f.store_key
               JOIN dim_time     t ON t.time_key     = f.time_key
               WHERE f.transaction_id = '536365' AND p.product_id = '85123A'""")
for r in cur.fetchall():
    print(" ", r)

print("\nAll checks passed:", all_ok)
conn.close()
