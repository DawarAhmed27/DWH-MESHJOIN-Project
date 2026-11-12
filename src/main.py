"""Near-real-time DW with MESHJOIN - program entry point.

Phase 6: ask for the connection details, create the tables, clean the file,
prepare the Master Data, load it, write the online file and load the 48
periodic groups into the staging table.
Phase 7: start the OnlineThread, PeriodicThread and MeshJoinThread.
Phase 8: accept commands while the threads run (type help for the list).
Phase 9: the LoaderThread loads every finished transaction into the DW.

Run:  python src/main.py   [--peak 80] [--nonpeak 10] [--hour 60] [--mode peak]
"""

import argparse
import os
import queue
import sys
import threading
import time
from getpass import getpass

import cleaning
import db
import master_data
import meshjoin
import splitting
import stream
import working_data
from loader import LoaderThread

#stream buffer size from the PDF
STREAM_BUFFER_LIMIT = 1000

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SRC_DIR)


#command-line options: speeds, hour length, start mode
def settings():
    p = argparse.ArgumentParser(description="MESHJOIN near-real-time DW")
    p.add_argument("--peak", type=int, default=80, help="transactions per second in peak time")
    p.add_argument("--nonpeak", type=int, default=10, help="transactions per second in non-peak time")
    p.add_argument("--hour", type=int, default=60, help="seconds of real time in one simulated hour")
    p.add_argument("--mode", choices=["peak", "non-peak"], default="peak", help="stream arrival mode at start")
    return p.parse_args()


#asks a question; Enter keeps the default
def ask(question, default):
    answer = input(f"{question} [{default}]: ").strip()
    return answer or default


#finds Create-DW.sql in the sql folder
def find_sql_file():
    path = db.find_file(PROJECT_DIR, "Create-DW.sql", "sql", "../Create-DW", ".", "src")
    if path:
        return path
    sys.exit("Create-DW.sql not found (expected in sql/ or ../Create-DW/).")


#default location of Online Retail.xlsx
def default_data_file():
    return db.find_file(PROJECT_DIR, "Online Retail.xlsx", "data", ".", "../Data") or "Online Retail.xlsx"


#prints the settings (the PDF wants them shown before the threads start)
def print_settings(cfg):
    print(f"Stream arrival mode:   {cfg.mode}")
    print(f"Peak speed:            {cfg.peak} transactions/second")
    print(f"Non-peak speed:        {cfg.nonpeak} transactions/second")
    print(f"One simulated hour:    {cfg.hour} seconds")
    print(f"Stream buffer limit:   {STREAM_BUFFER_LIMIT:,} transactions")


#program start: connect, prepare the data, then start the threads
def main():
    cfg = settings()
    print("=" * 60)
    print("Near-real-time Data Warehouse with MESHJOIN")
    print("=" * 60)
    print_settings(cfg)

    #1. connection details and file paths, asked at startup (PDF 6); Enter keeps the value in brackets
    print("\nConnection details (press Enter to keep the value in brackets):")
    host     = ask("Host", "localhost")
    port     = int(ask("Port", "3306"))
    database = ask("Database name", "dwh_project")
    user     = ask("User name", "root")
    #the password is typed hidden and kept only in memory
    password = getpass("Password: ")

    data_file = ask("Path of the transactional file (Online Retail.xlsx)", default_data_file())
    if os.path.isdir(data_file):   #a folder was given: look for the file inside it
        data_file = os.path.join(data_file, "Online Retail.xlsx")
    if not os.path.exists(data_file):
        sys.exit(f"File not found: {data_file}")
    out_dir = os.path.dirname(os.path.abspath(data_file))

    #the online file is written by the preparation and read by the OnlineThread
    online_file = ask("Path of the online file", os.path.join(out_dir, "online_sales_stream.csv"))
    if os.path.isdir(online_file):
        online_file = os.path.join(online_file, "online_sales_stream.csv")

    #connect, or stop with a clear message
    try:
        conn = db.connect(host, port, database, user, password)
    except Exception as e:
        sys.exit(f"Could not connect to MySQL at {host}:{port} as {user}.\n"
                 f"Check that MySQL is running, the port and the password.\n({e})")
    print(f"Connected to {host}:{port}/{database}")

    #2. create the working tables and the DW (drops any old copy)
    db.run_sql_file(conn, find_sql_file())
    print("Tables created (old copy and view dropped first)")

    #3. clean
    t0 = time.time()
    print("\n--- Cleaning ---")
    df = cleaning.clean(data_file)

    #4. online / periodic
    print("\n--- Sales mode ---")
    df = splitting.split(df)

    #5. master data: write the CSV files and load the tables
    print("\n--- Master Data ---")
    customers = master_data.build_customers(df)
    products = master_data.build_products(df)
    customers.to_csv(os.path.join(out_dir, "customer_master_data.csv"), index=False)
    products.to_csv(os.path.join(out_dir, "product_master_data.csv"), index=False)
    db.insert_rows(conn, "customer_master_data", master_data.with_partition_no(customers))
    db.insert_rows(conn, "product_master_data", master_data.with_partition_no(products))

    #6. online file and the 48 periodic groups
    print("\n--- Working data ---")
    online = working_data.build_online(df)
    online.to_csv(online_file, index=False)
    periodic = working_data.build_periodic(df)
    t_stage = time.time()
    db.insert_rows(conn, "periodic_sales_data", periodic)
    print(f"Staging table filled in {time.time() - t_stage:.1f} s ({len(periodic):,} rows)")

    print("\n--- Loaded into MySQL ---")
    for table in ["customer_master_data", "product_master_data", "periodic_sales_data"]:
        print(f"{table}: {db.count(conn, table):,} rows")
    print(f"Online file: {online_file}")
    print(f"Preparation took {time.time() - t0:.1f} s")

    conn.close()

    #settings printed again just before the threads start (PDF Section 9)
    print("\nStarting the threads")
    print_settings(cfg)
    run_threads(cfg, (host, port, database, user, password), online_file,
                expected=len(online) + len(periodic))


#the list of commands shown by help
HELP = """Commands:
  online             online stream only (no periodic groups)
  periodic           periodic groups only (online stream paused)
  both               both (online first)
  peak               fast speed, shedding allowed
  non-peak           slow speed, shed transactions processed
  speed peak N       set the peak speed to N transactions/second
  speed non-peak N   set the non-peak speed to N transactions/second
  status             show the current state
  help               show this list
  quit               stop the threads and close the program"""


#the status command: buffer, MESHJOIN, shedding and loading numbers
def print_status(s, buffer, mesh, online, periodic, loader, conn):
    m = mesh.mj
    print(f"Mode: {s.mode}   Source: {s.source}   "
          f"Speed: {s.tps()}/s (peak {s.peak_tps}/s, non-peak {s.nonpeak_tps}/s)")
    print(f"Stream buffer: {buffer.size():,} / {buffer.limit:,}")
    print(f"In H (MESHJOIN memory): {m.in_memory() if m else 0:,}   iterations: {m.iterations if m else 0:,}")
    print(f"Still on shed disk: {db.count(conn, 'shed_table'):,}")
    print(f"Shed in peak: online {online.shed_online:,}, "
          f"periodic {online.shed_periodic + periodic.shed:,} "
          f"(arriving {periodic.shed:,}, taken out of the buffer {online.shed_periodic:,})")
    print(f"Read back from shed (non-peak): {mesh.read_back:,}")
    print(f"Online sent: {online.sent:,}   Periodic groups released: {len(periodic.log)} / 48")
    print(f"Out of MESHJOIN: {loader.received:,}   by processing mode: {dict(loader.by_processing_mode)}")
    print(f"Loaded into the DW: {loader.loaded:,} fact rows   "
          f"periodic waiting for the hour: {len(loader.waiting):,}   "
          f"hourly loads: {len(loader.hourly_loads)} (last {loader.hourly_loads[-1][1] if loader.hourly_loads else 0:,} rows)")


#starts the 4 threads and reads commands until quit
def run_threads(cfg, db_params, online_file, expected):
    """Phase 7 threads + Phase 8 commands. The main thread reads commands;
    the LoaderThread takes finished transactions from `output`."""
    #shared objects: settings, stream buffer, output queue and the stop signal
    settings = stream.Settings(cfg.peak, cfg.nonpeak, cfg.hour, cfg.mode)
    buffer = stream.StreamBuffer(STREAM_BUFFER_LIMIT)
    output = queue.Queue()
    stop = threading.Event()

    #create the four threads, each with its own job
    online = stream.OnlineThread(online_file, buffer, settings, stop, db_params)
    periodic = stream.PeriodicThread(db_params, buffer, settings, stop)
    mesh = meshjoin.MeshJoinThread(db_params, buffer, output, stop, [online, periodic], settings)
    loader = LoaderThread(output, stop, db_params, settings)
    for t in (online, periodic, mesh, loader):
        t.start()
    conn = db.connect(*db_params)            #main thread's own connection (for status)
    start = time.time()
    print("\n" + HELP + "\n")

    #tell the user once when every transaction has gone through
    def watch():
        while not stop.is_set():
            if mesh.all_processed() and loader.loaded == expected:
                print(f"\nAll {expected:,} transactions loaded into the DW in {time.time() - start:.0f} s. "
                      "Type status or quit.\n> ", end="", flush=True)
                return
            time.sleep(0.5)
    threading.Thread(target=watch, daemon=True).start()

    #command loop: each command changes the shared settings
    while True:
        try:
            words = input("> ").strip().lower().split()
        except (EOFError, KeyboardInterrupt):
            words = ["quit"]
        if not words:
            continue
        cmd = words[0]
        if cmd in ("online", "periodic", "both"):
            settings.source = cmd
            print(f"Source is now: {cmd}")
        elif cmd in ("peak", "non-peak"):
            settings.mode = cmd
            print(f"Mode is now: {cmd} ({settings.tps()} transactions/second)")
        elif cmd == "speed" and len(words) == 3 and words[1] in ("peak", "non-peak") \
                and words[2].isdigit() and int(words[2]) > 0:
            if words[1] == "peak":
                settings.peak_tps = int(words[2])
            else:
                settings.nonpeak_tps = int(words[2])
            print(f"{words[1]} speed is now {words[2]} transactions/second")
        elif cmd == "status":
            print_status(settings, buffer, mesh, online, periodic, loader, conn)
        elif cmd == "help":
            print(HELP)
        elif cmd == "quit":
            break
        else:
            print("Unknown command. Type help for the list.")

    #quit: stop all threads, then print the summary
    print("Stopping the threads ...")
    stop.set()
    for t in (online, periodic, mesh):
        t.join(timeout=5)
    loader.join()                            #loads what is left in the output queue
    conn.close()
    print(f"Ran for {time.time() - start:.0f} s")
    print(f"Transactions out of MESHJOIN: {loader.received:,} (expected {expected:,})")
    print(f"By processing mode: {dict(loader.by_processing_mode)}")
    print(f"Not fully enriched: {loader.unmatched}")
    print("Rows per store:", dict(sorted(loader.stores.items())))
    print(f"Shed in peak: online {online.shed_online:,}, periodic {online.shed_periodic + periodic.shed:,}")
    print(f"Read back from shed (non-peak): {mesh.read_back:,}")
    print(f"Loaded into the DW: {loader.loaded:,} fact rows")


if __name__ == "__main__":
    main()
