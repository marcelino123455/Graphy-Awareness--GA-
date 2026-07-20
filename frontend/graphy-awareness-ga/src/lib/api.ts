import type { ChatMessage, GraphData, Recommendation } from "./types";

// Same-origin, proxied through Next.js route handlers (src/app/api/*) so the
// Function Compute URL never appears in client-side requests. user_id is
// derived server-side from the verified Cognito access token, never sent by
// the client.

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchGraph(accessToken: string): Promise<GraphData> {
  const res = await fetch("/api/graph", { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch graph: ${res.status}`);
  return res.json();
}

export async function fetchRecommendations(accessToken: string): Promise<Recommendation[]> {
  const res = await fetch("/api/recommend", { headers: authHeaders(accessToken), cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch recommendations: ${res.status}`);
  const data = await res.json();
  return data.recommendations ?? [];
}

export async function clearGraph(accessToken: string): Promise<void> {
  const res = await fetch("/api/graph", { method: "DELETE", headers: authHeaders(accessToken) });
  if (!res.ok) throw new Error(`Failed to clear graph: ${res.status}`);
}

interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (memory: { nodes_added: number; edges_added: number } | null) => void;
  onError: (err: Error) => void;
}

/**
 * Consumes the SSE-formatted /api/chat response. Works whether the upstream
 * server sends true incremental chunks (local dev) or a single buffered
 * payload (prod FC), since we just parse "data: {...}" lines as they arrive.
 */
export async function sendChatMessage(
  accessToken: string,
  message: string,
  history: ChatMessage[],
  { onDelta, onDone, onError }: StreamCallbacks
): Promise<void> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
      body: JSON.stringify({ message, history }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice("data:".length).trim();
        if (!jsonStr) continue;

        const payload = JSON.parse(jsonStr);
        if (payload.delta) {
          onDelta(payload.delta as string);
        } else if (payload.done) {
          onDone(payload.memory ?? null);
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
