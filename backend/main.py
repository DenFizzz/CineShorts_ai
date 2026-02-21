from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
import os
import subprocess
import json
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
UPLOAD_DIR      = "uploads"
THUMB_DIR       = "thumbnails"
SCENES_CACHE_DIR = "scenes_cache"

os.makedirs(UPLOAD_DIR,      exist_ok=True)
os.makedirs(THUMB_DIR,       exist_ok=True)
os.makedirs(SCENES_CACHE_DIR, exist_ok=True)


# ─── Модель для сцен ───────────────────────────────────────────────────────
class Scene(BaseModel):
    start: str
    end: str
    duration: float


# ─── Утилита для пути кэша сцен ────────────────────────────────────────────
def get_scenes_cache_path(filename: str) -> str:
    safe_name = filename.replace(".", "_").replace("/", "_")
    return os.path.join(SCENES_CACHE_DIR, f"{safe_name}.json")


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


# ─── Получение сохранённых сцен (для персистентности на фронте) ────────────
@app.get("/scenes/{filename}")
async def get_scenes(filename: str):
    cache_path = get_scenes_cache_path(filename)

    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"[SCENES CACHE] Загружен из файла: {cache_path}, сцен: {data.get('scene_count', 0)}")
            return {
                "from_cache": True,
                **data
            }
        except Exception as e:
            print(f"[SCENES CACHE] Ошибка чтения кэша: {e}")
            return {"from_cache": False, "scenes": [], "scene_count": 0}
    
    print(f"[SCENES CACHE] Кэш не найден: {cache_path}")
    return {"from_cache": False, "scenes": [], "scene_count": 0}


# ─── Обработка видео — поиск сцен + сохранение в кэш ──────────────────────
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

    # Проверяем, есть ли уже кэш — если да, можно сразу вернуть (оптимизация)
    cache_path = get_scenes_cache_path(filename)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"[PROCESS] Возврат из кэша: {cache_path}")
            return {
                "from_cache": True,
                **data
            }
        except:
            pass  # если кэш битый — пересчитываем

    # Поиск сцен
    try:
        print("[PROCESS] Запуск ContentDetector (threshold=27)...")
        scene_list = detect(file_path, ContentDetector(threshold=27.0))

        scenes: List[Dict] = []
        for scene in scene_list:
            start_sec = scene[0].get_seconds()
            end_sec   = scene[1].get_seconds()
            scenes.append({
                "start_sec": round(start_sec, 1),
                "end_sec":   round(end_sec, 1),
                "duration":  round(end_sec - start_sec, 1),
                "start": f"{int(start_sec // 60):02d}:{int(start_sec % 60):02d}",
                "end":   f"{int(end_sec // 60):02d}:{int(end_sec % 60):02d}",
            })

        result = {
            "status": "processed",
            "video_duration": round(duration, 1),
            "scenes": scenes,
            "scene_count": len(scenes),
            "method": "PySceneDetect ContentDetector threshold=27"
        }

        # Сохраняем результат в кэш
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"[SCENES CACHE] Сохранён: {cache_path}")

        return result

    except Exception as e:
        print(f"[PROCESS] PySceneDetect упал: {type(e).__name__} → {str(e)}")
        return {
            "status": "error",
            "video_duration": round(duration, 1),
            "scenes": [],
            "scene_count": 0,
            "error": str(e)
        }


# ─── Удаление видео + очистка связанных кэшей ──────────────────────────────
@app.delete("/delete")
async def delete_video(filename: str = Query(...)):
    print(f"[DELETE] Запрос на удаление: {filename}")
    
    file_path    = os.path.join(UPLOAD_DIR, filename)
    cache_path   = get_scenes_cache_path(filename)
    
    deleted = False
    
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            print(f"[DELETE] Удалён видео-файл: {file_path}")
            deleted = True
        except Exception as e:
            print(f"[DELETE] Ошибка удаления видео: {e}")
    
    if os.path.exists(cache_path):
        try:
            os.remove(cache_path)
            print(f"[DELETE] Удалён кэш сцен: {cache_path}")
        except Exception as e:
            print(f"[DELETE] Ошибка удаления кэша: {e}")
    
    if deleted:
        return {"status": "deleted", "filename": filename}
    else:
        raise HTTPException(status_code=404, detail=f"Файл не найден: {filename}")


# ─── Список загруженных файлов ─────────────────────────────────────────────
@app.get("/uploads/list")
async def list_uploads() -> List[str]:
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
    video_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Видео не найдено")

    seek_time = start_sec + 1.2  # середина сцены + небольшой отступ

    thumb_filename = f"{filename.replace('.', '_')}_{start_sec:.1f}.jpg"
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)

    if not os.path.exists(thumb_path):
        try:
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(seek_time),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",
                "-vf", "scale=640:-2",
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
        "scenes_cache_dir_exists": os.path.exists(SCENES_CACHE_DIR),
        "ffmpeg_available": subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0
    }