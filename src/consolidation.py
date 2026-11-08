"""Step 9.1: data consolidation (PDF 6.2 and 8).

Turns one transaction that has finished both MESHJOIN passes (and has its
store) into:
- the five dimension rows it points to (customer, product, supplier, store, time)
- its fact row: transaction_id, quantity, revenue, sales_mode, processing_mode
  (the five keys are added by the loader in step 9.2)

SALE does not exist in the transactional data or the Master Data, so it is
computed here:  revenue = quantity x unit_price
"""

from datetime import datetime
from decimal import Decimal

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def season(month):
    """Spring Mar-May, Summer Jun-Aug, Fall Sep-Nov, Winter Dec-Feb."""
    if month in (3, 4, 5):
        return "Spring"
    if month in (6, 7, 8):
        return "Summer"
    if month in (9, 10, 11):
        return "Fall"
    return "Winter"


def time_row(event_time):
    """dim_time row for one event_time ('YYYY-MM-DD HH:MM:SS'), minute level."""
    dt = datetime.strptime(event_time, "%Y-%m-%d %H:%M:%S")
    return {
        "time_key": int(dt.strftime("%Y%m%d%H%M")),      # e.g. 201012010826
        "event_time": dt.strftime("%Y-%m-%d %H:%M:00"),
        "full_date": dt.strftime("%Y-%m-%d"),
        "hour": dt.hour,
        "day_of_month": dt.day,
        "month": dt.month,
        "quarter": (dt.month - 1) // 3 + 1,
        "year": dt.year,
        "day_of_week": DAYS[dt.weekday()],
        "day_type": "Weekend" if dt.weekday() >= 5 else "Weekday",   # Sat, Sun
        "season": season(dt.month),
        "half_year": 1 if dt.month <= 6 else 2,                     # Jan-Jun, Jul-Dec
    }


def consolidate(t):
    """One enriched transaction -> (dimension rows, fact row)."""
    # Decimal so that e.g. 6 x 2.55 is exactly 15.30 (no float rounding)
    revenue = Decimal(str(t["unit_price"])) * t["quantity"]

    dims = {
        "customer": {"customer_id": t["customer_id"], "gender": t["gender"],
                     "age_group": t["age_group"], "occupation": t["occupation"],
                     "city_category": t["city_category"],
                     "stay_in_current_city_years": t["stay_in_current_city_years"],
                     "marital_status": t["marital_status"]},
        "product": {"product_id": t["product_id"], "product_name": t["product_name"],
                    "product_category": t["product_category"]},
        "supplier": {"supplier_id": t["supplier_id"], "supplier_name": t["supplier_name"]},
        "store": {"store_id": t["store_id"], "store_name": t["store_name"], "city": t["city"]},
        "time": time_row(t["event_time"]),
    }
    fact = {"transaction_id": t["transaction_id"], "quantity": t["quantity"],
            "revenue": revenue, "sales_mode": t["sales_mode"],
            "processing_mode": t["processing_mode"]}
    return dims, fact
