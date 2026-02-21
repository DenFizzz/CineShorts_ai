from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import subprocess
from scenedetect import detect, ContentDetector
from typing import List, Dict
from pydantic import BaseModel

app = FastAPI(title="CineShorts Scene Detection")

# ─── CORS для фронта ───────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Пути ──────────────────────────────────────────────────────────────────
UPLOAD_DIR = "uploads"
THUMB_DIR  = "thumbnails"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMB_DIR,  exist_ok=True)


# ─── Модель для сцен (для лучшей читаемости ответа) ───────────────────────
class Scene(BaseModel):
    start: str
    end: str
    duration: float


# ─── Загрузка видео ────────────────────────────────────────────────────────
@app.post("/upload/")
async def upload_video(file: UploadFile = File(...)):
    print(f"[UPLOAD] Получен файл: {file.filename}")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        print(f"[UPLOAD] Успешно сохранён → {file_path}")
        return {"filename": file.filename}
    except Exception as e:
        print(f"[UPLOAD] Ошибка сохранения: {type(e).__name__} → {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка при сохранении файла: {str(e)}")


# ─── Обработка видео — поиск сцен ─────────────────────────────────────────
@app.post("/process")
async def process_video(filename: str = Query(...)):
    print("╔════════════════════════════════════╗")
    print(f"║ [PROCESS] Вызван                   ║")
    print(f"║ filename = '{filename}'            ║")
    print(f"║ cwd      = {os.getcwd()}           ║")
    print("╚════════════════════════════════════╝")

    file_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(file_path):
        print(f"[PROCESS] Файл НЕ НАЙДЕН: {file_path}")
        raise HTTPException(status_code=404, detail=f"Видео не найдено: {filename}")

    print(f"[PROCESS] Файл найден: {file_path}")

    # Получаем длительность видео
    duration = 0.0
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, check=True
        )
        duration = float(result.stdout.strip())
        print(f"[PROCESS] Длительность: {duration:.2f} сек")
    except Exception as e:
        print(f"[PROCESS] ffprobe не сработал: {e}")

    # Поиск сцен
    try:
        print("[PROCESS] Запуск ContentDetector (threshold=27)...")
        scene_list = detect(file_path, ContentDetector(threshold=27.0))

        scenes: List[Dict] = []
        for scene in scene_list:
            start_sec = scene[0].get_seconds()
            end_sec   = scene[1].get_seconds()
    
            scenes.append({
            "start_sec": round(start_sec, 1),     # ← число секунд
            "end_sec":   round(end_sec, 1),
            "duration":  round(end_sec - start_sec, 1),
        # можно оставить и строковое представление для совместимости
            "start": f"{int(start_sec // 60):02d}:{int(start_sec % 60):02d}",
            "end":   f"{int(end_sec // 60):02d}:{int(end_sec % 60):02d}",
            })

        print(f"[PROCESS] Найдено сцен: {len(scenes)}")

        return {
            "status": "processed",
            "video_duration": round(duration, 1),
            "scenes": scenes,
            "scene_count": len(scenes),
            "method": "PySceneDetect ContentDetector threshold=27"
        }

    except Exception as e:
        print(f"[PROCESS] PySceneDetect упал: {type(e).__name__} → {str(e)}")
        return {
            "status": "error",
            "video_duration": round(duration, 1),
            "scenes": [],
            "scene_count": 0,
            "error": str(e)
        }


# ─── Удаление видео ────────────────────────────────────────────────────────
@app.delete("/delete")
async def delete_video(filename: str = Query(...)):
    print(f"[DELETE] Запрос на удаление: {filename}")
    
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            print(f"[DELETE] Удалён: {file_path}")
            return {"status": "deleted", "filename": filename}
        except Exception as e:
            print(f"[DELETE] Ошибка удаления: {e}")
            raise HTTPException(status_code=500, detail=f"Не удалось удалить файл: {str(e)}")
    
    print(f"[DELETE] Файл не найден: {file_path}")
    raise HTTPException(status_code=404, detail=f"Файл не найден: {filename}")


# ─── Список загруженных файлов ─────────────────────────────────────────────
@app.get("/uploads/list")
async def list_uploads() -> List[str]:
    """Возвращает отсортированный список имён файлов в папке uploads"""
    try:
        files = [
            f for f in os.listdir(UPLOAD_DIR)
            if os.path.isfile(os.path.join(UPLOAD_DIR, f))
        ]
        print(f"[LIST] Найдено файлов в uploads: {len(files)}")
        return sorted(files)
    except Exception as e:
        print(f"[LIST] Ошибка при чтении папки: {e}")
        return []


# ─── Отдача превьюшек сцен (генерация по требованию) ──────────────────────
@app.get("/thumbnail/{filename}/{start_sec}")
async def get_thumbnail(filename: str, start_sec: float):
    """
    Возвращает jpeg-кадр из середины сцены.
    Генерирует файл при первом запросе.
    """
    video_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Видео не найдено")

    # Середина сцены + небольшой отступ от начала перехода
    seek_time = start_sec + 1.2

    # Имя файла превьюшки — уникальное для видео + таймкода
    thumb_filename = f"{filename.replace('.', '_')}_{start_sec:.1f}.jpg"
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)

    if not os.path.exists(thumb_path):
        try:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(seek_time),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",           # качество 2 = хороший баланс
                "-vf", "scale=640:-2", # ширина 640px, высота пропорционально
                thumb_path
            ]
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(f"[THUMBNAIL] Сгенерировано: {thumb_path}")
        except subprocess.CalledProcessError as e:
            print(f"[THUMBNAIL] ffmpeg ошибка: {e.stderr}")
            raise HTTPException(status_code=500, detail="Не удалось создать превью")

    return FileResponse(thumb_path, media_type="image/jpeg")


# ─── Тестовый эндпоинт для отладки ─────────────────────────────────────────
@app.get("/debug-test")
async def debug_test():
    return {
        "status": "ok",
        "cwd": os.getcwd(),
        "upload_dir_exists": os.path.exists(UPLOAD_DIR),
        "thumb_dir_exists": os.path.exists(THUMB_DIR),
        "ffmpeg_available": subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0
    }