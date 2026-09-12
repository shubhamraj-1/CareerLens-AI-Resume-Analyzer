import { Menu, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface NavbarProps { onMenuClick: () => void; }

export function Navbar({ onMenuClick }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/");
  };

  return (
    <header
      className="sticky top-0 z-30 flex w-full min-h-16 items-center justify-between gap-x-2 border-b border-gray-200 bg-white px-3 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:border-white/[0.06] dark:bg-slate-950 dark:supports-[backdrop-filter]:bg-slate-950/80 sm:min-h-16 sm:gap-3 sm:px-4 sm:py-0 md:gap-3 lg:px-6"
    >
      <div className="flex min-h-10 min-w-0 flex-1 basis-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onMenuClick}
          className="shrink-0 rounded-xl p-2 text-gray-500 hover:bg-gray-100 sm:p-2 lg:hidden dark:hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="hidden min-w-0 flex-1 truncate text-xs font-semibold text-gray-500 sm:block sm:text-sm md:text-base dark:text-gray-400">
          AI Resume Analyzer
        </h1>
      </div>

      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1.5 md:gap-2">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9 shrink-0 rounded-xl sm:h-10 sm:w-10">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <button
          onClick={() => navigate("/profile")}
          className="flex max-w-full cursor-pointer items-center gap-1.5 border-l border-gray-200 pl-2 transition-opacity hover:opacity-80 sm:gap-2 sm:pl-3 md:gap-3 dark:border-white/10"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 sm:h-9 sm:w-9 sm:text-sm">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="hidden min-w-0 text-left md:block">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{user?.name || "User"}</p>
            <p className="text-[11px] capitalize text-gray-500 dark:text-gray-500">{user?.role?.replace(/_/g, " ") || "Member"}</p>
          </div>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-9 w-9 shrink-0 rounded-xl text-gray-400 hover:text-red-400 sm:h-10 sm:w-10"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
