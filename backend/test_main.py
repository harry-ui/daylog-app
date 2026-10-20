"""运行：cd backend && pytest -q"""

import os

os.environ["ANTHROPIC_API_KEY"] = ""  # 测试用 mock 模式，不花钱

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from prompt import build_user_message  # noqa: E402

main.API_KEY = ""
client = TestClient(main.app)

SAMPLE = {
    "date": "2026-10-18",
    "stops": [
        {"start": "09:10", "end": "09:40", "place": "BU 校园", "photoCount": 2},
        {"start": "14:00", "end": "17:30", "place": "Boston Public Library", "photoCount": 5},
    ],
    "emotions": ["平静", "疲惫"],
    "note": "终于把作业写完了",
    "style": "diary",
}


def test_health():
    assert client.get("/health").json()["mode"] == "mock"


def test_generate_mock():
    r = client.post("/generate", json=SAMPLE)
    assert r.status_code == 200
    body = r.json()
    assert body["mock"] is True
    assert "Boston Public Library" in body["text"]


def test_rejects_bad_input():
    assert client.post("/generate", json={**SAMPLE, "date": "yesterday"}).status_code == 422
    assert client.post("/generate", json={**SAMPLE, "note": "x" * 501}).status_code == 422
    assert client.post("/generate", json={**SAMPLE, "style": "rap"}).status_code == 422


def test_prompt_contains_facts_and_wraps_note():
    msg = build_user_message(**{k: SAMPLE[k] for k in ["date", "stops", "emotions", "note", "style"]})
    assert "14:00–17:30  Boston Public Library（5 张照片）" in msg
    assert "<user_note>终于把作业写完了</user_note>" in msg
    assert "平静、疲惫" in msg


def test_prompt_without_photos():
    msg = build_user_message("2026-10-18", [], [], "", "poem")
    assert "没有带定位的照片" in msg
    assert "现代短诗" in msg


def test_generate_llm_path(monkeypatch):
    """不真的调用 API，用假的 client 检查请求参数和返回值解析。"""
    import types

    import anthropic

    captured = {}

    class FakeMessages:
        def create(self, **kwargs):
            captured.update(kwargs)
            block = types.SimpleNamespace(type="text", text="  下午在图书馆待了很久。  ")
            return types.SimpleNamespace(content=[block])

    class FakeClient:
        def __init__(self, api_key):
            self.messages = FakeMessages()

    monkeypatch.setattr(main, "API_KEY", "test-key")
    monkeypatch.setattr(anthropic, "Anthropic", FakeClient)

    r = client.post("/generate", json=SAMPLE)
    assert r.status_code == 200
    assert r.json() == {"text": "下午在图书馆待了很久。", "mock": False}
    assert captured["model"] == main.MODEL
    assert captured["system"] == main.SYSTEM_PROMPT
    assert "Boston Public Library" in captured["messages"][0]["content"]
