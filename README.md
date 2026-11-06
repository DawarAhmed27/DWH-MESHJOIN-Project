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
4. Enter host, port, database name, user, password (hidden) and the path of the transactional file.
   Press Enter to accept a default. The database is created if it does not exist.

The program runs `Create-DW.sql` (drops and recreates all tables), cleans the file, prepares the
Master Data, loads it, writes `online_sales_stream.csv` and the Master Data CSV files next to the
input file, and loads the 48 periodic groups into `periodic_sales_data`.
