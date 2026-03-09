# HR AI Module

## Модуль AI для управления целями сотрудников

Решение для хакатона "Внедрение ИИ в HR-процессы управления эффективностью персонала"

### Основные возможности

1. **Оценка целей по SMART** - автоматическая оценка целей по методологии SMART с детальным анализом каждого критерия
2. **Генерация целей** - AI-генерация целей на основе ВНД, стратегии компании и профиля сотрудника
3. **Дашборд качества** - аналитика качества целеполагания по подразделениям
4. **Пакетная оценка** - оценка всех целей сотрудника за период

### Технологический стек

- **Backend**: FastAPI (Python 3.11)
- **Frontend**: React 18 + Vite + TailwindCSS
- **Database**: PostgreSQL / SQLite
- **Vector DB**: ChromaDB
- **AI/LLM**: OpenAI GPT-4
- **Embeddings**: OpenAI text-embedding-3-small

---

## Быстрый старт

### Предварительные требования

- Python 3.11+
- Node.js 20+
- OpenAI API Key

### 1. Клонирование и настройка

```bash
# Создайте файл .env в корне проекта
cp .env.example .env

# Добавьте ваш OpenAI API ключ в .env
OPENAI_API_KEY=sk-your-api-key-here
```

### 2. Запуск Backend

```bash
cd backend

# Создайте виртуальное окружение
python -m venv venv

# Активируйте виртуальное окружение
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Установите зависимости
pip install -r requirements.txt

# Сгенерируйте демо-данные
python -m app.seed_data

# Запустите сервер
uvicorn app.main:app --reload --port 8000
```

Backend будет доступен по адресу: http://localhost:8000

API документация: http://localhost:8000/docs

### 3. Запуск Frontend

```bash
cd frontend

# Установите зависимости
npm install

# Запустите dev сервер
npm run dev
```

Frontend будет доступен по адресу: http://localhost:3000

---

## Docker Compose

Для запуска всего стека через Docker:

```bash
# Создайте .env файл с OPENAI_API_KEY
echo "OPENAI_API_KEY=sk-your-key" > .env

# Запустите контейнеры
docker-compose up -d

# Проверьте статус
docker-compose ps
```

Сервисы будут доступны:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432

---

## API Endpoints

### Оценка целей

```
POST /api/evaluation/evaluate
```
Оценка одной цели по SMART

```
POST /api/evaluation/evaluate-batch
```
Пакетная оценка целей сотрудника

```
POST /api/evaluation/reformulate
```
Переформулировка цели

### Генерация целей

```
POST /api/generation/generate
```
Генерация целей для сотрудника

```
GET /api/generation/focus-areas
```
Список фокус-направлений

### Дашборд

```
GET /api/dashboard/summary
```
Сводная статистика

```
GET /api/dashboard/department/{id}
```
Статистика по подразделению

### Цели

```
GET /api/goals/
```
Список целей

```
POST /api/goals/
```
Создание цели

```
PUT /api/goals/{id}
```
Обновление цели

---

## Структура проекта

```
hr_ai_module/
├── backend/
│   ├── app/
│   │   ├── api/           # API endpoints
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # AI services
│   │   ├── config.py      # Configuration
│   │   ├── database.py    # DB connection
│   │   ├── main.py        # FastAPI app
│   │   └── seed_data.py   # Demo data generator
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## MVP Функции

- [x] SMART-оценка одной цели через API
- [x] Переформулировка слабой цели
- [x] Генерация 3-5 целей по должности
- [x] Привязка целей к источнику ВНД
- [x] Пакетная оценка целей за квартал
- [x] Дашборд качества по подразделениям

---

## Авторы

Решение разработано в рамках хакатона по внедрению ИИ в HR-процессы.

**Март 2026**
