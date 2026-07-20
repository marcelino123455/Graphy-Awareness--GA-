"use client";

import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  authority: process.env.NEXT_PUBLIC_COGNITO_AUTHORITY!,
  client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
  redirect_uri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI!,
  response_type: "code",
  scope: process.env.NEXT_PUBLIC_COGNITO_SCOPE ?? "phone openid email",
};

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider {...cognitoAuthConfig}>{children}</AuthProvider>;
}
