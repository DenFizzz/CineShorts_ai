// frontend/src/app/api/proxy/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── 1. Загрузка видео ──
  if (pathname === "/api/proxy") {
    const formData = await request.formData();
    const backendRes = await fetch("http://127.0.0.1:8000/upload/", {
      method: "POST",
      body: formData,
    });

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  }

  // ── 2. Обнаружение сцен ──
  if (pathname === "/api/proxy/process") {
    const filename = request.nextUrl.searchParams.get("filename");

    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    const backendRes = await fetch(
      `http://127.0.0.1:8000/process?filename=${encodeURIComponent(filename)}`,
      { method: "POST" }
    );

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  }

  return NextResponse.json({ error: "Invalid POST path" }, { status: 404 });
}

export async function DELETE(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── Удаление файла ──
  if (pathname === "/api/proxy/delete") {
    const filename = request.nextUrl.searchParams.get("filename");

    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    const backendRes = await fetch(
      `http://127.0.0.1:8000/delete?filename=${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    );

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  }

  return NextResponse.json({ error: "Invalid DELETE path" }, { status: 404 });
}