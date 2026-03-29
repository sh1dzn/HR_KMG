"""
Strategy Map API — extract strategic objectives and map goals to them
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.document import Document, DocumentType
from app.models.goal import Goal
from app.models.employee import Employee
from app.models.department import Department
from app.models.user import User
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service

logger = logging.getLogger("hr_ai.strategy")

router = APIRouter()


class StrategyAnalyzeRequest(BaseModel):
    quarter: Optional[str] = None
    year: Optional[int] = None
    model: Optional[str] = None


class FillGapRequest(BaseModel):
    objective: str = Field(..., description="Strategic objective text")
    department_id: int = Field(..., description="Target department ID")
    quarter: Optional[str] = None
    year: Optional[int] = None
    model: Optional[str] = None


@router.post("/analyze")
async def analyze_strategy(
    request: StrategyAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze strategy documents and map existing goals to strategic objectives.
    Returns a tree structure for visualization.
    """
    # 1. Load strategy documents
    strategy_docs = (
        db.query(Document)
        .filter(
            Document.is_active == True,
            Document.doc_type.in_([
                DocumentType.STRATEGY,
                DocumentType.VND,
                DocumentType.KPI_FRAMEWORK,
            ]),
        )
        .limit(10)
        .all()
    )

    if not strategy_docs:
        raise HTTPException(status_code=404, detail="Стратегические документы не найдены в базе")

    # Combine strategy text (first 3000 chars per doc)
    combined_text = "\n\n".join(
        f"## {doc.title}\n{(doc.content or '')[:3000]}"
        for doc in strategy_docs[:5]
    )

    # 2. Extract strategic objectives via LLM
    try:
        objectives_raw = await llm_service.complete_json(
            prompt=f"Проанализируй стратегические документы компании и выдели 5-7 КЛЮЧЕВЫХ стратегических целей/направлений.\n\nДокументы:\n{combined_text[:6000]}",
            system_prompt=(
                "Ты — эксперт по стратегическому планированию. Извлеки 5-7 ключевых стратегических целей из документов.\n"
                "Верни JSON:\n"
                '{"objectives": [{"id": 1, "title": "краткое название", "description": "описание в 1-2 предложениях"}]}\n'
                "Цели должны быть конкретными и относиться к бизнесу компании."
            ),
            temperature=0.3,
            model=request.model,
        )
    except Exception as e:
        logger.error(f"LLM extraction failed: {e}")
        # Fallback: use document titles as objectives
        objectives_raw = {
            "objectives": [
                {"id": i + 1, "title": doc.title, "description": (doc.content or "")[:150]}
                for i, doc in enumerate(strategy_docs[:6])
            ]
        }

    objectives = objectives_raw.get("objectives", [])
    if not objectives:
        raise HTTPException(status_code=500, detail="Не удалось извлечь стратегические цели")

    # 3. Load all goals and departments
    goal_query = db.query(Goal)
    if request.quarter:
        goal_query = goal_query.filter(Goal.quarter == request.quarter)
    if request.year:
        goal_query = goal_query.filter(Goal.year == request.year)
    all_goals = goal_query.all()

    departments = db.query(Department).filter(Department.is_active == True).all()
    dept_map = {d.id: d.name for d in departments}

    # Build employee lookup
    emp_ids = {g.employee_id for g in all_goals}
    employees = db.query(Employee).filter(Employee.id.in_(emp_ids)).all() if emp_ids else []
    emp_map = {e.id: e for e in employees}

    # 4. For each objective, find matching goals using keyword matching
    result_objectives = []

    for obj in objectives:
        obj_title = obj.get("title", "")
        obj_desc = obj.get("description", "")
        search_text = f"{obj_title} {obj_desc}".lower()

        # Simple keyword matching (fast, no LLM needed)
        keywords = [w for w in search_text.split() if len(w) > 3]

        matched_by_dept = {}
        for goal in all_goals:
            goal_text = (goal.goal_text or "").lower()
            # Score: how many objective keywords appear in goal text
            match_score = sum(1 for kw in keywords if kw in goal_text)
            if match_score >= 2 or (len(keywords) <= 3 and match_score >= 1):
                dept_id = None
                emp = emp_map.get(goal.employee_id)
                if emp:
                    dept_id = emp.department_id

                dept_name = dept_map.get(dept_id, "Без подразделения") if dept_id else "Без подразделения"

                if dept_name not in matched_by_dept:
                    matched_by_dept[dept_name] = []
                matched_by_dept[dept_name].append({
                    "id": str(goal.goal_id),
                    "text": goal.goal_text[:120],
                    "employee_name": emp.full_name if emp else None,
                    "status": goal.status.value if hasattr(goal.status, 'value') else str(goal.status),
                })

        # Build department nodes (include all depts, mark gaps)
        dept_nodes = []
        for dept in departments:
            goals_in_dept = matched_by_dept.get(dept.name, [])
            dept_nodes.append({
                "id": dept.id,
                "name": dept.name,
                "goals": goals_in_dept[:5],  # top 5 per dept
                "goal_count": len(goals_in_dept),
                "has_gap": len(goals_in_dept) == 0,
            })

        total_matched = sum(len(v) for v in matched_by_dept.values())
        coverage = min(1.0, total_matched / max(len(departments), 1) * 0.3)

        result_objectives.append({
            "id": obj.get("id", 0),
            "title": obj_title,
            "description": obj_desc,
            "coverage_score": round(coverage, 2),
            "total_goals_matched": total_matched,
            "departments": sorted(dept_nodes, key=lambda d: d["goal_count"], reverse=True),
        })

    # Summary stats
    total_gaps = sum(
        sum(1 for d in obj["departments"] if d["has_gap"])
        for obj in result_objectives
    )

    return {
        "objectives": result_objectives,
        "summary": {
            "total_objectives": len(result_objectives),
            "total_goals": len(all_goals),
            "total_departments": len(departments),
            "total_gaps": total_gaps,
            "source_documents": [{"title": d.title, "doc_type": d.doc_type.value if hasattr(d.doc_type, 'value') else str(d.doc_type)} for d in strategy_docs[:5]],
        },
    }
