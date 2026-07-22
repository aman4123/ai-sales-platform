import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white p-6">

      <h1 className="text-8xl font-bold text-blue-500">
        404
      </h1>

      <h2 className="mt-6 text-3xl font-semibold">
        Page Not Found
      </h2>

      <p className="mt-3 text-slate-400 text-center max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>

      <Link
        to="/dashboard"
        className="mt-8 rounded-lg bg-blue-600 px-6 py-3 hover:bg-blue-700"
      >
        Back to Dashboard
      </Link>

    </div>
  );
}