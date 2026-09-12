import { createBrowserRouter, useRouteError, Link } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "./ProtectedRoute";

// Pages
import { HomePage } from "@/pages/Home";
import { LoginPage } from "@/pages/auth/Login";
import { RegisterPage } from "@/pages/auth/Register";
import { DashboardPage } from "@/pages/dashboard/Dashboard";
import { UploadResumePage } from "@/pages/dashboard/UploadResume";
import { ResumeAnalysisPage } from "@/pages/dashboard/ResumeAnalysis";
import { JobMatchPage } from "@/pages/dashboard/JobMatch";
import { InterviewPrepPage } from "@/pages/dashboard/InterviewPrep";
import { ContentGeneratorPage } from "@/pages/dashboard/ContentGenerator";
import { ResumeComparePage } from "@/pages/dashboard/ResumeCompare";
import { AiChatPage } from "@/pages/dashboard/AiChat";
import { VisualizationsPage } from "@/pages/dashboard/Visualizations";
import { CareerHubPage } from "@/pages/dashboard/CareerHub";
import { MockInterviewPage } from "@/pages/dashboard/MockInterview";
import { HistoryPage } from "@/pages/dashboard/History";
import { ProfilePage } from "@/pages/dashboard/Profile";
import { NotFoundPage } from "@/pages/NotFound";
import { PricingPage } from "@/pages/Pricing";
import { PurchasePage } from "@/pages/Purchase";
import { ProGate } from "@/components/ProGate";

function RouteErrorBoundary() {
  const error = useRouteError() as Error;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
        <h2 className="mb-2 text-xl font-bold text-red-600 dark:text-red-400">
          Something went wrong
        </h2>
        <p className="mb-4 text-sm text-red-500 dark:text-red-300">
          {error?.message || "An unexpected error occurred"}
        </p>
        <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-red-100 p-3 text-left text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error?.stack || String(error)}
        </pre>
        <Link
          to="/dashboard"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Reload Page
        </Link>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/pricing",
    element: <PricingPage />,
  },
  {
    path: "/purchase",
    element: <PurchasePage />,
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/dashboard", element: <DashboardPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/upload", element: <UploadResumePage />, errorElement: <RouteErrorBoundary /> },
      { path: "/analysis", element: <ResumeAnalysisPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/job-match", element: <JobMatchPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/interview-prep", element: <InterviewPrepPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/content-generator", element: <ProGate feature="AI Content Generator"><ContentGeneratorPage /></ProGate>, errorElement: <RouteErrorBoundary /> },
      { path: "/compare", element: <ResumeComparePage />, errorElement: <RouteErrorBoundary /> },
      { path: "/ai-chat", element: <AiChatPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/visualize", element: <VisualizationsPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/career-hub", element: <CareerHubPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/mock-interview", element: <ProGate feature="Mock Interview Prep"><MockInterviewPage /></ProGate>, errorElement: <RouteErrorBoundary /> },
      { path: "/history", element: <HistoryPage />, errorElement: <RouteErrorBoundary /> },
      { path: "/profile", element: <ProfilePage />, errorElement: <RouteErrorBoundary /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
