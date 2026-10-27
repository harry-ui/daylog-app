"""DayLog 后端：接收 App 发来的当天摘要，调用大模型生成文字。

运行：
    cd backend
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env   # 填上 ANTHROPIC_API_KEY；不填就是 mock 模式
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import secrets
import time
from collections import defaultdict, deque
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from prompt import SYSTEM_PROMPT, build_user_message

load_dotenv()

API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
MODEL = os.getenv("DAYLOG_MODEL", "claude-haiku-5-5")  # 便宜、快，写短文够用
# App 请求时要带上 "Authorization: Bearer <token>"。接了真的大模型（会花钱）就必须设置。
API_TOKEN = os.getenv("DAYLOG_API_TOKEN", "").strip()
# 每个客户端在 RATE_WINDOW_S 秒内最多生成几次，防止被刷
RATE_LIMIT = int(os.getenv("DAYLOG_RATE_LIMIT", "20"))
RATE_WINDOW_S = 10 * 60

app = FastAPI(title="DayLog API")


class StopIn(BaseModel):
    start: str = Field(max_length=5)
    end: str = Field(max_length=5)
    place: str = Field(max_length=100)
    photoCount: int = Field(ge=0, le=1000)


class GenerateIn(BaseModel):
    # 限制长度和数量：防止有人拿你的接口刷 token
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    stops: list[StopIn] = Field(default_factory=list, max_length=30)
    emotions: list[str] = Field(default_factory=list, max_length=6)
    note: str = Field(default="", max_length=500)
    style: Literal["diary", "prose", "poem", "letter"] = "diary"


class GenerateOut(BaseModel):
    text: str
    mock: bool = False


@app.get("/health")
def health():
    return {"ok": True, "mode": "llm" if API_KEY else "mock", "model": MODEL, "auth": bool(API_TOKEN)}


def check_token(request: Request) -> None:
    if not API_TOKEN:
        if API_KEY:
            # 有 Key 没 token：同一个 Wi-Fi 里谁都能拿你的 Key 生成文字，直接拒绝
            raise HTTPException(status_code=503, detail="后端没有设置 DAYLOG_API_TOKEN，见 backend/.env.example")
        return  # mock 模式不花钱，不要求 token
    sent = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(sent.encode(), API_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="token 不对")


# 简单的内存限流：单进程够用，重启就清零。部署成多进程时要换成 Redis 之类。
_recent: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    q = _recent[key]
    while q and now - q[0] > RATE_WINDOW_S:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="请求太频繁")
    q.append(now)


def mock_text(req: GenerateIn) -> str:
    """没有 API Key 时返回的假数据，让你先把 App 整个流程跑通。"""
    places = "、".join(s.place for s in req.stops) or "家里"
    feel = "、".join(req.emotions) or "说不清"
    extra = f"想记下的一句话是：{req.note}" if req.note else ""
    return f"（mock 模式，还没接大模型）今天去了{places}，心情是{feel}。{extra}"


@app.post("/generate", response_model=GenerateOut, dependencies=[Depends(check_token), Depends(rate_limit)])
def generate(req: GenerateIn) -> GenerateOut:
    if not API_KEY:
        return GenerateOut(text=mock_text(req), mock=True)

    # 放在这里 import，mock 模式下不装 anthropic 也能跑
    import anthropic

    client = anthropic.Anthropic(api_key=API_KEY)
    user_msg = build_user_message(
        req.date, [s.model_dump() for s in req.stops], req.emotions, req.note, req.style
    )
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"大模型调用失败：{e.__class__.__name__}") from e

    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    if not text:
        raise HTTPException(status_code=502, detail="大模型没有返回内容")
    return GenerateOut(text=text)
