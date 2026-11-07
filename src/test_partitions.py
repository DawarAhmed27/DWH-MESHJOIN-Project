"""Step 7.2 test: read every partition of both master tables, page by page.

Run after main.py has loaded the master data:  python src/test_partitions.py
"""

from getpass import getpass

import db

conn = db.connect("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))

for table in db.MASTER_TABLES:
    n = db.partition_count(conn, table)
    print(f"\n{table}: {n} partitions")
    total = 0
    seen = set()
    for k in range(n):
        rows = db.read_partition(conn, table, k)
        first_id = list(rows[0].values())[0]
        print(f"  partition {k}: {len(rows)} rows, first id {first_id}")
        total += len(rows)
        seen.update(list(r.values())[0] for r in rows)
    print(f"  total rows read: {total:,}   distinct ids: {len(seen):,}   rows in table: {db.count(conn, table):,}")

# the loop MESHJOIN uses: after the last partition, start again at 0
n = db.partition_count(conn, "customer_master_data")
k = 0
order = []
for _ in range(12):
    order.append(k)
    k = (k + 1) % n
print("\nCustomer partition order over 12 iterations:", order)
conn.close()
