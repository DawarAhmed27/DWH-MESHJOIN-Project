"""Step 8.3 test: shed transactions are read back in non-peak time.

Run test_shedding.py first, so shed_table has rows. Here no new sales arrive
(the buffer stays empty), so MESHJOIN has free places in every chunk.
- 3 s in peak: nothing may be read back.
- then non-peak: everything must come back, online-flagged rows first,
  each marked processing_mode "Shed" and fully enriched.

Run from the Project folder:  python src/test_readback.py
"""

import queue
import threading
import time
from getpass import getpass

import db
import stream
from meshjoin import MeshJoinThread

db_params = ("localhost", 3306, "dwh_project", "root", getpass("MySQL password: "))
conn = db.connect(*db_params)
shed_before = db.count(conn, "shed_table")
print(f"On shed disk at the start: {shed_before:,}")


class Done:                      #stands in for the two feeding threads (already finished)
    finished = True


settings = stream.Settings(mode="peak")
buffer = stream.StreamBuffer(1000)
output = queue.Queue()
stop = threading.Event()
mesh = MeshJoinThread(db_params, buffer, output, stop, [Done(), Done()], settings)
mesh.start()

time.sleep(3)
print(f"After 3 s in peak:     read back {mesh.read_back:,}, on shed disk {db.count(conn, 'shed_table'):,}")

settings.mode = "non-peak"
print("Mode is now non-peak")
start = time.time()
out = []
while len(out) < shed_before and time.time() - start < 120:
    time.sleep(1)
    while not output.empty():
        out.append(output.get())
    print(f"  {time.time() - start:3.0f} s: read back {mesh.read_back:,}, "
          f"on shed disk {db.count(conn, 'shed_table'):,}, out of MESHJOIN {len(out):,}")
stop.set()
mesh.join()

modes = [t["sales_mode"] for t in out]
last_online = max((i for i, m in enumerate(modes) if m == "Online"), default=-1)
first_periodic = min((i for i, m in enumerate(modes) if m == "Periodic"), default=len(modes))
print(f"\nOut: {len(out):,} of {shed_before:,}   shed disk now: {db.count(conn, 'shed_table'):,}")
print("All processing_mode 'Shed':", all(t["processing_mode"] == "Shed" for t in out))
print(f"sales_mode kept: Online {modes.count('Online'):,}, Periodic {modes.count('Periodic'):,}")
print("Online-flagged came out before periodic:", last_online < first_periodic)
print("All fully enriched:", all(t["customer_matched"] and t["product_matched"] for t in out))
conn.close()
