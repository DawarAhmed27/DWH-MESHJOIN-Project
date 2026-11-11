"""Step 8.2 test: peak shedding with a deliberately slow MESHJOIN.

The real MESHJOIN is too fast to fill the buffer at 80 per second, so here a
slow "consumer" takes only 500 transactions every 0.5 s (1,000 per second)
while the online stream sends 2,000 per second and a periodic group comes
every 3 seconds. The buffer fills, so shedding must happen.

Checks: nothing is lost (taken + shed = sent), the shed table holds exactly
what the threads say they shed, and periodic carts are shed whole.

Run from the Project folder (after main.py):  python src/test_shedding.py
"""

import os
import threading
import time
from getpass import getpass

import db
import stream

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECONDS = 15

db_params = ("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))
conn = db.connect(*db_params)
cur = conn.cursor()
cur.execute("UPDATE periodic_sales_data SET released = 0")   #start again from group 0
cur.execute("DELETE FROM shed_table")
conn.commit()

settings = stream.Settings(peak_tps=2000, nonpeak_tps=10, hour_seconds=3, mode="peak")
buffer = stream.StreamBuffer(1000)
stop = threading.Event()
online = stream.OnlineThread(os.path.join(PROJECT_DIR, "online_sales_stream.csv"),
                             buffer, settings, stop, db_params)
periodic = stream.PeriodicThread(db_params, buffer, settings, stop)
online.start()
periodic.start()

#slow consumer instead of MESHJOIN
taken = {"Live": 0, "Periodic": 0}
start = time.time()
print(" time | buffer | taken | shed online | shed periodic (arriving + taken out)")
while time.time() - start < SECONDS:
    time.sleep(0.5)
    for t in buffer.take_chunk(500):
        taken[t["processing_mode"]] += 1
    print(f"{time.time() - start:4.0f} s | {buffer.size():6} | {sum(taken.values()):5} | "
          f"{online.shed_online:11} | {periodic.shed + online.shed_periodic:6} "
          f"({periodic.shed} + {online.shed_periodic})")

stop.set()
online.join()
periodic.join()
for t in buffer.take_chunk(1000):          #what is still in the buffer
    taken[t["processing_mode"]] += 1

cur.execute("SELECT sales_mode, COUNT(*) FROM shed_table GROUP BY sales_mode")
in_shed = dict(cur.fetchall())
released = sum(rows for _, rows, _ in periodic.log)
shed_periodic = periodic.shed + online.shed_periodic

print(f"\nOnline:   put in buffer {online.sent:,} = taken {taken['Live']:,};  shed {online.shed_online:,}")
print(f"Periodic: released {released:,} = taken {taken['Periodic']:,} + shed {shed_periodic:,}")
print("Nothing lost:", online.sent == taken["Live"] and released == taken["Periodic"] + shed_periodic)
print(f"Shed table: {in_shed}   matches the counters:",
      in_shed.get("Online", 0) == online.shed_online and in_shed.get("Periodic", 0) == shed_periodic)

#a periodic cart is shed whole: its shed row count equals its row count in the staging table
cur.execute("""SELECT COUNT(*) FROM
                 (SELECT transaction_id, COUNT(*) n FROM shed_table
                  WHERE sales_mode = 'Periodic' GROUP BY transaction_id) s
               JOIN
                 (SELECT transaction_id, COUNT(*) n FROM periodic_sales_data
                  GROUP BY transaction_id) p USING (transaction_id)
               WHERE s.n <> p.n""")
print("Periodic carts shed only partly:", cur.fetchone()[0])
conn.close()
