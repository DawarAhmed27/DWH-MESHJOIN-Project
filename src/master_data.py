"""Phase 3: customer and product Master Data (PDF Section 5.4.3)."""

import hashlib

PARTITION_SIZE = 500   # one partition = one page of 500 tuples

GENDER     = ["Male", "Female"]
AGE        = ["0-17", "18-25", "26-35", "36-45", "46-50", "51-55", "55+"]
OCCUPATION = ["Student", "Engineer", "Teacher", "Executive", "Clerk",
              "Healthcare", "Retail", "Homemaker", "Artist", "Other"]
CITY       = ["A", "B", "C"]
STAY       = ["0", "1", "2", "3", "4+"]
MARITAL    = ["Single", "Married"]
CATEGORY   = ["Home Decor", "Kitchen", "Stationery", "Toys", "Seasonal Gifts",
              "Bags", "Jewelry", "Garden", "Party", "Other"]
SUPPLIERS  = [("SUP01", "Northwind Supplies"), ("SUP02", "Atlantic Gifts Ltd"),
              ("SUP03", "Midlands Wholesale"), ("SUP04", "Celtic Craft Co"),
              ("SUP05", "EuroPack Partners")]


def stable(text, n):
    """MD5 of the text (UTF-8), first 8 hex characters as an integer, modulo n."""
    h = hashlib.md5(text.encode("utf-8")).hexdigest()
    return int(h[:8], 16) % n


def build_customers(df):
    # one row per customer; country from the first cleaned transaction
    cust = df.sort_values("event_time", kind="stable").drop_duplicates("customer_id")
    cust = cust[["customer_id", "country"]].copy()

    cust["gender"]         = cust["customer_id"].apply(lambda c: GENDER[stable(c, 2)])
    cust["age_group"]      = cust["customer_id"].apply(lambda c: AGE[stable(c + "age", 7)])
    cust["occupation"]     = cust["customer_id"].apply(lambda c: OCCUPATION[stable(c + "occ", 10)])
    cust["city_category"]  = (cust["customer_id"] + cust["country"]).apply(lambda t: CITY[stable(t, 3)])
    cust["stay_in_current_city_years"] = cust["customer_id"].apply(lambda c: STAY[stable(c + "stay", 5)])
    cust["marital_status"] = cust["customer_id"].apply(lambda c: MARITAL[stable(c + "mar", 2)])

    cust = cust.drop(columns="country").sort_values("customer_id").reset_index(drop=True)
    print(f"Customers: {len(cust):,} ({partitions(cust)} partitions)")
    return cust


def build_products(df):
    p = df[["product_id", "product_name"]].copy()
    p["product_name"] = p["product_name"].fillna("").str.strip()
    p["name_len"] = p["product_name"].str.len()

    # longest description per product (ties: first in file order)
    prod = p.sort_values("name_len", ascending=False, kind="stable").drop_duplicates("product_id")
    prod = prod[["product_id", "product_name"]].copy()
    prod.loc[prod["product_name"] == "", "product_name"] = "UNKNOWN"

    prod["product_category"] = prod["product_id"].apply(lambda x: CATEGORY[stable(x + "cat", 10)])
    prod["supplier_id"]      = prod["product_id"].apply(lambda x: SUPPLIERS[stable(x, 5)][0])
    prod["supplier_name"]    = prod["product_id"].apply(lambda x: SUPPLIERS[stable(x, 5)][1])

    prod = prod.sort_values("product_id").reset_index(drop=True)
    print(f"Products:  {len(prod):,} ({partitions(prod)} partitions)")
    return prod


def partitions(table):
    return -(-len(table) // PARTITION_SIZE)   # rounded up


def with_partition_no(table):
    """Partition number for MESHJOIN: rows 0-499 -> 0, 500-999 -> 1, ..."""
    out = table.copy()
    out["partition_no"] = out.index // PARTITION_SIZE
    return out
