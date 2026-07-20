"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import { fetchGraph, sendChatMessage } from "@/lib/api";
import type { ChatMessage, GraphData } from "@/lib/types";
import GraphCanvas from "./GraphCanvas";

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] };

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12h16M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatView() {
  const auth = useAuth();
  const accessToken = auth.user?.access_token ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [lastMemoryDelta, setLastMemoryDelta] = useState<{ nodes_added: number; edges_added: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetchGraph(accessToken).then(setGraph).catch(() => setGraph(EMPTY_GRAPH));
  }, [accessToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !accessToken || isStreaming) return;

    const history = messages;
    const nextMessages: ChatMessage[] = [...history, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(nextMessages);
    setDraft("");
    setIsStreaming(true);

    let assistantText = "";

    await sendChatMessage(accessToken, text, history, {
      onDelta: (delta) => {
        assistantText += delta;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistantText };
          return copy;
        });
      },
      onDone: (memory) => {
        setIsStreaming(false);
        setLastMemoryDelta(memory);
        fetchGraph(accessToken).then(setGraph).catch(() => {});
      },
      onError: () => {
        setIsStreaming(false);
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong reaching the agent. Please try again.",
          };
          return copy;
        });
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full gap-4 p-4">
      <div
        className="flex h-full min-h-0 w-1/2 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="border-b border-border-subtle px-4 py-3.5">
          <h2 className="font-display text-[15px] font-medium">Conversation</h2>
          <p className="text-xs text-foreground/50">
            Every exchange is analyzed and written into your memory graph on the right.
          </p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <p className="animate-rise-in text-sm text-foreground/40">
              Say hello — tell the agent something about yourself and watch the graph grow.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`animate-rise-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-jungle-green text-white"
                    : "bg-surface-muted text-foreground"
                }`}
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                {m.content || (isStreaming && i === messages.length - 1 ? (
                  <span className="inline-flex gap-1 py-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40" />
                  </span>
                ) : "")}
              </div>
            </div>
          ))}
        </div>

        {lastMemoryDelta && (lastMemoryDelta.nodes_added > 0 || lastMemoryDelta.edges_added > 0) && (
          <div className="animate-rise-in px-4 pb-1 text-[11px] text-seaweed">
            <span className="tabular-nums">+ {lastMemoryDelta.nodes_added}</span> memories,{" "}
            <span className="tabular-nums">{lastMemoryDelta.edges_added}</span> connections learned
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border-subtle p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message…"
            disabled={!accessToken || isStreaming}
            className="flex-1 rounded-full border border-border-subtle bg-background px-4 py-2.5 text-sm outline-none transition-[box-shadow,border-color] duration-150 ease-out focus:border-jungle-green focus:shadow-[var(--shadow-glow)] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || !accessToken || isStreaming}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-jungle-green px-4 py-2.5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-seaweed active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            Send
            <SendIcon />
          </button>
        </div>
      </div>

      <div
        className="flex h-full min-h-0 w-1/2 flex-col rounded-2xl border border-border-subtle bg-surface p-3.5"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-2 px-1">
          <h2 className="font-display text-[15px] font-medium">Live memory graph</h2>
          <p className="text-xs text-foreground/50">Updates in real time after each reply.</p>
        </div>
        <div className="min-h-0 flex-1">
          <GraphCanvas data={graph} />
        </div>
      </div>
    </div>
  );
}
