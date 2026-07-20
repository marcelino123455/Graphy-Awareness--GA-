import { createRemoteJWKSet, jwtVerify } from "jose";

// server-only: never import this from a client component.
// NEXT_PUBLIC_ vars are readable server-side too; reused here instead of duplicating config.
const authority = process.env.NEXT_PUBLIC_COGNITO_AUTHORITY!;
const jwks = createRemoteJWKSet(new URL(`${authority}/.well-known/jwks.json`));

/**
 * Verifies a Cognito access token and returns the authenticated user's sub.
 * Throws if the token is missing, expired, or signed by a different pool.
 */
export async function verifyCognitoAccessToken(authHeader: string | null): Promise<string> {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: authority,
  });

  if (payload.token_use !== "access" || !payload.sub) {
    throw new Error("Invalid token");
  }

  return payload.sub;
}
