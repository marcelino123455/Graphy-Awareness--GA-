"""Generates personalized recommendations from a user's memory graph.
Demonstrates the schema's business value: connects abstract needs/fears to
concrete entities via forced tool calling against Qwen.
"""
import json

from graph_store import GraphStore
from qwen_client import chat_completion

_RECOMMEND_TOOL = {
    "type": "function",
    "function": {
        "name": "record_recommendations",
        "description": "Records personalized recommendations based on the user's memory graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "Short name of the recommendation"},
                            "description": {"type": "string", "description": "1-2 sentences: what it is and why it helps"},
                            "reasoning": {"type": "string", "description": "Explains which graph nodes/edges justify this recommendation"},
                            "related_labels": {"type": "array", "items": {"type": "string"}, "description": "Labels of the related graph nodes"},
                            "category": {"type": "string", "enum": ["product", "activity", "content", "service"]},
                        },
                        "required": ["title", "description", "reasoning", "category"],
                    },
                }
            },
            "required": ["recommendations"],
        },
    },
}

_SYSTEM_PROMPT = (
    "You are a recommendation engine that reasons over a user's psychological/preference "
    "memory graph. The graph has typed nodes (Need, Fear, Preference, Trait, "
    "Fact, Entity) and edges connecting them (satisfies, causes, relates_to, etc). "
    "Generate 3 to 5 concrete recommendations (products, activities, content, or services) that "
    "explicitly connect an abstract need or fear to something actionable. Each "
    "recommendation must justify its reasoning by citing the specific graph nodes/edges "
    "that support it. Do not invent data that is not in the graph. Respond in English."
)


def _graph_summary(store: GraphStore) -> str:
    lines = []
    for node_id, attrs in store.graph.nodes(data=True):
        if attrs.get("intensity", 0) <= 0.05:
            continue
        domain = f" [{attrs.get('domain')}]" if attrs.get("domain") else ""
        lines.append(f"- ({attrs.get('type')}){domain} \"{attrs.get('label')}\" (id={node_id})")

    lines.append("\nRelationships:")
    for u, v, attrs in store.graph.edges(data=True):
        u_label = store.graph.nodes[u].get("label", u)
        v_label = store.graph.nodes[v].get("label", v)
        lines.append(f"- \"{u_label}\" -{attrs.get('type')}-> \"{v_label}\"")

    return "\n".join(lines) if lines else "(empty graph, no memories yet)"


def generate_recommendations(user_id: str) -> list[dict]:
    store = GraphStore(user_id)
    store.apply_decay()
    store.save()

    summary = _graph_summary(store)
    if "empty graph" in summary:
        return []

    completion = chat_completion(
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"User's memory graph:\n\n{summary}"},
        ],
        tools=[_RECOMMEND_TOOL],
        tool_choice={"type": "function", "function": {"name": "record_recommendations"}},
    )

    choices = completion.get("choices") or []
    if not choices:
        return []
    message = choices[0].get("message", {})
    tool_calls = message.get("tool_calls") or []
    if not tool_calls:
        return []

    try:
        args = json.loads(tool_calls[0]["function"]["arguments"])
    except (json.JSONDecodeError, KeyError, IndexError):
        return []

    return args.get("recommendations", [])
