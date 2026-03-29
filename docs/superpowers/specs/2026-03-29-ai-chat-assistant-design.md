# AI Chat Assistant - Design Spec

## Overview

Floating chat widget (bottom-right corner) with full conversation history. Role-based AI assistant that uses RAG over company documents (ВНД), knows employees, goals, and organizational structure.

## Roles & Capabilities

### Employee Assistant
- **System prompt focus**: Help with personal goals, explain ВНД documents, assist with SMART goal formulation, explain evaluation criteria
- **Data access**: Own goals, own department documents, general ВНД
- **Quick actions**: "Помоги сформулировать цель", "Объясни мою оценку", "Найди в ВНД"

### Manager Assistant
- **System prompt focus**: All employee features + team goal management, approval guidance, department analytics, cascading advice
- **Data access**: Team goals, department employees, department documents
- **Quick actions**: Employee quick actions + "Статус команды", "Помоги с каскадированием"

### Admin Assistant
- **System prompt focus**: All features + system-wide analytics, operations, integration guidance
- **Data access**: All employees, all goals, all documents, system stats
- **Quick actions**: Manager quick actions + "Общая аналитика", "Статус системы"

## Database Schema

### `chat_conversations`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | Integer | FK to employees |
| title | String(200) | Auto-generated from first message |
| created_at | DateTime | |
| updated_at | DateTime | |

### `chat_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| conversation_id | UUID | FK to chat_conversations |
| role | Enum | 'user', 'assistant' |
| content | Text | Message text |
| created_at | DateTime | |

## Backend API

### Endpoints (`/api/chat/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/conversations` | Create new conversation |
| GET | `/conversations` | List user's conversations (newest first) |
| DELETE | `/conversations/{id}` | Delete conversation |
| GET | `/conversations/{id}/messages` | Get messages for conversation |
| POST | `/conversations/{id}/messages` | Send user message, get AI response |

### AI Pipeline (per message)

1. Receive user message
2. Load conversation history (last 20 messages for context window)
3. Build role-based system prompt with:
   - Role description and constraints
   - RAG: search ВНД documents relevant to user query
   - Employee context (name, position, department)
   - If employee: own goals summary
   - If manager: team summary
   - If admin: system stats
4. Call LLM with conversation history + context
5. Save user message + assistant response
6. Auto-generate conversation title from first message (LLM call)
7. Return assistant response

## Frontend Component

### `ChatWidget.jsx`
- **Closed state**: Floating circular button (bottom-right, 56px), chat icon, pulse animation on first load
- **Open state**: Chat panel (400px wide, 600px tall, or full-screen on mobile)
- **Panel sections**:
  - Header: "AI Ассистент" title, conversation list toggle, close button
  - Conversation list (sidebar/dropdown): list of past conversations, "New chat" button
  - Messages area: scrollable, auto-scroll to bottom
  - Quick actions: role-based suggestion chips (shown when conversation is empty)
  - Input area: text input + send button

### Styling
- Uses existing design system (semantic CSS variables, `.card` class)
- Dark/light theme support via existing theme tokens
- Animation: slide-up on open, fade-out on close
- Z-index above sidebar overlay (z-50+)

## Constraints

- Max 20 messages sent as LLM context (older messages trimmed)
- Conversation title auto-generated after first user message
- No streaming (request-response, consistent with existing LLM service)
- No file uploads
- Messages are plain text (no markdown rendering needed for MVP, but nice to have)
