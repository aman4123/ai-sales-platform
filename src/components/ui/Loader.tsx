export default function Loader() {
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-live="polite">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500"
        aria-hidden="true"
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
