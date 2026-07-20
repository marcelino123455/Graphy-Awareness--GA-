"""Genera recomendaciones personalizadas a partir del grafo de memoria de un usuario.
Demuestra el valor de negocio del esquema: conecta necesidades/miedos abstractos con
entidades concretas via tool calling forzado contra Qwen.
"""
import json

from graph_store import GraphStore
from qwen_client import chat_completion

_RECOMMEND_TOOL = {
    "type": "function",
    "function": {
        "name": "record_recommendations",
        "description": "Registra recomendaciones personalizadas basadas en el grafo de memoria del usuario.",
        "parameters": {
            "type": "object",
            "properties": {
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "Nombre corto de la recomendacion"},
                            "description": {"type": "string", "description": "1-2 frases, que es y por que le sirve"},
                            "reasoning": {"type": "string", "description": "Explica que nodos/aristas del grafo justifican esta recomendacion"},
                            "related_labels": {"type": "array", "items": {"type": "string"}, "description": "Labels de los nodos del grafo relacionados"},
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
    "Eres un motor de recomendaciones que razona sobre un grafo de memoria psicologica/de "
    "preferencias de un usuario. El grafo tiene nodos tipados (Need, Fear, Preference, Trait, "
    "Fact, Entity) y aristas que los conectan (satisfies, causes, relates_to, etc). "
    "Genera 3 a 5 recomendaciones concretas (productos, actividades, contenido o servicios) que "
    "conecten explicitamente una necesidad o miedo abstracto con algo accionable. Cada "
    "recomendacion debe justificar su razonamiento citando los nodos/aristas especificos del "
    "grafo que la sustentan. No inventes datos que no esten en el grafo."
)


def _graph_summary(store: GraphStore) -> str:
    lines = []
    for node_id, attrs in store.graph.nodes(data=True):
        if attrs.get("intensity", 0) <= 0.05:
            continue
        domain = f" [{attrs.get('domain')}]" if attrs.get("domain") else ""
        lines.append(f"- ({attrs.get('type')}){domain} \"{attrs.get('label')}\" (id={node_id})")

    lines.append("\nRelaciones:")
    for u, v, attrs in store.graph.edges(data=True):
        u_label = store.graph.nodes[u].get("label", u)
        v_label = store.graph.nodes[v].get("label", v)
        lines.append(f"- \"{u_label}\" -{attrs.get('type')}-> \"{v_label}\"")

    return "\n".join(lines) if lines else "(grafo vacio, sin memorias todavia)"


def generate_recommendations(user_id: str) -> list[dict]:
    store = GraphStore(user_id)
    store.apply_decay()
    store.save()

    summary = _graph_summary(store)
    if "vacio" in summary:
        return []

    completion = chat_completion(
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Grafo de memoria del usuario:\n\n{summary}"},
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
