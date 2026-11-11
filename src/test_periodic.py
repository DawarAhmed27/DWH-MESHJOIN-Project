"""Step 7.4 test: the PeriodicThread with a short hour (2 seconds).

A stand-in for MESHJOIN takes chunks out of the buffer so it never stays full.
Expected: group 0 at 0 s, group 1 at 2 s, group 2 at 4 s, group 3 at 6 s,
and released = 1 in MySQL for exactly those groups.

Run from the Project folder (after main.py):  python src/test_periodic.py
"""

import threading
import time
from getpass import getpass

import db
from stream import PeriodicThread, Settings, StreamBuffer

params = ("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))

#start clean: no group released yet
conn = db.connect(*params)
cur = conn.cursor()
cur.execute("UPDATE periodic_sales_data SET released = 0")
conn.commit()

settings = Settings(hour_seconds=2)
buffer = StreamBuffer(limit=1000)
stop = threading.Event()
periodic = PeriodicThread(params, buffer, settings, stop)
periodic.start()

taken = []
start = time.time()
while time.time() - start < 7.5:          #simulated MESHJOIN: take chunks
    taken.extend(buffer.take_chunk(500))
    time.sleep(0.1)
stop.set()
periodic.join()

print("Groups released (group, rows, seconds after start):")
for k, n, t in periodic.log:
    print(f"  group {k}: {n:,} rows at {t} s")
print(f"Transactions taken out of the buffer: {len(taken):,}")
print("Example:", taken[0])

cur.execute("SELECT release_hour, COUNT(*) FROM periodic_sales_data "
            "WHERE released = 1 GROUP BY release_hour ORDER BY release_hour")
print("Released in MySQL:", cur.fetchall())

cur.execute("UPDATE periodic_sales_data SET released = 0")   #reset for the real run
conn.commit()
conn.close()
