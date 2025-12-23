export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200"></div>
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-600 absolute top-0"></div>
      </div>
      <p className="text-gray-600 text-lg mt-6 font-medium">加载数据中...</p>
    </div>
  );
}
