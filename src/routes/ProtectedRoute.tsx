import { Navigate, Outlet, useLocation } from "react-router-dom";
import Loader from "../components/ui/Loader";
import { useAuth } from "../contexts/auth-context";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <Loader />
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}
