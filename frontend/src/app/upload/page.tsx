import VideoUploader from "@/components/VideoUploader";

export default function UploadPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Загрузка и анализ видео</h1>
      <VideoUploader />
    </div>
  );
}