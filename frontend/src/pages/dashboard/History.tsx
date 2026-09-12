import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Trash2, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { resumeApi } from "@/api/resume";
import type { Resume } from "@/types";
import { getScoreLabel } from "@/utils/constants";

export function HistoryPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    resumeApi
      .getHistory()
      .then(setResumes)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await resumeApi.delete(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
      toast.success("Resume deleted successfully");
    } catch {
      toast.error("Failed to delete resume");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Resume History
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              All your uploaded resumes and their scores
            </p>
          </div>
          <Link to="/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload New
            </Button>
          </Link>
        </div>
      </motion.div>

      {resumes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              No Resumes Found
            </h3>
            <p className="mb-6 text-gray-500">
              Upload your first resume to get started
            </p>
            <Link to="/upload">
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Resume
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume, index) => (
            <motion.div
              key={resume.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-brand-500" />
                      <div>
                        <CardTitle className="text-base">
                          {resume.fileName || "Resume"}
                        </CardTitle>
                        <p className="text-xs text-gray-500">
                          {new Date(resume.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        (resume.atsScore || 0) >= 70
                          ? "success"
                          : (resume.atsScore || 0) >= 40
                          ? "warning"
                          : "danger"
                      }
                    >
                      {resume.atsScore || 0}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-gray-500">ATS Score</span>
                      <span className="font-medium">
                        {getScoreLabel(resume.atsScore || 0)}
                      </span>
                    </div>
                    <Progress value={resume.atsScore || 0} size="sm" />
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/analysis?resumeId=${resume.id}`}
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full gap-1">
                        <ExternalLink className="h-3 w-3" />
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(resume.id)}
                      className="gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
