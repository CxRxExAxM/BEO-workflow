#!/usr/bin/env python3
"""
Migration script to add file_type column to beos table
"""

import psycopg2
import os

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:devpassword@localhost:5432/beo_app"
)

def migrate():
    """Add file_type column to beos table"""

    # Parse the DATABASE_URL
    # Format: postgresql://user:password@host:port/dbname
    url_parts = DATABASE_URL.replace('postgresql://', '').split('@')
    user_pass = url_parts[0].split(':')
    host_port_db = url_parts[1].split('/')
    host_port = host_port_db[0].split(':')

    user = user_pass[0]
    password = user_pass[1]
    host = host_port[0]
    port = host_port[1] if len(host_port) > 1 else '5432'
    dbname = host_port_db[1]

    print(f"Connecting to database: {dbname} at {host}:{port}")

    try:
        # Connect to database
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=dbname,
            user=user,
            password=password
        )

        cur = conn.cursor()

        # Check if column already exists
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='beos' AND column_name='file_type';
        """)

        if cur.fetchone():
            print("Column 'file_type' already exists. No migration needed.")
        else:
            print("Adding 'file_type' column to 'beos' table...")

            # Add the column with default value
            cur.execute("""
                ALTER TABLE beos
                ADD COLUMN file_type VARCHAR DEFAULT 'daily';
            """)

            conn.commit()
            print("✓ Successfully added 'file_type' column with default value 'daily'")

        cur.close()
        conn.close()
        print("Migration complete!")

    except Exception as e:
        print(f"Error during migration: {e}")
        raise

if __name__ == "__main__":
    migrate()
