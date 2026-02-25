export function LoadingScreen() {
  return (
    <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-wasp-500 flex items-center justify-center animate-pulse">
          <span className="text-white text-2xl font-bold">W</span>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}
