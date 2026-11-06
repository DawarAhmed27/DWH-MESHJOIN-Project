"""Phase 1: read and clean the transactional file (PDF Section 3 and 5.1)."""

import pandas as pd

# PDF Section 5.1: map the file's attributes to the project names
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


def clean(path):
    # IDs read as text so the MD5 rules hash the exact id
    df = pd.read_excel(path, dtype={"InvoiceNo": str, "StockCode": str})
    before = len(df)

    df = df[df["Quantity"] > 0]
    df = df[df["UnitPrice"] > 0]
    df = df[df["CustomerID"].notna()]
    df = df[~df["InvoiceNo"].str.startswith("C")]   # drop cancellations

    # CustomerID as text without ".0" (e.g. "17850", not "17850.0")
    df["CustomerID"] = df["CustomerID"].astype(int).astype(str)

    df = df.rename(columns=COLUMN_MAP).reset_index(drop=True)

    print(f"Transactions before cleaning: {before:,}")
    print(f"Transactions after cleaning:  {len(df):,}")
    return df
