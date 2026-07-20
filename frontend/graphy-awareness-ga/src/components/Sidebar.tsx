"use client";

export type ViewKey = "chat" | "insights";

interface SidebarProps {
  active: ViewKey;
  collapsed: boolean;
  onSelect: (view: ViewKey) => void;
  onToggleCollapsed: () => void;
  username?: string;
  onSignOut: () => void;
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="7" r="3" fill="white" />
      <circle cx="18" cy="7" r="3" fill="white" fillOpacity="0.75" />
      <circle cx="12" cy="18" r="3" fill="white" fillOpacity="0.55" />
      <path d="M8.4 8.4 15.6 8.4M9.2 9.9 11.3 15.5M14.8 9.9 12.7 15.5" stroke="white" strokeOpacity="0.6" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M4 5h16v11H8l-4 4V5Z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7.9 7.3 10.5 16M16.1 7.3 13.5 16M8.4 6h7.2" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`transition-transform duration-200 ease-out ${collapsed ? "rotate-180" : ""}`}
    >
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS: { key: ViewKey; label: string; icon: React.ReactNode; description: string }[] = [
  { key: "chat", label: "Chat", icon: <ChatIcon />, description: "Talk to the agent" },
  { key: "insights", label: "Insights", icon: <InsightsIcon />, description: "Explore the memory graph" },
];

export default function Sidebar({
  active,
  collapsed,
  onSelect,
  onToggleCollapsed,
  username,
  onSignOut,
}: SidebarProps) {
  return (
    <aside
      className={`flex h-full flex-col justify-between border-r border-border-subtle bg-surface transition-[width] duration-250 ease-out ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div>
        <div className={`flex items-center gap-2.5 px-4 py-5 ${collapsed ? "justify-center px-0" : ""}`}>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-jungle-green"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <LogoMark />
          </div>
          {!collapsed && (
            <span className="font-display text-[15px] font-medium italic leading-tight tracking-tight">
              Graphy Awareness
            </span>
          )}
        </div>

        <nav className="mt-1 flex flex-col gap-1 px-2.5">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                title={item.label}
                className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                  isActive
                    ? "bg-jungle-green text-white"
                    : "text-foreground/65 hover:bg-surface-muted hover:text-foreground"
                } ${collapsed ? "justify-center px-0" : ""}`}
                style={isActive ? { boxShadow: "var(--shadow-md)" } : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && (
                  <span className="flex flex-col">
                    <span className="font-medium">{item.label}</span>
                    <span
                      className={`text-[11px] transition-colors ${isActive ? "text-white/75" : "text-foreground/35"}`}
                    >
                      {item.description}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-2.5">
        {username && (
          <div
            className={`mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 ${collapsed ? "justify-center px-0" : ""}`}
            title={username}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-celadon text-xs font-semibold text-black/70">
              {username[0]?.toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/60">{username}</span>
                <button
                  onClick={onSignOut}
                  title="Sign out"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/40 transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-muted hover:text-foreground active:scale-[0.92]"
                >
                  <SignOutIcon />
                </button>
              </>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground/45 transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-muted hover:text-foreground active:scale-[0.97] ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <CollapseIcon collapsed={collapsed} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
