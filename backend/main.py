from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
import os
import time
from scenedetect import detect, AdaptiveDetector

app = FastAPI()

# Папка для загруженных видео
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/upload/")
async def upload_video(file: UploadFile = File(...)):
    if not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Только видеофайлы")

    file_path = UPLOAD_DIR / file.filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    size_mb = file_path.stat().st_size / (1024 * 1024)
    return {
        "message": "Файл загружен",
        "filename": file.filename,
        "size_mb": round(size_mb, 2)
    }

@app.delete("/delete")
async def delete_video(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    file_path.unlink()
    return {"message": f"Файл {filename} удалён"}

@app.post("/process")
async def process_video(filename: str):
    video_path = UPLOAD_DIR / filename
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Видео не найдено")

    start_time = time.time()

    try:
        scenes = detect(
            str(video_path),
            AdaptiveDetector(threshold=3.0, min_scene_len=15),
        )

        scene_list = []
        for i, scene in enumerate(scenes):
            start_sec = scene[0].get_seconds()
            end_sec = scene[1].get_seconds()
            duration = end_sec - start_sec

            scene_list.append({
                "scene_id": i + 1,
                "start_time": round(start_sec, 2),
                "end_time": round(end_sec, 2),
                "duration": round(duration, 2),
            })

        processing_time = round(time.time() - start_time, 2)

        return {
            "message": "Сцены обработаны",
            "filename": filename,
            "scene_count": len(scenes),
            "scenes": scene_list,
            "processing_time_sec": processing_time
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки: {str(e)}")