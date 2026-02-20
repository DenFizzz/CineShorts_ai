from fastapi import FastAPI, UploadFile, File
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.post("/upload/")
async def upload_video(file: UploadFile = File(...)):
    file_path = UPLOAD_DIR / file.filename
    with file_path.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)
    return {"message": "ok", "filename": file.filename, "size_mb": file_path.stat().st_size / (1024**2)}


@app.delete("/delete/{filename}")
async def delete_video(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    try:
        file_path.unlink()
        return {"message": f"Файл {filename} удалён"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления: {str(e)}")