"""Near-real-time DW with MESHJOIN - program entry point.

Phase 6: ask for the connection details, create the tables, clean the file,
prepare the Master Data, load it, write the online file and load the 48
periodic groups into the staging table. (Threads: Phases 7-8.)

Run:  python src/main.py   [--peak 80] [--nonpeak 10] [--hour 60] [--mode peak]
"""

import argparse
import os
import sys
import time
from getpass import getpass

import cleaning
import db
import master_data
import splitting
import working_data

STREAM_BUFFER_LIMIT = 1000

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SRC_DIR)


def settings():
    p = argparse.ArgumentParser(description="MESHJOIN near-real-time DW")
    p.add_argument("--peak", type=int, default=80, help="transactions per second in peak time")
    p.add_argument("--nonpeak", type=int, default=10, help="transactions per second in non-peak time")
    p.add_argument("--hour", type=int, default=60, help="seconds of real time in one simulated hour")
    p.add_argument("--mode", choices=["peak", "non-peak"], default="peak", help="stream arrival mode at start")
    return p.parse_args()


def ask(question, default):
    answer = input(f"{question} [{default}]: ").strip()
    return answer or default


def find_sql_file():
    for path in [os.path.join(PROJECT_DIR, "sql", "Create-DW.sql"),
                 os.path.join(PROJECT_DIR, "Create-DW.sql"),
                 os.path.join(SRC_DIR, "Create-DW.sql")]:
        if os.path.exists(path):
            return path
    sys.exit("Create-DW.sql not found (expected in the sql folder).")


def default_data_file():
    for path in [os.path.join(PROJECT_DIR, "data", "Online Retail.xlsx"),
                 os.path.join(PROJECT_DIR, "Online Retail.xlsx")]:
        if os.path.exists(path):
            return path
    return "Online Retail.xlsx"


def print_settings(cfg):
    print(f"Stream arrival mode:   {cfg.mode}")
    print(f"Peak speed:            {cfg.peak} transactions/second")
    print(f"Non-peak speed:        {cfg.nonpeak} transactions/second")
    print(f"One simulated hour:    {cfg.hour} seconds")
    print(f"Stream buffer limit:   {STREAM_BUFFER_LIMIT:,} transactions")


def main():
    cfg = settings()
    print("=" * 60)
    print("Near-real-time Data Warehouse with MESHJOIN")
    print("=" * 60)
    print_settings(cfg)

    # 1. connection details and file path (password is never stored)
    host, port, database, user = "localhost", 3306, "dwh_project", "root"
    data_file = default_data_file()
    print("\nConnection settings:")
    print(f"  Host: {host}   Port: {port}   Database: {database}   User: {user}")
    print(f"  Transactional file: {data_file}")
    if input("Press Enter to use these, or type c to change them: ").strip().lower() == "c":
        host     = ask("Host", host)
        port     = int(ask("Port", str(port)))
        database = ask("Database name", database)
        user     = ask("User name", user)
        data_file = ask("Path of the transactional file", data_file)
    password = getpass("MySQL password: ")

    if os.path.isdir(data_file):   # a folder was given: look for the file inside it
        data_file = os.path.join(data_file, "Online Retail.xlsx")
    if not os.path.exists(data_file):
        sys.exit(f"File not found: {data_file}")
    out_dir = os.path.dirname(os.path.abspath(data_file))

    try:
        conn = db.connect(host, port, database, user, password)
    except Exception as e:
        sys.exit(f"Could not connect to MySQL at {host}:{port} as {user}.\n"
                 f"Check that MySQL is running, the port and the password.\n({e})")
    print(f"Connected to {host}:{port}/{database}")

    # 2. create the working tables and the DW (drops any old copy)
    db.run_sql_file(conn, find_sql_file())
    print("Tables created (old copy and view dropped first)")

    # 3. clean
    t0 = time.time()
    print("\n--- Cleaning ---")
    df = cleaning.clean(data_file)

    # 4. online / periodic
    print("\n--- Sales mode ---")
    df = splitting.split(df)

    # 5. master data: write the CSV files and load the tables
    print("\n--- Master Data ---")
    customers = master_data.build_customers(df)
    products = master_data.build_products(df)
    customers.to_csv(os.path.join(out_dir, "customer_master_data.csv"), index=False)
    products.to_csv(os.path.join(out_dir, "product_master_data.csv"), index=False)
    db.insert_rows(conn, "customer_master_data", master_data.with_partition_no(customers))
    db.insert_rows(conn, "product_master_data", master_data.with_partition_no(products))

    # 6. online file and the 48 periodic groups
    print("\n--- Working data ---")
    online = working_data.build_online(df)
    online_file = os.path.join(out_dir, "online_sales_stream.csv")
    online.to_csv(online_file, index=False)
    periodic = working_data.build_periodic(df)
    db.insert_rows(conn, "periodic_sales_data", periodic)

    print("\n--- Loaded into MySQL ---")
    for table in ["customer_master_data", "product_master_data", "periodic_sales_data"]:
        print(f"{table}: {db.count(conn, table):,} rows")
    print(f"Online file: {online_file}")
    print(f"Preparation took {time.time() - t0:.1f} s")

    # settings printed again just before the threads start (Phase 7)
    print("\nReady to start the threads")
    print_settings(cfg)
    conn.close()


if __name__ == "__main__":
    main()
