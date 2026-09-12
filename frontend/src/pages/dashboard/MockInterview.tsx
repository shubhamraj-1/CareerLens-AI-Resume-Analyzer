import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Upload, CheckCircle2, XCircle, ChevronRight, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resumeApi } from "@/api/resume";
import type { Resume, InterviewQuestion, AnswerEvaluation } from "@/types";

/** Strip leading "- " bullet and render **bold** markdown inline */
function renderMarkdown(text: string) {
  const cleaned = text.replace(/^-\s+/, "");
  return cleaned.split("**").map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

export function MockInterviewPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [totalScore, setTotalScore] = useState<number[]>([]);

  useEffect(() => {
    setIsLoading(true);
    resumeApi.getHistory().then((data) => {
      setResumes(data);
      if (data.length > 0) setSelectedResumeId(data[0].id);
    }).catch(() => {}).finally(() => setIsLoading(false));
  }, []);

  const startInterview = async () => {
    if (!selectedResumeId) return;
    setIsGenerating(true);
    toast.loading("Preparing questions...", { id: "mock" });
    try {
      const r = await resumeApi.getInterviewQuestions(selectedResumeId);
      setQuestions(r.questions.slice(0, 10));
      setCurrentIdx(0); setAnswer(""); setEvaluation(null); setTotalScore([]);
      toast.success("Interview started!", { id: "mock" });
    } catch { toast.error("Failed", { id: "mock" }); }
    finally { setIsGenerating(false); }
  };

  const submitAnswer = async () => {
    if (!answer.trim() || !selectedResumeId) return;
    setIsEvaluating(true);
    try {
      const r = await resumeApi.evaluateAnswer(selectedResumeId, questions[currentIdx].question, answer);
      setEvaluation(r);
      setTotalScore((prev) => [...prev, r.score]);
      const s10 = r.scoreOutOf10 ?? Math.max(1, Math.min(10, Math.round(r.score / 10)));
      toast.success(`Score: ${s10}/10 — ${r.grade}`);
    } catch { toast.error("Evaluation failed"); }
    finally { setIsEvaluating(false); }
  };

  const nextQuestion = () => {
    setCurrentIdx((prev) => prev + 1);
    setAnswer(""); setEvaluation(null);
  };

  const avgScore = totalScore.length > 0 ? Math.round(totalScore.reduce((a, b) => a + b, 0) / totalScore.length) : 0;
  const currentQ = questions[currentIdx];
  const isFinished = questions.length > 0 && currentIdx >= questions.length;

  if (isLoading) {
    return (
      <div className="mx-auto flex h-64 min-h-0 w-full min-w-0 max-w-4xl items-center justify-center overflow-x-hidden px-4 sm:px-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col items-center justify-center overflow-x-hidden px-4 py-20 sm:px-6">
        <Mic className="mb-4 h-16 w-16 shrink-0 text-gray-300 dark:text-gray-600" />
        <h2 className="mb-2 text-balance text-center text-xl font-semibold text-gray-900 dark:text-white sm:text-2xl">No Resumes Found</h2>
        <Link to="/upload" className="w-full max-w-xs sm:max-w-none sm:w-auto">
          <Button className="w-full gap-2 sm:w-auto">
            <Upload className="h-4 w-4" /> Upload Resume
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 overflow-x-hidden px-4 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-balance text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">AI Mock Interview</h1>
        <p className="text-balance text-sm text-gray-500 dark:text-gray-400 sm:text-base">
          Practice interviews with AI feedback on your answers
        </p>
      </motion.div>

      {/* Start Card */}
      {questions.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full min-w-0">
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardContent className="flex w-full min-w-0 flex-col items-center py-8 text-center sm:py-12">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                <Mic className="mb-4 h-16 w-16 shrink-0 text-brand-500" />
              </motion.div>
              <h3 className="mb-2 text-balance text-xl font-semibold text-gray-900 dark:text-white sm:text-2xl">Ready to Practice?</h3>
              <p className="mb-4 max-w-prose text-balance px-0 text-sm text-gray-500 sm:px-2 sm:text-base">
                AI will ask questions based on your resume. You type your answer, and AI evaluates it!
              </p>
              <div className="mb-6 flex w-full min-w-0 flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
                <select
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                  className="h-9 min-w-0 w-full rounded-lg border border-gray-300 bg-white px-3 text-left text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 sm:w-auto sm:min-w-48"
                >
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fileName}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={startInterview}
                  isLoading={isGenerating}
                  className="w-full min-w-0 gap-2 shadow-lg shadow-brand-500/25 sm:w-auto"
                >
                  <Mic className="h-4 w-4 shrink-0" /> Start Mock Interview
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Interview In Progress — on mobile, answer/submit (or next) is fixed to bottom with blur */}
      {currentQ && !isFinished && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="flex min-h-0 w-full min-w-0 max-w-full flex-col space-y-4 overflow-x-hidden max-md:min-h-[50vh] max-md:pb-0"
          >
            <div className="min-h-0 w-full min-w-0 max-md:flex-1 max-md:overflow-y-auto max-md:overflow-x-hidden max-md:pb-[calc(13rem+env(safe-area-inset-bottom,0px))] md:pb-0">
              {/* Progress */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Question {currentIdx + 1} of {questions.length}</span>
                {totalScore.length > 0 && <Badge variant="default">Avg Score: {avgScore}%</Badge>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-500"
                  animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
                />
              </div>

              <Card>
                <CardHeader>
                  <Badge variant="default" className="mb-2 w-fit">{currentQ.category}</Badge>
                  <CardTitle className="text-lg">{currentQ.question}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer here... (Use the STAR method: Situation, Task, Action, Result)"
                    rows={6}
                    disabled={!!evaluation}
                    className="hidden w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 md:block"
                  />

                  {!evaluation ? (
                    <Button
                      onClick={submitAnswer}
                      isLoading={isEvaluating}
                      disabled={!answer.trim()}
                      className="hidden w-full gap-2 shadow-lg shadow-brand-500/25 md:inline-flex"
                    >
                      <Send className="h-4 w-4" /> Submit Answer
                    </Button>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-50 to-purple-50 p-4 dark:from-brand-900/20 dark:to-purple-900/20">
                        <div>
                          <p className="text-xs text-gray-500">Your Score</p>
                          <p className="text-3xl font-bold text-brand-600">
                            {evaluation.scoreOutOf10 ?? Math.max(1, Math.min(10, Math.round(evaluation.score / 10)))}
                            <span className="text-lg font-semibold text-gray-500">/10</span>
                          </p>
                          <p className="text-xs text-gray-500">≈ {evaluation.score}% on full scale</p>
                        </div>
                        <Badge variant={evaluation.score >= 70 ? "success" : evaluation.score >= 50 ? "warning" : "danger"} className="text-sm">
                          {evaluation.grade}
                        </Badge>
                      </div>

                      {evaluation.starFeedback && (
                        <div className="rounded-lg border border-brand-200 bg-white/80 p-3 text-xs leading-relaxed text-gray-800 dark:border-brand-800 dark:bg-gray-900/60 dark:text-gray-200">
                          <p className="mb-1 font-semibold text-brand-700 dark:text-brand-300">STAR feedback</p>
                          <p className="whitespace-pre-wrap">{evaluation.starFeedback}</p>
                        </div>
                      )}

                      {evaluation.strengths.length > 0 && (
                        <div className="space-y-1">
                          {evaluation.strengths.map((s, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <CheckCircle2 className="mt-0.5 h-3 w-3 text-green-500" />
                              <span className="text-green-700 dark:text-green-400">{renderMarkdown(s)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {evaluation.feedback.length > 0 && (
                        <div className="space-y-1">
                          {evaluation.feedback.map((f, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <XCircle className="mt-0.5 h-3 w-3 text-red-500" />
                              <span className="text-red-700 dark:text-red-400">{renderMarkdown(f)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button onClick={nextQuestion} className="hidden w-full gap-2 md:inline-flex">
                        {currentIdx < questions.length - 1 ? (
                          <>
                            <ChevronRight className="h-4 w-4" /> Next Question
                          </>
                        ) : (
                          <>Finish Interview</>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Mobile: fixed answer / next area */}
            <div
              className="z-20 w-full min-w-0 max-w-full border-t border-gray-200 bg-white/85 p-4 backdrop-blur-md dark:border-gray-700 dark:bg-slate-950/85 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:overflow-x-hidden md:hidden"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {!evaluation ? (
                <div className="space-y-2">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer (STAR: Situation, Task, Action, Result)..."
                    rows={4}
                    className="w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <Button
                    onClick={submitAnswer}
                    isLoading={isEvaluating}
                    disabled={!answer.trim()}
                    className="w-full gap-2 shadow-lg shadow-brand-500/25"
                  >
                    <Send className="h-4 w-4" /> Submit Answer
                  </Button>
                </div>
              ) : (
                <Button onClick={nextQuestion} className="w-full gap-2">
                  {currentIdx < questions.length - 1 ? (
                    <>
                      <ChevronRight className="h-4 w-4" /> Next Question
                    </>
                  ) : (
                    <>Finish Interview</>
                  )}
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Finished */}
      {isFinished && (
        <motion.div
          className="w-full min-w-0 max-w-full overflow-x-hidden"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="w-full min-w-0 max-w-full overflow-hidden">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <span className="mb-4 text-6xl">🎉</span>
              <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">Interview Complete!</h3>
              <p className="mb-4 text-4xl font-bold text-brand-600">{avgScore}%</p>
              <p className="mb-6 text-sm text-gray-500">Average score across {totalScore.length} questions</p>
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                {totalScore.map((s, i) => (
                  <Badge key={i} variant={s >= 70 ? "success" : s >= 50 ? "warning" : "danger"}>Q{i + 1}: {s}%</Badge>
                ))}
              </div>
              <Button onClick={() => { setQuestions([]); setCurrentIdx(0); setTotalScore([]); setEvaluation(null); setAnswer(""); }} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Try Again
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
