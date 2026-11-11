#Phase 2 : Splitting into ONLINE or PERIODIC 

import hashlib


#turns any text into a fixed number with MD5 (same text, same number on every run)
def md5_number(text):
    #MD5 of the text (UTF-8), first 8 hex characters as a whole number.
    h = hashlib.md5(text.encode("utf-8")).hexdigest()
    return int(h[:8], 16)


#labels every row Online or Periodic from its invoice number
def split(df):
    #one MD5 number per row; the same invoice gives the same number, so a cart gets one label
    n = df["transaction_id"].apply(md5_number)

    #remainder 0-6 = Online, 7-9 = physical store (Periodic)
    df["sales_mode"] = "Periodic"
    df.loc[n % 10 <= 6, "sales_mode"] = "Online"

    #count carts and rows of each kind for the report
    carts = df.drop_duplicates("transaction_id")["sales_mode"].value_counts()
    rows = df["sales_mode"].value_counts()
    total = carts.sum()
    print(f"Online carts:   {carts['Online']:,} ({carts['Online'] / total:.2%}), rows {rows['Online']:,}")
    print(f"Periodic carts: {carts['Periodic']:,} ({carts['Periodic'] / total:.2%}), rows {rows['Periodic']:,}")
    return df
