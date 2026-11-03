# DWH MESHJOIN Project

Near-real-time data warehouse for the UCI **Online Retail** dataset (DS3003 & DS3004, Fall 2026).

- **ETL:** Python, MESHJOIN with three threads (Online, MeshJoin, Periodic), load shedding, live commands
- **DW:** MySQL 8.0+ star schema
- **Analysis:** 20 OLAP queries + view `STORE_QUARTERLY_SALES`

## Structure
| Folder | Contents |
|---|---|
| `src/` | Python program (cleaning, master data, MESHJOIN threads, DW loading) |
| `sql/` | DW creation script and OLAP query script |
| `data/` | Local data files (not committed; `Online Retail.xlsx` goes here) |
| `docs/` | Design decisions and notes |
| `report/` | Project report |

## Dataset
UCI Machine Learning Repository: https://archive.ics.uci.edu/dataset/352/online+retail
Download date: _TBD_

## How to run
_To be added._
