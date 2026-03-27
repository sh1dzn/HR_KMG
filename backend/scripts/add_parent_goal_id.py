"""Add parent_goal_id column to goals table."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.begin() as conn:
        conn.execute(text("""
            ALTER TABLE goals ADD COLUMN IF NOT EXISTS parent_goal_id UUID REFERENCES goals(goal_id);
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_goals_parent_goal_id ON goals(parent_goal_id);"))
    print("Added parent_goal_id to goals table.")

if __name__ == "__main__":
    migrate()
