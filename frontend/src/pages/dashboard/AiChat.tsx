import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Bot, Send, User, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resumeApi } from "@/api/resume";
import type { Resume, ChatHistoryTurn } from "@/types";

interface Message { role: "user" | "ai"; text: string }

const SUGGESTIONS = [
  "How can I improve my experience section?",
  "What skills am I missing?",
  "How's my ATS score?",
  "How to improve my projects section?",
  "What should my summary look like?",
  "How to make my resume ATS-friendly?",
];

export function AiChatPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Hi! 👋 I'm your AI Resume Assistant. Ask me anything about your resume — how to improve sections, what keywords are missing, ATS tips, and more!\n\nSelect a resume above, then ask away!" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInit, setIsInit] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resumeApi.getHistory().then((data) => {
      setResumes(data);
      if (data.length > 0) setSelectedResumeId(data[0].id);
    }).catch(() => {}).finally(() => setIsInit(false));
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async (text?: string) => {
    const q = (text || input).trim();
    if (!q || !selectedResumeId) return;
    setInput("");
    const historyForApi: ChatHistoryTurn[] = messages.slice(1).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setIsLoading(true);
    try {
      const res = await resumeApi.chat(selectedResumeId, q, historyForApi);
      setMessages((prev) => [...prev, { role: "ai", text: res.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", text: "Sorry, something went wrong. Please try again!" }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isInit) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>;

  if (resumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Bot className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">No Resumes Found</h2>
        <p className="mb-6 text-gray-500">Upload a resume to start chatting</p>
        <Link to="/upload"><Button className="gap-2"><Upload className="h-4 w-4" /> Upload Resume</Button></Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 md:text-3xl dark:text-white">AI Resume Chat</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
          <select value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)}
            className="flex h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            {resumes.map((r) => <option key={r.id} value={r.id}>{r.fileName}</option>)}
          </select>
          <span className="text-xs text-gray-500">Ask anything about this resume</span>
        </div>
      </motion.div>

      {/* Chat Area — on mobile, composer is fixed to bottom; messages have extra bottom padding so nothing hides behind it */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          {/* Messages + suggestions (scroll) */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 pb-28 max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:pb-4 scrollbar-thin">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex w-full min-w-0 gap-2 sm:gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    msg.role === "ai" ? "bg-gradient-to-br from-brand-500 to-purple-500 text-white" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  {msg.role === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />}
                </div>
                <div
                  className={`min-w-0 flex-1 ${msg.role === "user" ? "flex justify-end" : "flex justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${
                      msg.role === "ai"
                        ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        : "bg-brand-600 text-white"
                    }`}
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {msg.text.split("**").map((part, j) =>
                      j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div className="flex w-full min-w-0 gap-2 sm:gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="inline-block min-w-0 max-w-[90%] break-words rounded-2xl bg-gray-100 px-4 py-3 sm:max-w-[75%] dark:bg-gray-800">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />

            {messages.length <= 2 && (
              <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
                <p className="mb-2 text-xs font-medium text-gray-500">Quick questions:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-left text-xs text-gray-700 transition-all hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-600"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer — fixed to viewport bottom on small screens only */}
          <div
            className="shrink-0 border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-slate-900 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-20 max-md:border-t max-md:bg-white/85 max-md:backdrop-blur-md max-md:dark:bg-slate-950/85 md:static md:bg-white md:backdrop-blur-none md:dark:bg-slate-900"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="mx-auto flex max-w-full gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your resume..."
                className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <Button type="submit" disabled={!input.trim() || isLoading} className="shrink-0 rounded-xl shadow-lg shadow-brand-500/25">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
