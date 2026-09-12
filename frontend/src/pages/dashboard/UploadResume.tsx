import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import ReactGA from "react-ga4"; // Added GA4 Import
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Loader2,
  User,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resumeApi } from "@/api/resume";
import { SAMPLE_RESUMES, type SampleResume } from "@/data/sampleResumes";

export function UploadResumePage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);

  const handleSample = (sample: SampleResume) => {
    if (loadingSample) return;

    // Track Sample View Event
    ReactGA.event({
      category: "Resume Features",
      action: "View_Sample_CV",
      label: `Sample: ${sample.name}`,
    });

    setLoadingSample(sample.id);
    toast.loading(`Loading ${sample.name}'s analysis...`, { id: "sample" });
    
    setTimeout(() => {
      setLoadingSample(null);
      toast.success("Viewing sample analysis. Upload your own CV to get personalized insights!", { id: "sample", duration: 5000 });
      navigate(`/analysis?resumeId=${sample.id}&sample=true`, {
        state: { sampleData: sample },
      });
    }, 2000);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadError("");
    setUploadProgress(0);
    const selectedFile = acceptedFiles[0];

    if (selectedFile) {
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedTypes.includes(selectedFile.type)) {
        setUploadError("Only PDF and DOCX files are accepted");
        toast.error("Invalid file type", {
          description: "Please upload a PDF or DOCX file",
        });
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setUploadError("File size must be less than 5MB");
        toast.error("File too large", {
          description: "Maximum file size is 5MB",
        });
        return;
      }
      setFile(selectedFile);
      toast.success("File selected!", {
        description: selectedFile.name,
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!file) return;

    // Track CV Upload Event
    ReactGA.event({
      category: "Resume Features",
      action: "Upload_Personal_CV",
      label: `File Type: ${file.type}`,
    });

    setIsUploading(true);
    setUploadError("");

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const resume = await resumeApi.upload(file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setIsUploading(false);

      toast.success("Resume uploaded successfully!", {
        description: "Starting AI analysis...",
      });

      setIsAnalyzing(true);
      try {
        await resumeApi.analyze(resume.id);
        
        // Track Successful AI Analysis Event
        ReactGA.event({
          category: "AI Analysis",
          action: "Analysis_Complete",
          label: "Resume successfully processed by AI",
        });

        toast.success("Analysis complete!", {
          description: "Redirecting to your results...",
        });
      } catch (analyzeErr: unknown) {
        const ax = analyzeErr as { response?: { data?: { message?: string } } };
        const msg = ax.response?.data?.message || "Analysis could not complete. You can try Analyze from the Analysis page.";
        toast.error(msg, { id: "upload-analyze" });
      }

      setTimeout(() => {
        navigate(`/analysis?resumeId=${resume.id}`);
      }, 1000);
    } catch (err: unknown) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      const error = err as { response?: { data?: { message?: string } } };
      const msg = error.response?.data?.message || "Upload failed. Please try again.";
      setUploadError(msg);
      toast.error("Upload failed", { description: msg });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setUploadError("");
    setUploadProgress(0);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Upload Resume
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Upload your PDF resume to get an AI-powered analysis
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-500" />
              Resume File
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              {...getRootProps()}
              className={`group relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-300 ${
                isDragActive
                  ? "scale-[1.02] border-brand-500 bg-brand-50 shadow-lg shadow-brand-500/10 dark:bg-brand-900/10"
                  : "border-gray-300 hover:border-brand-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800/50"
              }`}
            >
              <input {...getInputProps()} />
              <motion.div
                animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Upload
                  className={`mx-auto mb-4 h-12 w-12 transition-colors duration-300 ${
                    isDragActive
                      ? "text-brand-500"
                      : "text-gray-400 group-hover:text-brand-400"
                  }`}
                />
              </motion.div>
              {isDragActive ? (
                <p className="text-lg font-medium text-brand-600 dark:text-brand-400">
                  Drop your resume here...
                </p>
              ) : (
                <div>
                  <p className="mb-1 text-gray-700 dark:text-gray-300">
                    <span className="font-semibold text-brand-600 dark:text-brand-400">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </p>
                  <p className="text-sm text-gray-500">PDF & DOCX supported (max 5MB)</p>
                </div>
              )}
            </div>

            <AnimatePresence>
              {file && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ type: "spring", damping: 20 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                        <FileText className="h-5 w-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(isUploading || isAnalyzing) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      {isAnalyzing ? (
                        <>
                          <Sparkles className="h-4 w-4 animate-pulse text-brand-500" />
                          AI is analyzing your resume...
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                          Uploading...
                        </>
                      )}
                    </span>
                    <span className="font-medium text-brand-600">
                      {isAnalyzing ? "Processing" : `${uploadProgress}%`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: isAnalyzing ? "100%" : `${uploadProgress}%`,
                      }}
                      transition={{
                        duration: isAnalyzing ? 2 : 0.3,
                        repeat: isAnalyzing ? Infinity : 0,
                        repeatType: "reverse",
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {uploadError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {uploadError}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {uploadProgress === 100 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                >
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  Resume uploaded successfully! Redirecting to analysis...
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              className="w-full gap-2"
              disabled={!file || isUploading || isAnalyzing}
              isLoading={isUploading || isAnalyzing}
              onClick={handleUpload}
            >
              <Upload className="h-4 w-4" />
              {isAnalyzing
                ? "Analyzing..."
                : isUploading
                  ? "Uploading..."
                  : "Upload & Analyze"}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-gray-50 px-4 text-xs font-bold uppercase tracking-widest text-gray-400 dark:bg-slate-950 dark:text-gray-600">
              or try a sample
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SAMPLE_RESUMES.map((sample) => {
            const isLoading = loadingSample === sample.id;
            return (
              <motion.button
                key={sample.id}
                onClick={() => handleSample(sample)}
                disabled={!!loadingSample}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                  isLoading
                    ? "border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-gray-200 hover:border-indigo-500/30 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-indigo-500/20 dark:hover:bg-white/[0.02]"
                }`}
              >
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isLoading
                    ? "bg-indigo-500/10"
                    : "bg-gray-100 group-hover:bg-indigo-500/10 dark:bg-gray-800"
                }`}>
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  ) : sample.role.includes("Marketing") ? (
                    <Briefcase className="h-5 w-5 text-indigo-500" />
                  ) : (
                    <User className="h-5 w-5 text-purple-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {sample.emoji} {sample.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {sample.role} • {sample.years}
                  </p>
                </div>
                <span className="text-xs font-medium text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                  View →
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { step: "1", title: "Upload PDF", desc: "Drop your resume file" },
                { step: "2", title: "AI Analysis", desc: "Automatic scoring" },
                { step: "3", title: "Get Results", desc: "Actionable insights" },
              ].map((item, i) => (
                <div key={item.step} className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-purple-500 text-sm font-bold text-white shadow-lg shadow-brand-500/25">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  {i < 2 && (
                    <div className="hidden h-px flex-1 bg-gradient-to-r from-gray-300 to-transparent sm:block dark:from-gray-600" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}