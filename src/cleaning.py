#Phase 1 

import pandas as pd

#PDF Section 5.1: map the file's attributes to the project names
COLUMN_MAP = {
    "InvoiceNo": "transaction_id",
    "StockCode": "product_id",
    "Description": "product_name",
    "Quantity": "quantity",
    "InvoiceDate": "event_time",
    "UnitPrice": "unit_price",
    "CustomerID": "customer_id",
    "Country": "country",
}


#reads the Excel file, applies the 4 cleaning rules and renames the columns
def clean(path):
    #IDs read as text so the MD5 rules hash the exact id
    df = pd.read_excel(path, dtype={"InvoiceNo": str, "StockCode": str})
    #row count before cleaning, for the report
    before = len(df)

    #the 4 PDF cleaning rules: quantity > 0, price > 0, a known customer, no cancelled (C) invoice
    df = df[df["Quantity"] > 0]
    df = df[df["UnitPrice"] > 0]
    df = df[df["CustomerID"].notna()]
    df = df[~df["InvoiceNo"].str.startswith("C")]   #drop cancellations

    #CustomerID as text without ".0" (e.g. "17850", not "17850.0")
    df["CustomerID"] = df["CustomerID"].astype(int).astype(str)

    #5.1 Renaiming Column names. 
    df = df.rename(columns=COLUMN_MAP).reset_index(drop=True)

    #print the counts for the report
    print(f"Transactions before cleaning: {before:,}")
    print(f"Transactions after cleaning:  {len(df):,}")
    return df
