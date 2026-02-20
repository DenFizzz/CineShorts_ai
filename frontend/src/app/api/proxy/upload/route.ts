import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("[PROXY UPLOAD] called");

  const formData = await request.formData();
  const res = await fetch("http://127.0.0.1:8000/upload/", {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}