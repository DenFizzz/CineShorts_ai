"use client";

import { useState } from "react";

export default function VideoUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setStatus(res.ok ? `Готово! ${data.filename} (${data.size_mb.toFixed(1)} MB)` : "Ошибка: " + data.detail);
    } catch (err: any) {
      setStatus("Ошибка сети: " + err.message);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-gray-700 file:text-white hover:file:bg-gray-600"
        />
        <button
          type="submit"
          disabled={!file}
          className="px-6 py-3 bg-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Отправить на обработку
        </button>
      </form>
      {status && <p className="mt-6 text-lg">{status}</p>}
    </div>
  );
}