# HR AI Module - КМГ-КУМКОЛЬ - https://hr-kmg.silkroadtech.kz/

AI-модуль для работы с целями сотрудников: SMART-оценка, генерация целей по контексту сотрудника и внутренних документов (RAG), workflow согласования, alert-менеджер и аналитический дашборд по качеству целеполагания.

Проект адаптирован под хакатонный контур из [hackaton.md](hackaton.md) и работает поверх восстановленного PostgreSQL-дампа `mock_smart`.

## Что сейчас является источником истины

- Основная база данных: `mock_smart` в PostgreSQL
- Целевая схема: дамп из `sql/mock_smart 1 .sql`
- Backend больше не использует старый demo-seed как основной сценарий
- Frontend умеет работать:
  - локально через Vite proxy
  - в production через `VITE_API_BASE_URL`

## Стек

| Компонент | Технологии |
|-----------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, React Router |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| База данных | PostgreSQL 18 |
| RAG / поиск | ChromaDB |
| LLM | OpenAI API |
| Infra | Docker Compose, Caddy, Vercel |

## Актуальная архитектура

```text
Frontend (React/Vite)
  -> /api
Backend (FastAPI)
  -> PostgreSQL mock_smart
  -> ChromaDB
  -> OpenAI API
```

Основные модули:
- `frontend/src/pages/Home.jsx`
- `frontend/src/pages/GoalEvaluation.jsx`
- `frontend/src/pages/GoalGeneration.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/EmployeeGoals.jsx`
- `frontend/src/pages/Operations.jsx`
- `backend/app/api/*.py`

## Что умеет система

- SMART-оценка одной цели
- Переформулировка слабой формулировки
- Пакетная оценка целей сотрудника
- Генерация 3-5 целей по сотруднику, кварталу и фокус-направлениям
- Показ источника из документов и обоснования генерации
- Историческая достижимость (личная история сотрудника / бенчмарк подразделения)
- Workflow согласования цели: `submit`, `approve`, `reject`, `comment` + история событий/ревью
- Alert Manager по качеству и портфелю целей
- Дашборд зрелости целеполагания по подразделениям
- Просмотр и фильтрация целей сотрудников
- Mock-интеграции экспорта целей (`1c`, `sap`, `oracle`)
- Операционная страница: статус индекса ВНД, ручная переиндексация, экспорт в файл
- Темы интерфейса: `Light`, `Dark`, `System`

## Требования

- Docker + Docker Compose
- Node.js 18+
- npm 9+
- Python 3.11+ только если хочешь запускать backend без Docker
- PostgreSQL dump `sql/mock_smart 1 .sql`
- `OPENAI_API_KEY` для полноценных LLM-сценариев

## Быстрый старт через Docker Compose

### 1. Клонирование

```bash
git clone https://github.com/sh1dzn/HR_KMG.git
cd HR_KMG
```

### 2. Создай `.env`

Пример:

```env
POSTGRES_USER=hr_user
POSTGRES_PASSWORD=change_me
POSTGRES_DB=mock_smart
POSTGRES_PORT=5433

DATABASE_URL=postgresql://hr_user:change_me@127.0.0.1:5433/mock_smart

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

CHROMA_PERSIST_DIR=./chroma_data
CHROMA_COLLECTION_NAME=vnd_documents

DEBUG=true
APP_NAME=HR AI Module
APP_VERSION=1.0.0
```

### 3. Подними PostgreSQL и backend

```bash
docker compose up -d db backend
```

### 4. Восстанови дамп в `mock_smart`

Файл `sql/mock_smart 1 .sql` является custom dump PostgreSQL. Его нужно восстанавливать через `pg_restore`.

Пример через Docker:

```bash
docker run --rm \
  --network host \
  -v "$PWD/sql:/sql" \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  postgres:18-alpine \
  sh -lc 'pg_restore -h 127.0.0.1 -p 5433 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "/sql/mock_smart 1 .sql"'
```

Если база уже заполнена, сначала очисти или создай новый volume/контейнер PostgreSQL.

### 5. Проверка backend

```bash
curl http://127.0.0.1:8000/health
```

Ожидаемый ответ:

```json
{"status":"healthy","service":"HR AI Module","version":"1.0.0"}
```

Swagger:

```text
http://127.0.0.1:8000/docs
```

## Локальный запуск frontend

### Dev-режим

```bash
cd frontend
npm install
npm run dev
```

По умолчанию Vite поднимается на:

```text
http://localhost:5173
```

Если `VITE_API_BASE_URL` не задан, frontend использует локальный `/api` через Vite proxy.

### Production build

```bash
cd frontend
npm run build
```

## Локальный запуск backend без Docker

Если нужен запуск напрямую:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Важно:
- backend не должен создавать старую demo-схему
- схема должна уже существовать в PostgreSQL после восстановления дампа

## Frontend на Vercel

### Настройки проекта

- Root Directory: `frontend`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

### Переменные окружения Vercel

```env
VITE_API_BASE_URL=https://hr-ai.sh7dzn.me/api
```

Для SPA-routing добавлен:

- `frontend/vercel.json`

Он нужен, чтобы при прямом переходе на `/dashboard`, `/evaluation` и другие маршруты не было `404`.

## Backend через Caddy

Текущий публичный backend:

```text
https://hr-ai.sh7dzn.me
```

Полезные URL:

- health: `https://hr-ai.sh7dzn.me/health`
- docs: `https://hr-ai.sh7dzn.me/docs`
- api base: `https://hr-ai.sh7dzn.me/api`

## Автодеплой backend

Добавлен GitHub Actions workflow:

- [.github/workflows/deploy-backend.yml](.github/workflows/deploy-backend.yml)

И серверный скрипт:

- [deploy/redeploy_backend.sh](deploy/redeploy_backend.sh)

Что делает workflow:
- срабатывает на push в `main`
- если изменились `backend/**`, `docker-compose.yml` или deploy workflow
- подключается по SSH к серверу
- делает `git pull --ff-only`
- выполняет `docker compose up -d --build backend`

Нужные GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`

## Структура проекта

```text
HR_KMG/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   ├── vercel.json
│   └── vite.config.js
├── deploy/
│   └── redeploy_backend.sh
├── sql/
│   └── mock_smart 1 .sql
├── docker-compose.yml
├── hackaton.md
└── README.md
```

## Полезные команды

Проверка backend:

```bash
curl -s http://127.0.0.1:8000/health
```

Проверка сотрудников:

```bash
curl -s http://127.0.0.1:8000/api/employees/
```

Проверка дашборда:

```bash
curl -s "http://127.0.0.1:8000/api/dashboard/summary?quarter=Q2&year=2026"
```

Проверка статуса индекса ВНД (RAG):

```bash
curl -s http://127.0.0.1:8000/api/generation/index-status
```

Проверка алертов:

```bash
curl -s "http://127.0.0.1:8000/api/alerts/summary?quarter=Q2&year=2026"
```

Проверка систем интеграции:

```bash
curl -s http://127.0.0.1:8000/api/integrations/systems
```

Проверка workflow по цели:

```bash
curl -s http://127.0.0.1:8000/api/goals/<goal_id>/workflow
```

Пересборка только backend:

```bash
docker compose up -d --build backend
```

## Что устарело

Ниже перечислено то, на что больше не надо ориентироваться:

- старая SQLite/demo-конфигурация
- `hr_goals` как основная рабочая БД
- обязательный запуск `python -m app.seed_data` для свежей установки
- старые цифры про `58 сотрудников` и `120+ целей`
- локальный frontend по умолчанию на `3000` в dev-режиме

## Известные замечания

- для LLM-функций нужен рабочий `OPENAI_API_KEY`
- без OpenAI часть сценариев работает через fallback (эвристика + lexical search), а не через полноценный LLM/vector pipeline
- в `GET /api/goals` параметр `per_page` ограничен `<= 100`
- интеграции `1c/sap/oracle` сейчас реализованы как mock-экспорт, без полноценного внешнего auth/sync
- production build frontend сейчас собирается, но основной JS bundle крупный; позже можно сделать code splitting

## Дата актуализации

README актуализирован под состояние проекта на 16 марта 2026 года.
