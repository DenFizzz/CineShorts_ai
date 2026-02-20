import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  console.log("[PROXY DELETE] called");

  const filename = request.nextUrl.searchParams.get("filename");
  console.log("[PROXY DELETE] filename →", filename);

  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const res = await fetch(
    `http://127.0.0.1:8000/delete?filename=${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}