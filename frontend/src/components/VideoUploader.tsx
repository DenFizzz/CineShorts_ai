// src/components/VideoUploader.tsx
"use client"

import { useState, useEffect } from "react"
import axios from "axios"

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
      setUploadedFiles(prev => [...new Set([...prev, newName])].sort())
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
      const res = await axios.post(`/api/proxy/process?filename=${encodeURIComponent(uploadedFileName)}`)
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
      await axios.delete(`/api/proxy/delete?filename=${encodeURIComponent(uploadedFileName)}`)
      setUploadedFiles(prev => prev.filter(f => f !== uploadedFileName))
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
    <div className="min-h-screen bg-[#F3EFE7] text-[#212121] p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Заголовок */}
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-[#D97757]">
            CineShorts
          </h1>
          <p className="mt-3 text-lg text-[#A0A0A0]">
            Разбиение видео на сцены одним кликом
          </p>
        </div>

        {/* Список загруженных файлов */}
        <div className="bg-[#E9E3D8] border border-[#D4C9B8] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[#212121]">
              Видео на сервере
            </h3>
            <button
              onClick={fetchUploadedFiles}
              disabled={loadingFiles}
              className="px-4 py-1.5 bg-[#FAF9F6] hover:bg-[#F0EDE5] rounded-lg text-sm transition-colors disabled:opacity-50 border border-[#D4C9B8] text-[#212121]"
            >
              {loadingFiles ? "Обновление..." : "Обновить"}
            </button>
          </div>

          {loadingFiles ? (
            <div className="text-center py-8 text-[#A0A0A0]">Загружаем список...</div>
          ) : uploadedFiles.length === 0 ? (
            <div className="text-center py-10 text-[#A0A0A0] border border-dashed border-[#D4C9B8] rounded-xl">
              Пока нет загруженных видео<br />
              <span className="text-sm">Загрузите первое ↓</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {uploadedFiles.map(fname => (
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
                      ? "bg-[#FFFFFF] border-[#D97757]/40 shadow-sm text-[#212121]"
                      : "bg-[#FFFFFF] border-[#E9E3D8] hover:bg-[#FAF9F6] hover:border-[#D4C9B8] text-[#212121]"
                  }`}
                >
                  {fname}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Зона загрузки нового файла */}
        <div
          className={`border-2 border-dashed rounded-2xl p-10 md:p-14 text-center transition-all ${
            file
              ? "border-[#D97757]/60 bg-[#FAF9F6]"
              : "border-[#D4C9B8] hover:border-[#A0A0A0] bg-[#FFFFFF]"
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
            className="cursor-pointer text-xl font-medium text-[#D97757] hover:text-[#c45f3f] transition-colors"
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
                ? "bg-[#E9E3D8] text-[#A0A0A0] cursor-not-allowed"
                : "bg-[#D97757] hover:bg-[#c45f3f] active:bg-[#a94a38] text-white shadow-[#D97757]/30"
            }`}
          >
            {uploading ? "Загружается..." : "Отправить на сервер"}
          </button>

          {uploading && (
            <div className="w-full max-w-lg">
              <div className="w-full bg-[#E9E3D8] rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[#D97757] h-2.5 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-center mt-3 text-sm text-[#A0A0A0]">
                {uploadProgress}% — {file?.name}
              </p>
            </div>
          )}
        </div>

        {/* Управление выбранным файлом */}
        {uploadedFileName && (
          <div className="bg-[#FFFFFF] border border-[#E9E3D8] rounded-2xl p-6 md:p-8 shadow-sm">
            <p className="text-lg mb-5">
              Выбран: <span className="text-[#D97757] font-medium">{uploadedFileName}</span>
            </p>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleProcess}
                disabled={processing}
                className={`px-8 py-3.5 rounded-xl font-medium transition-all duration-300 shadow-md ${
                  processing
                    ? "bg-[#E9E3D8] text-[#A0A0A0] cursor-not-allowed"
                    : "bg-[#D97757] hover:bg-[#c45f3f] active:bg-[#a94a38] text-white shadow-[#D97757]/30"
                }`}
              >
                {processing ? "Анализирую..." : "Найти сцены"}
              </button>

              <button
                onClick={handleDelete}
                className="px-8 py-3.5 bg-[#A0A0A0] hover:bg-[#8a8a8a] rounded-xl font-medium text-white transition-all duration-300 shadow-gray-400/30"
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
              Найдено сцен: <span className="text-[#D97757]">{sceneCount}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {currentScenes.map((scene, idx) => (
                <div
                  key={idx}
                  className="
                    group relative rounded-2xl overflow-hidden
                    bg-[#FFFFFF] border border-[#E9E3D8]
                    shadow-sm hover:shadow-md hover:border-[#D4C9B8]
                    transition-all duration-300 hover:scale-[1.02]
                  "
                >
                  <div className="aspect-video bg-[#FAF9F6] flex items-center justify-center">
                    <span className="text-[#A0A0A0] text-sm font-mono">
                      сцена {indexOfFirstScene + idx + 1}
                    </span>
                  </div>

                  <div className="absolute top-4 left-4 bg-[#FFFFFF]/90 backdrop-blur-sm px-3.5 py-1.5 rounded-lg text-[#D97757] font-mono text-sm tracking-wide shadow-sm">
                    {scene.start}
                  </div>

                  <div className="absolute bottom-4 right-4 bg-[#FFFFFF]/80 px-3 py-1 rounded-lg text-[#212121] text-sm font-medium">
                    {scene.duration} сек
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-10 flex-wrap">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-2.5 bg-[#FFFFFF] hover:bg-[#FAF9F6] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-[#E9E3D8] transition-colors text-[#212121]"
                >
                  ← Назад
                </button>

                <span className="px-6 py-2.5 bg-[#FAF9F6] rounded-lg border border-[#E9E3D8] text-[#A0A0A0] font-medium">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-6 py-2.5 bg-[#FFFFFF] hover:bg-[#FAF9F6] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-[#E9E3D8] transition-colors text-[#212121]"
                >
                  Вперед →
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-center text-[#D97757] font-medium mt-8 bg-[#FAF9F6] border border-[#D4C9B8] rounded-xl p-5">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}