"""Step 7.3: the stream buffer (the door) and the OnlineThread (people walking in).

PDF 4.1-4.4: the OnlineThread reads online_sales_stream.csv and puts each
transaction into the stream buffer at the current speed (80 per second in
peak time, 10 in non-peak). The buffer holds at most 1,000 transactions.
"""

import csv
import threading
import time
from collections import deque


class Settings:
    """Values the user can change while the program runs (commands: Phase 8)."""

    def __init__(self, peak_tps=80, nonpeak_tps=10, hour_seconds=60, mode="peak"):
        self.peak_tps = peak_tps
        self.nonpeak_tps = nonpeak_tps
        self.hour_seconds = hour_seconds
        self.mode = mode                      # "peak" or "non-peak"

    def tps(self):
        """Transactions per second right now."""
        return self.peak_tps if self.mode == "peak" else self.nonpeak_tps


class StreamBuffer:
    """The waiting area in front of MESHJOIN. Two lines at the door:
    online (Live) and periodic. Together they never hold more than `limit`."""

    def __init__(self, limit=1000):
        self.limit = limit
        self.online = deque()
        self.periodic = deque()
        self.lock = threading.Condition()     # one thread at a time touches the lines

    def size(self):
        with self.lock:
            return len(self.online) + len(self.periodic)

    def put_online(self, row, stop_event):
        """Add one online transaction; wait while the buffer is full."""
        with self.lock:
            while len(self.online) + len(self.periodic) >= self.limit:
                if stop_event.is_set():
                    return False
                self.lock.wait(timeout=0.2)   # sleep until MESHJOIN takes some out
            self.online.append(row)
            self.lock.notify_all()
            return True

    def take_chunk(self, max_rows=500):
        """MESHJOIN side: take up to max_rows, online first (PDF priority)."""
        chunk = []
        with self.lock:
            while self.online and len(chunk) < max_rows:
                chunk.append(self.online.popleft())
            while self.periodic and len(chunk) < max_rows:
                chunk.append(self.periodic.popleft())
            self.lock.notify_all()            # wake a thread waiting for space
        return chunk


def to_transaction(row, processing_mode):
    """CSV row (all text) -> transaction dict with proper types."""
    return {
        "transaction_id": row["transaction_id"],
        "customer_id": row["customer_id"],
        "product_id": row["product_id"],
        "quantity": int(row["quantity"]),
        "unit_price": float(row["unit_price"]),
        "event_time": row["event_time"],
        "sales_mode": row["sales_mode"],
        "processing_mode": processing_mode,
    }


class OnlineThread(threading.Thread):
    """Reads the online file top to bottom and sends each transaction into the
    stream buffer at settings.tps() transactions per second."""

    def __init__(self, path, buffer, settings, stop_event):
        super().__init__(name="OnlineThread", daemon=True)
        self.path = path
        self.buffer = buffer
        self.settings = settings
        self.stop_event = stop_event
        self.sent = 0
        self.finished = False

    def run(self):
        next_time = time.time()
        with open(self.path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if self.stop_event.is_set():
                    break
                if not self.buffer.put_online(to_transaction(row, "Live"), self.stop_event):
                    break
                self.sent += 1

                # keep the speed: one transaction every 1/tps seconds
                next_time += 1.0 / self.settings.tps()
                delay = next_time - time.time()
                if delay > 0:
                    time.sleep(delay)
                else:
                    next_time = time.time()   # we were held up (buffer full): don't rush to catch up
        self.finished = True
