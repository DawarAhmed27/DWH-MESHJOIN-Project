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
    """Values the user can change while the program runs (commands, Phase 8)."""

    def __init__(self, peak_tps=80, nonpeak_tps=10, hour_seconds=60, mode="peak"):
        self.peak_tps = peak_tps
        self.nonpeak_tps = nonpeak_tps
        self.hour_seconds = hour_seconds
        self.mode = mode                      # "peak" or "non-peak"
        self.source = "both"                  # "online", "periodic" or "both"

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
        """Non-peak: add one online transaction; wait while the buffer is full."""
        with self.lock:
            while len(self.online) + len(self.periodic) >= self.limit:
                if stop_event.is_set():
                    return False
                self.lock.wait(timeout=0.2)   # sleep until MESHJOIN takes some out
            self.online.append(row)
            self.lock.notify_all()
            return True

    def put_periodic(self, row, stop_event):
        """Non-peak: add one periodic transaction; wait while the buffer is full."""
        with self.lock:
            while len(self.online) + len(self.periodic) >= self.limit:
                if stop_event.is_set():
                    return False
                self.lock.wait(timeout=0.2)
            self.periodic.append(row)
            self.lock.notify_all()
            return True

    def try_put_cart(self, cart):
        """Peak (step 8.2): put a whole periodic cart only if it fits.
        Returns False if it does not fit; the caller then sheds the cart."""
        with self.lock:
            if len(self.online) + len(self.periodic) + len(cart) > self.limit:
                return False
            self.periodic.extend(cart)
            self.lock.notify_all()
            return True

    def put_online_peak(self, row):
        """Peak (step 8.2): put an online transaction without waiting.
        If the buffer is full, the newest periodic cart in the buffer is taken
        out to make room (periodic is shed before online).
        Returns (put, evicted): put is False if there was still no room."""
        with self.lock:
            evicted = []
            if len(self.online) + len(self.periodic) >= self.limit and self.periodic:
                cart_id = self.periodic[-1]["transaction_id"]
                while self.periodic and self.periodic[-1]["transaction_id"] == cart_id:
                    evicted.append(self.periodic.pop())
                evicted.reverse()
            if len(self.online) + len(self.periodic) >= self.limit:
                return False, evicted         # only online inside: shed this one too
            self.online.append(row)
            self.lock.notify_all()
            return True, evicted

    def take_chunk(self, max_rows=500):
        """MESHJOIN side: take up to max_rows, online first (PDF priority),
        then whole periodic carts."""
        chunk = []
        with self.lock:
            while self.online and len(chunk) < max_rows:
                chunk.append(self.online.popleft())
            # periodic: whole carts only, so a cart is never split between
            # MESHJOIN and the shed table (only a cart bigger than the room is cut)
            while self.periodic and len(chunk) < max_rows:
                cart_id = self.periodic[0]["transaction_id"]
                size = 0
                for t in self.periodic:
                    if t["transaction_id"] != cart_id:
                        break
                    size += 1
                if chunk and len(chunk) + size > max_rows:
                    break                     # does not fit: next iteration
                for _ in range(min(size, max_rows - len(chunk))):
                    chunk.append(self.periodic.popleft())
            self.lock.notify_all()            # wake a thread waiting for space
        return chunk


def to_transaction(row, processing_mode):
    """CSV or staging-table row -> transaction dict with proper types."""
    return {
        "transaction_id": row["transaction_id"],
        "customer_id": row["customer_id"],
        "product_id": row["product_id"],
        "quantity": int(row["quantity"]),
        "unit_price": float(row["unit_price"]),
        "event_time": str(row["event_time"]),       # 'YYYY-MM-DD HH:MM:SS'
        "sales_mode": row["sales_mode"],
        "processing_mode": processing_mode,
    }


class OnlineThread(threading.Thread):
    """Reads the online file top to bottom and sends each transaction into the
    stream buffer at settings.tps() transactions per second."""

    def __init__(self, path, buffer, settings, stop_event, db_params):
        super().__init__(name="OnlineThread", daemon=True)
        self.path = path
        self.buffer = buffer
        self.settings = settings
        self.stop_event = stop_event
        self.db_params = db_params        # own MySQL connection, for shedding
        self.sent = 0                     # put into the stream buffer
        self.shed_online = 0              # online transactions shed (peak, last resort)
        self.shed_periodic = 0            # periodic transactions taken out of the buffer to make room
        self.finished = False

    def run(self):
        import db
        conn = db.connect(*self.db_params)
        next_time = time.time()
        with open(self.path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                # command "periodic": pause the stream reader
                while self.settings.source == "periodic" and not self.stop_event.is_set():
                    time.sleep(0.05)
                    next_time = time.time()
                if self.stop_event.is_set():
                    break
                t = to_transaction(row, "Live")
                if self.settings.mode == "peak":
                    # peak: never wait. Shed periodic first, then online.
                    put, evicted = self.buffer.put_online_peak(t)
                    if evicted:
                        db.shed_rows(conn, evicted)
                        self.shed_periodic += len(evicted)
                    if put:
                        self.sent += 1
                    else:
                        db.shed_rows(conn, [t])
                        self.shed_online += 1
                else:
                    # non-peak: wait for space, nothing is shed
                    if not self.buffer.put_online(t, self.stop_event):
                        break
                    self.sent += 1

                # keep the speed: one transaction every 1/tps seconds
                next_time += 1.0 / self.settings.tps()
                delay = next_time - time.time()
                if delay > 0:
                    time.sleep(delay)
                else:
                    next_time = time.time()   # we were held up (buffer full): don't rush to catch up
        conn.close()
        self.finished = True


class PeriodicThread(threading.Thread):
    """Every simulated hour, extracts the next group (0 to 47) from the
    staging table, marks it released, and sends its transactions into the
    stream buffer. Hour k starts k * hour_seconds after the thread starts.
    If a group is still being fed when the next hour comes, the next group
    waits behind it (decision Q4).
    Command "online": no group is released. When periodic or both is typed
    again, the waiting group is released at once, then one per hour again."""

    def __init__(self, db_params, buffer, settings, stop_event, groups=48):
        super().__init__(name="PeriodicThread", daemon=True)
        self.db_params = db_params        # (host, port, database, user, password)
        self.buffer = buffer
        self.settings = settings
        self.stop_event = stop_event
        self.groups = groups
        self.sent = 0                     # put into the stream buffer
        self.shed = 0                     # periodic transactions shed (peak)
        self.log = []                     # (group, rows, seconds after start)
        self.finished = False

    def run(self):
        import db                         # own MySQL connection for this thread
        conn = db.connect(*self.db_params)
        start = time.time()
        next_release = start                  # group 0 at once
        for k in range(self.groups):
            # wait for hour k (and while the source is "online")
            while time.time() < next_release or self.settings.source == "online":
                if self.stop_event.is_set():
                    conn.close()
                    return
                time.sleep(0.05)
            if time.time() - next_release > 1:    # held back by "online": restart the hour clock
                next_release = time.time()
            next_release += self.settings.hour_seconds

            rows = db.release_group(conn, k)
            self.log.append((k, len(rows), round(time.time() - start, 1)))
            # whole shopping carts, in the order they appear
            carts = {}
            for row in rows:
                carts.setdefault(row["transaction_id"], []).append(to_transaction(row, "Periodic"))

            for cart in carts.values():
                if self.settings.mode == "peak":
                    # peak: the cart goes in only if it fits; otherwise the whole cart is shed
                    if self.buffer.try_put_cart(cart):
                        self.sent += len(cart)
                    else:
                        db.shed_rows(conn, cart)
                        self.shed += len(cart)
                else:
                    # non-peak: wait for space, nothing is shed
                    for t in cart:
                        if not self.buffer.put_periodic(t, self.stop_event):
                            conn.close()
                            return
                        self.sent += 1
        conn.close()
        self.finished = True
