export type NodeType = "Need" | "Fear" | "Preference" | "Trait" | "Fact" | "Entity";

export type EdgeType =
  | "relates_to"
  | "causes"
  | "satisfies"
  | "conflicts_with"
  | "superseded_by"
  | "mentioned_in";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  domain?: string | null;
  confidence?: number;
  intensity?: number;
  last_seen?: number;
  frequency?: number;
  evidence?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Recommendation {
  title: string;
  description: string;
  reasoning: string;
  related_labels?: string[];
  category: "product" | "activity" | "content" | "service";
}
