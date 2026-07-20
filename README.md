# Graphy Awareness (GA)

A conversational agent with persistent, explainable memory. Every exchange is distilled into a typed **memory graph** (needs, fears, preferences, traits, facts, concrete entities) that grows across sessions, decays when unused, and is used both to personalize the conversation and to justify recommendations ("why is this graph useful").

Track: **MemoryAgent** — Qwen Cloud Hackathon.

---

## Backend (`/backend`)

Python, deployed as an **Alibaba Cloud Function Compute** HTTP function. This is where the actual engineering lives.

### Memory graph schema

Single graph per user (no per-domain graphs — domain is a node attribute, not a partition).

- **Node types**: `Need`, `Fear`, `Preference`, `Trait`, `Fact`, `Entity`. `Entity` is the bridge from an abstract driver (a fear, a need) to something concrete and actionable (a brand, activity, product) — this is what makes the graph useful for recommendations, not just profiling.
- **Edge types**: `relates_to`, `causes`, `satisfies`, `conflicts_with`, `superseded_by`, `mentioned_in`.
- **Node metadata**: `confidence`, `intensity`, `last_seen`, `frequency`, `evidence` (verbatim quote — traceability).

Implementation: `graph_store.py` builds an in-memory `networkx.MultiDiGraph` per request from Tablestore rows, exposes `upsert_node`, `add_edge`, `supersede`, `apply_decay`, `relevant_context`.

### The three memory pillars

1. **Efficient storage & retrieval** — nodes/edges are separate rows in Tablestore (`user_id` partition key), not a JSON blob, so writes are atomic per-node and reads are a single partition range-scan. `relevant_context()` ranks nodes by `intensity * 0.6 + recency * 0.3 + confidence * 0.1` before injecting them into the LLM prompt, instead of dumping the whole graph.
2. **Forgetting** — `apply_decay()` runs on every request: `intensity`/`confidence` decay exponentially (30-day half-life) based on `last_seen`. Nodes below an intensity threshold silently drop out of context. Contradictions are resolved explicitly via a `superseded_by` edge (the old node's intensity is zeroed) rather than left to average out.
3. **Recall under limited context** — the chat prompt only ever receives the top-k ranked nodes (`relevant_context(top_k=12)`), not the full graph, so the context footprint stays bounded as memory grows.

### Why the backend is built the way it is (Function Compute constraints)

Several decisions exist specifically because of how FC's Python runtime behaves — they are not arbitrary:

- **`qwen_client.py` uses raw `requests`, not the `openai` SDK.** The SDK pulls in `pydantic-core` / `jiter` (Rust extensions) which need a Linux build; `requests` and its dependency tree are pure Python, so the deployment package works cross-platform without Docker.
- **`vendor/` directory, added to `sys.path` at runtime only if the import fails locally.** Dependencies are pip-installed with `--platform manylinux2014_x86_64 --only-binary=:all:` directly into `backend/vendor/`, kept separate from the local `.venv` so Windows dev and Linux deployment never shadow each other.
- **Manual WSGI adapter in `handler.py`.** FC's managed `python3.10` runtime does not do automatic WSGI bridging for Flask — it calls `handler(event, context)` with `event` as a raw JSON payload (API-Gateway-v2-style: `rawPath`, `headers`, `queryParameters`, `body`, `requestContext.http.method`). `handler()` builds a real WSGI `environ` from that payload, drives the Flask app, and reshapes the response into `{statusCode, headers, body, isBase64Encoded}`.
- **`/chat` streams SSE from Qwen, but the response is buffered when deployed** — FC's classic invocation model returns one full response per invocation, so token-by-token streaming only happens in local dev (`python handler.py`, a real socket server). The frontend's SSE parser handles both transparently.
- **Tablestore over a single JSON blob in OSS** — per-row `put_row`/`get_range` avoids the read-modify-write race that a whole-file blob would have under concurrent requests from the same user.

### Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/chat` | POST | `{user_id, message, history}` → SSE stream of `delta` chunks, then `{done, memory}`. Also runs extraction (forced tool-call) and writes the graph. |
| `/graph` | GET | `?user_id=` → full graph as `{nodes, edges}` for visualization. |
| `/recommend` | GET | `?user_id=` → LLM-generated recommendations, each with `reasoning` that cites the specific nodes/edges that justify it. |
| `/health` | GET | liveness check. |

### Run locally

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env   # fill QWEN_API_KEY, TABLESTORE_*
python handler.py      # http://localhost:9000, real streaming
```

### Deploy

```bash
cd backend
pip install -r requirements.txt --target vendor \
  --platform manylinux2014_x86_64 --only-binary=:all:
s deploy -y
```

`s.yaml` targets `runtime: python3.10`, `handler: handler.app` is unused — the real entry point is the `handler(event, context)` function described above.

---

## Frontend (`/frontend/graphy-awareness-ga`)

Next.js 16 (App Router, Turbopack) + React 19, deployed to Vercel.

- **Sidebar** — two views, `Chat` and `Insights`; collapses to an icon rail on selection, with a manual expand/collapse toggle.
- **Chat view** — conversation on the left, the user's live memory graph on the right; the graph refetches and re-renders after every reply.
- **Insights view** — full graph + AI-generated recommendation cards; hovering a card highlights the graph nodes it cites (`related_labels` match).
- **`GraphCanvas`** — a hand-rolled force-directed graph (`d3-force` + SVG, no charting library) with drag, zoom/pan, and a click-to-inspect tooltip (label, evidence, confidence, intensity). Chosen over a graph-viz package to avoid dependency-compatibility risk on a brand-new Next/React version.
- **Auth** — AWS Cognito (Hosted UI, Authorization Code + PKCE) via `react-oidc-context`. `user_id` is the Cognito `sub` claim, not a generated id — this is what lets a second session, on any device, prove real cross-session memory recall in the demo. `AuthGate` blocks the dashboard until signed in; sign-out clears both the local session and the Cognito Hosted UI session.
- **API proxy** — the client never talks to Function Compute directly. `app/api/{chat,graph,recommend}/route.ts` verify the Cognito access token server-side (`jose` against the pool's JWKS) and derive `user_id` from the verified `sub` — the client can't spoof another user's id even by editing requests in devtools. The FC URL lives in the server-only `API_BASE_URL` env var and never reaches the browser (verified: zero client requests to `*.fcapp.run`, string absent from every served JS bundle).

### Run locally

```bash
cd frontend/graphy-awareness-ga
pnpm install
cp .env.example .env.local   # fill NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_COGNITO_*
pnpm dev   # http://localhost:3000
```
