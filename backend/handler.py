"""Entry point HTTP para Alibaba Cloud Function Compute (runtime administrado python3.10).
FC invoca handler(event, context) con event = bytes JSON estilo API Gateway HTTP v2
(rawPath, headers, queryParameters, body, requestContext.http.method). No hay WSGI
automatico para Flask en este modelo, asi que se construye el environ a mano y se
adapta la respuesta al formato {statusCode, headers, body, isBase64Encoded} que FC espera.
Localmente (python handler.py) se sigue usando el servidor de desarrollo de Flask.
"""
import base64
import json
import os
import sys
from io import BytesIO

try:
    import flask  # noqa: F401
except ImportError:
    # Deployado en FC: las dependencias Linux vendorizadas viven en vendor/, no en el .venv local.
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

from graph_store import GraphStore
from memory_extraction import extract_and_apply
from qwen_client import chat_completion_stream
from recommendations import generate_recommendations

app = Flask(__name__)
CORS(app)

_SYSTEM_PROMPT_TEMPLATE = (
    "Eres un asistente conversacional con memoria persistente del usuario. "
    "Usa la siguiente informacion recordada sobre el usuario para personalizar tus respuestas "
    "de forma natural, sin listarla explicitamente ni sonar robotico:\n\n{memory_context}\n\n"
    "Si no hay informacion relevante todavia, simplemente conversa con naturalidad."
)


def _format_memory_context(nodes: list[dict]) -> str:
    if not nodes:
        return "(sin memorias relevantes todavia)"
    lines = []
    for n in nodes:
        domain = f" [{n['domain']}]" if n.get("domain") else ""
        lines.append(f"- ({n['type']}){domain} {n['label']}")
    return "\n".join(lines)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/chat", methods=["POST"])
def chat():
    body = request.get_json(force=True) or {}
    user_id = body.get("user_id")
    message = body.get("message")
    history = body.get("history", [])  # memoria de corto plazo, la maneja el cliente

    if not user_id or not message:
        return jsonify({"error": "user_id y message son requeridos"}), 400

    store = GraphStore(user_id)
    store.apply_decay()

    memory_context = _format_memory_context(store.relevant_context(top_k=12))
    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(memory_context=memory_context)

    messages = [{"role": "system", "content": system_prompt}]
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    def generate():
        chunks = []
        for delta in chat_completion_stream(messages):
            chunks.append(delta)
            yield f"data: {json.dumps({'delta': delta})}\n\n"

        reply = "".join(chunks)
        extraction_result = extract_and_apply(message, reply, store)
        yield f"data: {json.dumps({'done': True, 'memory': extraction_result})}\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.route("/graph", methods=["GET"])
def graph():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id es requerido"}), 400
    store = GraphStore(user_id)
    return jsonify(store.to_visual_json())


@app.route("/graph", methods=["DELETE"])
def delete_graph():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id es requerido"}), 400
    store = GraphStore(user_id)
    store.clear()
    return jsonify({"status": "ok"})


@app.route("/recommend", methods=["GET"])
def recommend():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id es requerido"}), 400
    return jsonify({"recommendations": generate_recommendations(user_id)})


def _build_environ(payload: dict) -> dict:
    http_ctx = (payload.get("requestContext") or {}).get("http", {})
    method = http_ctx.get("method", "GET")
    path = payload.get("rawPath", "/")
    query_params = payload.get("queryParameters") or {}
    query_string = "&".join(f"{k}={v}" for k, v in query_params.items())
    headers = payload.get("headers") or {}

    raw_body = payload.get("body") or ""
    body_bytes = base64.b64decode(raw_body) if payload.get("isBase64Encoded") else raw_body.encode("utf-8")

    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "QUERY_STRING": query_string,
        "CONTENT_LENGTH": str(len(body_bytes)),
        "SERVER_NAME": headers.get("Host", "localhost").split(",")[0],
        "SERVER_PORT": "443",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": headers.get("X-Forwarded-Proto", "https"),
        "wsgi.input": BytesIO(body_bytes),
        "wsgi.errors": sys.stderr,
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }
    if "Content-Type" in headers:
        environ["CONTENT_TYPE"] = headers["Content-Type"]
    for key, value in headers.items():
        header_key = "HTTP_" + key.upper().replace("-", "_")
        if header_key not in ("HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"):
            environ[header_key] = value
    return environ


def handler(event, context):
    """Adaptador WSGI manual: FC no reconoce Flask nativamente en este runtime,
    asi que la respuesta se buffers completa (sin streaming real al cliente)."""
    payload = json.loads(event)
    environ = _build_environ(payload)

    captured = {}

    def start_response(status, response_headers, exc_info=None):
        captured["status"] = int(status.split(" ", 1)[0])
        captured["headers"] = dict(response_headers)

    body_bytes = b"".join(app(environ, start_response))

    try:
        body_text = body_bytes.decode("utf-8")
        is_b64 = False
    except UnicodeDecodeError:
        body_text = base64.b64encode(body_bytes).decode("ascii")
        is_b64 = True

    return {
        "statusCode": captured.get("status", 200),
        "headers": captured.get("headers", {}),
        "body": body_text,
        "isBase64Encoded": is_b64,
    }


if __name__ == "__main__":
    port = int(os.environ.get("FC_SERVER_PORT", 9000))
    app.run(host="0.0.0.0", port=port)
