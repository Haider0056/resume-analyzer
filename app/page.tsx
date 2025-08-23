import ResumeUploader from "@/components/resumeUpload";
export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen w-full bg-gray-50 p-6">
      <ResumeUploader />
    </div>
  );
}
