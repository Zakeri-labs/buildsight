export default function RootLoading() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-blue-100/80 dark:bg-blue-950/80"
    >
      <span className="block h-full w-2/5 rounded-e-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)] loading-progress-line" />
    </div>
  )
}
