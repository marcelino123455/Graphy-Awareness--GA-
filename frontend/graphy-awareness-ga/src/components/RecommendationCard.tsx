"use client";

import type { Recommendation } from "@/lib/types";

const CATEGORY_LABEL: Record<Recommendation["category"], string> = {
  product: "Product",
  activity: "Activity",
  content: "Content",
  service: "Service",
};

interface RecommendationCardProps {
  recommendation: Recommendation;
  onHover: (labels: string[] | null) => void;
  delay?: number;
}

export default function RecommendationCard({ recommendation, onHover, delay = 0 }: RecommendationCardProps) {
  return (
    <div
      onMouseEnter={() => onHover(recommendation.related_labels ?? [recommendation.title])}
      onMouseLeave={() => onHover(null)}
      style={{ animationDelay: `${delay}ms`, boxShadow: "var(--shadow-sm)" }}
      className="animate-rise-in rounded-2xl border border-border-subtle bg-surface p-4 transition-[box-shadow,border-color] duration-200 ease-out hover:border-jungle-green/40"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{recommendation.title}</h3>
        <span className="shrink-0 rounded-full bg-celadon/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/70">
          {CATEGORY_LABEL[recommendation.category]}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-foreground/70">{recommendation.description}</p>
      <div className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-[11px] text-foreground/55">
        <span className="font-medium text-seaweed">Why: </span>
        {recommendation.reasoning}
      </div>
    </div>
  );
}
