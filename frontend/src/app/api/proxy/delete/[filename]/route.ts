import { NextRequest, NextResponse } from "next/server"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const resolvedParams = await params;               // ← распаковываем Promise
  const { filename } = resolvedParams;

  // или короче в одну строку:
  // const { filename } = await params;

  try {
    const backendRes = await fetch(
      `http://127.0.0.1:8000/delete/${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    );

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}