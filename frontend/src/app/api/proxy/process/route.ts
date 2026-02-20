import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("[PROXY PROCESS] called");

  const filename = request.nextUrl.searchParams.get("filename");
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const res = await fetch(
    `http://127.0.0.1:8000/process?filename=${encodeURIComponent(filename)}`,
    { method: "POST" }
  );

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}