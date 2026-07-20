"""Cliente minimo para Qwen Cloud (endpoint OpenAI-compatible), via requests puro.
Evita el SDK openai (depende de pydantic-core/jiter, extensiones compiladas que
complican el deploy multiplataforma a Function Compute) sin perder funcionalidad:
soporta chat normal, streaming (SSE) y tool calling forzado.
"""
import json
import os

import requests


def _base_url() -> str:
    return os.environ.get("QWEN_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {os.environ['QWEN_API_KEY']}",
        "Content-Type": "application/json",
    }


def model_name() -> str:
    return os.environ.get("QWEN_MODEL", "qwen-max-2025-01-25")


def chat_completion(messages: list[dict], tools: list[dict] | None = None,
                     tool_choice=None) -> dict:
    """Llamada no streaming. Devuelve el JSON completo de la respuesta."""
    payload = {"model": model_name(), "messages": messages}
    if tools:
        payload["tools"] = tools
    if tool_choice:
        payload["tool_choice"] = tool_choice

    resp = requests.post(f"{_base_url()}/chat/completions", headers=_headers(), json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()


def chat_completion_stream(messages: list[dict]):
    """Generador que produce fragmentos de texto (delta) segun llegan del stream SSE."""
    payload = {"model": model_name(), "messages": messages, "stream": True}
    with requests.post(f"{_base_url()}/chat/completions", headers=_headers(), json=payload,
                        stream=True, timeout=60) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            data = line[len("data:"):].strip()
            if data == "[DONE]":
                break
            chunk = json.loads(data)
            choices = chunk.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta", {}).get("content")
            if delta:
                yield delta
