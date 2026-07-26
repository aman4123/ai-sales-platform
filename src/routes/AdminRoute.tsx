import { Navigate, Outlet } from "react-router";
import { useAuth } from "../contexts/auth-context";

export default function AdminRoute() {
  const { user } = useAuth();
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
    ? <Outlet />
    : <Navigate to="/dashboard" replace />;
}
