# HR AI Module - КМГ-КУМКОЛЬ

> https://hr-kmg.silkroadtech.kz/

AI-модуль для управления целями сотрудников: семантическая SMART-оценка, RAG-генерация целей по ВНД и стратегии, workflow согласования, Alert Manager и аналитический дашборд с квартальными трендами.

Проект адаптирован под хакатонный контур из [hackaton.md](hackaton.md) и работает поверх PostgreSQL-дампа `mock_smart`.

## Стек

| Компонент | Технологии |
|-----------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, React Router |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| База данных | PostgreSQL 18 |
| RAG / поиск | ChromaDB (гибридный: vector + lexical с RRF-merge) |
| LLM | OpenAI API (GPT-4o + text-embedding-3-small) |
| Infra | Docker Compose, Caddy, Vercel, GitHub Actions CI/CD |

## Архитектура

```text
Frontend (React/Vite)
  -> /api
Backend (FastAPI)
  ├── PostgreSQL mock_smart    — сотрудники, цели, workflow, документы
  ├── ChromaDB                 — векторный индекс ВНД для RAG
  └── OpenAI API               — LLM-оценка, генерация, эмбеддинги
      (fallback: семантические эвристики + лексический поиск)
```

### Middleware pipeline

Каждый запрос проходит через:
1. **CORS** — whitelist: `hr-kmg.silkroadtech.kz`, `localhost:5173/3000`
2. **RequestIdMiddleware** — `X-Request-ID` в каждом запросе/ответе
3. **RequestLoggingMiddleware** — structured log: метод, путь, статус, время
4. **Global Exception Handler** — 500 → JSON с `request_id`

## Что умеет система

### Оценка целей (SMART)
- Семантическая оценка по 5 критериям (конкретность, измеримость, достижимость, релевантность, срок)
- Анализ на основе бизнес-ключевых слов, конкретных глаголов, наличия объектов и метрик
- Переформулировка слабой формулировки
- Пакетная оценка целей сотрудника за квартал
- Определение типа цели: activity / output / impact
- Определение стратегической связки: strategic / functional / operational

### Генерация целей (RAG)
- Гибридный поиск ВНД: vector (cosine similarity) + lexical с Reciprocal Rank Fusion
- Генерация 3-5 целей по сотруднику, кварталу и фокус-направлениям
- Каскадирование от целей руководителя
- Показ источника (документ + фрагмент + обоснование)
- Историческая достижимость (личная история / бенчмарк подразделения)
- Дедупликация с существующими целями

### Workflow согласования
- Жизненный цикл: `draft` → `submitted` → `approved` / `rejected` → ...
- Действия: `submit`, `approve`, `reject`, `comment`
- Полный аудит-трейл: GoalEvent + GoalReview

### Alert Manager
- Алерты по SMART-индексу, стратегической связке, метрикам, срокам
- Портфельные алерты: сумма весов, количество целей, стагнация согласования
- Пагинация (page/per_page/total_pages)

### Аналитика и дашборд
- 5-факторный индекс зрелости (SMART, стратегия, тип, веса, количество)
- Квартальные тренды: LineChart с динамикой SMART и стратегических целей
- Детализация по подразделениям: SMART-индекс, зрелость, слабые критерии
- Executive Summary + Top Issues

### Интеграции
- Mock-экспорт целей в 1C:ЗУП, SAP SuccessFactors, Oracle HCM
- Каждая система формирует payload в своём формате
- Скачиваемый файл экспорта на фронтенде

### UI
- 6 страниц: Home, Evaluation, Generation, Dashboard, EmployeeGoals, Operations
- Темы: Light / Dark / System
- Мобильная адаптация (sidebar → overlay, таблицы → карточки)

## Требования

- Docker + Docker Compose
- Node.js 18+ / npm 9+ (для локального запуска frontend)
- Python 3.11+ (только если backend без Docker)
- PostgreSQL dump `sql/mock_smart 1 .sql`
- `OPENAI_API_KEY` для LLM-сценариев (без него работает fallback)

## Быстрый старт

### 1. Клонирование

```bash
git clone https://github.com/sh1dzn/HR_KMG.git
cd HR_KMG
```

### 2. Создать `.env`

```env
POSTGRES_USER=hr_user
POSTGRES_PASSWORD=change_me
POSTGRES_DB=mock_smart
POSTGRES_PORT=5433

DATABASE_URL=postgresql://hr_user:change_me@127.0.0.1:5433/mock_smart

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

CHROMA_PERSIST_DIR=./chroma_data
CHROMA_COLLECTION_NAME=vnd_documents

DEBUG=true
APP_NAME=HR AI Module
APP_VERSION=1.0.0
```

### 3. Поднять PostgreSQL и backend

```bash
docker compose up -d db backend
```

### 4. Восстановить дамп

```bash
docker run --rm \
  --network host \
  -v "$PWD/sql:/sql" \
  -e PGPASSWORD=change_me \
  postgres:18-alpine \
  sh -lc 'pg_restore -h 127.0.0.1 -p 5433 -U hr_user -d mock_smart "/sql/mock_smart 1 .sql"'
```

### 5. Проверить backend

```bash
curl -s http://127.0.0.1:8000/health | python3 -m json.tool
```

Ожидаемый ответ:

```json
{
    "status": "healthy",
    "service": "HR AI Module",
    "version": "1.0.0",
    "checks": {
        "database": "ok",
        "openai_configured": true,
        "chroma_chunks": 288
    }
}
```

Swagger UI: http://127.0.0.1:8000/docs
ReDoc: http://127.0.0.1:8000/redoc

### 6. Запустить frontend

```bash
cd frontend
npm install
npm run dev
```

Откроется на http://localhost:5173

## API-справка

### Служебные

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/` | Метаинформация сервиса |
| GET | `/health` | Health check (PostgreSQL + OpenAI + ChromaDB) |

### Сотрудники

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/employees/` | Список сотрудников с поиском |

### Цели (CRUD + Workflow)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/goals/` | Список целей с фильтрацией и пагинацией |
| GET | `/api/goals/{id}` | Одна цель с SMART-оценкой и алертами |
| POST | `/api/goals/` | Создать цель |
| PUT | `/api/goals/{id}` | Обновить цель |
| DELETE | `/api/goals/{id}` | Удалить цель |
| GET | `/api/goals/{id}/workflow` | История событий и ревью |
| POST | `/api/goals/{id}/submit` | Отправить на согласование |
| POST | `/api/goals/{id}/approve` | Утвердить |
| POST | `/api/goals/{id}/reject` | Вернуть на доработку |
| POST | `/api/goals/{id}/comment` | Добавить комментарий |

### Оценка целей (SMART)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/evaluation/evaluate` | Оценка одной цели |
| POST | `/api/evaluation/evaluate-batch` | Пакетная оценка по сотруднику |
| POST | `/api/evaluation/reformulate` | Переформулировка цели |

### Генерация целей (RAG)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/generation/generate` | Сгенерировать цели (без сохранения) |
| POST | `/api/generation/generate-and-save` | Сгенерировать и сохранить |
| POST | `/api/generation/save-accepted` | Сохранить принятые цели |
| GET | `/api/generation/documents` | Список доступных ВНД |
| GET | `/api/generation/index-status` | Статус ChromaDB индекса |
| POST | `/api/generation/reindex-documents` | Переиндексация ВНД |
| GET | `/api/generation/focus-areas` | Типовые фокус-направления |

### Аналитика и дашборд

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/dashboard/summary` | Сводка по организации |
| GET | `/api/dashboard/department/{id}` | Статистика подразделения |
| GET | `/api/dashboard/trends` | Тренды по кварталам (LineChart) |
| GET | `/api/dashboard/employees/{id}/goals-summary` | Портфель целей сотрудника |

### Алерты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/alerts/summary` | Алерты с пагинацией (`page`, `per_page`) |

### Интеграции

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/integrations/systems` | Доступные HR-системы |
| POST | `/api/integrations/export-goals` | Mock-экспорт целей |

## Структура проекта

```text
HR_KMG/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI routers (goals, evaluation, generation, dashboard, alerts, employees, integrations)
│   │   ├── models/           # SQLAlchemy ORM (Goal, Employee, Department, Document, GoalEvent, GoalReview)
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # Бизнес-логика (smart_evaluator, goal_generator, rag_service, alert_service, llm_service)
│   │   ├── utils/            # Утилиты (smart_heuristics, text_processing, document_scope, goal_context)
│   │   ├── config.py         # Настройки из .env
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── middleware.py      # RequestId + Logging middleware
│   │   └── main.py           # FastAPI app, CORS, health check
│   ├── tests/                # Тесты (pytest)
│   │   ├── conftest.py
│   │   └── test_smart_heuristics.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.js     # Axios API-клиент (все эндпоинты)
│   │   ├── components/       # UI-компоненты (SMARTScoreCard, EmployeePicker, KmgLogo)
│   │   ├── pages/            # 6 страниц (Home, GoalEvaluation, GoalGeneration, Dashboard, EmployeeGoals, Operations)
│   │   ├── App.jsx           # Роутинг, навигация, тема
│   │   └── main.jsx          # Entry point
│   ├── Dockerfile
│   ├── package.json
│   ├── vercel.json           # SPA fallback для Vercel
│   └── vite.config.js
├── deploy/
│   └── redeploy_backend.sh
├── sql/
│   └── mock_smart 1 .sql     # PostgreSQL custom dump
├── .github/workflows/
│   └── deploy-backend.yml    # CI/CD автодеплой
├── docker-compose.yml
├── hackaton.md
└── README.md
```

## Тестирование

```bash
cd backend
python3 -m pytest tests/ -v
```

Тесты покрывают:
- Семантическую SMART-оценку (хорошие / слабые / средние цели)
- Отдельные критерии (specific, measurable, achievable, relevant, time_bound)
- Влияние полей metric и deadline на оценку
- Edge cases (пустая строка, повторяющийся текст, английские цели)

## Деплой

### Frontend — Vercel

| Параметр | Значение |
|----------|----------|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment | `VITE_API_BASE_URL=https://hr-ai.sh7dzn.me/api` |

### Backend — Docker + Caddy

Публичный backend: https://hr-ai.sh7dzn.me

- health: `https://hr-ai.sh7dzn.me/health`
- docs: `https://hr-ai.sh7dzn.me/docs`
- api: `https://hr-ai.sh7dzn.me/api`

### CI/CD

GitHub Actions workflow (`.github/workflows/deploy-backend.yml`):
- Триггер: push в `main` с изменениями в `backend/**` или `docker-compose.yml`
- SSH на сервер → `git pull --ff-only` → `docker compose up -d --build backend`
- Secrets: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`

## Fallback-режим (без OpenAI)

Система полностью работает без `OPENAI_API_KEY`:

| Компонент | С OpenAI | Без OpenAI |
|-----------|----------|------------|
| SMART-оценка | GPT-4 + переформулировка | Семантические эвристики (keyword-based) |
| RAG-поиск | Гибридный (vector + lexical, RRF) | Только лексический поиск |
| Генерация целей | LLM по контексту ВНД | Fallback: цели из заголовков документов |
| Эмбеддинги | text-embedding-3-small | Не используются |

## Данные в дампе

| Таблица | Записей | Описание |
|---------|---------|----------|
| departments | 8 | Организационная структура |
| positions | 25 | Должности с грейдами |
| employees | 450 | Сотрудники с иерархией |
| documents | 160 | ВНД, стратегии, KPI-фреймворки |
| goals | 9 000 | Цели сотрудников |
| goal_events | 30 789 | Аудит-трейл целей |
| goal_reviews | 4 305 | Ревью руководителей |
| kpi_catalog | 13 | Справочник KPI |
| kpi_timeseries | 2 112 | Динамика KPI по подразделениям |
| projects | 34 | Проекты |
| employee_projects | 886 | Привязка сотрудников к проектам |

## Известные замечания

- Для LLM-функций нужен рабочий `OPENAI_API_KEY`
- В `GET /api/goals` параметр `per_page` ограничен `<= 100`
- Интеграции `1c/sap/oracle` реализованы как mock-экспорт
- Production JS bundle крупный (~730 KB); можно добавить code splitting

## Дата актуализации

README актуализирован под состояние проекта на 17 марта 2026 года.
