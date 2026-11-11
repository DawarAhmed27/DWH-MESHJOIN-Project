
-- working tables (master data, staging, shed) 
-- star schema (5 dimensions + 1 fact). 
SET NAMES utf8mb4;

-- Drop the old copy first: the view and the materialized table, then the fact (it points to the dimensions), then the rest
DROP VIEW  IF EXISTS STORE_QUARTERLY_SALES;
DROP TABLE IF EXISTS MV_STORE_QUARTERLY_SALES;

DROP TABLE IF EXISTS fact_sales;
DROP TABLE IF EXISTS dim_customer;
DROP TABLE IF EXISTS dim_product;
DROP TABLE IF EXISTS dim_supplier;
DROP TABLE IF EXISTS dim_store;
DROP TABLE IF EXISTS dim_time;

DROP TABLE IF EXISTS customer_master_data;
DROP TABLE IF EXISTS product_master_data;
DROP TABLE IF EXISTS periodic_sales_data;
DROP TABLE IF EXISTS shed_table;


-- WORKING TABLES

-- Customer Master Data (stays on disk; MESHJOIN reads one partition
-- of 500 tuples per iteration using partition_no)
CREATE TABLE customer_master_data (
    customer_id                 VARCHAR(10)  NOT NULL,
    gender                      VARCHAR(6)   NOT NULL,
    age_group                   VARCHAR(5)   NOT NULL,
    occupation                  VARCHAR(20)  NOT NULL,
    city_category               CHAR(1)      NOT NULL,
    stay_in_current_city_years  VARCHAR(2)   NOT NULL,
    marital_status              VARCHAR(7)   NOT NULL,
    partition_no                INT          NOT NULL,
    PRIMARY KEY (customer_id),
    INDEX idx_customer_partition (partition_no)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Product Master Data (stays on disk; read one partition per iteration)
CREATE TABLE product_master_data (
    product_id        VARCHAR(20)   NOT NULL,
    product_name      VARCHAR(255)  NOT NULL,
    product_category  VARCHAR(20)   NOT NULL,
    supplier_id       CHAR(5)       NOT NULL,
    supplier_name     VARCHAR(30)   NOT NULL,
    partition_no      INT           NOT NULL,
    PRIMARY KEY (product_id),
    INDEX idx_product_partition (partition_no)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Staging table for periodic (store) sales: 48 groups, one per hour.
-- row_id is needed because the cleaned data keeps duplicate rows.
CREATE TABLE periodic_sales_data (
    row_id          INT            NOT NULL AUTO_INCREMENT,
    transaction_id  VARCHAR(10)    NOT NULL,
    customer_id     VARCHAR(10)    NOT NULL,
    product_id      VARCHAR(20)    NOT NULL,
    quantity        INT            NOT NULL,
    unit_price      DECIMAL(10,3)  NOT NULL,   
    event_time      DATETIME       NOT NULL,
    sales_mode      VARCHAR(8)     NOT NULL,
    release_hour    TINYINT        NOT NULL,          -- group 0 to 47
    released        TINYINT(1)     NOT NULL DEFAULT 0, -- 1 = already extracted
    PRIMARY KEY (row_id),
    INDEX idx_periodic_release (release_hour, released),
    CONSTRAINT chk_periodic_mode CHECK (sales_mode = 'Periodic'),
    CONSTRAINT chk_release_hour  CHECK (release_hour BETWEEN 0 AND 47)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Shed table (disk): transactions moved out of memory in peak time
-- (periodic first, online last); processed later in non-peak time
CREATE TABLE shed_table (
    shed_id         INT            NOT NULL AUTO_INCREMENT,
    transaction_id  VARCHAR(10)    NOT NULL,
    customer_id     VARCHAR(10)    NOT NULL,
    product_id      VARCHAR(20)    NOT NULL,
    quantity        INT            NOT NULL,
    unit_price      DECIMAL(10,3)  NOT NULL,   
    event_time      DATETIME       NOT NULL,
    sales_mode      VARCHAR(8)     NOT NULL,          -- the transaction's flag
    shed_time       DATETIME(3)    NOT NULL,          -- when it was shed
    PRIMARY KEY (shed_id),
    INDEX idx_shed_time (shed_time)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;


-- STAR SCHEMA
-- Surrogate keys for the dimensions; original ids are kept as columns.

-- Customer dimension: surrogate key + customer_id + the 6 attributes from the Master Data
CREATE TABLE dim_customer (
    customer_key                INT          NOT NULL AUTO_INCREMENT,
    customer_id                 VARCHAR(10)  NOT NULL,
    gender                      VARCHAR(6)   NOT NULL,
    age_group                   VARCHAR(5)   NOT NULL,
    occupation                  VARCHAR(20)  NOT NULL,
    city_category               CHAR(1)      NOT NULL,
    stay_in_current_city_years  VARCHAR(2)   NOT NULL,
    marital_status              VARCHAR(7)   NOT NULL,
    PRIMARY KEY (customer_key),
    UNIQUE KEY uq_customer_id (customer_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Product dimension: surrogate key + product_id, name and category
CREATE TABLE dim_product (
    product_key       INT           NOT NULL AUTO_INCREMENT,
    product_id        VARCHAR(20)   NOT NULL,
    product_name      VARCHAR(255)  NOT NULL,
    product_category  VARCHAR(20)   NOT NULL,
    PRIMARY KEY (product_key),
    UNIQUE KEY uq_product_id (product_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Supplier dimension: its own table, because queries group by supplier
CREATE TABLE dim_supplier (
    supplier_key   INT          NOT NULL AUTO_INCREMENT,
    supplier_id    CHAR(5)      NOT NULL,
    supplier_name  VARCHAR(30)  NOT NULL,
    PRIMARY KEY (supplier_key),
    UNIQUE KEY uq_supplier_id (supplier_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Store dimension: the 5 stores (1 = Online)
CREATE TABLE dim_store (
    store_key   INT          NOT NULL AUTO_INCREMENT,
    store_id    TINYINT      NOT NULL,
    store_name  VARCHAR(30)  NOT NULL,
    city        VARCHAR(20)  NOT NULL,
    PRIMARY KEY (store_key),
    UNIQUE KEY uq_store_id (store_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- One row per distinct event_time (minute level).
-- time_key = YYYYMMDDHHMM, e.g. 201012010826
CREATE TABLE dim_time (
    time_key      BIGINT       NOT NULL,
    event_time    DATETIME     NOT NULL,
    full_date     DATE         NOT NULL,
    hour          TINYINT      NOT NULL,
    day_of_month  TINYINT      NOT NULL,
    month         TINYINT      NOT NULL,
    quarter       TINYINT      NOT NULL,
    year          SMALLINT     NOT NULL,
    day_of_week   VARCHAR(9)   NOT NULL,   -- Monday ... Sunday
    day_type      VARCHAR(7)   NOT NULL,   -- Weekday (Mon-Fri) / Weekend (Sat-Sun)
    season        VARCHAR(6)   NOT NULL,   -- Spring Mar-May, Summer Jun-Aug, Fall Sep-Nov, Winter Dec-Feb
    half_year     TINYINT      NOT NULL,   -- 1 = Jan-Jun, 2 = Jul-Dec
    PRIMARY KEY (time_key),
    UNIQUE KEY uq_event_time (event_time),
    CONSTRAINT chk_day_type CHECK (day_type IN ('Weekday', 'Weekend')),
    CONSTRAINT chk_season   CHECK (season IN ('Spring', 'Summer', 'Fall', 'Winter')),
    CONSTRAINT chk_half     CHECK (half_year IN (1, 2)),
    CONSTRAINT chk_quarter  CHECK (quarter BETWEEN 1 AND 4)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Fact: one row = one transaction (one product in one shopping cart)
CREATE TABLE fact_sales (
    sale_key         BIGINT         NOT NULL AUTO_INCREMENT,
    transaction_id   VARCHAR(10)    NOT NULL,
    customer_key     INT            NOT NULL,
    product_key      INT            NOT NULL,
    supplier_key     INT            NOT NULL,
    store_key        INT            NOT NULL,
    time_key         BIGINT         NOT NULL,
    quantity         INT            NOT NULL,
    revenue          DECIMAL(14,3)  NOT NULL,   -- SALE = QUANTITY x PRICE
    sales_mode       VARCHAR(8)     NOT NULL,   -- Online / Periodic
    processing_mode  VARCHAR(8)     NOT NULL,   -- Live / Periodic / Shed
    PRIMARY KEY (sale_key),
    INDEX idx_fact_transaction (transaction_id),
    CONSTRAINT fk_fact_customer FOREIGN KEY (customer_key) REFERENCES dim_customer (customer_key),
    CONSTRAINT fk_fact_product  FOREIGN KEY (product_key)  REFERENCES dim_product  (product_key),
    CONSTRAINT fk_fact_supplier FOREIGN KEY (supplier_key) REFERENCES dim_supplier (supplier_key),
    CONSTRAINT fk_fact_store    FOREIGN KEY (store_key)    REFERENCES dim_store    (store_key),
    CONSTRAINT fk_fact_time     FOREIGN KEY (time_key)     REFERENCES dim_time     (time_key),
    CONSTRAINT chk_sales_mode      CHECK (sales_mode IN ('Online', 'Periodic')),
    CONSTRAINT chk_processing_mode CHECK (processing_mode IN ('Live', 'Periodic', 'Shed'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;