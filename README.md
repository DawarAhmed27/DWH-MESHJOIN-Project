# ReadMe: Near-Real-Time Data Warehouse with MESHJOIN

Dawar Ahmed, 24I-2533, DS-5B. DS3003 & DS3004 Data Warehousing and Business Intelligence, Fall 2026.

The program cleans the UCI Online Retail file, prepares the Master Data and both forms of
transactional data (online stream and hourly periodic groups), joins them with MESHJOIN in three
threads (with load shedding and live commands) and loads the result into a MySQL star schema.
`Queries-DW.sql` then analyses the DW.

## Folders in the submission

| Folder | Contents |
|---|---|
| `Create-DW/` | `Create-DW.sql`: removes any pre-existing schema and creates the star schema |
| `Mesh-Join/` | the Python project (`src/`), the optional web control room (`app/`), `requirements.txt` and `Start Control Room.bat` |
| `Queries-DW/` | `Queries-DW.sql`: the 20 OLAP queries, the view and the materialized view |
| `Data/` | `online_sales_stream.csv`, `customer_master_data.csv`, `product_master_data.csv` and `Data_Note.txt` |
| `Project-Report/` | the report (Word and PDF) and its figures |
| `ReadMe/` | this file |

Run every command below from the `Mesh-Join` folder. The program finds `Create-DW.sql` and
`Queries-DW.sql` in the folders next to it. (In the GitHub repository the same files are in `sql/`,
`src/`, `app/` and `report/`, and the commands are run from the repository folder.)

## Dataset

Chen, D., Sain, S. L., and Guo, K. Online Retail. UCI Machine Learning Repository.
https://archive.ics.uci.edu/dataset/352/online+retail

Downloaded on **3 November 2026** (file `Online Retail.xlsx`, 541,909 rows).

## What you need

- MySQL Server 8.0 or newer (MySQL Workbench to run the queries).
- Python 3.10 or newer, and the packages in `requirements.txt`:

  ```
  pip install -r requirements.txt
  ```
  (pandas, openpyxl, mysql-connector-python, and flask for the optional control room)
- `Online Retail.xlsx`, downloaded from the link above. It is not in the zip because of its size:
  put it in the `Data` folder, or type its path when the program asks for it.

## Files of the Python project

| Path (inside `Mesh-Join`) | Contents |
|---|---|
| `src/main.py` | Program to start |
| `src/cleaning.py`, `splitting.py`, `master_data.py`, `working_data.py` | Cleaning, sales_mode rule, Master Data, online file and 48 periodic groups |
| `src/stream.py`, `meshjoin.py` | Stream buffer, OnlineThread, PeriodicThread, MESHJOIN, MeshJoinThread, load shedding |
| `src/consolidation.py`, `loader.py` | Revenue and dimension rows; LoaderThread that loads the DW |
| `src/db.py` | MySQL helpers |
| `src/test_*.py` | Check scripts (see "Checks" below) |
| `app/` | Optional web control room (see the end of this file) |

## 1. Create the database

Nothing has to be done by hand. When the program starts it connects to MySQL, creates the
database `dwh_project` if it does not exist, and runs `Create-DW.sql`, which removes any
pre-existing schema and creates all tables.

To create it by hand instead (for example in MySQL Workbench):

```sql
CREATE DATABASE IF NOT EXISTS dwh_project;
USE dwh_project;
-- then run Create-DW/Create-DW.sql
```

## 2. Prepare the data

This is also done by the program at startup, in this order:

1. Read `Online Retail.xlsx` and clean it (CustomerID present, no cancellation invoices starting with C,
   Quantity > 0, UnitPrice > 0): 541,909 rows become 397,884.
2. Label every cart Online or Periodic with the MD5 rule: 278,740 online rows, 119,144 periodic rows.
3. Build the customer (4,338) and product (3,665) Master Data, write
   `customer_master_data.csv` and `product_master_data.csv`, and load them into MySQL in partitions
   of 500 rows (9 and 8 partitions).
4. Write `online_sales_stream.csv` and load the periodic sales into `periodic_sales_data` in 48 hourly
   groups (whole carts, 2,263 to 2,710 rows each).

The CSV files are written next to `Online Retail.xlsx` (so into `Data/` when the file is there).
Preparation takes about 30 seconds and prints how long the staging table took to fill.

## 3. Start the program

From the `Mesh-Join` folder:

```
python src/main.py
```

The program prints its settings, then the default connection (localhost, port 3306, database
`dwh_project`, user root) and the path of the transactional file:

- press **Enter** to use them, or type **c** to change any of them (host, port, database, user, file
  path; a folder path is accepted);
- type the **MySQL password** (hidden, never stored).

Settings can be given on the command line (defaults are the project settings):

| Option | Default | Meaning |
|---|---|---|
| `--peak N` | 80 | transactions per second in peak time |
| `--nonpeak N` | 10 | transactions per second in non-peak time |
| `--hour N` | 60 | seconds of real time in one simulated hour |
| `--mode peak` / `--mode non-peak` | peak | stream arrival mode at start |

With the defaults a full run takes more than an hour (278,740 online sales at 80 per second).
For a run of a few minutes:

```
python src/main.py --peak 5000 --nonpeak 2000 --hour 2
```

After preparation the OnlineThread, PeriodicThread and MeshJoinThread start, and a LoaderThread
loads the joined sales into the DW. The program then waits for commands.

## 4. Commands (type while the program runs)

| Command | Effect |
|---|---|
| `online` | online stream only; no periodic groups are released |
| `periodic` | periodic groups only; the online stream is paused |
| `both` | both forms, online first (default) |
| `peak` | fast speed; when MESHJOIN cannot keep up, periodic sales (then, last, online sales) are shed to `shed_table` |
| `non-peak` | slow speed; nothing is shed and shed sales are read back and processed |
| `speed peak N`, `speed non-peak N` | change a speed while the program runs |
| `status` | mode, source, speed, stream-buffer count, transactions in H, transactions still on the shed disk, shed and read-back counts, rows loaded into the DW |
| `help` | list the commands |
| `quit` | stop the threads, load what is left and close the program |

Priority: online sales first, then periodic sales, then shed sales.
Sales shed in peak time are processed only in non-peak time, so before the end of a run type
`non-peak` (after `status` shows 48 / 48 groups). When every transaction is in the DW the program
prints "All 397,884 transactions loaded into the DW" and keeps accepting commands until `quit`.

## Which load is used (bonus)

The bonus was **not** used: Live results are inserted **directly into the fact table**.
Periodic results are loaded once every simulated hour, after they have been joined.

## 5. Run the queries

1. Open `Queries-DW/Queries-DW.sql` in MySQL Workbench.
2. Double-click `dwh_project` in the Schemas list so it is the default schema.
3. Run the whole script, or select one query and run it. Each query starts with a comment `-- Qn.`,
   and its last two comment lines say what it shows and how it works.

The loaded dates are 1 December 2010 to 9 December 2011, so "the loaded year" is 2011 and "the latest
six months" are July to December 2011; the script names these dates in a comment and its first query
prints them. Q20 creates the view `STORE_QUARTERLY_SALES`. MySQL has no materialized views, so the
script stores the view's result in the table `MV_STORE_QUARTERLY_SALES` (run its two statements again
to refresh it). The whole script takes about 3 minutes; Q16 (product pairs) takes about 20 seconds.

The queries can also be run from Python, which prints the time, row count and first rows of each:

```
python src/test_queries.py
```

## Control room (web front end, optional)

The same program can be run and presented from the browser:

```
python app/server.py
```

On Windows, double-clicking `Start Control Room.bat` does the same (it installs the packages the first
time). The browser opens http://localhost:5000. The pages follow the project:

| Page | What it does |
|---|---|
| Overview | line map of the pipeline, KPIs and charts of the loaded DW |
| Setup | connection (password kept in memory only), settings with presets, data preparation step by step |
| How it works | step-through models of the threads and stream buffer, the lock, keeping the speed, MESHJOIN and loading the DW |
| Live run | start the threads; source, mode and speed commands; live stream buffer, MESHJOIN partitions and queue, shed table, loader and event log |
| Console | the terminal program's commands (status, peak, non-peak, ...) with the same answers |
| Data warehouse | schema diagram, live row counts, and a live table view: the newest rows of any table, or the newest sales with every dimension attribute and a check against the Master Data |
| Analysis | every statement of `Queries-DW.sql` with its explanation, SQL, result table, chart and time |
| Checks | the checks of `test_dw.py`, including the enrichment checks |
| Report | the project report PDF from the `Project-Report` folder |
| Codebase | a map of how the code files use each other, every file with its code, and buttons to open the project folder |

"Presenter mode" opens step-by-step demo notes (what to show, what to say) with buttons that run each step;
the arrow keys move between steps. The command-line program (`src/main.py`) is unchanged and still works on its own.

## Checks

Run from the `Mesh-Join` folder after `main.py` (each asks for the MySQL password):

| Script | Checks |
|---|---|
| `python src/test_dw.py` | fact rows, total revenue and dimension counts against the working data; every customer and product attribute against the Master Data; sales_mode and store recomputed with the MD5 rule in SQL |
| `python src/test_consolidation.py` | revenue and time parts of one transaction, and the time rules on edge dates |
| `python src/test_shedding.py`, then `python src/test_readback.py` | peak shedding order and non-peak read-back |
| `python src/test_partitions.py`, `test_online.py`, `test_periodic.py`, `test_meshjoin_core.py`, `test_store.py` | the MESHJOIN steps one at a time |
