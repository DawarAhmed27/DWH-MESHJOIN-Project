"""Draws the DW schema in the style of a MySQL Workbench EER diagram
(report/schema_diagram.png). Run:  python docs/schema_diagram.py   (needs playwright)"""

import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "report", "schema_diagram.png")
W_BOX, HEAD, ROW, FOOT = 270, 26, 20, 18

# name: (x, y, [(column, type, kind)])   kind: pk / fk / col
TABLES = {
    "dim_customer": (40, 70, [("customer_key", "INT", "pk"), ("customer_id", "VARCHAR(10)", "col"),
        ("gender", "VARCHAR(6)", "col"), ("age_group", "VARCHAR(5)", "col"), ("occupation", "VARCHAR(20)", "col"),
        ("city_category", "CHAR(1)", "col"), ("stay_in_current_city_years", "VARCHAR(2)", "col"),
        ("marital_status", "VARCHAR(7)", "col")]),
    "dim_product": (40, 340, [("product_key", "INT", "pk"), ("product_id", "VARCHAR(20)", "col"),
        ("product_name", "VARCHAR(255)", "col"), ("product_category", "VARCHAR(20)", "col")]),
    "fact_sales": (595, 110, [("sale_key", "BIGINT", "pk"), ("transaction_id", "VARCHAR(10)", "col"),
        ("customer_key", "INT", "fk"), ("product_key", "INT", "fk"), ("supplier_key", "INT", "fk"),
        ("store_key", "INT", "fk"), ("time_key", "BIGINT", "fk"), ("quantity", "INT", "col"),
        ("revenue", "DECIMAL(14,3)", "col"), ("sales_mode", "VARCHAR(8)", "col"),
        ("processing_mode", "VARCHAR(8)", "col")]),
    "dim_supplier": (595, 455, [("supplier_key", "INT", "pk"), ("supplier_id", "CHAR(5)", "col"),
        ("supplier_name", "VARCHAR(30)", "col")]),
    "dim_time": (1150, 225, [("time_key", "BIGINT", "pk"), ("event_time", "DATETIME", "col"),
        ("full_date", "DATE", "col"), ("hour", "TINYINT", "col"), ("day_of_month", "TINYINT", "col"),
        ("month", "TINYINT", "col"), ("quarter", "TINYINT", "col"), ("year", "SMALLINT", "col"),
        ("day_of_week", "VARCHAR(9)", "col"), ("day_type", "VARCHAR(7)", "col"),
        ("season", "VARCHAR(6)", "col"), ("half_year", "TINYINT", "col")]),
    "dim_store": (1150, 50, [("store_key", "INT", "pk"), ("store_id", "TINYINT", "col"),
        ("store_name", "VARCHAR(30)", "col"), ("city", "VARCHAR(20)", "col")]),
    # working tables
    "customer_master_data": (40, 640, [("customer_id", "VARCHAR(10)", "pk"), ("gender", "VARCHAR(6)", "col"),
        ("age_group", "VARCHAR(5)", "col"), ("occupation", "VARCHAR(20)", "col"),
        ("city_category", "CHAR(1)", "col"), ("stay_in_current_city_years", "VARCHAR(2)", "col"),
        ("marital_status", "VARCHAR(7)", "col"), ("partition_no", "INT", "col")]),
    "product_master_data": (330, 640, [("product_id", "VARCHAR(20)", "pk"), ("product_name", "VARCHAR(255)", "col"),
        ("product_category", "VARCHAR(20)", "col"), ("supplier_id", "CHAR(5)", "col"),
        ("supplier_name", "VARCHAR(30)", "col"), ("partition_no", "INT", "col")]),
    "periodic_sales_data": (620, 640, [("row_id", "INT", "pk"), ("transaction_id", "VARCHAR(10)", "col"),
        ("customer_id", "VARCHAR(10)", "col"), ("product_id", "VARCHAR(20)", "col"), ("quantity", "INT", "col"),
        ("unit_price", "DECIMAL(10,3)", "col"), ("event_time", "DATETIME", "col"),
        ("sales_mode", "VARCHAR(8)", "col"), ("release_hour", "TINYINT", "col"), ("released", "TINYINT(1)", "col")]),
    "shed_table": (910, 640, [("shed_id", "INT", "pk"), ("transaction_id", "VARCHAR(10)", "col"),
        ("customer_id", "VARCHAR(10)", "col"), ("product_id", "VARCHAR(20)", "col"), ("quantity", "INT", "col"),
        ("unit_price", "DECIMAL(10,3)", "col"), ("event_time", "DATETIME", "col"),
        ("sales_mode", "VARCHAR(8)", "col"), ("shed_time", "DATETIME(3)", "col")]),
    "mv_store_quarterly_sales": (1200, 640, [("store_name", "VARCHAR(30)", "col"), ("year", "SMALLINT", "col"),
        ("quarter", "TINYINT", "col"), ("total_sales", "DECIMAL(36,3)", "col")]),
}
VIEW = ("store_quarterly_sales", 1200, 800)


def height(cols):
    return HEAD + ROW * len(cols) + FOOT


def row_y(name, i):
    x, y, cols = TABLES[name]
    return y + HEAD + ROW * i + ROW / 2


ICON = {
    "pk": '<svg width="13" height="13" viewBox="0 0 13 13"><circle cx="4" cy="6.5" r="3.2" fill="#F2C12E" stroke="#B8860B"/>'
          '<rect x="6.5" y="5.6" width="6" height="1.9" fill="#F2C12E" stroke="#B8860B" stroke-width=".6"/>'
          '<rect x="10.5" y="7.2" width="1.4" height="2.4" fill="#F2C12E"/></svg>',
    "fk": '<svg width="13" height="13" viewBox="0 0 13 13"><path d="M6.5 1.5 L11.5 6.5 L6.5 11.5 L1.5 6.5 Z" fill="#E0565B" stroke="#A33"/></svg>',
    "col": '<svg width="13" height="13" viewBox="0 0 13 13"><path d="M6.5 2 L11 6.5 L6.5 11 L2 6.5 Z" fill="#5B9BD5" stroke="#2E6DA4"/></svg>',
}


def box(name):
    x, y, cols = TABLES[name]
    rows = "".join(f'<div class="r">{ICON[k]}<span class="c">{c}</span><span class="t">{t}</span></div>'
                   for c, t, k in cols)
    return (f'<div class="tb" style="left:{x}px;top:{y}px;width:{W_BOX}px">'
            f'<div class="h"><span class="ti">&#9638;</span>{name}</div>{rows}'
            f'<div class="f">&#9656; Indexes</div></div>')


# relationships: (dim, dim row, fact row, route)
EDGES = [("dim_customer", 0, 2, "left"), ("dim_product", 0, 3, "left"),
         ("dim_supplier", 0, 4, "below"), ("dim_store", 0, 5, "right"), ("dim_time", 0, 6, "right")]


def lines():
    fx, fy, fcols = TABLES["fact_sales"]
    out = []
    for dim, dr, fr, side in EDGES:
        dx, dy, dcols = TABLES[dim]
        y2 = row_y("fact_sales", fr)
        if side == "below":                     # supplier: up into the bottom of the fact table
            x = fx + W_BOX * 0.5
            y1 = dy
            yb = fy + height(fcols)
            out.append(f'<path d="M{x},{y1} L{x},{yb}" class="e"/>')
            out.append(f'<path d="M{x-7},{y1-6} L{x+7},{y1-6} M{x-7},{y1-10} L{x+7},{y1-10}" class="m"/>')
            out.append(f'<path d="M{x},{yb+12} L{x-7},{yb} M{x},{yb+12} L{x+7},{yb} M{x-7},{yb+15} L{x+7},{yb+15}" class="m"/>')
            continue
        y1 = row_y(dim, dr)
        if side == "left":
            x1, x2, s = dx + W_BOX, fx, 1
        else:
            x1, x2, s = dx, fx + W_BOX, -1
        xm = (x1 + x2) / 2 + (8 if dim in ("dim_product", "dim_store") else -8) * s
        out.append(f'<path d="M{x1},{y1} L{xm},{y1} L{xm},{y2} L{x2},{y2}" class="e"/>')
        # "one" end at the dimension: two bars
        out.append(f'<path d="M{x1+6*s},{y1-7} L{x1+6*s},{y1+7} M{x1+10*s},{y1-7} L{x1+10*s},{y1+7}" class="m"/>')
        # "many" end at the fact: crow's foot + bar
        c = x2 - 12 * s
        out.append(f'<path d="M{c},{y2} L{x2},{y2-7} M{c},{y2} L{x2},{y2+7} M{c-3*s},{y2-7} L{c-3*s},{y2+7}" class="m"/>')
    return "".join(out)


def html():
    vx, vy = VIEW[1], VIEW[2]
    view = (f'<div class="vw" style="left:{vx}px;top:{vy}px;width:{W_BOX}px">'
            f'<span class="ti">&#9638;</span>{VIEW[0]} <i>(view)</i></div>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;background:#fff;font-family:Tahoma,Verdana,"DejaVu Sans",sans-serif}}
#c{{position:relative;width:1500px;height:900px;background:#fff}}
.band{{position:absolute;left:20px;top:600px;width:1460px;height:285px;border:1px dashed #9AA9BA;border-radius:6px;background:#FAFBFD}}
.lab{{position:absolute;font-size:13px;font-weight:bold;color:#3B4A5C}}
.tb{{position:absolute;border:1px solid #6F8FB8;border-radius:5px;background:#fff;box-shadow:2px 2px 4px rgba(0,0,0,.18);overflow:hidden}}
.h{{background:linear-gradient(#B9D2EE,#8DB2DE);font-weight:bold;font-size:13px;color:#14243A;height:{HEAD}px;line-height:{HEAD}px;padding-left:8px;border-bottom:1px solid #6F8FB8}}
.ti{{color:#4A6F9E;margin-right:6px}}
.r{{height:{ROW}px;display:flex;align-items:center;font-size:12px;padding-left:7px;color:#222}}
.r svg{{margin-right:6px;flex:none}}
.c{{flex:none}} .t{{margin-left:6px;color:#555}}
.f{{height:{FOOT}px;line-height:{FOOT}px;font-size:11px;background:linear-gradient(#DCE7F4,#C6D6EA);color:#3B4A5C;padding-left:8px;border-top:1px solid #9FB6D6}}
.vw{{position:absolute;height:30px;line-height:30px;font-size:13px;font-weight:bold;background:linear-gradient(#FFF3A8,#F5DC5A);border:1px solid #C9A928;border-radius:5px;padding-left:8px;box-shadow:2px 2px 4px rgba(0,0,0,.18)}}
.vw i{{font-weight:normal;color:#6B5A10}}
svg.ln{{position:absolute;left:0;top:0}}
.e{{fill:none;stroke:#333;stroke-width:1.4;stroke-dasharray:7 5}}
.m{{fill:none;stroke:#333;stroke-width:1.4}}
</style></head><body><div id="c">
<div class="lab" style="left:40px;top:20px">Star schema</div>
<div class="band"></div>
<div class="lab" style="left:40px;top:612px">Working tables (Master Data, staging, shed) and the materialized view</div>
<svg class="ln" width="1500" height="900">{lines()}</svg>
{''.join(box(n) for n in TABLES)}{view}
</div></body></html>"""


if __name__ == "__main__":
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1500, "height": 900}, device_scale_factor=2)
        pg.set_content(html())
        pg.locator("#c").screenshot(path=OUT)
        b.close()
    print("written", OUT)
