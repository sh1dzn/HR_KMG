"""
Seed Data Script
Генерация демонстрационных данных для HR AI Module
"""
import random
from datetime import datetime, timedelta
from app.database import SessionLocal, init_db
from app.models import Department, Position, Employee, Goal, Document, GoalStatus, DocumentType
from app.services.rag_service import rag_service


def seed_departments(db):
    """Создать подразделения"""
    departments_data = [
        {"name": "Управление продаж", "code": "SALES", "parent_id": None},
        {"name": "IT-департамент", "code": "IT", "parent_id": None},
        {"name": "HR-департамент", "code": "HR", "parent_id": None},
        {"name": "Финансовый отдел", "code": "FIN", "parent_id": None},
        {"name": "Производственный департамент", "code": "PROD", "parent_id": None},
        {"name": "Отдел маркетинга", "code": "MKT", "parent_id": None},
        {"name": "Юридический отдел", "code": "LEGAL", "parent_id": None},
        {"name": "Отдел закупок", "code": "PROC", "parent_id": None},
    ]

    departments = []
    for data in departments_data:
        dept = Department(**data)
        db.add(dept)
        departments.append(dept)

    db.commit()
    for dept in departments:
        db.refresh(dept)

    print(f"✅ Создано {len(departments)} подразделений")
    return departments


def seed_positions(db):
    """Создать должности"""
    positions_data = [
        {"name": "Генеральный директор", "grade": "C"},
        {"name": "Директор департамента", "grade": "D"},
        {"name": "Руководитель отдела", "grade": "M1"},
        {"name": "Старший менеджер", "grade": "M2"},
        {"name": "Менеджер", "grade": "S1"},
        {"name": "Старший специалист", "grade": "S2"},
        {"name": "Специалист", "grade": "S3"},
        {"name": "Младший специалист", "grade": "J"},
        {"name": "Ведущий инженер", "grade": "E1"},
        {"name": "Инженер", "grade": "E2"},
        {"name": "Аналитик", "grade": "A1"},
        {"name": "Старший аналитик", "grade": "A2"},
        {"name": "Бухгалтер", "grade": "B1"},
        {"name": "Главный бухгалтер", "grade": "B2"},
        {"name": "Юрист", "grade": "L1"},
    ]

    positions = []
    for data in positions_data:
        pos = Position(**data)
        db.add(pos)
        positions.append(pos)

    db.commit()
    for pos in positions:
        db.refresh(pos)

    print(f"✅ Создано {len(positions)} должностей")
    return positions


def seed_employees(db, departments, positions):
    """Создать сотрудников"""
    first_names = ["Александр", "Мария", "Дмитрий", "Елена", "Сергей", "Анна", "Андрей", "Ольга",
                   "Максим", "Наталья", "Иван", "Екатерина", "Артём", "Татьяна", "Николай"]
    last_names = ["Иванов", "Петрова", "Сидоров", "Козлова", "Новиков", "Морозова", "Волков",
                  "Соколова", "Лебедев", "Кузнецова", "Попов", "Семенова", "Орлов", "Федорова"]

    employees = []

    # Create department heads first
    for i, dept in enumerate(departments):
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        emp = Employee(
            employee_code=f"EMP{1000 + i}",
            full_name=name,
            email=f"head_{dept.code.lower()}@company.ru",
            department_id=dept.id,
            position_id=positions[1].id,  # Director
            manager_id=None,
            hire_date=datetime.now() - timedelta(days=random.randint(365, 3650)),
            is_active=True
        )
        db.add(emp)
        employees.append(emp)

    db.commit()
    for emp in employees:
        db.refresh(emp)

    # Create regular employees
    for i in range(50):
        dept = random.choice(departments)
        pos = random.choice(positions[4:])  # Non-director positions
        head = next((e for e in employees if e.department_id == dept.id), None)

        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        emp = Employee(
            employee_code=f"EMP{2000 + i}",
            full_name=name,
            email=f"emp{2000 + i}@company.ru",
            department_id=dept.id,
            position_id=pos.id,
            manager_id=head.id if head else None,
            hire_date=datetime.now() - timedelta(days=random.randint(30, 2000)),
            is_active=True
        )
        db.add(emp)
        employees.append(emp)

    db.commit()
    for emp in employees:
        db.refresh(emp)

    print(f"✅ Создано {len(employees)} сотрудников")
    return employees


def seed_documents(db, departments):
    """Создать ВНД документы"""
    documents_data = [
        {
            "doc_type": DocumentType.STRATEGY,
            "title": "Стратегия развития компании 2024-2026",
            "content": """
            СТРАТЕГИЯ РАЗВИТИЯ КОМПАНИИ НА 2024-2026 ГОДЫ

            1. СТРАТЕГИЧЕСКИЕ ПРИОРИТЕТЫ
            1.1. Цифровая трансформация бизнес-процессов
            - Внедрение ERP-системы нового поколения
            - Автоматизация 80% рутинных операций к 2026 году
            - Развитие цифровых каналов взаимодействия с клиентами

            1.2. Операционная эффективность
            - Снижение операционных затрат на 15% к концу 2026 года
            - Оптимизация логистических процессов
            - Внедрение lean-методологий в производство

            1.3. Устойчивое развитие
            - Снижение углеродного следа на 20%
            - Переход на возобновляемые источники энергии
            - Программа ESG-трансформации

            2. КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ ЭФФЕКТИВНОСТИ
            - Рост выручки на 25% ежегодно
            - EBITDA margin не менее 20%
            - NPS не ниже 70 баллов
            - Текучесть персонала не более 10%

            3. ИНВЕСТИЦИИ В РАЗВИТИЕ
            - Модернизация производственных мощностей
            - Развитие R&D направления
            - Обучение и развитие персонала
            """,
            "keywords": "стратегия,цифровизация,эффективность,ESG,KPI",
            "department_scope": "SALES,IT,HR,FIN,PROD,MKT"
        },
        {
            "doc_type": DocumentType.KPI_FRAMEWORK,
            "title": "KPI-фреймворк отдела продаж",
            "content": """
            KPI-ФРЕЙМВОРК УПРАВЛЕНИЯ ПРОДАЖ

            1. КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ МЕНЕДЖЕРА ПО ПРОДАЖАМ
            - Объём продаж (план/факт)
            - Количество новых клиентов
            - Средний чек сделки
            - Конверсия лидов в сделки
            - Retention rate клиентов

            2. ПОКАЗАТЕЛИ РУКОВОДИТЕЛЯ ОТДЕЛА
            - Выполнение плана отделом
            - Развитие команды (обучение, продвижение)
            - Качество клиентской базы
            - Маржинальность продаж

            3. ЦЕЛЕВЫЕ ЗНАЧЕНИЯ НА 2026 ГОД
            - Рост продаж: +20% к предыдущему году
            - Привлечение новых клиентов: 50+ в квартал
            - Конверсия: не менее 25%
            - NPS клиентов: 75+
            """,
            "keywords": "продажи,KPI,клиенты,конверсия,план",
            "department_scope": "SALES"
        },
        {
            "doc_type": DocumentType.KPI_FRAMEWORK,
            "title": "KPI-фреймворк IT-департамента",
            "content": """
            KPI-ФРЕЙМВОРК IT-ДЕПАРТАМЕНТА

            1. ПОКАЗАТЕЛИ ИНФРАСТРУКТУРЫ
            - Uptime систем: не менее 99.5%
            - Время реакции на инциденты: до 15 минут
            - SLA выполнение: 95%+

            2. ПОКАЗАТЕЛИ РАЗРАБОТКИ
            - Velocity команды
            - Code review coverage: 100%
            - Количество критических багов в продакшене
            - Time to market новых фич

            3. ПОКАЗАТЕЛИ БЕЗОПАСНОСТИ
            - Количество инцидентов ИБ
            - Время устранения уязвимостей
            - Результаты пентестов

            4. ЦЕЛИ НА 2026 ГОД
            - Миграция 100% сервисов в облако
            - Внедрение CI/CD для всех проектов
            - Автоматизация 90% тестирования
            """,
            "keywords": "IT,разработка,инфраструктура,безопасность,автоматизация",
            "department_scope": "IT"
        },
        {
            "doc_type": DocumentType.POLICY,
            "title": "Политика управления персоналом",
            "content": """
            ПОЛИТИКА УПРАВЛЕНИЯ ПЕРСОНАЛОМ

            1. ПОДБОР И АДАПТАЦИЯ
            - Срок закрытия вакансий: до 30 дней
            - Качество найма (retention 1 год): 85%+
            - Удовлетворённость адаптацией: 4.5/5

            2. РАЗВИТИЕ И ОБУЧЕНИЕ
            - Минимум 40 часов обучения на сотрудника в год
            - Охват программами развития: 100%
            - Внутренние продвижения: не менее 30% вакансий

            3. ОЦЕНКА И МОТИВАЦИЯ
            - Ежеквартальная постановка целей
            - Годовая оценка эффективности
            - Прозрачная система вознаграждения

            4. КОРПОРАТИВНАЯ КУЛЬТУРА
            - eNPS не ниже 40
            - Вовлечённость персонала: 75%+
            - Участие в корпоративных инициативах
            """,
            "keywords": "HR,персонал,обучение,развитие,оценка,мотивация",
            "department_scope": "HR,SALES,IT,FIN,PROD,MKT"
        },
        {
            "doc_type": DocumentType.REGULATION,
            "title": "Регламент постановки и оценки целей",
            "content": """
            РЕГЛАМЕНТ ПОСТАНОВКИ И ОЦЕНКИ ЦЕЛЕЙ

            1. ОБЩИЕ ПОЛОЖЕНИЯ
            1.1. Цели сотрудников устанавливаются ежеквартально
            1.2. Каждый сотрудник должен иметь от 3 до 5 целей
            1.3. Суммарный вес целей должен составлять 100%

            2. ТРЕБОВАНИЯ К ЦЕЛЯМ
            2.1. Цели должны соответствовать методологии SMART
            2.2. Каждая цель должна быть связана со стратегией компании
            2.3. Приоритет отдаётся результатным целям (output/impact)

            3. ПРОЦЕСС СОГЛАСОВАНИЯ
            3.1. Сотрудник формулирует цели в системе
            3.2. Руководитель проверяет и согласовывает
            3.3. При отклонении цель возвращается на доработку

            4. ОЦЕНКА ВЫПОЛНЕНИЯ
            4.1. Ежемесячный check-in по прогрессу
            4.2. Квартальная оценка достижения
            4.3. Учёт результатов в годовом бонусе
            """,
            "keywords": "цели,SMART,оценка,KPI,регламент",
            "department_scope": "SALES,IT,HR,FIN,PROD,MKT,LEGAL,PROC"
        },
        {
            "doc_type": DocumentType.VND,
            "title": "Программа цифровой трансформации",
            "content": """
            ПРОГРАММА ЦИФРОВОЙ ТРАНСФОРМАЦИИ

            1. ЦЕЛИ ПРОГРАММЫ
            - Повышение операционной эффективности на 30%
            - Сокращение времени вывода продуктов на рынок
            - Улучшение клиентского опыта

            2. КЛЮЧЕВЫЕ ИНИЦИАТИВЫ
            2.1. Внедрение RPA (Robotic Process Automation)
            - Автоматизация финансовых операций
            - Автоматизация HR-процессов
            - Автоматизация закупок

            2.2. Развитие аналитики данных
            - Построение Data Lake
            - Внедрение BI-платформы
            - Предиктивная аналитика

            2.3. Цифровые каналы
            - Мобильное приложение для клиентов
            - Портал самообслуживания
            - Чат-боты и AI-ассистенты

            3. KPI ПРОГРАММЫ
            - Доля автоматизированных процессов: 80%
            - Время обработки запросов: -50%
            - Удовлетворённость цифровыми сервисами: 4.5/5
            """,
            "keywords": "цифровизация,автоматизация,RPA,аналитика,AI",
            "department_scope": "IT,FIN,HR,PROC"
        },
        {
            "doc_type": DocumentType.KPI_FRAMEWORK,
            "title": "KPI-фреймворк производства",
            "content": """
            KPI-ФРЕЙМВОРК ПРОИЗВОДСТВЕННОГО ДЕПАРТАМЕНТА

            1. ОПЕРАЦИОННЫЕ ПОКАЗАТЕЛИ
            - OEE (Overall Equipment Effectiveness): целевое 85%
            - Выполнение производственного плана: 98%+
            - Уровень брака: не более 0.5%
            - Время переналадки: -20% к базовому

            2. ПОКАЗАТЕЛИ БЕЗОПАСНОСТИ
            - LTIFR (Lost Time Injury Frequency Rate): 0
            - Количество инцидентов: 0
            - Охват обучением по ТБ: 100%

            3. ПОКАЗАТЕЛИ КАЧЕСТВА
            - Соответствие стандартам ISO
            - Количество рекламаций: снижение на 30%
            - Время устранения дефектов

            4. ЦЕЛИ НА 2026 ГОД
            - Внедрение предиктивного обслуживания
            - Цифровизация производственного учёта
            - Сертификация по ISO 14001
            """,
            "keywords": "производство,OEE,безопасность,качество,ISO",
            "department_scope": "PROD"
        },
        {
            "doc_type": DocumentType.VND,
            "title": "Программа развития талантов",
            "content": """
            ПРОГРАММА РАЗВИТИЯ ТАЛАНТОВ

            1. ЦЕЛИ ПРОГРАММЫ
            - Формирование кадрового резерва на ключевые позиции
            - Развитие лидерских компетенций
            - Удержание высокопотенциальных сотрудников

            2. КОМПОНЕНТЫ ПРОГРАММЫ
            2.1. Оценка потенциала
            - Assessment центры для HiPo
            - 360-градусная обратная связь
            - Карьерные диалоги

            2.2. Развивающие активности
            - Менторинг от топ-менеджмента
            - Кросс-функциональные проекты
            - MBA-программы для резервистов

            2.3. Карьерное продвижение
            - Ротация между подразделениями
            - Временные назначения
            - Внутренние продвижения

            3. ЦЕЛЕВЫЕ ПОКАЗАТЕЛИ
            - Охват HiPo программой: 100%
            - Заполнение ключевых вакансий изнутри: 60%
            - Retention HiPo: 95%
            """,
            "keywords": "таланты,развитие,карьера,резерв,HiPo,менторинг",
            "department_scope": "HR,SALES,IT,FIN,PROD,MKT"
        }
    ]

    documents = []
    for data in documents_data:
        doc = Document(
            doc_type=data["doc_type"],
            title=data["title"],
            content=data["content"],
            valid_from=datetime.now() - timedelta(days=30),
            valid_to=datetime.now() + timedelta(days=365),
            department_scope=data["department_scope"],
            keywords=data["keywords"],
            is_active=True
        )
        db.add(doc)
        documents.append(doc)

    db.commit()
    for doc in documents:
        db.refresh(doc)

    # Index documents in vector store
    print("📚 Индексация документов в векторную базу...")
    for doc in documents:
        rag_service.add_document(
            doc_id=doc.doc_id,
            content=doc.content,
            metadata={
                "title": doc.title,
                "doc_type": doc.doc_type.value,
                "department_scope": doc.department_scope,
                "keywords": doc.keywords
            }
        )

    print(f"✅ Создано и проиндексировано {len(documents)} документов")
    return documents


def seed_goals(db, employees):
    """Создать примеры целей"""
    # Good goals
    good_goals = [
        "Увеличить объём продаж на 20% к концу Q2 2026 за счёт привлечения 30 новых корпоративных клиентов",
        "Сократить время обработки заявок клиентов с 48 до 24 часов к 31 марта 2026",
        "Внедрить систему автоматизированного тестирования, обеспечив покрытие кода тестами на уровне 80% к концу Q1 2026",
        "Провести обучение 50 сотрудников новой ERP-системе с достижением 90% успешной сдачи итогового теста к 15 апреля 2026",
        "Снизить уровень брака на производстве с 2% до 0.5% к концу 2026 года через внедрение системы контроля качества",
    ]

    # Weak goals (for demonstration)
    weak_goals = [
        "Улучшить работу отдела",
        "Повысить эффективность",
        "Больше продавать",
        "Работать лучше",
        "Выполнять задачи качественно",
    ]

    # Medium goals
    medium_goals = [
        "Увеличить продажи в следующем квартале",
        "Провести обучение сотрудников",
        "Улучшить показатели KPI отдела на 10%",
        "Оптимизировать процессы работы с клиентами",
        "Внедрить новые инструменты автоматизации",
    ]

    all_goal_texts = good_goals * 3 + medium_goals * 4 + weak_goals * 2

    goals = []
    for i, emp in enumerate(employees[:30]):  # Create goals for first 30 employees
        num_goals = random.randint(3, 5)
        selected_goals = random.sample(all_goal_texts, num_goals)

        weights = generate_weights(num_goals)

        for j, goal_text in enumerate(selected_goals):
            goal = Goal(
                employee_id=emp.id,
                title=goal_text,
                weight=weights[j],
                quarter=random.choice(["Q1", "Q2"]),
                year=2026,
                status=random.choice([GoalStatus.DRAFT, GoalStatus.PENDING, GoalStatus.APPROVED]),
                smart_score=None,  # Will be evaluated later
            )
            db.add(goal)
            goals.append(goal)

    db.commit()
    for goal in goals:
        db.refresh(goal)

    print(f"✅ Создано {len(goals)} целей")
    return goals


def generate_weights(n: int) -> list:
    """Generate n weights that sum to 100"""
    weights = [random.randint(15, 35) for _ in range(n)]
    total = sum(weights)
    weights = [round(w / total * 100) for w in weights]

    # Adjust to ensure sum is exactly 100
    diff = 100 - sum(weights)
    weights[0] += diff

    return weights


def main():
    """Main seed function"""
    print("🌱 Начало генерации демонстрационных данных...")

    # Initialize database
    init_db()

    db = SessionLocal()

    try:
        # Check if data already exists
        existing_depts = db.query(Department).count()
        if existing_depts > 0:
            print("⚠️ Данные уже существуют. Пропускаем генерацию.")
            return

        # Seed data
        departments = seed_departments(db)
        positions = seed_positions(db)
        employees = seed_employees(db, departments, positions)
        documents = seed_documents(db, departments)
        goals = seed_goals(db, employees)

        print("\n✨ Генерация данных завершена!")
        print(f"   - Подразделений: {len(departments)}")
        print(f"   - Должностей: {len(positions)}")
        print(f"   - Сотрудников: {len(employees)}")
        print(f"   - Документов ВНД: {len(documents)}")
        print(f"   - Целей: {len(goals)}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
