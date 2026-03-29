"""
Chat API endpoints — AI Assistant with conversation history
"""
import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.chat import ChatConversation, ChatMessage, ChatMessageRole
from app.schemas.chat import (
    SendMessageRequest,
    SendMessageResponse,
    ChatMessageResponse,
    ConversationResponse,
    TokenUsageResponse,
)
from app.services.chat_service import chat_reply, generate_title

logger = logging.getLogger("hr_ai.chat")

router = APIRouter()


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(50, ge=1, le=100, description="Записей на страницу"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all conversations for the current user (newest first)."""
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == current_user.id)
        .order_by(ChatConversation.updated_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    result = []
    for conv in conversations:
        msg_count = db.query(func.count(ChatMessage.id)).filter(ChatMessage.conversation_id == conv.id).scalar()
        result.append(ConversationResponse(
            id=str(conv.id),
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=msg_count,
        ))

    return result


@router.post("/conversations/{conversation_id}/messages", response_model=SendMessageResponse)
async def send_message(
    conversation_id: UUID,
    request: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a message to an existing conversation and get AI response."""
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диалог не найден")

    # Save user message
    user_msg = ChatMessage(
        conversation_id=conversation.id,
        role=ChatMessageRole.USER,
        content=request.message,
    )
    db.add(user_msg)
    db.flush()

    # Generate AI response
    token_usage = None
    try:
        reply_payload = await chat_reply(current_user, db, conversation, request.message, model=request.model)
        reply = reply_payload.get("content", "")
        usage = reply_payload.get("usage")
        if usage:
            token_usage = TokenUsageResponse(**usage)
    except Exception as e:
        logger.error(f"Chat reply failed: {e}")
        reply = "Извините, произошла ошибка при генерации ответа. Попробуйте ещё раз."

    # Save assistant message
    assistant_msg = ChatMessage(
        conversation_id=conversation.id,
        role=ChatMessageRole.ASSISTANT,
        content=reply,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)
    db.refresh(conversation)

    return SendMessageResponse(
        user_message=ChatMessageResponse(
            id=str(user_msg.id), role=user_msg.role.value, content=user_msg.content, created_at=user_msg.created_at,
        ),
        assistant_message=ChatMessageResponse(
            id=str(assistant_msg.id), role=assistant_msg.role.value, content=assistant_msg.content, created_at=assistant_msg.created_at,
        ),
        conversation_id=str(conversation.id),
        title=conversation.title,
        token_usage=token_usage,
    )


@router.post("/conversations/new", response_model=SendMessageResponse)
async def create_conversation_and_send(
    request: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new conversation with the first message."""
    # Create conversation
    conversation = ChatConversation(
        user_id=current_user.id,
        title="Новый диалог",
    )
    db.add(conversation)
    db.flush()

    # Save user message
    user_msg = ChatMessage(
        conversation_id=conversation.id,
        role=ChatMessageRole.USER,
        content=request.message,
    )
    db.add(user_msg)
    db.flush()

    # Generate AI response
    token_usage = None
    try:
        reply_payload = await chat_reply(current_user, db, conversation, request.message, model=request.model)
        reply = reply_payload.get("content", "")
        usage = reply_payload.get("usage")
        if usage:
            token_usage = TokenUsageResponse(**usage)
    except Exception as e:
        logger.error(f"Chat reply failed: {e}")
        reply = "Извините, произошла ошибка при генерации ответа. Попробуйте ещё раз."

    # Save assistant message
    assistant_msg = ChatMessage(
        conversation_id=conversation.id,
        role=ChatMessageRole.ASSISTANT,
        content=reply,
    )
    db.add(assistant_msg)

    # Generate title asynchronously
    try:
        title = await generate_title(request.message, model=request.model)
        conversation.title = title
    except Exception:
        conversation.title = request.message[:50]

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)
    db.refresh(conversation)

    return SendMessageResponse(
        user_message=ChatMessageResponse(
            id=str(user_msg.id), role=user_msg.role.value, content=user_msg.content, created_at=user_msg.created_at,
        ),
        assistant_message=ChatMessageResponse(
            id=str(assistant_msg.id), role=assistant_msg.role.value, content=assistant_msg.content, created_at=assistant_msg.created_at,
        ),
        conversation_id=str(conversation.id),
        title=conversation.title,
        token_usage=token_usage,
    )


@router.get("/conversations/{conversation_id}/messages", response_model=List[ChatMessageResponse])
async def get_messages(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all messages for a conversation."""
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диалог не найден")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at)
        .all()
    )

    return [
        ChatMessageResponse(
            id=str(m.id), role=m.role.value, content=m.content, created_at=m.created_at,
        )
        for m in messages
    ]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.id == conversation_id, ChatConversation.user_id == current_user.id)
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Диалог не найден")

    db.delete(conversation)
    db.commit()
