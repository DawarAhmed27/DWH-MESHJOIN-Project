"""Phase 10 test: run every statement in sql/Queries-DW.sql on the loaded DW
and print its time, its row count and its first rows.

Run from the Project folder (after the DW is loaded):  python src/test_queries.py
"""

import os
import time
from getpass import getpass

import db

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOW = 5

with open(os.path.join(PROJECT_DIR, "sql", "Queries-DW.sql"), encoding="utf-8") as f:
    text = f.read()

# split into statements; the "-- Qn." comment line above each one is its title
statements, title, lines = [], "", []
for line in text.splitlines():
    if line.startswith("-- Q") and not lines:
        title = line[3:]
    elif not line.startswith("--"):
        lines.append(line)
        if line.rstrip().endswith(";"):
            sql = "\n".join(lines).strip().rstrip(";")
            if sql:
                statements.append((title, sql))
            lines = []

conn = db.connect("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))
cur = conn.cursor()
for title, sql in statements:
    start = time.time()
    cur.execute(sql)
    rows = cur.fetchall() if cur.with_rows else []
    print(f"\n{title[:90]}\n  {sql.splitlines()[0][:70]} ...  ({time.time() - start:.1f} s, {len(rows):,} rows)")
    for r in rows[:SHOW]:
        print("   ", tuple(str(v) for v in r))
conn.close()
