-- Queries-DW.sql: OLAP queries on the DW (PDF Section 10)
-- Run after main.py has loaded the DW, with dwh_project as the default schema.
--
-- Loaded dates: 2010-12-01 08:26 to 2011-12-09 12:50.
--   2010: December only (1 to 31 December).
--   2011: 1 January to 9 December.
-- "The loaded year" = 2011, the only year with (almost) all twelve months.
-- "The latest six months" = July to December 2011 (December up to the 9th).
-- Revenue = the revenue stored on the fact (quantity x unit_price).
-- Growth / volatility = (this period - previous period) / previous period x 100.

-- Check the loaded dates named above
-- How we wrote it: MIN and MAX of event_time and COUNT(DISTINCT year, month), over the facts joined to dim_time.
-- In one line: Shows the first and last sale and how many months are loaded, so we know which year is "the loaded year".
SELECT MIN(t.event_time) AS first_sale, MAX(t.event_time) AS last_sale,
       COUNT(DISTINCT t.year, t.month) AS months_loaded
FROM fact_sales f
JOIN dim_time t ON t.time_key = f.time_key;


-- Q1. Top 5 products by revenue on weekdays and on weekends (2011),
-- then drill down to each month. Slice: year 2011; drill-down: year -> month.
-- How we wrote it: A CTE ranks products per day type over 2011 with ROW_NUMBER (ties by product id); the outer query keeps rank <= 5 and joins the facts again to sum each one per month.
-- In one line: Top 5 products of 2011 for weekdays and for weekends, each split into its monthly revenue.
WITH yearly AS (
    SELECT t.day_type, p.product_key, p.product_id, p.product_name,
           SUM(f.revenue) AS year_revenue,
           ROW_NUMBER() OVER (PARTITION BY t.day_type
                              ORDER BY SUM(f.revenue) DESC, p.product_id) AS rank_no
    FROM fact_sales f
    JOIN dim_time t    ON t.time_key = f.time_key
    JOIN dim_product p ON p.product_key = f.product_key
    WHERE t.year = 2011
    GROUP BY t.day_type, p.product_key, p.product_id, p.product_name
)
SELECT y.day_type, y.rank_no, y.product_id, y.product_name, y.year_revenue,
       t.month, SUM(f.revenue) AS month_revenue
FROM yearly y
JOIN fact_sales f ON f.product_key = y.product_key
JOIN dim_time t   ON t.time_key = f.time_key
                 AND t.year = 2011 AND t.day_type = y.day_type
WHERE y.rank_no <= 5
GROUP BY y.day_type, y.rank_no, y.product_id, y.product_name, y.year_revenue, t.month
ORDER BY y.day_type, y.rank_no, t.month;


-- Q2. Total purchase amount by gender and age group, detailed by city category.
-- Dice: gender x age group x city category.
-- How we wrote it: Join the facts to dim_customer, GROUP BY gender, age group and city category, SUM(revenue).
-- In one line: How much each gender and age group spends, in each city category.
SELECT c.gender, c.age_group, c.city_category, SUM(f.revenue) AS purchase_amount
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY c.gender, c.age_group, c.city_category
ORDER BY c.gender, c.age_group, c.city_category;


-- Q3. Total sales of each product category by customer occupation.
-- How we wrote it: Join the facts to dim_product and dim_customer, GROUP BY category and occupation, SUM(revenue), biggest first inside each category.
-- In one line: Which occupations buy the most of each product category.
SELECT p.product_category, c.occupation, SUM(f.revenue) AS total_sales
FROM fact_sales f
JOIN dim_product p  ON p.product_key = f.product_key
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY p.product_category, c.occupation
ORDER BY p.product_category, total_sales DESC;


-- Q4. Purchase amount by gender and age group, per quarter of 2011.
-- Slice: year 2011; drill-down: year -> quarter.
-- How we wrote it: Keep 2011, GROUP BY gender and age group, and turn the quarters into columns with SUM(CASE WHEN quarter = n ...).
-- In one line: Spending of each gender and age group in each quarter of 2011.
SELECT c.gender, c.age_group,
       SUM(CASE WHEN t.quarter = 1 THEN f.revenue ELSE 0 END) AS q1_2011,
       SUM(CASE WHEN t.quarter = 2 THEN f.revenue ELSE 0 END) AS q2_2011,
       SUM(CASE WHEN t.quarter = 3 THEN f.revenue ELSE 0 END) AS q3_2011,
       SUM(CASE WHEN t.quarter = 4 THEN f.revenue ELSE 0 END) AS q4_2011,
       SUM(f.revenue) AS total_2011
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
JOIN dim_time t     ON t.time_key = f.time_key
WHERE t.year = 2011
GROUP BY c.gender, c.age_group
ORDER BY c.gender, c.age_group;


-- Q5. Top 5 occupations by sales within each product category.
-- How we wrote it: A CTE sums revenue per category and occupation and ranks the occupations inside each category with ROW_NUMBER; the outer query keeps rank <= 5.
-- In one line: The 5 occupations that spend the most in each product category.
WITH ranked AS (
    SELECT p.product_category, c.occupation, SUM(f.revenue) AS total_sales,
           ROW_NUMBER() OVER (PARTITION BY p.product_category
                              ORDER BY SUM(f.revenue) DESC, c.occupation) AS rank_no
    FROM fact_sales f
    JOIN dim_product p  ON p.product_key = f.product_key
    JOIN dim_customer c ON c.customer_key = f.customer_key
    GROUP BY p.product_category, c.occupation
)
SELECT product_category, rank_no, occupation, total_sales
FROM ranked
WHERE rank_no <= 5
ORDER BY product_category, rank_no;


-- Q6. Purchase amount by city category and marital status, per month,
-- for the latest six months: July to December 2011 (December up to the 9th).
-- July to December is the second half of 2011, so the dim_time attribute half_year = 2 selects exactly these months.
-- Dice: six months x city category x marital status; drill-down to month.
-- How we wrote it: Keep year 2011 and half_year 2 (July to December) from dim_time, GROUP BY month, city category and marital status, SUM(revenue).
-- In one line: Monthly spending by city category and marital status over the last six months.
SELECT t.year, t.month, c.city_category, c.marital_status,
       SUM(f.revenue) AS purchase_amount
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
JOIN dim_time t     ON t.time_key = f.time_key
WHERE t.year = 2011 AND t.half_year = 2
GROUP BY t.year, t.month, c.city_category, c.marital_status
ORDER BY t.year, t.month, c.city_category, c.marital_status;


-- Q7. Average purchase amount (average revenue per transaction) by years
-- stayed in the current city and gender.
-- How we wrote it: AVG(revenue) of the fact rows grouped by years in the city and gender; CAST sorts the years as numbers (4+ last).
-- In one line: Average purchase per transaction line for each years-in-city and gender group.
SELECT c.stay_in_current_city_years, c.gender,
       ROUND(AVG(f.revenue), 2) AS avg_purchase_amount,
       COUNT(*) AS transactions
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY c.stay_in_current_city_years, c.gender
ORDER BY CAST(c.stay_in_current_city_years AS UNSIGNED), c.gender;


-- Q8. City categories (A, B, C) ranked by revenue inside each product category.
-- How we wrote it: Sum revenue per product category and city category, then RANK() inside each product category by revenue.
-- In one line: Ranks cities A, B and C by revenue inside every product category.
SELECT p.product_category, c.city_category, SUM(f.revenue) AS revenue,
       RANK() OVER (PARTITION BY p.product_category ORDER BY SUM(f.revenue) DESC) AS city_rank
FROM fact_sales f
JOIN dim_product p  ON p.product_key = f.product_key
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY p.product_category, c.city_category
ORDER BY p.product_category, city_rank;


-- Q9. Month-over-month sales growth (%) for each product category in 2011.
-- January has no previous month in 2011, so its growth is NULL.
-- December 2011 holds only 1 to 9 December, so its drop is expected.
-- How we wrote it: A CTE sums 2011 revenue per category and month; LAG gives the previous month; growth = (this - previous) / previous x 100.
-- In one line: Month-to-month sales growth % of each product category in 2011.
WITH monthly AS (
    SELECT p.product_category, t.month, SUM(f.revenue) AS sales
    FROM fact_sales f
    JOIN dim_product p ON p.product_key = f.product_key
    JOIN dim_time t    ON t.time_key = f.time_key
    WHERE t.year = 2011
    GROUP BY p.product_category, t.month
)
SELECT product_category, month, sales,
       LAG(sales) OVER (PARTITION BY product_category ORDER BY month) AS previous_month,
       ROUND((sales - LAG(sales) OVER (PARTITION BY product_category ORDER BY month))
             / LAG(sales) OVER (PARTITION BY product_category ORDER BY month) * 100, 2) AS growth_pct
FROM monthly
ORDER BY product_category, month;


-- Q10. Weekend vs weekday sales by age group in 2011. Slice: year 2011.
-- How we wrote it: Keep 2011, GROUP BY age group, and two SUM(CASE WHEN day_type ...) columns split weekday and weekend revenue.
-- In one line: Weekday vs weekend spending of each age group in 2011.
SELECT c.age_group,
       SUM(CASE WHEN t.day_type = 'Weekday' THEN f.revenue ELSE 0 END) AS weekday_sales,
       SUM(CASE WHEN t.day_type = 'Weekend' THEN f.revenue ELSE 0 END) AS weekend_sales,
       SUM(f.revenue) AS total_sales
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
JOIN dim_time t     ON t.time_key = f.time_key
WHERE t.year = 2011
GROUP BY c.age_group
ORDER BY c.age_group;


-- Q11. Top 5 products by revenue within each month of 2011, separately for
-- weekdays and weekends (Q1 ranks over the whole year; Q11 ranks in each month).
-- How we wrote it: Same ranking as Q1, but ROW_NUMBER is partitioned by month and day type; keep rank <= 5.
-- In one line: Top 5 products in every month of 2011, separately for weekdays and weekends.
WITH ranked AS (
    SELECT t.month, t.day_type, p.product_id, p.product_name, SUM(f.revenue) AS revenue,
           ROW_NUMBER() OVER (PARTITION BY t.month, t.day_type
                              ORDER BY SUM(f.revenue) DESC, p.product_id) AS rank_no
    FROM fact_sales f
    JOIN dim_time t    ON t.time_key = f.time_key
    JOIN dim_product p ON p.product_key = f.product_key
    WHERE t.year = 2011
    GROUP BY t.month, t.day_type, p.product_key, p.product_id, p.product_name
)
SELECT month, day_type, rank_no, product_id, product_name, revenue
FROM ranked
WHERE rank_no <= 5
ORDER BY month, day_type, rank_no;


-- Q12. Quarter-to-quarter revenue growth (%) for each store in 2011.
-- The first quarter of 2011 has no previous quarter in 2011, so its growth is NULL.
-- How we wrote it: A CTE sums 2011 revenue per store and quarter; LAG gives the previous quarter; growth % from the difference.
-- In one line: Quarter-to-quarter revenue growth of each store in 2011.
WITH quarterly AS (
    SELECT s.store_name, t.quarter, SUM(f.revenue) AS revenue
    FROM fact_sales f
    JOIN dim_store s ON s.store_key = f.store_key
    JOIN dim_time t  ON t.time_key = f.time_key
    WHERE t.year = 2011
    GROUP BY s.store_name, t.quarter
)
SELECT store_name, quarter, revenue,
       LAG(revenue) OVER (PARTITION BY store_name ORDER BY quarter) AS previous_quarter,
       ROUND((revenue - LAG(revenue) OVER (PARTITION BY store_name ORDER BY quarter))
             / LAG(revenue) OVER (PARTITION BY store_name ORDER BY quarter) * 100, 2) AS growth_pct
FROM quarterly
ORDER BY store_name, quarter;


-- Q13. Sales contribution of each supplier in each store, by product name.
-- Contribution % = share of that store's total revenue.
-- How we wrote it: Sum revenue per store, supplier and product; SUM(SUM(revenue)) OVER (PARTITION BY store) gives the store total to divide by.
-- In one line: Each supplier's and product's share of every store's revenue.
SELECT s.store_name, su.supplier_name, p.product_name,
       SUM(f.revenue) AS revenue,
       ROUND(SUM(f.revenue) / SUM(SUM(f.revenue)) OVER (PARTITION BY s.store_name) * 100, 4)
           AS pct_of_store_revenue
FROM fact_sales f
JOIN dim_store s     ON s.store_key = f.store_key
JOIN dim_supplier su ON su.supplier_key = f.supplier_key
JOIN dim_product p   ON p.product_key = f.product_key
GROUP BY s.store_name, su.supplier_name, p.product_name
ORDER BY s.store_name, su.supplier_name, p.product_name;


-- Q14. Total sales of each product drilled down by season (all loaded dates).
-- How we wrote it: GROUP BY product and turn the four seasons into columns with SUM(CASE WHEN season = ...).
-- In one line: Each product's sales in spring, summer, fall and winter.
SELECT p.product_id, p.product_name,
       SUM(CASE WHEN t.season = 'Spring' THEN f.revenue ELSE 0 END) AS spring,
       SUM(CASE WHEN t.season = 'Summer' THEN f.revenue ELSE 0 END) AS summer,
       SUM(CASE WHEN t.season = 'Fall'   THEN f.revenue ELSE 0 END) AS fall,
       SUM(CASE WHEN t.season = 'Winter' THEN f.revenue ELSE 0 END) AS winter,
       SUM(f.revenue) AS total_sales
FROM fact_sales f
JOIN dim_product p ON p.product_key = f.product_key
JOIN dim_time t    ON t.time_key = f.time_key
GROUP BY p.product_key, p.product_id, p.product_name
ORDER BY total_sales DESC;


-- Q15. Month-to-month revenue volatility (%) for each store and supplier pair,
-- over all loaded months (December 2010 to December 2011).
-- How we wrote it: A CTE sums revenue per store, supplier and month; LAG over each store-supplier pair gives the previous month; the change % is the volatility.
-- In one line: How much each store-supplier pair's revenue goes up or down from month to month.
WITH monthly AS (
    SELECT s.store_name, su.supplier_name, t.year, t.month, SUM(f.revenue) AS revenue
    FROM fact_sales f
    JOIN dim_store s     ON s.store_key = f.store_key
    JOIN dim_supplier su ON su.supplier_key = f.supplier_key
    JOIN dim_time t      ON t.time_key = f.time_key
    GROUP BY s.store_name, su.supplier_name, t.year, t.month
)
SELECT store_name, supplier_name, year, month, revenue,
       LAG(revenue) OVER (PARTITION BY store_name, supplier_name ORDER BY year, month) AS previous_month,
       ROUND((revenue - LAG(revenue) OVER (PARTITION BY store_name, supplier_name ORDER BY year, month))
             / LAG(revenue) OVER (PARTITION BY store_name, supplier_name ORDER BY year, month) * 100, 2)
           AS volatility_pct
FROM monthly
ORDER BY store_name, supplier_name, year, month;


-- Q16. Top 5 product pairs bought together. A shopping cart = one transaction_id.
-- The fact table is joined to itself on transaction_id (uses the index on it).
-- COUNT(DISTINCT transaction_id): each cart counts once per pair, even if a
-- product is listed twice in that cart. b.product_key > a.product_key, so each
-- pair is counted once (not A-B and B-A).
-- A pair can never be in more carts than either of its two products, so only
-- products bought in at least 400 carts can reach the top 5: on the loaded
-- data the 5th pair is in 519 carts (if the 5th count were below 400, lower 400).
-- How we wrote it: Self-join the fact table on transaction_id to make product pairs in the same cart, count distinct carts per pair and keep the top 5; only products in 400+ carts are paired, to make it fast.
-- In one line: The 5 product pairs most often bought in the same cart.
WITH popular AS (
    SELECT product_key
    FROM fact_sales
    GROUP BY product_key
    HAVING COUNT(DISTINCT transaction_id) >= 400
),
pairs AS (
    SELECT a.product_key AS key_a, b.product_key AS key_b,
           COUNT(DISTINCT a.transaction_id) AS carts_together
    FROM fact_sales a
    JOIN fact_sales b ON b.transaction_id = a.transaction_id AND b.product_key > a.product_key
    WHERE a.product_key IN (SELECT product_key FROM popular)
      AND b.product_key IN (SELECT product_key FROM popular)
    GROUP BY a.product_key, b.product_key
    ORDER BY carts_together DESC, a.product_key, b.product_key
    LIMIT 5
)
SELECT pa.product_id AS product_a, pa.product_name AS name_a,
       pb.product_id AS product_b, pb.product_name AS name_b,
       pairs.carts_together
FROM pairs
JOIN dim_product pa ON pa.product_key = pairs.key_a
JOIN dim_product pb ON pb.product_key = pairs.key_b
ORDER BY pairs.carts_together DESC, product_a, product_b;


-- Q17. Revenue for 2011 by store, supplier and product with ROLLUP:
-- product rows, supplier subtotals, store subtotals and the grand total.
-- How we wrote it: GROUP BY store, supplier, product WITH ROLLUP adds the subtotal rows; GROUPING() tells which rows are subtotals so we can label them.
-- In one line: 2011 revenue by store, supplier and product, with supplier and store subtotals and a grand total.
SELECT CASE WHEN GROUPING(s.store_name) = 1     THEN 'Grand total'
            WHEN GROUPING(su.supplier_name) = 1 THEN 'Store subtotal'
            WHEN GROUPING(p.product_name) = 1   THEN 'Supplier subtotal'
            ELSE 'Product' END AS row_type,
       s.store_name, su.supplier_name, p.product_name,
       SUM(f.revenue) AS revenue_2011
FROM fact_sales f
JOIN dim_store s     ON s.store_key = f.store_key
JOIN dim_supplier su ON su.supplier_key = f.supplier_key
JOIN dim_product p   ON p.product_key = f.product_key
JOIN dim_time t      ON t.time_key = f.time_key
WHERE t.year = 2011
GROUP BY s.store_name, su.supplier_name, p.product_name WITH ROLLUP;


-- Q18. Quantity and revenue per product for the first half (Jan-Jun),
-- the second half (Jul-Dec, up to 9 December) and the full year 2011.
-- How we wrote it: Keep 2011, GROUP BY product, and SUM(CASE WHEN half_year = 1 or 2 ...) gives quantity and revenue for each half as columns.
-- In one line: Each product's quantity and revenue in the first half, the second half and the whole of 2011.
SELECT p.product_id, p.product_name,
       SUM(CASE WHEN t.half_year = 1 THEN f.quantity ELSE 0 END) AS h1_quantity,
       SUM(CASE WHEN t.half_year = 1 THEN f.revenue  ELSE 0 END) AS h1_revenue,
       SUM(CASE WHEN t.half_year = 2 THEN f.quantity ELSE 0 END) AS h2_quantity,
       SUM(CASE WHEN t.half_year = 2 THEN f.revenue  ELSE 0 END) AS h2_revenue,
       SUM(f.quantity) AS year_quantity,
       SUM(f.revenue)  AS year_revenue
FROM fact_sales f
JOIN dim_product p ON p.product_key = f.product_key
JOIN dim_time t    ON t.time_key = f.time_key
WHERE t.year = 2011
GROUP BY p.product_key, p.product_id, p.product_name
ORDER BY year_revenue DESC;


-- Q19. Revenue spikes: days on which a product's revenue is more than twice
-- its own average daily revenue (average over the days the product sold,
-- all loaded dates). Biggest spikes first.
-- How we wrote it: CTE daily sums revenue per product per day; CTE average averages those days per product; keep the days above twice that average.
-- In one line: Days on which a product sold more than twice its normal daily revenue.
WITH daily AS (
    SELECT f.product_key, t.full_date, SUM(f.revenue) AS day_revenue
    FROM fact_sales f
    JOIN dim_time t ON t.time_key = f.time_key
    GROUP BY f.product_key, t.full_date
),
average AS (
    SELECT product_key, AVG(day_revenue) AS avg_daily_revenue
    FROM daily
    GROUP BY product_key
)
SELECT p.product_id, p.product_name, d.full_date, d.day_revenue,
       ROUND(a.avg_daily_revenue, 2) AS avg_daily_revenue,
       ROUND(d.day_revenue / a.avg_daily_revenue, 2) AS times_average
FROM daily d
JOIN average a     ON a.product_key = d.product_key
JOIN dim_product p ON p.product_key = d.product_key
WHERE d.day_revenue > 2 * a.avg_daily_revenue
ORDER BY times_average DESC;


-- Q20. View STORE_QUARTERLY_SALES: total quarterly sales by store.
-- MySQL does not keep ORDER BY inside CREATE VIEW, so the SELECT that
-- reads the view orders by store name and then by quarter.
-- How we wrote it: CREATE VIEW groups revenue by store, year and quarter; the SELECT on the view does the sorting, because a view cannot keep ORDER BY.
-- In one line: A saved view of total sales per store per quarter.
DROP VIEW IF EXISTS STORE_QUARTERLY_SALES;
CREATE VIEW STORE_QUARTERLY_SALES AS
SELECT s.store_name, t.year, t.quarter, SUM(f.revenue) AS total_sales
FROM fact_sales f
JOIN dim_store s ON s.store_key = f.store_key
JOIN dim_time t  ON t.time_key = f.time_key
GROUP BY s.store_name, t.year, t.quarter;

SELECT store_name, year, quarter, total_sales
FROM STORE_QUARTERLY_SALES
ORDER BY store_name, year, quarter;


-- Materialized view (PDF Section 11, task 4). MySQL has no materialized
-- views, so the result of the view is stored in a table. Reading it does
-- not recompute the joins and the sums. To refresh it after new loads,
-- run these two statements again.
-- How we wrote it: CREATE TABLE ... AS SELECT from the view stores the result once, so reading it needs no joins or sums.
-- In one line: A materialized copy of the view: fast to read, refreshed by running these statements again.
DROP TABLE IF EXISTS MV_STORE_QUARTERLY_SALES;
CREATE TABLE MV_STORE_QUARTERLY_SALES AS
SELECT store_name, year, quarter, total_sales
FROM STORE_QUARTERLY_SALES;

SELECT store_name, year, quarter, total_sales
FROM MV_STORE_QUARTERLY_SALES
ORDER BY store_name, year, quarter;
