"use client"

import { useState, useEffect } from "react"
import axios from "axios"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export default function VideoUploader() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [scenes, setScenes] = useState<any[]>([])
  const [sceneCount, setSceneCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const scenesPerPage = 12
  const [currentPage, setCurrentPage] = useState(1)

  const { theme, setTheme } = useTheme()

  // ─── Загрузка списка файлов при монтировании ───────────────────────────────
  const fetchUploadedFiles = async () => {
    setLoadingFiles(true)
    try {
      const res = await axios.get("/api/proxy/uploads/list")
      setUploadedFiles(res.data)
      if (res.data.length > 0 && !selectedFileName) {
        const first = res.data[0]
        setSelectedFileName(first)
        setUploadedFileName(first)
      }
    } catch (err: any) {
      console.error("Ошибка загрузки списка файлов:", err)
      setError("Не удалось загрузить список видео")
    } finally {
      setLoadingFiles(false)
    }
  }

  useEffect(() => {
    fetchUploadedFiles()
  }, [])

  // ─── Загрузка сцен из кэша при выборе файла ────────────────────────────────
  const fetchSavedScenes = async (fname: string) => {
    try {
      const res = await axios.get(`/api/proxy/scenes/${encodeURIComponent(fname)}`)
      const data = res.data
      if (data.from_cache && data.scene_count > 0) {
        setScenes(data.scenes)
        setSceneCount(data.scene_count)
        console.log(`[SCENES] Загружены из кэша: ${data.scene_count} сцен`)
        return true
      }
      console.log("[SCENES] Кэш пустой или не найден")
      return false
    } catch (err) {
      console.warn("[SCENES] Ошибка при загрузке кэша сцен", err)
      return false
    }
  }

  // Авто-выбор первого файла
  useEffect(() => {
    if (uploadedFiles.length > 0 && !uploadedFileName) {
      const first = uploadedFiles[0]
      setSelectedFileName(first)
      setUploadedFileName(first)
    }
  }, [uploadedFiles])

  // Загрузка сцен при смене выбранного файла
  useEffect(() => {
    if (uploadedFileName) {
      setScenes([])
      setSceneCount(0)
      setProcessing(false)
      setCurrentPage(1)
      fetchSavedScenes(uploadedFileName)
    }
  }, [uploadedFileName])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0])
      setError(null)
      setScenes([])
      setSceneCount(0)
      setSelectedFileName(null)
      setUploadedFileName(null)
      setCurrentPage(1)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await axios.post("/api/proxy/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadProgress(percent)
          }
        },
      })

      const newName = res.data.filename || file.name
      setUploadedFileName(newName)
      setSelectedFileName(newName)
      setUploadedFiles((prev) => [...new Set([...prev, newName])].sort())
      setFile(null)
      setUploadProgress(0)
      fetchUploadedFiles()
    } catch (err: any) {
      setError(err.message || "Ошибка загрузки")
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async () => {
    if (!uploadedFileName) return
    setProcessing(true)
    setError(null)

    try {
      const res = await axios.post(
        `/api/proxy/process?filename=${encodeURIComponent(uploadedFileName)}`
      )
      const data = res.data
      setScenes(data.scenes || [])
      setSceneCount(data.scene_count || data.scenes?.length || 0)
    } catch (err: any) {
      setError(err.message || "Ошибка анализа видео")
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!uploadedFileName) return
    try {
      await axios.delete(
        `/api/proxy/delete?filename=${encodeURIComponent(uploadedFileName)}`
      )
      setUploadedFiles((prev) => prev.filter((f) => f !== uploadedFileName))
      setUploadedFileName(null)
      setSelectedFileName(null)
      setScenes([])
      setSceneCount(0)
      setCurrentPage(1)
    } catch (err: any) {
      setError(err.message || "Ошибка удаления")
    }
  }

  const indexOfLastScene = currentPage * scenesPerPage
  const indexOfFirstScene = indexOfLastScene - scenesPerPage
  const currentScenes = scenes.slice(indexOfFirstScene, indexOfLastScene)
  const totalPages = Math.ceil(scenes.length / scenesPerPage)

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 md:p-10 font-sans relative">
      {/* Кнопка смены темы */}
      <div className="absolute top-6 right-6 z-10">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-3 rounded-full bg-[var(--surface)] border border-[var(--border-light)] hover:bg-[var(--surface-hover)] transition-colors shadow-sm"
          aria-label="Переключить тему"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5 text-[var(--text-primary)]" />
          ) : (
            <Moon className="w-5 h-5 text-[var(--text-primary)]" />
          )}
        </button>
      </div>

      <div className="max-w-6xl mx-auto space-y-10">
        {/* Заголовок */}
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-[var(--accent)]">
            CineShorts
          </h1>
          <p className="mt-3 text-lg text-[var(--text-secondary)]">
            Разбиение видео на сцены одним кликом
          </p>
        </div>

        {/* Список загруженных файлов */}
        <div className="bg-[var(--surface)] border border-[var(--border-light)] rounded-2xl p-6 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[var(--text-primary)]">
              Видео на сервере
            </h3>
            <button
              onClick={fetchUploadedFiles}
              disabled={loadingFiles}
              className="px-4 py-1.5 bg-[var(--surface-light)] hover:bg-[var(--surface-hover)] rounded-lg text-sm transition-colors disabled:opacity-50 border border-[var(--border-light)] text-[var(--text-primary)]"
            >
              {loadingFiles ? "Обновление..." : "Обновить"}
            </button>
          </div>

          {loadingFiles ? (
            <div className="text-center py-8 text-[var(--text-secondary)]">
              Загружаем список...
            </div>
          ) : uploadedFiles.length === 0 ? (
            <div className="text-center py-10 text-[var(--text-secondary)] border border-dashed border-[var(--border-light)] rounded-xl">
              Пока нет загруженных видео<br />
              <span className="text-sm">Загрузите первое ↓</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {uploadedFiles.map((fname) => (
                <button
                  key={fname}
                  onClick={() => {
                    setSelectedFileName(fname)
                    setUploadedFileName(fname)
                    setFile(null)
                    setScenes([])
                    setSceneCount(0)
                  }}
                  className={`px-5 py-3 rounded-xl text-left transition-all duration-200 border ${
                    selectedFileName === fname
                      ? "bg-[var(--surface-light)] border-[var(--accent)]/40 shadow-sm text-[var(--text-primary)] font-medium"
                      : "bg-[var(--surface)] border-[var(--border-light)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)] text-[var(--text-primary)]"
                  }`}
                >
                  {fname}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Зона загрузки */}
        <div
          className={`border-2 border-dashed rounded-2xl p-10 md:p-14 text-center transition-all ${
            file
              ? "border-[var(--accent)]/60 bg-[var(--surface-hover)]"
              : "border-[var(--border-light)] hover:border-[var(--text-secondary)] bg-[var(--surface)]"
          }`}
        >
          <input
            type="file"
            accept="video/mp4,video/webm"
            onChange={handleFileChange}
            className="hidden"
            id="video-upload"
          />
          <label
            htmlFor="video-upload"
            className="cursor-pointer text-xl font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            {file ? file.name : "Загрузить новое видео"}
          </label>
        </div>

        {/* Кнопка загрузки + прогресс */}
        <div className="flex flex-col items-center gap-5">
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`px-10 py-4 rounded-xl font-semibold text-lg transition-all duration-300 shadow-md ${
              uploading
                ? "bg-[var(--surface-light)] text-[var(--text-secondary)] cursor-not-allowed"
                : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] text-white shadow-[0_4px_14px_rgba(217,119,87,0.3)]"
            }`}
          >
            {uploading ? "Загружается..." : "Отправить на сервер"}
          </button>

          {uploading && (
            <div className="w-full max-w-lg">
              <div className="w-full bg-[var(--surface-light)] rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[var(--accent)] h-2.5 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-center mt-3 text-sm text-[var(--text-secondary)]">
                {uploadProgress}% — {file?.name}
              </p>
            </div>
          )}
        </div>

        {/* Управление выбранным файлом */}
        {uploadedFileName && (
          <div className="bg-[var(--surface)] border border-[var(--border-light)] rounded-2xl p-6 md:p-8 shadow-[var(--shadow)]">
            <p className="text-lg mb-5">
              Выбран: <span className="text-[var(--accent)] font-medium">{uploadedFileName}</span>
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleProcess}
                disabled={processing}
                className={`px-8 py-3.5 rounded-xl font-medium transition-all duration-300 shadow-md ${
                  processing
                    ? "bg-[var(--surface-light)] text-[var(--text-secondary)] cursor-not-allowed"
                    : "bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] text-white shadow-[0_4px_14px_rgba(217,119,87,0.3)]"
                }`}
              >
                {processing ? "Анализирую..." : "Найти сцены"}
              </button>

              <button
                onClick={handleDelete}
                className="px-8 py-3.5 bg-[var(--text-secondary)] hover:bg-gray-700 rounded-xl font-medium text-white transition-all duration-300 shadow-md"
              >
                Удалить
              </button>
            </div>
          </div>
        )}

        {/* Результаты анализа */}
        {sceneCount > 0 && (
          <div className="space-y-8">
            <h2 className="text-3xl font-bold tracking-tight">
              Найдено сцен: <span className="text-[var(--accent)]">{sceneCount}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {currentScenes.map((scene, idx) => (
                <div
                  key={idx}
                  className="
                    group relative rounded-2xl overflow-hidden
                    bg-[var(--surface)] border border-[var(--border-light)]
                    shadow-[var(--shadow)] hover:shadow-md hover:border-[var(--border)]
                    transition-all duration-300
                  "
                >
                  {/* Превью */}
                  <div className="aspect-video relative">
                    <img
                      src={`/api/proxy/thumbnail/${encodeURIComponent(uploadedFileName!)}/${scene.start_sec}`}
                      alt={`Scene ${indexOfFirstScene + idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-placeholder.jpg"
                        e.currentTarget.alt = "Превью не загрузилось"
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  </div>

                  {/* Таймкоды */}
                  <div className="absolute top-3 left-3 bg-[var(--surface)]/90 backdrop-blur-sm px-3 py-1 rounded-lg text-[var(--accent)] font-mono text-sm shadow-sm">
                    {scene.start_sec.toFixed(1)} s
                  </div>

                  <div className="absolute bottom-3 right-3 bg-[var(--surface)]/85 px-3 py-1 rounded-lg text-[var(--text-primary)] text-sm font-medium shadow-sm">
                    {scene.duration.toFixed(1)} сек
                  </div>

                  <div className="absolute inset-0 bg-[var(--accent)]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-10 flex-wrap">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-[var(--border-light)] transition-colors text-[var(--text-primary)]"
                >
                  ← Назад
                </button>

                <span className="px-6 py-2.5 bg-[var(--surface-light)] rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] font-medium">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-6 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-[var(--border-light)] transition-colors text-[var(--text-primary)]"
                >
                  Вперед →
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-center text-[var(--accent)] font-medium mt-8 bg-[var(--surface-light)] border border-[var(--border-light)] rounded-xl p-5">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}