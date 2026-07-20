import { NextRequest } from "next/server";
import { verifyCognitoAccessToken } from "@/lib/verifyCognitoToken";

const API_BASE_URL = process.env.API_BASE_URL;

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await verifyCognitoAccessToken(request.headers.get("authorization"));
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const upstream = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // user_id always comes from the verified token, never from the client payload.
    body: JSON.stringify({ ...body, user_id: userId }),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/event-stream" },
  });
}
