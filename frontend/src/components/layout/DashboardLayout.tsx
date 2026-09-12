import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { DashboardTopBar } from "./DashboardTopBar";

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-slate-100 dvh-screen dark:bg-slate-950">
      {/* Subtle gradient orbs in background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden dark:block hidden">
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-purple-500/5 blur-3xl" />
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <DashboardTopBar />
        <main className="dashboard-scroll flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-7 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
