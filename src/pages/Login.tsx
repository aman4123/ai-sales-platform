import { Link } from "react-router-dom";

export default function Login() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">

      <div className="bg-slate-900 p-8 rounded-xl w-96">

        <h2 className="text-3xl font-bold text-white">
          Login
        </h2>

        <input
          className="w-full mt-6 p-3 rounded bg-slate-800 text-white"
          placeholder="Email"
        />

        <input
          type="password"
          className="w-full mt-4 p-3 rounded bg-slate-800 text-white"
          placeholder="Password"
        />

        <Link
          to="/dashboard"
          className="block text-center mt-6 bg-blue-600 py-3 rounded"
        >
          Login
        </Link>

      </div>

    </div>
  );
}