"""Phase 4: online stream file and 48 periodic groups (PDF Sections 5.2 and 5.3)."""

#one group per simulated hour
GROUPS = 48

#columns of the online file and of the staging table
ONLINE_COLS = ["transaction_id", "customer_id", "product_id",
               "quantity", "unit_price", "event_time", "sales_mode"]
STAGING_COLS = ONLINE_COLS + ["release_hour", "released"]


#online rows in time order: the file the OnlineThread reads
def build_online(df):
    online = df[df["sales_mode"] == "Online"][ONLINE_COLS]
    print(f"Online transactions: {len(online):,}")
    return online


#periodic rows cut into 48 hourly groups of whole carts
def build_periodic(df):
    periodic = df[df["sales_mode"] == "Periodic"].copy()
    total = len(periodic)

    #one line per cart: its earliest time and its number of rows
    carts = periodic.groupby("transaction_id").agg(
        first_time=("event_time", "min"),
        rows=("event_time", "size"),
    ).reset_index()
    carts = carts.sort_values(["first_time", "transaction_id"]).reset_index(drop=True)

    #whole carts: group = starting position * 48 / total rows -> 0 to 47
    carts["start"] = carts["rows"].cumsum() - carts["rows"]
    carts["release_hour"] = carts["start"] * GROUPS // total

    #give every row the group (release_hour) of its cart
    periodic = periodic.merge(carts[["transaction_id", "release_hour"]], on="transaction_id")
    #released = 0 means the group has not been sent yet
    periodic["released"] = 0
    #order by group, then time, for the staging table
    periodic = periodic.sort_values(["release_hour", "event_time", "transaction_id"])[STAGING_COLS]

    #smallest and largest group for the report
    sizes = periodic.groupby("release_hour").size()
    print(f"Periodic transactions: {total:,} in {sizes.size} groups")
    print(f"Smallest group: {sizes.min():,}   Largest group: {sizes.max():,}")
    return periodic
