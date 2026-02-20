"use client"

import { useState, useRef } from "react"

export default function VideoUploader() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string>("")
  const [progress, setProgress] = useState<number>(0)
  const [uploading, setUploading] = useState<boolean>(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [scenes, setScenes] = useState<any[]>([])           // массив сцен после обработки
  const [processing, setProcessing] = useState<boolean>(false)

  const abortController = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (!selected.type.startsWith("video/")) {
      setStatus("Выберите видеофайл")
      return
    }

    setFile(selected)
    setStatus("")
    setProgress(0)
    setUploadedFileName(null)
    setScenes([])           // сбрасываем сцены при новом файле
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setStatus("Загрузка...")
    setProgress(0)
    setScenes([])

    const formData = new FormData()
    formData.append("file", file)

    abortController.current = new AbortController()

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded * 100) / event.total)
        setProgress(percent)
      }
    }

    xhr.onload = () => {
      setUploading(false)
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          setStatus(`Готово! ${data.filename} (${data.size_mb.toFixed(1)} MB)`)
          setUploadedFileName(data.filename)
        } catch {
          setStatus("Ошибка обработки ответа")
        }
      } else {
        setStatus(`Ошибка сервера: ${xhr.status}`)
      }
      abortController.current = null
    }

    xhr.onerror = () => {
      setUploading(false)
      setStatus("Ошибка сети")
      abortController.current = null
    }

    xhr.onabort = () => {
      setUploading(false)
      setStatus("Загрузка отменена")
      setProgress(0)
      abortController.current = null
    }

    xhr.open("POST", "/api/proxy")
    xhr.send(formData)
  }

  const handleCancel = () => {
    if (abortController.current) {
      abortController.current.abort()
    }
  }

  const handleDelete = async () => {
    if (!uploadedFileName) return

    try {
      const res = await fetch(`/api/proxy/delete?filename=${encodeURIComponent(uploadedFileName)}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setStatus("Файл удалён с сервера")
        setUploadedFileName(null)
        setFile(null)
        setScenes([])
        if (fileInputRef.current) fileInputRef.current.value = ""
      } else {
        setStatus("Не удалось удалить файл")
      }
    } catch (err: any) {
      setStatus("Ошибка при удалении: " + err.message)
    }
  }

  const handleClear = () => {
    setFile(null)
    setStatus("")
    setProgress(0)
    setUploadedFileName(null)
    setScenes([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleProcess = async () => {
    if (!uploadedFileName) return

    setProcessing(true)
    setStatus("Обнаружение сцен...")
    setScenes([])

    try {
      const res = await fetch(`/api/proxy/process?filename=${encodeURIComponent(uploadedFileName)}`, {
        method: "POST",
      })

      if (res.ok) {
        const data = await res.json()
        setScenes(data.scenes || [])
        setStatus(`Готово! Найдено ${data.scene_count} сцен за ${data.processing_time_sec} сек`)
      } else {
        setStatus("Ошибка обработки сцен")
      }
    } catch (err: any) {
      setStatus("Не удалось запустить обработку: " + err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col">
          <label className="text-lg mb-2 text-gray-300">
            Выберите видео
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            disabled={uploading}
            className={[
              "block w-full text-sm text-gray-400",
              "file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0",
              "file:text-sm file:font-semibold file:bg-blue-600 file:text-white",
              "hover:file:bg-blue-700",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          />
        </div>

        {file && (
          <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <div>
                <p className="font-medium text-white">{file.name}</p>
                <p className="text-sm text-gray-400">
                  {formatFileSize(file.size)} · {file.type || "video/*"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                disabled={uploading}
                className="text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                × Убрать
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={!file || uploading}
            className={[
              "flex-1 py-3 px-6 bg-blue-600 rounded-lg font-medium",
              "hover:bg-blue-700",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {uploading ? `Загружается... ${progress}%` : "Отправить на сервер"}
          </button>

          {uploading && (
            <button
              type="button"
              onClick={handleCancel}
              className={[
                "py-3 px-6 bg-red-600/80 rounded-lg font-medium",
                "hover:bg-red-700",
              ].join(" ")}
            >
              Отмена
            </button>
          )}
        </div>
      </form>

      {/* Прогресс-бар */}
      {uploading && (
        <div className="mt-6">
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center mt-2 text-sm text-gray-400">{progress}%</p>
        </div>
      )}

      {/* Статус */}
      {status && (
        <p
          className={`mt-6 text-center text-lg ${
            status.includes("Готово") ? "text-green-400" : "text-yellow-400"
          }`}
        >
          {status}
        </p>
      )}

      {/* Блок действий после загрузки */}
      {uploadedFileName && (
        <div className="mt-8 space-y-4">
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleProcess}
              disabled={processing}
              className={[
                "py-3 px-8 bg-green-600 rounded-lg font-medium text-white",
                "hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {processing ? "Обработка..." : "Начать работу"}
            </button>

            <button
              onClick={handleDelete}
              className={[
                "py-3 px-8 bg-red-600/80 rounded-lg font-medium text-white",
                "hover:bg-red-700",
              ].join(" ")}
            >
              Удалить файл
            </button>
          </div>

          {/* Список найденных сцен */}
          {scenes.length > 0 && (
            <div className="mt-6 bg-gray-900 p-6 rounded-xl border border-gray-700">
              <h3 className="text-lg font-medium mb-4 text-white">Найденные сцены</h3>
              <ul className="space-y-3 text-gray-300">
                {scenes.map((scene) => (
                  <li key={scene.scene_id} className="flex justify-between">
                    <span>Сцена {scene.scene_id}</span>
                    <span>
                      {scene.start_time} → {scene.end_time} сек
                      <span className="ml-3 text-gray-500">({scene.duration} сек)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}