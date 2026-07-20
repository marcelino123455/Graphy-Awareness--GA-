"""Grafo de memoria por usuario, persistido en Alibaba Cloud Tablestore.
Ver .claude/skills/esquema-grafo-memoria/SKILL.md

Escrituras por fila (put_row por nodo/arista) en vez de reescribir un blob completo,
para evitar condiciones de carrera entre mensajes concurrentes del mismo usuario.
"""
import math
import time
import uuid

import networkx as nx
from tablestore import (
    INF_MAX,
    INF_MIN,
    Condition,
    Direction,
    Row,
    RowExistenceExpectation,
)

from tablestore_client import EDGES_TABLE, NODES_TABLE, get_client

NODE_TYPES = {"Need", "Fear", "Preference", "Trait", "Fact", "Entity"}
EDGE_TYPES = {"relates_to", "causes", "satisfies", "conflicts_with", "superseded_by", "mentioned_in"}

DECAY_HALF_LIFE_SECONDS = 30 * 24 * 3600  # una memoria no reforzada pierde la mitad de su peso en ~30 dias


def _scan_partition(client, table_name: str, user_id: str):
    """Trae todas las filas de un usuario (particion = user_id) via range scan, paginado."""
    id_column = "node_id" if table_name == NODES_TABLE else "edge_id"
    start_pk = [("user_id", user_id), (id_column, INF_MIN)]
    end_pk = [("user_id", user_id), (id_column, INF_MAX)]
    rows = []
    while start_pk is not None:
        _, next_start_pk, row_list, _ = client.get_range(
            table_name, Direction.FORWARD, start_pk, end_pk, columns_to_get=None, limit=200
        )
        rows.extend(row_list)
        start_pk = next_start_pk
    return rows


def _put_row(client, table_name: str, primary_key: list, attrs: dict):
    columns = [(k, v) for k, v in attrs.items() if v is not None]
    row = Row(primary_key, columns)
    client.put_row(table_name, row, Condition(RowExistenceExpectation.IGNORE))


class GraphStore:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.graph = nx.MultiDiGraph()
        self._dirty_nodes = set()
        self._dirty_edges = set()
        self._load()

    def _load(self):
        client = get_client()

        for row in _scan_partition(client, NODES_TABLE, self.user_id):
            node_id = row.primary_key[1][1]
            attrs = {c[0]: c[1] for c in row.attribute_columns}
            self.graph.add_node(node_id, **attrs)

        for row in _scan_partition(client, EDGES_TABLE, self.user_id):
            edge_id = row.primary_key[1][1]
            attrs = {c[0]: c[1] for c in row.attribute_columns}
            source = attrs.pop("source", None)
            target = attrs.pop("target", None)
            if source is None or target is None:
                continue
            self.graph.add_edge(source, target, key=edge_id, **attrs)

    def save(self):
        client = get_client()
        for node_id in self._dirty_nodes:
            if not self.graph.has_node(node_id):
                continue
            attrs = dict(self.graph.nodes[node_id])
            _put_row(client, NODES_TABLE, [("user_id", self.user_id), ("node_id", node_id)], attrs)

        for edge_id in self._dirty_edges:
            found = None
            for u, v, k, attrs in self.graph.edges(keys=True, data=True):
                if k == edge_id:
                    found = (u, v, attrs)
                    break
            if not found:
                continue
            u, v, attrs = found
            row_attrs = dict(attrs)
            row_attrs["source"] = u
            row_attrs["target"] = v
            _put_row(client, EDGES_TABLE, [("user_id", self.user_id), ("edge_id", edge_id)], row_attrs)

        self._dirty_nodes.clear()
        self._dirty_edges.clear()

    def upsert_node(self, label: str, node_type: str, domain: str | None = None,
                     confidence: float = 0.7, intensity: float = 0.5, evidence: str = ""):
        if node_type not in NODE_TYPES:
            raise ValueError(f"tipo de nodo invalido: {node_type}")

        existing_id = self._find_similar_node(label, node_type)
        now = time.time()

        if existing_id:
            attrs = self.graph.nodes[existing_id]
            attrs["frequency"] = attrs.get("frequency", 1) + 1
            attrs["last_seen"] = now
            attrs["confidence"] = max(attrs.get("confidence", 0.5), confidence)
            attrs["intensity"] = min(1.0, attrs.get("intensity", 0.5) + 0.15)
            if evidence:
                attrs["evidence"] = evidence
            self._dirty_nodes.add(existing_id)
            return existing_id

        node_id = f"{node_type.lower()}:{uuid.uuid4().hex[:8]}"
        self.graph.add_node(
            node_id,
            label=label,
            type=node_type,
            domain=domain,
            confidence=confidence,
            intensity=intensity,
            last_seen=now,
            frequency=1,
            evidence=evidence,
        )
        self._dirty_nodes.add(node_id)
        return node_id

    def _find_similar_node(self, label: str, node_type: str):
        label_norm = label.strip().lower()
        for n, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == node_type and attrs.get("label", "").strip().lower() == label_norm:
                return n
        return None

    def add_edge(self, source_id: str, target_id: str, edge_type: str, evidence: str = ""):
        if edge_type not in EDGE_TYPES:
            raise ValueError(f"tipo de arista invalido: {edge_type}")
        if not self.graph.has_node(source_id) or not self.graph.has_node(target_id):
            return
        edge_id = f"{source_id}|{edge_type}|{target_id}"
        self.graph.add_edge(source_id, target_id, key=edge_id, type=edge_type,
                             evidence=evidence, last_seen=time.time())
        self._dirty_edges.add(edge_id)

    def supersede(self, old_node_id: str, new_node_id: str):
        self.add_edge(new_node_id, old_node_id, "superseded_by")
        if self.graph.has_node(old_node_id):
            self.graph.nodes[old_node_id]["intensity"] = 0.0
            self._dirty_nodes.add(old_node_id)

    def apply_decay(self):
        """Pilar 2: decae confidence/intensity de nodos no reforzados recientemente."""
        now = time.time()
        for node_id, attrs in self.graph.nodes(data=True):
            last_seen = attrs.get("last_seen", now)
            elapsed = now - last_seen
            decay_factor = math.pow(0.5, elapsed / DECAY_HALF_LIFE_SECONDS)
            new_intensity = attrs.get("intensity", 0.5) * decay_factor
            new_confidence = max(0.1, attrs.get("confidence", 0.5) * (0.5 + 0.5 * decay_factor))
            if abs(new_intensity - attrs.get("intensity", 0.5)) > 1e-6:
                attrs["intensity"] = new_intensity
                attrs["confidence"] = new_confidence
                self._dirty_nodes.add(node_id)

    def relevant_context(self, top_k: int = 12) -> list[dict]:
        """Pilar 3: ranking por intensity + recencia para recall limitado por contexto."""
        now = time.time()
        scored = []
        for n, attrs in self.graph.nodes(data=True):
            if attrs.get("intensity", 0) <= 0.05:
                continue
            recency = math.exp(-(now - attrs.get("last_seen", now)) / DECAY_HALF_LIFE_SECONDS)
            score = attrs.get("intensity", 0.5) * 0.6 + recency * 0.3 + attrs.get("confidence", 0.5) * 0.1
            scored.append((score, n, attrs))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {"id": n, "label": a.get("label"), "type": a.get("type"), "domain": a.get("domain")}
            for _, n, a in scored[:top_k]
        ]

    def clear(self):
        """Borra todos los nodos y aristas del usuario, en Tablestore y en memoria."""
        client = get_client()
        for table_name, id_column in ((NODES_TABLE, "node_id"), (EDGES_TABLE, "edge_id")):
            for row in _scan_partition(client, table_name, self.user_id):
                row_id = row.primary_key[1][1]
                pk = [("user_id", self.user_id), (id_column, row_id)]
                client.delete_row(table_name, Row(pk), Condition(RowExistenceExpectation.IGNORE))

        self.graph = nx.MultiDiGraph()
        self._dirty_nodes.clear()
        self._dirty_edges.clear()

    def to_visual_json(self) -> dict:
        nodes = [{"id": n, **{k: v for k, v in attrs.items()}} for n, attrs in self.graph.nodes(data=True)]
        edges = [
            {"source": u, "target": v, "type": attrs.get("type")}
            for u, v, attrs in self.graph.edges(data=True)
        ]
        return {"nodes": nodes, "edges": edges}
