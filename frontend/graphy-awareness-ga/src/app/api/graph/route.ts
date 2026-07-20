import { NextRequest } from "next/server";
import { verifyCognitoAccessToken } from "@/lib/verifyCognitoToken";

const API_BASE_URL = process.env.API_BASE_URL;

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await verifyCognitoAccessToken(request.headers.get("authorization"));
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE_URL}/graph?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}

export async function DELETE(request: NextRequest) {
  let userId: string;
  try {
    userId = await verifyCognitoAccessToken(request.headers.get("authorization"));
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE_URL}/graph?user_id=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
