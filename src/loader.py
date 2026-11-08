"""Step 8.1: the LoaderThread takes finished transactions out of the output queue.

For now it only counts them (Phase 9 will insert them into the DW here).
It runs in the background so the main thread is free to read commands.
"""

import queue
import threading
from collections import Counter


class LoaderThread(threading.Thread):
    def __init__(self, output, stop_event):
        super().__init__(name="LoaderThread", daemon=True)
        self.output = output
        self.stop_event = stop_event
        self.received = 0
        self.stores = Counter()
        self.by_processing_mode = Counter()    # Live / Periodic / Shed
        self.unmatched = 0

    def run(self):
        while not self.stop_event.is_set() or not self.output.empty():
            try:
                t = self.output.get(timeout=0.2)
            except queue.Empty:
                continue
            self.received += 1
            self.stores[t["store_id"]] += 1
            self.by_processing_mode[t["processing_mode"]] += 1
            self.unmatched += not (t["customer_matched"] and t["product_matched"])
