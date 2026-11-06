"""Phase 2: decide Online or Periodic for each shopping cart (PDF Section 5.4.1)."""

import hashlib


def md5_number(text):
    """MD5 of the text (UTF-8), first 8 hex characters as a whole number."""
    h = hashlib.md5(text.encode("utf-8")).hexdigest()
    return int(h[:8], 16)


def split(df):
    n = df["transaction_id"].apply(md5_number)

    # remainder 0-6 = Online, 7-9 = physical store (Periodic)
    df["sales_mode"] = "Periodic"
    df.loc[n % 10 <= 6, "sales_mode"] = "Online"

    carts = df.drop_duplicates("transaction_id")["sales_mode"].value_counts()
    rows = df["sales_mode"].value_counts()
    total = carts.sum()
    print(f"Online carts:   {carts['Online']:,} ({carts['Online'] / total:.2%}), rows {rows['Online']:,}")
    print(f"Periodic carts: {carts['Periodic']:,} ({carts['Periodic'] / total:.2%}), rows {rows['Periodic']:,}")
    return df
