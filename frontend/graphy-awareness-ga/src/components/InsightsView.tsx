"use client";

import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { clearGraph, fetchGraph, fetchRecommendations } from "@/lib/api";
import type { GraphData, Recommendation } from "@/lib/types";
import GraphCanvas from "./GraphCanvas";
import RecommendationCard from "./RecommendationCard";
import SkeletonCard from "./SkeletonCard";

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] };

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={spinning ? "animate-spin" : ""}
    >
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function InsightsView() {
  const auth = useAuth();
  const accessToken = auth.user?.access_token ?? null;
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [highlightLabels, setHighlightLabels] = useState<string[] | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  async function load() {
    if (!accessToken) return;
    setStatus("loading");
    try {
      const g = await fetchGraph(accessToken);
      setGraph(g);

      if (g.nodes.length === 0) {
        setRecommendations([]);
        setStatus("empty");
        return;
      }

      const recs = await fetchRecommendations(accessToken);
      setRecommendations(recs);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleClear() {
    if (!accessToken || isClearing) return;
    if (!window.confirm("This will permanently delete every memory node and edge. Continue?")) return;
    setIsClearing(true);
    try {
      await clearGraph(accessToken);
      await load();
    } catch {
      setStatus("error");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div className="flex h-full w-full gap-4 p-4">
      <div
        className="flex h-full w-1/2 flex-col rounded-2xl border border-border-subtle bg-surface p-3.5"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-2 flex items-start justify-between gap-3 px-1">
          <div>
            <h2 className="font-display text-[15px] font-medium">Memory graph</h2>
            <p className="text-xs text-foreground/50">
              Every node is something the agent learned about you; edges show how those memories connect.
            </p>
          </div>
          <button
            onClick={handleClear}
            disabled={isClearing || graph.nodes.length === 0}
            title="Delete all memories"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5 text-xs font-medium text-foreground/60 transition-[background-color,color,transform,border-color] duration-150 ease-out hover:border-red-500/60 hover:text-red-600 active:scale-[0.96] disabled:opacity-40"
          >
            <TrashIcon />
            {isClearing ? "Clearing…" : "Clear graph"}
          </button>
        </div>
        <div className="flex-1">
          <GraphCanvas data={graph} highlightLabels={highlightLabels} />
        </div>
      </div>

      <div
        className="flex h-full w-1/2 flex-col rounded-2xl border border-border-subtle bg-surface p-4"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15px] font-medium">Why this graph is useful</h2>
            <p className="text-xs text-foreground/50">
              The agent reasons over the graph to turn abstract needs and fears into concrete, explainable suggestions.
            </p>
          </div>
          <button
            onClick={load}
            disabled={status === "loading"}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5 text-xs font-medium text-foreground/60 transition-[background-color,color,transform,border-color] duration-150 ease-out hover:border-jungle-green hover:text-foreground active:scale-[0.96] disabled:opacity-60"
          >
            <RefreshIcon spinning={status === "loading"} />
            Refresh
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
          {status === "loading" && (
            <>
              <p className="mb-1 text-xs text-foreground/40">Reasoning over the graph…</p>
              <SkeletonCard delay={0} />
              <SkeletonCard delay={80} />
              <SkeletonCard delay={160} />
            </>
          )}
          {status === "empty" && (
            <p className="animate-rise-in text-sm text-foreground/40">
              No memories yet. Go to the Chat tab and talk to the agent first.
            </p>
          )}
          {status === "error" && (
            <p className="animate-rise-in text-sm text-red-600/80">
              Could not load recommendations. Try refreshing.
            </p>
          )}
          {status === "ready" && recommendations.length === 0 && (
            <p className="animate-rise-in text-sm text-foreground/40">
              Not enough signal yet to make confident suggestions.
            </p>
          )}
          {recommendations.map((rec, i) => (
            <RecommendationCard key={i} recommendation={rec} onHover={setHighlightLabels} delay={i * 60} />
          ))}
        </div>
      </div>
    </div>
  );
}
