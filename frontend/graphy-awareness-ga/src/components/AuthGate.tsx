"use client";

import { useAuth } from "react-oidc-context";

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="7" r="3" fill="white" />
      <circle cx="18" cy="7" r="3" fill="white" fillOpacity="0.75" />
      <circle cx="12" cy="18" r="3" fill="white" fillOpacity="0.55" />
      <path
        d="M8.4 8.4 15.6 8.4M9.2 9.9 11.3 15.5M14.8 9.9 12.7 15.5"
        stroke="white"
        strokeOpacity="0.6"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-sm text-foreground/50">
        Loading…
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background text-center">
        <p className="text-sm text-red-600/80">Authentication error: {auth.error.message}</p>
        <button
          onClick={() => auth.signinRedirect()}
          className="rounded-full bg-jungle-green px-4 py-2 text-sm font-medium text-white transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center bg-background"
        style={{
          backgroundImage:
            "radial-gradient(680px circle at 88% 8%, rgba(168,216,192,0.16), transparent 60%), radial-gradient(520px circle at 6% 96%, rgba(47,182,116,0.08), transparent 55%)",
        }}
      >
        <div
          className="animate-rise-in flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border-subtle bg-surface p-8 text-center"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-jungle-green"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <LogoMark />
          </div>
          <div>
            <h1 className="font-display text-xl font-medium italic">Graphy Awareness</h1>
            <p className="mt-1.5 text-sm text-foreground/55">
              Sign in to talk to your agent and grow your memory graph.
            </p>
          </div>
          <button
            onClick={() => auth.signinRedirect()}
            className="w-full rounded-full bg-jungle-green px-4 py-2.5 text-sm font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:bg-seaweed active:scale-[0.96]"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
