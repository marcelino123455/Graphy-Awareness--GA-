"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useRef, useState } from "react";
import type { GraphData, GraphNode, NodeType } from "@/lib/types";

interface SimNode extends SimulationNodeDatum, GraphNode {
  id: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string;
}

const NODE_STYLE: Record<NodeType, { fill: string; shape: "circle" | "square"; dashed?: boolean }> = {
  Need: { fill: "var(--seaweed)", shape: "circle" },
  Fear: { fill: "var(--black)", shape: "circle" },
  Preference: { fill: "var(--jungle-green)", shape: "circle" },
  Trait: { fill: "var(--celadon)", shape: "circle" },
  Fact: { fill: "var(--alabaster-grey)", shape: "circle", dashed: true },
  Entity: { fill: "var(--jungle-green)", shape: "square" },
};

function radiusFor(node: GraphNode): number {
  const base = 10;
  const boost = (node.intensity ?? 0.5) * 10;
  return base + boost;
}

interface GraphCanvasProps {
  data: GraphData;
  emptyMessage?: string;
  highlightLabels?: string[] | null;
}

export default function GraphCanvas({ data, emptyMessage, highlightLabels }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<Map<string, SimNode>>(new Map());
  const linksRef = useRef<SimLink[]>([]);

  const [renderNodes, setRenderNodes] = useState<SimNode[]>([]);
  const [renderLinks, setRenderLinks] = useState<SimLink[]>([]);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ width: 600, height: 400 });

  const draggingRef = useRef<{ node: SimNode; pointerId: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const existing = nodesRef.current;
    const nextNodes: SimNode[] = data.nodes.map((n) => {
      const prev = existing.get(n.id);
      if (prev) {
        return Object.assign(prev, n);
      }
      return {
        ...n,
        x: size.width / 2 + (Math.random() - 0.5) * 40,
        y: size.height / 2 + (Math.random() - 0.5) * 40,
      };
    });

    const nextMap = new Map(nextNodes.map((n) => [n.id, n]));
    nodesRef.current = nextMap;

    const links: SimLink[] = data.edges.map((e) => ({
      source: nextMap.get(e.source) ?? e.source,
      target: nextMap.get(e.target) ?? e.target,
      type: e.type,
    })) as SimLink[];
    linksRef.current = links;

    if (!simulationRef.current) {
      simulationRef.current = forceSimulation<SimNode>(nextNodes)
        .force("charge", forceManyBody().strength(-220))
        .force("center", forceCenter(size.width / 2, size.height / 2))
        .force("collide", forceCollide<SimNode>((n) => radiusFor(n) + 14))
        .force(
          "link",
          forceLink<SimNode, SimLink>(links)
            .id((n) => n.id)
            .distance(90)
            .strength(0.4)
        )
        .on("tick", () => {
          // read from refs (not closed-over locals) so this stays correct
          // across later effect runs that reuse the same simulation instance
          setRenderNodes([...nodesRef.current.values()]);
          setRenderLinks(linksRef.current);
        });
    } else {
      simulationRef.current.nodes(nextNodes);
      const linkForce = simulationRef.current.force<ReturnType<typeof forceLink<SimNode, SimLink>>>("link");
      linkForce?.links(links);
      simulationRef.current.force(
        "center",
        forceCenter(size.width / 2, size.height / 2)
      );
      simulationRef.current.alpha(0.6).restart();
    }

    setRenderNodes(nextNodes);
    setRenderLinks(links);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, size.width, size.height]);

  useEffect(() => {
    return () => {
      simulationRef.current?.stop();
    };
  }, []);

  function screenToWorld(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - transform.x) / transform.k,
      y: (clientY - rect.top - transform.y) / transform.k,
    };
  }

  function handleNodePointerDown(e: React.PointerEvent, node: SimNode) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = { node, pointerId: e.pointerId };
    node.fx = node.x;
    node.fy = node.y;
    setSelected(node);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (draggingRef.current) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      draggingRef.current.node.fx = x;
      draggingRef.current.node.fy = y;
      simulationRef.current?.alpha(0.3).restart();
      return;
    }
    const pan = panRef.current;
    if (pan) {
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      const nextX = pan.origin.x + dx;
      const nextY = pan.origin.y + dy;
      setTransform((t) => ({ ...t, x: nextX, y: nextY }));
    }
  }

  function handlePointerUp() {
    if (draggingRef.current) {
      draggingRef.current.node.fx = null;
      draggingRef.current.node.fy = null;
      draggingRef.current = null;
    }
    panRef.current = null;
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: transform.x, y: transform.y },
    };
    setSelected(null);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const scaleDelta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => {
      const newK = Math.min(3, Math.max(0.3, t.k * scaleDelta));
      const worldX = (pointer.x - t.x) / t.k;
      const worldY = (pointer.y - t.y) / t.k;
      return {
        k: newK,
        x: pointer.x - worldX * newK,
        y: pointer.y - worldY * newK,
      };
    });
  }

  const connectedIds = selected
    ? new Set(
        renderLinks
          .filter((l) => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return s === selected.id || t === selected.id;
          })
          .flatMap((l) => {
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return [s, t];
          })
      )
    : null;

  const isEmpty = data.nodes.length === 0;

  const lowerHighlightLabels = highlightLabels?.map((l) => l.toLowerCase());
  const hasAnyHighlightMatch = Boolean(
    lowerHighlightLabels?.some((l) =>
      renderNodes.some((n) => n.label.toLowerCase().includes(l) || l.includes(n.label.toLowerCase()))
    )
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border-subtle bg-surface-muted touch-none transition-shadow duration-200 ease-out"
        style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.03)" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerDown={handleBackgroundPointerDown}
        onWheel={handleWheel}
      >
        {isEmpty && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-foreground/50">
            {emptyMessage ?? "No memories yet. Start a conversation to grow the graph."}
          </div>
        )}
        <svg width="100%" height="100%" className="block">
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {renderLinks.map((l, i) => {
              const s = typeof l.source === "object" ? l.source : nodesRef.current.get(l.source as unknown as string);
              const t = typeof l.target === "object" ? l.target : nodesRef.current.get(l.target as unknown as string);
              if (!s || !t) return null;
              const isHighlighted =
                selected && (s.id === selected.id || t.id === selected.id);
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={isHighlighted ? "var(--seaweed)" : "var(--border-subtle)"}
                  strokeWidth={isHighlighted ? 2 : 1}
                  opacity={selected && !isHighlighted ? 0.15 : 0.7}
                />
              );
            })}

            {renderNodes.map((n) => {
              const style = NODE_STYLE[n.type];
              const r = radiusFor(n);
              const highlightSet = highlightLabels?.map((l) => l.toLowerCase());
              const isHighlightMatch = highlightSet?.some((l) => n.label.toLowerCase().includes(l) || l.includes(n.label.toLowerCase()));
              const dimmedBySelection = selected && selected.id !== n.id && !connectedIds?.has(n.id);
              const dimmedByHighlight = highlightSet && highlightSet.length > 0 && hasAnyHighlightMatch && !isHighlightMatch;
              const dimmed = dimmedBySelection || dimmedByHighlight;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                  onPointerDown={(e) => handleNodePointerDown(e, n)}
                  className="cursor-grab active:cursor-grabbing"
                  opacity={dimmed ? 0.25 : 1}
                >
                  {style.shape === "circle" ? (
                    <circle
                      r={r}
                      fill={style.fill}
                      stroke={isHighlightMatch ? "var(--seaweed)" : n.type === "Fact" ? "var(--black)" : "transparent"}
                      strokeDasharray={style.dashed && !isHighlightMatch ? "3 2" : undefined}
                      strokeWidth={isHighlightMatch ? 3 : 1.5}
                    />
                  ) : (
                    <rect
                      x={-r}
                      y={-r}
                      width={r * 2}
                      height={r * 2}
                      rx={4}
                      fill={style.fill}
                      stroke={isHighlightMatch ? "var(--seaweed)" : "transparent"}
                      strokeWidth={isHighlightMatch ? 3 : 0}
                    />
                  )}
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--foreground)"
                    className="pointer-events-none select-none"
                  >
                    {n.label.length > 22 ? `${n.label.slice(0, 22)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selected && (
        <div
          className="animate-rise-in mt-2 rounded-xl border border-border-subtle bg-surface p-3 text-xs"
          style={{ boxShadow: "var(--shadow-md)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: NODE_STYLE[selected.type].fill }}
            />
            <span className="font-medium">{selected.type}</span>
            {selected.domain && (
              <span className="rounded-full bg-celadon/40 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {selected.domain}
              </span>
            )}
          </div>
          <p className="mt-1 font-medium">{selected.label}</p>
          {selected.evidence && (
            <p className="mt-1 text-foreground/60">&ldquo;{selected.evidence}&rdquo;</p>
          )}
          <div className="mt-1 flex gap-3 text-[10px] text-foreground/50">
            <span className="tabular-nums">confidence {(selected.confidence ?? 0).toFixed(2)}</span>
            <span className="tabular-nums">intensity {(selected.intensity ?? 0).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
