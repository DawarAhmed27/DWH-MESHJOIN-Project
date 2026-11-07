"""MySQL helpers: connect, run the Create-DW script, insert rows in batches."""

import mysql.connector

BATCH_SIZE = 5000


def connect(host, port, database, user, password):
    conn = mysql.connector.connect(host=host, port=port, user=user, password=password)
    cur = conn.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{database}`")
    cur.execute(f"USE `{database}`")
    cur.close()
    return conn


def run_sql_file(conn, path):
    """Run every statement of a .sql file. Comments are removed first,
    because some comments contain ';'."""
    with open(path, encoding="utf-8") as f:
        lines = [line.split("--")[0] for line in f]
    statements = [s.strip() for s in "\n".join(lines).split(";") if s.strip()]

    cur = conn.cursor()
    for s in statements:
        cur.execute(s)
    conn.commit()
    cur.close()


def insert_rows(conn, table, df):
    """Insert a DataFrame into a table, BATCH_SIZE rows per commit."""
    columns = list(df.columns)
    sql = (f"INSERT INTO {table} ({', '.join(columns)}) "
           f"VALUES ({', '.join(['%s'] * len(columns))})")

    data = df.copy()
    for col in data.columns:
        if str(data[col].dtype).startswith("datetime"):
            data[col] = data[col].dt.strftime("%Y-%m-%d %H:%M:%S")
    rows = data.astype(object).values.tolist()   # plain Python values for MySQL

    cur = conn.cursor()
    for i in range(0, len(rows), BATCH_SIZE):
        cur.executemany(sql, rows[i:i + BATCH_SIZE])
        conn.commit()
    cur.close()


MASTER_TABLES = ("customer_master_data", "product_master_data")


def partition_count(conn, table):
    """How many partitions (pages of 500 rows) a master table has."""
    cur = conn.cursor()
    cur.execute(f"SELECT MAX(partition_no) + 1 FROM {table}")
    n = cur.fetchone()[0]
    cur.close()
    return n


def read_partition(conn, table, k):
    """MESHJOIN disk buffer: read ONE partition (500 rows) of a master table.
    Uses the partition_no index, so only that page is read from disk."""
    if table not in MASTER_TABLES:
        raise ValueError(f"not a master table: {table}")
    cur = conn.cursor(dictionary=True)        # each row comes back as a dict
    cur.execute(f"SELECT * FROM {table} WHERE partition_no = %s", (k,))
    rows = cur.fetchall()
    cur.close()
    return rows


def count(conn, table):
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    n = cur.fetchone()[0]
    cur.close()
    return n
