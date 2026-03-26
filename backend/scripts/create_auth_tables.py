"""
Create users and refresh_tokens tables in existing PostgreSQL database.
Run from backend dir: python -m scripts.create_auth_tables
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


def create_tables():
    with engine.begin() as conn:
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE userrole AS ENUM ('employee', 'manager', 'admin');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                employee_id BIGINT NOT NULL UNIQUE REFERENCES employees(id),
                role userrole NOT NULL DEFAULT 'employee',
                is_active BOOLEAN NOT NULL DEFAULT true,
                must_change_password BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens(user_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens(expires_at);"))

    print("Auth tables created successfully.")


if __name__ == "__main__":
    create_tables()
