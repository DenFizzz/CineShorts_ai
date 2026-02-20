import VideoUploader from "@/components/VideoUploader";

export default function UploadPage() {
  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl mb-8">Загрузить видео</h1>
      <VideoUploader />
    </main>
  );
}