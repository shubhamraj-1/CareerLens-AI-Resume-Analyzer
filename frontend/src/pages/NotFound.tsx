import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, LayoutDashboard, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-screen min-w-0 items-center justify-center overflow-x-hidden overflow-y-hidden bg-slate-950 px-3 sm:px-4 md:px-6 lg:px-8">
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/15 blur-[120px]" />
        <div className="absolute -right-32 bottom-0 h-[350px] w-[350px] rounded-full bg-purple-600/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/30"
        >
          <Brain className="h-7 w-7 text-white" />
        </motion.div>

        {/* Giant 404 */}
        <motion.h1
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 120 }}
          className="mb-4 text-[10rem] font-black leading-none tracking-tighter sm:text-[12rem]"
        >
          <span className="bg-gradient-to-b from-indigo-400 via-purple-400 to-indigo-600/40 bg-clip-text text-transparent">
            404
          </span>
        </motion.h1>

        {/* Sub-headline */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-3 text-xl font-bold text-white sm:text-2xl"
        >
          Oops! This page got lost in the ATS system
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mx-auto mb-10 max-w-md text-gray-400"
        >
          The page you're looking for doesn't exist, was moved, or got filtered out. Let's get you back on track.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link to="/dashboard">
            <Button size="lg" className="gap-2 px-8 shadow-xl shadow-indigo-500/25 transition-shadow hover:shadow-2xl hover:shadow-indigo-500/40">
              <LayoutDashboard className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <Link to="/">
            <Button size="lg" variant="outline" className="gap-2 border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white">
              <Home className="h-4 w-4" />
              Go to Home
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
