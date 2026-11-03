# Design decisions

Status legend: **ASK** = asked to instructor, **DECIDED** = our choice (documented in report/ReadMe), **LATER** = revisit at that stage.

| # | Topic | Status | Decision |
|---|---|---|---|
| 1 | Meaning of `processing_mode` | ASK | Proposed: Live / Periodic / Shed (how the row went through MESHJOIN) |
| 2 | MESHJOIN with two master tables | ASK | Proposed: each iteration reads one partition of each table; H has two indexes over the same chunk; chunk leaves after max(#cust, #prod) iterations; mark product match done to avoid double enrichment |
| 3 | ID text format for MD5 | DECIDED | CustomerID -> `str(int(x))` (e.g. "17850"); InvoiceNo/StockCode read as text, stripped, case kept. Assert no ".0" before hashing |
| 4 | Periodic group > 1,000-row buffer | DECIDED | Peak: overflow shed to `shed_table`. Non-peak: fed gradually, no shedding; shed rows drained when idle. Next group queues behind an unfinished one. Buffer has live + periodic queues; chunk takes live first |
| 5 | "Loaded year" / periods | DECIDED | 2011 detected as `MAX(year)` in DW; dates named in SQL comments; group monthly by year+month; note partial Dec 2011 |
| 6 | Q1 vs Q11 | DECIDED | Implement exactly as worded in the PDF |
| 7 | Materialized view | LATER | MySQL has none. Q20 = normal view (consider `ALGORITHM=TEMPTABLE`); simulate MV with `MV_STORE_QUARTERLY_SALES` summary table |
| 8 | Time dimension grain | LATER | Leaning: one row per distinct event_time, `time_id = YYYYMMDDHHMM`; season not year-bound |
| 9 | Tie-breaks | DECIDED | Strip descriptions, longest wins, tie -> first in file order. Country = earliest transaction by event_time, file order breaks ties |
| 10 | Run time | DECIDED | Full peak run ~1 h; batched DW inserts; fast speed/short hour for development; PDF defaults for final run |

## Open items (user)
- MySQL version, bonus cache table (yes/no), dataset download date, report format.
