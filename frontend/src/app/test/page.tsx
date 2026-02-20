"use client";

export default function TestPage() {
  const test = async (endpoint: string, method: string = "POST") => {
    try {
      const url =
        endpoint === "delete"
          ? `/api/proxy/delete?filename=тест_файл_2026.mp4`
          : endpoint === "process"
            ? `/api/proxy/process?filename=тест_файл_2026.mp4`
            : `/api/proxy/upload`;

      const res = await fetch(url, { method });
      console.log(`${method} ${endpoint} → status:`, res.status);
      console.log("body:", await res.text());
    } catch (err) {
      console.error("Ошибка:", err);
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "system-ui" }}>
      <h1>Тест прокси</h1>
      <div style={{ display: "flex", gap: "16px", marginTop: "24px" }}>
        <button
          onClick={() => test("upload", "POST")}
          style={{ padding: "12px 24px", background: "#2e7d32", color: "white", border: "none", borderRadius: "6px" }}
        >
          Тест UPLOAD (POST)
        </button>

        <button
          onClick={() => test("process", "POST")}
          style={{ padding: "12px 24px", background: "#1976d2", color: "white", border: "none", borderRadius: "6px" }}
        >
          Тест PROCESS (POST)
        </button>

        <button
          onClick={() => test("delete", "DELETE")}
          style={{ padding: "12px 24px", background: "#d32f2f", color: "white", border: "none", borderRadius: "6px" }}
        >
          Тест DELETE
        </button>
      </div>
    </div>
  );
}