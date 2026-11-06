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


def count(conn, table):
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    n = cur.fetchone()[0]
    cur.close()
    return n
