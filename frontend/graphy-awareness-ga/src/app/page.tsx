"use client";

import { useState } from "react";
import { useAuth } from "react-oidc-context";
import AuthGate from "@/components/AuthGate";
import ChatView from "@/components/ChatView";
import InsightsView from "@/components/InsightsView";
import Sidebar, { type ViewKey } from "@/components/Sidebar";

function displayUsername(profile: Record<string, unknown> | undefined): string | undefined {
  if (!profile) return undefined;
  const username =
    (profile["cognito:username"] as string | undefined) ??
    (profile.preferred_username as string | undefined) ??
    (profile.email as string | undefined)?.split("@")[0];
  return username;
}

function Dashboard() {
  const auth = useAuth();
  const [active, setActive] = useState<ViewKey>("chat");
  const [collapsed, setCollapsed] = useState(false);

  function handleSelect(view: ViewKey) {
    setActive(view);
    setCollapsed(true);
  }

  function handleSignOut() {
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const logoutUri = process.env.NEXT_PUBLIC_COGNITO_LOGOUT_URI;

    // Also invalidate the Cognito Hosted UI session, not just the local one.
    if (domain && clientId && logoutUri) {
      auth.removeUser();
      window.location.href = `${domain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
      return;
    }
    auth.removeUser();
  }

  return (
    <div
      className="flex h-screen w-full flex-1 bg-background"
      style={{
        backgroundImage:
          "radial-gradient(680px circle at 88% 8%, rgba(168,216,192,0.16), transparent 60%), radial-gradient(520px circle at 6% 96%, rgba(47,182,116,0.08), transparent 55%)",
      }}
    >
      <Sidebar
        active={active}
        collapsed={collapsed}
        onSelect={handleSelect}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        username={displayUsername(auth.user?.profile)}
        onSignOut={handleSignOut}
      />
      <main className="min-w-0 flex-1">
        {active === "chat" ? <ChatView /> : <InsightsView />}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
