-- Queries-DW.sql: OLAP queries on the DW. Run after main.py, with dwh_project as the default schema.
-- Loaded dates: 1 Dec 2010 to 9 Dec 2011, so "the year" = 2011 and "the latest six months" = Jul-Dec 2011.

-- Check the loaded dates
-- First and last sale and the number of months loaded, to pick the year used below.
SELECT MIN(t.event_time) AS first_sale, MAX(t.event_time) AS last_sale,
       COUNT(DISTINCT t.year, t.month) AS months_loaded
FROM fact_sales f
JOIN dim_time t ON t.time_key = f.time_key;


-- Q1. Top 5 products on weekdays and weekends in 2011, drilled down to months.
-- ROW_NUMBER() OVER (PARTITION BY day_type) numbers the products 1, 2, 3 ... separately inside weekdays and weekends; the top 5 of each are split by month.
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


-- Q2. Purchase amount by gender and age group, per city category.
-- Dice = looking at several dimensions at once, here gender x age group x city category.
SELECT c.gender, c.age_group, c.city_category, SUM(f.revenue) AS purchase_amount
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY c.gender, c.age_group, c.city_category
ORDER BY c.gender, c.age_group, c.city_category;


-- Q3. Sales of each product category by customer occupation.
-- Joins sales to products and customers and sums revenue per category and occupation.
SELECT p.product_category, c.occupation, SUM(f.revenue) AS total_sales
FROM fact_sales f
JOIN dim_product p  ON p.product_key = f.product_key
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY p.product_category, c.occupation
ORDER BY p.product_category, total_sales DESC;


-- Q4. Purchase amount by gender and age group, per quarter of 2011.
-- Slice = fix one value (year = 2011); drill-down = go to finer detail (year -> quarter); SUM(CASE WHEN quarter = n ...) makes one column per quarter.
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


-- Q5. Top 5 occupations within each product category.
-- ROW_NUMBER() OVER (PARTITION BY category) ranks occupations inside each category; the top 5 are kept.
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


-- Q6. Purchase amount by city category and marital status, per month, for Jul-Dec 2011.
-- Dice on time, city and marital status; half_year = 2 picks the latest six months.
SELECT t.year, t.month, c.city_category, c.marital_status,
       SUM(f.revenue) AS purchase_amount
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
JOIN dim_time t     ON t.time_key = f.time_key
WHERE t.year = 2011 AND t.half_year = 2
GROUP BY t.year, t.month, c.city_category, c.marital_status
ORDER BY t.year, t.month, c.city_category, c.marital_status;


-- Q7. Average purchase amount by years in the current city and gender.
-- AVG(revenue) per group; CAST sorts the years as numbers.
SELECT c.stay_in_current_city_years, c.gender,
       ROUND(AVG(f.revenue), 2) AS avg_purchase_amount,
       COUNT(*) AS transactions
FROM fact_sales f
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY c.stay_in_current_city_years, c.gender
ORDER BY CAST(c.stay_in_current_city_years AS UNSIGNED), c.gender;


-- Q8. City categories ranked by revenue inside each product category.
-- RANK() OVER (PARTITION BY category) gives each city its place inside the category.
SELECT p.product_category, c.city_category, SUM(f.revenue) AS revenue,
       RANK() OVER (PARTITION BY p.product_category ORDER BY SUM(f.revenue) DESC) AS city_rank
FROM fact_sales f
JOIN dim_product p  ON p.product_key = f.product_key
JOIN dim_customer c ON c.customer_key = f.customer_key
GROUP BY p.product_category, c.city_category
ORDER BY p.product_category, city_rank;


-- Q9. Month-over-month sales growth (%) per product category in 2011.
-- LAG() = the value from the previous row, here last month's revenue of the same category; January has none, so its growth is NULL.
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


-- Q10. Weekday vs weekend sales by age group in 2011.
-- Slice on 2011; SUM(CASE ...) puts weekday and weekend revenue in two columns.
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


-- Q11. Top 5 products in each month of 2011, separately for weekdays and weekends.
-- Like Q1, but ROW_NUMBER() ranks inside each month and day type.
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


-- Q12. Quarter-to-quarter revenue growth (%) per store in 2011.
-- LAG() reads the previous quarter's revenue of the same store; Q1 has none, so its growth is NULL.
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


-- Q13. Each supplier's and product's share of every store's revenue.
-- SUM() OVER (PARTITION BY store) = the store's total on every row, so revenue / store total = contribution %.
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


-- Q14. Each product's sales per season (all loaded dates).
-- SUM(CASE WHEN season = ...) gives one column per season.
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


-- Q15. Month-to-month revenue volatility (%) per store and supplier.
-- LAG() reads the previous month of the same store-supplier pair to work out the change %.
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


-- Q16. Top 5 product pairs bought in the same cart.
-- Self join: fact_sales joined to itself on transaction_id pairs products of one cart; only products in 400+ carts are paired to keep it fast.
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


-- Q17a. 2011 revenue: supplier subtotals, store subtotals and the grand total.
-- ROLLUP adds subtotal rows to a GROUP BY; GROUPING() = 1 marks a subtotal row, and only those rows are kept here.
SELECT * FROM (
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
  GROUP BY s.store_name, su.supplier_name, p.product_name WITH ROLLUP
) r
WHERE row_type <> 'Product';


-- Q17b. 2011 revenue by store, supplier and product, with all subtotals.
-- WITH ROLLUP adds a subtotal after each supplier and store and a grand total at the end; GROUPING() labels them.
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


-- Q18. Quantity and revenue per product for each half and the whole of 2011.
-- SUM(CASE WHEN half_year = n ...) gives the two halves as columns next to the full-year total.
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


-- Q19. Revenue spikes: days a product earned more than twice its own average daily revenue.
-- WITH (CTE) builds named steps: daily revenue per product, then its average; days above twice the average are kept.
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


-- Q20. View STORE_QUARTERLY_SALES: total sales per store per quarter.
-- A view is a saved SELECT that runs again every time it is read; the SELECT on it does the sorting.
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


-- Materialized view: the view's result stored in the table MV_STORE_QUARTERLY_SALES.
-- MySQL has no materialized views, so a table holds the result; reading it needs no joins, run these two statements again to refresh it.
DROP TABLE IF EXISTS MV_STORE_QUARTERLY_SALES;
CREATE TABLE MV_STORE_QUARTERLY_SALES AS
SELECT store_name, year, quarter, total_sales
FROM STORE_QUARTERLY_SALES;

SELECT store_name, year, quarter, total_sales
FROM MV_STORE_QUARTERLY_SALES
ORDER BY store_name, year, quarter;
