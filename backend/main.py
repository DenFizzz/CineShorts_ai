from fastapi import FastAPI, UploadFile, File, Query, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import subprocess
import json
from scenedetect import open_video, SceneManager, ContentDetector
from scenedetect.scene_manager import SceneManager
from typing import List, Dict
from pydantic import BaseModel
from uuid import uuid4
import asyncio

app = FastAPI(title="CineShorts Scene Detection")

# ─── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Пути ───────────────────────────────────────────────────────────────────
UPLOAD_DIR       = "uploads"
THUMB_DIR        = "thumbnails"
SCENES_CACHE_DIR = "scenes_cache"

os.makedirs(UPLOAD_DIR,       exist_ok=True)
os.makedirs(THUMB_DIR,        exist_ok=True)
os.makedirs(SCENES_CACHE_DIR, exist_ok=True)

# ─── Активные задачи ────────────────────────────────────────────────────────
active_tasks: Dict[str, Dict] = {}  # task_id → {"progress": int, "status": str, ...}

# ─── Модель сцены (для валидации, если понадобится) ─────────────────────────
class Scene(BaseModel):
    start_sec: float
    end_sec: float
    duration: float
    start: str
    end: str

# ─── Утилита пути кэша ──────────────────────────────────────────────────────
def get_scenes_cache_path(filename: str) -> str:
    safe_name = filename.replace(".", "_").replace("/", "_")
    return os.path.join(SCENES_CACHE_DIR, f"{safe_name}.json")

# ─── WebSocket для живого прогресса ─────────────────────────────────────────
@app.websocket("/ws/progress/{task_id}")
async def websocket_progress(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        while True:
            if task_id not in active_tasks:
                await websocket.send_json({"status": "not_found"})
                break

            task = active_tasks[task_id]
            await websocket.send_json({
                "progress": task["progress"],
                "status":   task["status"],
                "message":  task.get("message", ""),
            })

            if task["status"] in ("completed", "error"):
                if "result" in task:
                    await websocket.send_json({
                        "status": "completed",
                        "result": task["result"]
                    })
                elif "error" in task:
                    await websocket.send_json({
                        "status": "error",
                        "error":  task["error"]
                    })
                break

            await asyncio.sleep(0.4)

    except WebSocketDisconnect:
        print(f"[WS] Клиент отключился от задачи {task_id}")
    except Exception as e:
        print(f"[WS] Ошибка WebSocket {task_id}: {e}")

# ─── Запуск фоновой обработки ───────────────────────────────────────────────
@app.post("/process-async")
async def start_process_video(
    background_tasks: BackgroundTasks,
    filename: str = Query(...),
    force: bool = Query(default=False),
):
    print(f"[PROCESS-ASYNC] Запрос: {filename}, force={force}")
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "Видео не найдено")

    cache_path = get_scenes_cache_path(filename)
    task_id = str(uuid4())

    # Если не форсируем и кэш есть — сразу отдаём
    if not force and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"[PROCESS-ASYNC] Кэш найден, сцен: {data.get('scene_count', 0)}")
            return {
                "task_id": task_id,
                "status": "completed",
                "result": data
            }
        except Exception as e:
            print(f"[PROCESS-ASYNC] Кэш битый: {e} → пересчитываем")

    print(f"[PROCESS-ASYNC] Создаём задачу {task_id}")

    active_tasks[task_id] = {
        "progress": 0,
        "status": "starting",
        "message": "Подготовка...",
        "result": None,
        "error": None
    }

    background_tasks.add_task(process_video_background, task_id, file_path, cache_path)
    return {"task_id": task_id, "status": "processing_started"}

# ─── Основная фоновая функция с callback ────────────────────────────────────
async def process_video_background(task_id: str, file_path: str, cache_path: str):
    print(f"[BACKGROUND START] Задача {task_id} запущена, pid={os.getpid()}")
    task = active_tasks.get(task_id)
    if not task:
        print(f"[BACKGROUND] Задача {task_id} исчезла")
        return

    try:
        # 1. Длительность
        task["progress"] = 5
        task["message"] = "Получаем длительность..."
        print(f"[BACKGROUND] Шаг 1 — получение длительности {file_path}")

        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, check=True
        )
        duration = float(result.stdout.strip())
        print(f"[BACKGROUND] Длительность: {duration:.2f} сек")

        # 2. Анализ сцен
        task["progress"] = 12
        task["status"] = "analyzing"
        task["message"] = "Анализ сцен (ContentDetector threshold=27.0)..."

        video = open_video(file_path)
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector(threshold=27.0))

        scene_counter = 0

        def on_scene_detected(frame_img, frame_num):
            nonlocal scene_counter
            scene_counter += 1

            fps = video.frame_rate if video.frame_rate is not None else 30.0
            est_progress = 15 + int(70 * (frame_num / (fps * duration)))
            est_progress = min(est_progress, 90)

            task["progress"] = est_progress
            task["message"] = f"Сцена {scene_counter} • кадр {frame_num}"

            print(f"[BACKGROUND] Обнаружена сцена #{scene_counter} на кадре {frame_num}, ~{est_progress}%")

        print("[BACKGROUND] Запуск детекции с callback...")
        # Выполняем в отдельном потоке, чтобы не блокировать цикл WS
        await asyncio.to_thread(
            lambda: scene_manager.detect_scenes(video=video, show_progress=False, callback=on_scene_detected)
        )

        scene_list = scene_manager.get_scene_list()
        print(f"[BACKGROUND] Найдено сцен: {len(scene_list)}")

        # 3. Форматирование
        task["progress"] = 92
        task["message"] = f"Форматирование {len(scene_list)} сцен..."

        scenes_formatted = []
        total = len(scene_list) or 1
        for i, (start, end) in enumerate(scene_list):
            start_sec = start.get_seconds()
            end_sec   = end.get_seconds()

            scenes_formatted.append({
                "start_sec": round(start_sec, 1),
                "end_sec":   round(end_sec, 1),
                "duration":  round(end_sec - start_sec, 1),
                "start": f"{int(start_sec // 60):02d}:{int(start_sec % 60):02d}",
                "end":   f"{int(end_sec // 60):02d}:{int(end_sec % 60):02d}",
            })

            task["progress"] = 92 + int(7 * (i + 1) / total)
            print(f"[BACKGROUND] Обработана сцена {i+1}/{total}, прогресс {task['progress']}%")

        # 4. Сохранение
        task["progress"] = 98
        task["message"] = "Сохранение кэша..."

        result_data = {
            "status": "processed",
            "video_duration": round(duration, 1),
            "scenes": scenes_formatted,
            "scene_count": len(scenes_formatted),
            "method": "PySceneDetect ContentDetector threshold=27"
        }

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)

        task["progress"] = 100
        task["status"] = "completed"
        task["result"] = result_data
        task["message"] = f"Готово! Сцен: {len(scenes_formatted)}"
        print(f"[BACKGROUND] Задача {task_id} завершена успешно")

    except Exception as e:
        task["status"] = "error"
        task["error"] = str(e)
        task["progress"] = 0
        print(f"[BACKGROUND ERROR] {task_id} → {type(e).__name__}: {str(e)}")
    finally:
        await asyncio.sleep(1800)           # 30 мин кэшируем задачу
        active_tasks.pop(task_id, None)
        print(f"[BACKGROUND] {task_id} удалена")

# ─── Остальные эндпоинты (без изменений) ────────────────────────────────────

@app.post("/upload/")
async def upload_video(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    print(f"[UPLOAD] Сохранён → {file_path}")
    return {"filename": file.filename}

@app.get("/scenes/{filename}")
async def get_scenes(filename: str):
    cache_path = get_scenes_cache_path(filename)
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"from_cache": True, **data}
    return {"from_cache": False, "scenes": [], "scene_count": 0}

@app.delete("/delete")
async def delete_video(filename: str = Query(...)):
    file_path  = os.path.join(UPLOAD_DIR, filename)
    cache_path = get_scenes_cache_path(filename)
    deleted = False
    if os.path.exists(file_path):
        os.remove(file_path)
        deleted = True
    if os.path.exists(cache_path):
        os.remove(cache_path)
    return {"status": "deleted" if deleted else "not_found", "filename": filename}

@app.get("/uploads/list")
async def list_uploads() -> List[str]:
    return [f for f in os.listdir(UPLOAD_DIR) if os.path.isfile(os.path.join(UPLOAD_DIR, f))]

@app.get("/thumbnail/{filename}/{start_sec}")
async def get_thumbnail(filename: str, start_sec: float):
    video_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(video_path):
        raise HTTPException(404, "Видео не найдено")

    seek_time = start_sec + 1.2
    thumb_filename = f"{filename.replace('.', '_')}_{start_sec:.1f}.jpg"
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)

    if not os.path.exists(thumb_path):
        cmd = [
            "ffmpeg", "-y", "-ss", str(seek_time), "-i", video_path,
            "-vframes", "1", "-q:v", "2", "-vf", "scale=640:-2", thumb_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    return FileResponse(thumb_path, media_type="image/jpeg")

@app.get("/debug-test")
async def debug_test():
    return {
        "cwd": os.getcwd(),
        "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0,
        "active_tasks": len(active_tasks)
    }