"""Extrae actualizaciones del grafo de memoria a partir de un turno de conversacion.
Usa tool calling forzado contra Qwen para obtener JSON estructurado y confiable.
Esquema: .claude/skills/esquema-grafo-memoria/SKILL.md
"""
import json

from graph_store import GraphStore
from qwen_client import chat_completion

_EXTRACTION_TOOL = {
    "type": "function",
    "function": {
        "name": "record_memory_updates",
        "description": (
            "Registra nodos y aristas nuevas detectadas en el ultimo turno de la conversacion "
            "para el grafo de memoria del usuario. Solo incluye informacion nueva o reforzada, "
            "no repitas lo que ya es obvio o irrelevante."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "nodes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "Texto corto y normalizado, ej. 'miedo al fracaso academico'"},
                            "type": {"type": "string", "enum": ["Need", "Fear", "Preference", "Trait", "Fact", "Entity"]},
                            "domain": {"type": "string", "description": "work | study | health | social | other, o null"},
                            "confidence": {"type": "number", "description": "0 a 1, que tan seguro estas de que es cierto"},
                            "intensity": {"type": "number", "description": "0 a 1, que tan fuerte/relevante parece para el usuario"},
                            "evidence": {"type": "string", "description": "Cita corta del mensaje del usuario que lo sustenta"},
                        },
                        "required": ["label", "type"],
                    },
                },
                "edges": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "source_label": {"type": "string"},
                            "target_label": {"type": "string"},
                            "type": {"type": "string", "enum": ["relates_to", "causes", "satisfies", "conflicts_with", "superseded_by"]},
                        },
                        "required": ["source_label", "target_label", "type"],
                    },
                },
            },
            "required": ["nodes", "edges"],
        },
    },
}

_SYSTEM_PROMPT = (
    "Eres un extractor de memoria psicologica/de preferencias. Analiza el ultimo intercambio "
    "usuario-asistente y llama a record_memory_updates con lo relevante segun el esquema. "
    "Prioriza conectar necesidades/miedos abstractos con entidades concretas (marcas, actividades, "
    "productos) cuando sea posible via aristas 'satisfies' o 'relates_to'. Si no hay nada nuevo, "
    "llama la funcion con arrays vacios."
)


def extract_and_apply(user_message: str, assistant_reply: str, store: GraphStore) -> dict:
    completion = chat_completion(
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Usuario: {user_message}\nAsistente: {assistant_reply}"},
        ],
        tools=[_EXTRACTION_TOOL],
        tool_choice={"type": "function", "function": {"name": "record_memory_updates"}},
    )

    choices = completion.get("choices") or []
    if not choices:
        return {"nodes_added": 0, "edges_added": 0}

    message = choices[0].get("message", {})
    tool_calls = message.get("tool_calls") or []
    if not tool_calls:
        return {"nodes_added": 0, "edges_added": 0}

    try:
        args = json.loads(tool_calls[0]["function"]["arguments"])
    except (json.JSONDecodeError, KeyError, IndexError):
        return {"nodes_added": 0, "edges_added": 0}

    label_to_id = {}
    for node in args.get("nodes", []):
        label = node.get("label", "").strip()
        node_type = node.get("type")
        if not label or node_type not in {"Need", "Fear", "Preference", "Trait", "Fact", "Entity"}:
            continue
        node_id = store.upsert_node(
            label=label,
            node_type=node_type,
            domain=node.get("domain"),
            confidence=float(node.get("confidence", 0.7)),
            intensity=float(node.get("intensity", 0.5)),
            evidence=node.get("evidence", ""),
        )
        label_to_id[label.strip().lower()] = node_id

    edges_added = 0
    for edge in args.get("edges", []):
        source_id = label_to_id.get(edge.get("source_label", "").strip().lower())
        target_id = label_to_id.get(edge.get("target_label", "").strip().lower())
        edge_type = edge.get("type")
        if source_id and target_id and edge_type:
            store.add_edge(source_id, target_id, edge_type)
            edges_added += 1

    store.apply_decay()
    store.save()
    return {"nodes_added": len(label_to_id), "edges_added": edges_added}
