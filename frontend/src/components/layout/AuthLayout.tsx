import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain } from "lucide-react";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen min-w-0 overflow-x-hidden">
      {/* Left Panel - Branding */}
      <div className="hidden w-1/2 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
            <Brain className="h-10 w-10 text-white" />
          </div>
          <h1 className="mb-4 text-4xl font-bold text-white">
            AI Resume Analyzer
          </h1>
          <p className="mx-auto max-w-md text-lg text-brand-200">
            Get instant ATS scores, AI-powered suggestions, and find your
            perfect job match with our intelligent resume analysis platform.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-6">
            {[
              { label: "ATS Score", value: "98%" },
              { label: "Job Matches", value: "500+" },
              { label: "Users", value: "10K+" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-white/10 p-4 backdrop-blur-sm"
              >
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-brand-200">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex w-full items-center justify-center bg-white p-3 sm:p-4 md:p-6 lg:p-8 dark:bg-gray-900 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Outlet />
        </motion.div>
      </div>
    </div>
  );
}
