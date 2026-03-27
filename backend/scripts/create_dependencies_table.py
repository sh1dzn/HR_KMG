"""Create goal_dependencies table."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy import text
from app.database import engine

def create_table():
    with engine.begin() as conn:
        for enum_name, values in [
            ("dependency_type_enum", "'blocks','relates_to','cascaded_from'"),
            ("dependency_status_enum", "'active','resolved','dismissed'"),
            ("dependency_created_by_enum", "'manual','ai_suggested','cascade'"),
        ]:
            conn.execute(text(f"DO $$ BEGIN CREATE TYPE {enum_name} AS ENUM ({values}); EXCEPTION WHEN duplicate_object THEN null; END $$;"))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS goal_dependencies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_goal_id UUID NOT NULL REFERENCES goals(goal_id),
                target_goal_id UUID NOT NULL REFERENCES goals(goal_id),
                dependency_type dependency_type_enum NOT NULL,
                status dependency_status_enum NOT NULL DEFAULT 'active',
                created_by dependency_created_by_enum NOT NULL DEFAULT 'manual',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_goal_dependency UNIQUE (source_goal_id, target_goal_id),
                CONSTRAINT ck_no_self_dependency CHECK (source_goal_id != target_goal_id)
            );
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_goal_deps_source ON goal_dependencies(source_goal_id);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_goal_deps_target ON goal_dependencies(target_goal_id);"))
    print("goal_dependencies table created.")

if __name__ == "__main__":
    create_table()
