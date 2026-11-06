"""Phase 4: online stream file and 48 periodic groups (PDF Sections 5.2 and 5.3)."""

GROUPS = 48

ONLINE_COLS = ["transaction_id", "customer_id", "product_id",
               "quantity", "unit_price", "event_time", "sales_mode"]
STAGING_COLS = ONLINE_COLS + ["release_hour", "released"]


def build_online(df):
    online = df[df["sales_mode"] == "Online"][ONLINE_COLS]
    print(f"Online transactions: {len(online):,}")
    return online


def build_periodic(df):
    periodic = df[df["sales_mode"] == "Periodic"].copy()
    total = len(periodic)

    # one line per cart: its earliest time and its number of rows
    carts = periodic.groupby("transaction_id").agg(
        first_time=("event_time", "min"),
        rows=("event_time", "size"),
    ).reset_index()
    carts = carts.sort_values(["first_time", "transaction_id"]).reset_index(drop=True)

    # whole carts: group = starting position * 48 / total rows -> 0 to 47
    carts["start"] = carts["rows"].cumsum() - carts["rows"]
    carts["release_hour"] = carts["start"] * GROUPS // total

    periodic = periodic.merge(carts[["transaction_id", "release_hour"]], on="transaction_id")
    periodic["released"] = 0
    periodic = periodic.sort_values(["release_hour", "event_time", "transaction_id"])[STAGING_COLS]

    sizes = periodic.groupby("release_hour").size()
    print(f"Periodic transactions: {total:,} in {sizes.size} groups")
    print(f"Smallest group: {sizes.min():,}   Largest group: {sizes.max():,}")
    return periodic
