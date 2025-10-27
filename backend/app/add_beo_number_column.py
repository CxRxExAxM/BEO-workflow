#!/usr/bin/env python3
"""
Migration script to add beo_number column to beos table
"""

import psycopg2
import os

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:devpassword@localhost:5432/beo_app"
)

# Parse the URL to get connection parameters
# Format: postgresql://user:password@host:port/database
url_parts = DATABASE_URL.replace("postgresql://", "").split("@")
user_pass = url_parts[0].split(":")
host_port_db = url_parts[1].split("/")
host_port = host_port_db[0].split(":")

user = user_pass[0]
password = user_pass[1]
host = host_port[0]
port = host_port[1] if len(host_port) > 1 else "5432"
database = host_port_db[1]

try:
    # Connect to PostgreSQL
    conn = psycopg2.connect(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password
    )

    cursor = conn.cursor()

    # Check if column exists
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name='beos' AND column_name='beo_number';
    """)

    if cursor.fetchone():
        print("Column 'beo_number' already exists in 'beos' table.")
    else:
        # Add the column
        cursor.execute("""
            ALTER TABLE beos
            ADD COLUMN beo_number VARCHAR;
        """)

        # Add index
        cursor.execute("""
            CREATE INDEX ix_beos_beo_number ON beos (beo_number);
        """)

        conn.commit()
        print("Successfully added 'beo_number' column to 'beos' table with index.")

    cursor.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
    if conn:
        conn.rollback()
