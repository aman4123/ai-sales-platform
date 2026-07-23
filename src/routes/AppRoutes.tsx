import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Loader from "../components/ui/Loader";
import ProtectedRoute from "./ProtectedRoute";

const Landing = lazy(() => import("../pages/Landing"));
const Login = lazy(() => import("../pages/Login"));
const VerifyEmail = lazy(() => import("../pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("../pages/ForgotPassword"));
const ResendVerification = lazy(() => import("../pages/ResendVerification"));
const ResetPassword = lazy(() => import("../pages/ResetPassword"));
const RecoverAccount = lazy(() => import("../pages/RecoverAccount"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const Research = lazy(() => import("../pages/Research"));
const CRM = lazy(() => import("../pages/CRM"));
const Email = lazy(() => import("../pages/Email"));
const Reports = lazy(() => import("../pages/Reports"));
const Settings = lazy(() => import("../pages/Settings"));
const Profile = lazy(() => import("../pages/Profile"));
const NotFound = lazy(() => import("../pages/NotFound"));

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-slate-950"><Loader /></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login mode="login" />} />
          <Route path="/register" element={<Login mode="register" />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/resend-verification" element={<ResendVerification />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/recover-account" element={<RecoverAccount />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/research" element={<Research />} />
            <Route path="/crm" element={<CRM />} />
            <Route path="/email" element={<Email />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
