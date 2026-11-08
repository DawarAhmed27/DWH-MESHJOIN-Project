# DWH MESHJOIN Project

Near-real-time data warehouse for the UCI **Online Retail** dataset (DS3003 & DS3004, Fall 2026).

- **ETL:** Python, MESHJOIN with three threads (Online, MeshJoin, Periodic), load shedding, live commands
- **DW:** MySQL 8.0+ star schema
- **Analysis:** 20 OLAP queries + view `STORE_QUARTERLY_SALES`

## Structure
| Folder | Contents |
|---|---|
| `notebooks/` | Step-by-step exploration notebooks (cleaning, splitting, master data) |
| `src/` | Python program (cleaning, master data, MESHJOIN threads, DW loading) |
| `sql/` | DW creation script and OLAP query script |
| `data/` | Local data files (not committed; `Online Retail.xlsx` goes here) |
| `docs/` | Design decisions and notes |
| `report/` | Project report |

## Dataset
UCI Machine Learning Repository: https://archive.ics.uci.edu/dataset/352/online+retail
Download date: _TBD_

## How to run
1. Install Python packages: `pip install -r requirements.txt`
2. Put `Online Retail.xlsx` in the project folder (or `data/`).
3. Start MySQL 8.0+ and run: `python src/main.py`
   Optional settings: `--peak 80 --nonpeak 10 --hour 60 --mode peak`
4. The program shows the default connection (localhost, 3306, dwh_project, root) and the file path.
   Press Enter to use them, or type `c` to change any of them (host, port, database, user, file path;
   a folder path is accepted). Then type the MySQL password (hidden, never stored).
   The database is created if it does not exist.

The program runs `Create-DW.sql` (drops and recreates all tables), cleans the file, prepares the
Master Data, loads it, writes `online_sales_stream.csv` and the Master Data CSV files next to the
input file, and loads the 48 periodic groups into `periodic_sales_data`.
It then starts the OnlineThread, PeriodicThread and MeshJoinThread and waits for commands.
For a quick test run use fast settings, e.g. `python src/main.py --peak 5000 --hour 2` (about 2 minutes).

## Commands (type while the program runs)
| Command | Effect |
|---|---|
| `online` | online stream only; no periodic groups are released |
| `periodic` | periodic groups only; the online stream is paused |
| `both` | both forms, online first (default) |
| `peak` | fast speed; shedding periodic transactions to disk is allowed |
| `non-peak` | slow speed; shed transactions are processed |
| `speed peak N` / `speed non-peak N` | change a speed while running |
| `status` | mode, source, speed, stream-buffer count, transactions in H, transactions still on the shed disk |
| `help` | list the commands |
| `quit` | stop the threads and close the program |

The program keeps running after all transactions are processed (it prints a message) until `quit`.

## Running the queries
After the program has loaded the DW (it prints "All ... transactions loaded into the DW"):
1. Open `sql/Queries-DW.sql` in MySQL Workbench.
2. Double-click `dwh_project` in the Schemas list so it is the default schema.
3. Run the script (or run each query on its own). Each query starts with a comment `-- Qn.` that says what it answers.

The loaded dates are 2010-12-01 to 2011-12-09, so "the loaded year" is 2011 and "the latest six months" are July to December 2011 (named in the script comments).
MySQL has no materialized views; the script stores the result of the view `STORE_QUARTERLY_SALES` in the table `MV_STORE_QUARTERLY_SALES` (run its two statements again to refresh it).
