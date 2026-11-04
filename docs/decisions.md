# Design decisions

Status legend: **ASK** = asked to instructor, **DECIDED** = our choice (documented in report/ReadMe), **LATER** = revisit at that stage.

| # | Topic | Status | Decision |
|---|---|---|---|
| 1 | Meaning of `processing_mode` | CONFIRMED | Live / Periodic / Shed: how the row was processed (see instructor answers below) |
| 2 | MESHJOIN with two master tables | LEANING A | Proposed: each iteration reads one partition of each table; H has two indexes over the same chunk; chunk leaves after max(#cust, #prod) iterations; mark product match done to avoid double enrichment |
| 3 | ID text format for MD5 | DECIDED | CustomerID -> `str(int(x))` (e.g. "17850"); InvoiceNo/StockCode read as text, stripped, case kept. Assert no ".0" before hashing |
| 4 | Periodic group > 1,000-row buffer | DECIDED | Peak: overflow shed to `shed_table` as whole carts. Non-peak: fed gradually, no shedding; shed rows drained when idle. Next group queues behind an unfinished one. Buffer has live + periodic queues; chunk takes live first |
| 5 | "Loaded year" / periods | DECIDED | 2011 detected as `MAX(year)` in DW; dates named in SQL comments; group monthly by year+month; note partial Dec 2011 |
| 6 | Q1 vs Q11 | DECIDED | Implement exactly as worded in the PDF |
| 7 | Materialized view | LATER | MySQL has none. Q20 = normal view (consider `ALGORITHM=TEMPTABLE`); simulate MV with `MV_STORE_QUARTERLY_SALES` summary table |
| 8 | Time dimension grain | LATER | Leaning: one row per distinct event_time, `time_id = YYYYMMDDHHMM`; season not year-bound |
| 9 | Tie-breaks | DECIDED | Strip descriptions, longest wins, tie -> first in file order. Country = earliest transaction by event_time, file order breaks ties |
| 10 | Run time | DECIDED | Full peak run ~1 h; batched DW inserts; fast speed/short hour for development; PDF defaults for final run |

## Open items (user)
- MySQL version, bonus cache table (yes/no), dataset download date, report format.

## Cleaning counts (Phase 1)
- Before cleaning: 541,909 rows
- After cleaning: 397,884 rows
- Rules (PDF Section 3 only): quantity > 0, unit_price > 0, customer_id present, drop cancellations (transaction_id starts with C). No other cleaning (duplicates and non-product codes kept).

## Split counts (Phase 2, PDF 5.4.1)
- Rule: n = int(MD5(transaction_id)[:8], 16); n % 10 in 0-6 -> Online, 7-9 -> Periodic. Applied per cart (mixed carts = 0).
- Carts: 18,532 total -> Online 12,971 (69.99%), Periodic 5,561 (30.01%)
- Rows: Online 278,740, Periodic 119,144
- store_id is not stored at this stage (not in the PDF's online file / staging columns). Store rule (1 for Online, 2 + n % 4 for Periodic) is applied during enrichment outside MESHJOIN using the in-memory store list.
- Note for report: the store rule reuses the same MD5 number, so store carts (remainder 7/8/9) are 2/3 odd, giving stores 3 and 5 about twice the carts of stores 2 and 4 (909 / 1,869 / 920 / 1,863).

## Master data (Phase 3, PDF 5.4.3)
- stable(text, n) = int(MD5(text UTF-8)[:8], 16) % n; index 0 = first value in the PDF list. Suffixes concatenated with no separator (e.g. "17850age").
- Customers: 4,338 (from cleaned data). 8 customers have more than one country -> country of first cleaned transaction (sorted by event_time, file order breaks ties).
- Products: 3,665. Name = longest stripped Description; 54 products had tied longest names -> first in file order. UNKNOWN used 0 times (cleaning removed all empty descriptions). No case-variant product ids.
- Labels use ASCII hyphens (0-17, not the PDF's en dash) for safe CSV/MySQL encoding.
- Files sorted by id so 500-row partitions are deterministic: customers 9 partitions, products 8 partitions (PDF estimated ~6; count reported from loaded table).
- Independent re-check (plain csv + hashlib, no pandas): 0 mismatches in both files.

## Instructor answers (4 Nov 2026)

### 1. processing_mode - CONFIRMED
Instructor: processing_mode records how / by which thread the row was processed, so that once all rows are in the fact table you can tell how each one got there (he mentioned load shedding).
- `Live`: came through OnlineThread straight into MESHJOIN (all Online rows; online is never shed)
- `Periodic`: came through PeriodicThread on its hour
- `Shed`: periodic row moved to shed_table in peak and processed later in non-peak
- sales_mode = where the sale happened (Online / Periodic); processing_mode = how the ETL handled it. Lets the report count shed rows in SQL.

### 2. MESHJOIN with two master tables - left open on purpose ("decide the most efficient approach")
What the instructor said (partly remembered):
- Master tables must not be cloned (no merged customer x product table, no full copy in memory). Keep the two tables separate on disk.
- Disk access already has a high cost, so avoid extra disk work.
- Something about MESHJOIN itself not being replicated / cloned -> most likely: do not run two separate MESHJOIN instances (one per master table). This argues against Option B.

Options:
| Option | How | Disk reads / iteration | Chunk stays | Memory |
|---|---|---|---|---|
| A. Scan both together | 1 customer + 1 product partition per iteration; one H indexed by customer_id and product_id | 2 | 9 iterations | 9 chunks |
| B. Two MESHJOINs in a row | customer MESHJOIN output feeds product MESHJOIN | 2 | 17 | 2 hash tables, 17 chunks |
| C. One long cycle | 9 customer then 8 product partitions in one loop | 1 | 17 | 17 chunks |

Current choice: **A** (to be finalised in Phase 7).
- Matches PDF 5.4: "Each iteration reads one partition of each master data table into memory."
- Lowest latency (near-real-time), least memory -> less load shedding. No cloning of tables or of MESHJOIN.
- Trade-off to state in viva/report: C reads 1 partition per iteration instead of 2, but keeps every chunk twice as long and needs twice the memory.
- Detail: 9 customer vs 8 product partitions -> in 9 iterations a chunk sees one product partition twice; keep a per-transaction "product matched" flag to avoid double enrichment. Store attributes added in the product pass from the in-memory store list (PDF 4.2 step 3).
- Possible improvement (report only, not built): each transaction matches exactly one customer and one product (unique ids), so it could be emitted as soon as both matches are found instead of waiting a full cycle.

### 3. Periodic groups - APPROVED by instructor
Whole carts per group (see Phase 4). Matching rule for Phase 8: when shedding in peak, shed whole carts, not single rows.

### 4. Materialized view - not discussed
Default stays: Q20 as normal CREATE VIEW; simulate a materialized view with summary table MV_STORE_QUARTERLY_SALES (revisit at the SQL stage).

### 5. Store rule imbalance - not discussed
Keep the PDF formula exactly; explain in the report why stores 3 and 5 get about twice the carts of stores 2 and 4.

## Phase 4 decision: periodic groups (approved)
- Periodic carts ordered by their earliest event_time (tie: transaction_id); 10 carts have items with different timestamps.
- Each cart is assigned whole to a group by its starting position in the sorted list: group = start_row * 48 // 119,144 (target ~2,482 rows/group). Always exactly 48 groups.
- Test run: smallest group 2,263 rows, largest 2,710 rows, 0 carts split (equal cut would split 44 carts and give 2,482/2,483).
- PDF splits by size (position in the time-sorted list), not by time windows (48 time windows would give 910 to 6,191 rows).
