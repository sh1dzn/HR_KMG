# Auth & Login Architecture for HR_KMG

**Date:** 2026-03-26
**Status:** Approved
**Approach:** Minimal auth layer integrated into existing FastAPI + React app

---

## Context

HR_KMG is an AI-powered HR goal management system (FastAPI + React + PostgreSQL) with 450 employees, 9K+ goals, and zero authentication. All API endpoints are publicly accessible. This design adds JWT-based authentication with role-based access control using the existing PostgreSQL database in Docker.

## Decisions

- **JWT access + refresh tokens** — access token (15min) in memory, refresh token (7 days) in httpOnly cookie
- **Three roles:** employee, manager, admin
- **Seed all 450 employees** with default passwords, force change on first login
- **Admin-only account creation** going forward
- **No email infrastructure** — admin handles password resets manually
- **No new Docker services** — everything in existing PostgreSQL + FastAPI + React

---

## 1. Data Model

### `users` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, default uuid4 |
| email | VARCHAR(255) | unique, NOT NULL, from employees.email |
| password_hash | VARCHAR(255) | bcrypt, NOT NULL |
| employee_id | BIGINT FK | references employees.id, unique, NOT NULL |
| role | ENUM('employee','manager','admin') | NOT NULL, default 'employee' |
| is_active | BOOLEAN | default true |
| must_change_password | BOOLEAN | default true |
| created_at | TIMESTAMP | default now() |
| updated_at | TIMESTAMP | default now(), on update |

### `refresh_tokens` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, default uuid4 |
| user_id | UUID FK | references users.id, ON DELETE CASCADE |
| token_hash | VARCHAR(255) | bcrypt hash of refresh token |
| expires_at | TIMESTAMP | 7 days from creation |
| created_at | TIMESTAMP | default now() |

### Role assignment (seed)

- Employees who are referenced as `manager_id` by other employees -> `manager`
- All others -> `employee`
- 1-2 manually configured -> `admin`

### Relationship

`users.employee_id` -> `employees.id` is 1:1. The existing `employees` table is not modified.

---

## 2. Backend Architecture

### New files

**`backend/app/models/user.py`**
SQLAlchemy models for `User` and `RefreshToken`. User has relationship to `Employee` model.

**`backend/app/api/auth.py`**
Auth router:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | public | Email + password -> access token (JSON body) + refresh token (httpOnly cookie) |
| `/api/auth/refresh` | POST | cookie | Refresh cookie -> new access token + rotated refresh token |
| `/api/auth/logout` | POST | authenticated | Invalidate refresh token, clear cookie |
| `/api/auth/me` | GET | authenticated | Return current user profile, role, employee info |
| `/api/auth/change-password` | POST | authenticated | Old + new password, clears `must_change_password` flag |

**`backend/app/services/auth_service.py`**
Business logic:
- `authenticate(email, password)` — verify credentials, return user or raise
- `create_tokens(user)` — JWT access token (15min) + refresh token (7 days), store refresh hash in DB
- `refresh_access_token(refresh_token)` — validate, rotate (invalidate old, issue new), return new pair
- `hash_password(plain)` / `verify_password(plain, hashed)` — bcrypt via passlib
- `revoke_refresh_token(token)` — delete from DB (logout)
- `cleanup_expired_tokens()` — delete expired refresh_tokens rows

**`backend/app/dependencies/auth.py`**
FastAPI dependencies:
- `get_current_user` — decode JWT from `Authorization: Bearer <token>`, query user from DB, raise 401 if invalid
- `require_role(role)` — returns dependency that checks `user.role == role`, raises 403
- `require_roles(*roles)` — returns dependency that checks `user.role in roles`, raises 403

### JWT token payload

```json
{
  "sub": "<user.id UUID>",
  "role": "employee|manager|admin",
  "employee_id": 123,
  "exp": 1234567890
}
```

### Refresh token cookie

```
Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800
```

### Route protection

| Router | Required Role | Data Scoping |
|--------|--------------|--------------|
| `/api/auth/login`, `/api/auth/refresh` | public | — |
| `/api/auth/me`, `/api/auth/logout`, `/api/auth/change-password` | any authenticated | own data |
| `/api/goals/*` | employee+ | employees: own goals; managers: own + subordinates; admin: all |
| `/api/evaluation/*` | employee+ | — |
| `/api/generation/*` | employee+ | — |
| `/api/dashboard/*` | manager+ | managers: own department; admin: all |
| `/api/alerts/*` | manager+ | managers: own department; admin: all |
| `/api/employees/*` | manager+ | managers: subordinates; admin: all |
| `/api/integrations/*` | admin | all |

### Data scoping implementation

Add `employee_id` and `role` filtering in existing query functions:
- **employee**: `WHERE goals.employee_id = current_user.employee_id`
- **manager**: `WHERE goals.employee_id IN (current_user.employee_id, ...subordinate_ids)` using `employees.manager_id` hierarchy
- **admin**: no filter

### Rate limiting

- `/api/auth/login`: 5 requests per minute per IP
- Implemented via simple in-memory counter (sufficient for 450 users)
- Returns 429 Too Many Requests when exceeded

### New dependencies

- `python-jose[cryptography]` — JWT encode/decode
- `passlib[bcrypt]` — password hashing

### New environment variables

```env
JWT_SECRET_KEY=<random 64-char string>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
DEFAULT_SEED_PASSWORD=KMG2026!
```

---

## 3. Frontend Architecture

### New files

**`frontend/src/pages/Login.jsx`**
- Email + password form
- Error display on 401
- Branded with KMG logo, respects dark/light theme
- No "register" link — admin creates accounts

**`frontend/src/pages/ChangePassword.jsx`**
- Old password + new password + confirm new password
- Validation: min 8 chars, must differ from old
- On success: clears `must_change_password`, redirects to home

**`frontend/src/contexts/AuthContext.jsx`**
React context providing:
- State: `user`, `role`, `isAuthenticated`, `loading`
- Methods: `login(email, password)`, `logout()`, `refreshToken()`
- On mount: calls `/api/auth/refresh` to restore session from cookie
- If refresh fails: sets `isAuthenticated = false`, shows login

### Changes to existing files

**`frontend/src/api/client.js`:**
- Request interceptor: attach `Authorization: Bearer <accessToken>` header
- Response interceptor: on 401, attempt `/api/auth/refresh`, retry original request. If refresh fails, redirect to `/login`
- Store access token in module-level variable (not localStorage)

**`frontend/src/App.jsx`:**
- Wrap entire app in `<AuthProvider>`
- Add `<ProtectedRoute>` component that checks `isAuthenticated` + allowed roles
- Add routes: `/login`, `/change-password`
- Sidebar: conditionally render nav items based on `role`
- Show user name + role in sidebar footer, with logout button

### Role-based navigation

| Page | Route | Employee | Manager | Admin |
|------|-------|----------|---------|-------|
| Login | /login | public | public | public |
| Change Password | /change-password | yes | yes | yes |
| Home | / | yes | yes | yes |
| Goal Evaluation | /evaluation | yes | yes | yes |
| Goal Generation | /generation | yes | yes | yes |
| Employee Goals | /employees | own only | + subordinates | all |
| Approvals | /approvals | own submissions | + approve/reject | all |
| Dashboard | /dashboard | hidden | yes | yes |
| Operations | /operations | hidden | hidden | yes |
| Settings | /settings | yes | yes | yes |

### UX flow

1. App loads -> `AuthContext` tries silent refresh via httpOnly cookie
2. No valid session -> redirect to `/login`
3. User submits email + password -> POST `/api/auth/login`
4. Success + `must_change_password=true` -> redirect to `/change-password`
5. Password changed -> redirect to `/`
6. Normal authenticated session -> app renders with role-scoped nav
7. Access token expires -> interceptor refreshes silently via cookie
8. Refresh token expires -> redirect to `/login`

---

## 4. Seed Script

**`backend/scripts/seed_users.py`**

Run once to create accounts for all existing employees:

1. Query all active employees from `employees` table
2. For each employee:
   - Skip if `users` record with that `employee_id` already exists
   - Determine role: `manager` if any employee has `manager_id` pointing to them, else `employee`
   - Create `users` record: email from employee, bcrypt hash of `DEFAULT_SEED_PASSWORD`, `must_change_password=true`
3. Optionally designate admin(s) via CLI arg or env var (e.g., `ADMIN_EMPLOYEE_IDS=1,2`)
4. Print summary: created N users (X employees, Y managers, Z admins)

Invocation: `python -m scripts.seed_users` from backend directory.
Admin designation: `ADMIN_EMPLOYEE_IDS` env var (comma-separated employee IDs). If not set, no admins are created — must be set explicitly.

---

## 5. Database Migration

Use Alembic for schema changes:

**Migration: `add_users_and_refresh_tokens`**
- Create `userrole` enum type
- Create `users` table with all columns and constraints
- Create `refresh_tokens` table with FK to users
- Add indexes: `users.email` (unique), `users.employee_id` (unique), `refresh_tokens.user_id`, `refresh_tokens.expires_at`

---

## 6. Security Measures

| Measure | Implementation |
|---------|---------------|
| Password hashing | bcrypt via passlib, cost factor 12 |
| Token signing | HS256 with `JWT_SECRET_KEY` env var |
| Refresh token storage | bcrypt hash in DB, not plain text |
| Refresh token rotation | Old token invalidated on each refresh |
| Cookie security | HttpOnly, Secure, SameSite=Strict, Path=/api/auth |
| Rate limiting | 5 login attempts/min/IP, in-memory counter |
| CORS | Existing whitelist unchanged |
| Forced password change | `must_change_password` flag on seeded accounts |
| Expired token cleanup | On each refresh call + periodic cleanup |

---

## 7. What Is NOT In Scope

- Email-based password reset (no email infrastructure)
- Self-registration (admin-only account creation)
- SSO / LDAP / OAuth2 providers
- Two-factor authentication
- Audit logging of auth events (can be added later)
- Changes to Docker Compose (same 3 services)
- Refactoring existing code beyond what auth integration requires
