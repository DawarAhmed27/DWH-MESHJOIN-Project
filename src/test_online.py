"""Step 7.3 test: the OnlineThread and the stream buffer, with no MESHJOIN yet.

Part 1: peak (80/s) for 5 s, then non-peak (10/s) for 5 s. Nobody takes
        transactions out, so the buffer just fills up.
Part 2: very fast speed until the buffer reaches its limit of 1,000.
Part 3: take a chunk of 500 out: the thread can continue.

Run from the Project folder:  python src/test_online.py
"""

import os
import threading
import time

from stream import OnlineThread, Settings, StreamBuffer

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ONLINE_FILE = os.path.join(PROJECT_DIR, "online_sales_stream.csv")

settings = Settings(mode="peak")
buffer = StreamBuffer(limit=1000)
stop = threading.Event()
online = OnlineThread(ONLINE_FILE, buffer, settings, stop)
online.start()

print("Part 1: speed")
last = 0
for second in range(1, 11):
    if second == 6:
        settings.mode = "non-peak"
        print("  -- switched to non-peak --")
    time.sleep(1)
    print(f"  second {second:2}: +{online.sent - last:3} transactions   buffer size {buffer.size():4}")
    last = online.sent

print("\nPart 2: fill the buffer")
settings.peak_tps = 2000
settings.mode = "peak"
time.sleep(1.5)
print(f"  buffer size {buffer.size()} (limit 1,000) - the thread is now waiting at the door")
before = online.sent
time.sleep(1)
print(f"  sent in the next second while full: {online.sent - before}")

print("\nPart 3: MESHJOIN takes a chunk")
chunk = buffer.take_chunk(500)
print(f"  took {len(chunk)} transactions, buffer size now {buffer.size()}")
time.sleep(0.5)
print(f"  half a second later: buffer size {buffer.size()} (the thread filled the space again)")
print("  first transaction taken:", chunk[0])

stop.set()
online.join()
print("\nOnlineThread stopped.")
