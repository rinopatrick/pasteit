import { useState } from "react";

interface Issue {
  severity: string;
  line: number;
  message: string;
  suggestion: string;
}

interface Props {
  code: string;
  language: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-300", icon: "🔴" },
  warning: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-300", icon: "🟡" },
  info: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-300", icon: "🔵" },
};

export default function CodeReviewPanel({ code, language }: Props) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const handleReview = async () => {
    setLoading(true);
    setShow(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });
      const data = await res.json();
      setIssues(data.issues || []);
      setScore(data.score);
    } catch {
      setIssues([]);
      setScore(null);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-400";
    if (s >= 60) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="mt-4">
      <button
        onClick={handleReview}
        disabled={loading}
        className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? "Reviewing..." : "🔍 Code Review"}
      </button>

      {show && (
        <div className="mt-3 bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Code Review</span>
            {score !== null && (
              <span className={`text-lg font-bold font-mono ${getScoreColor(score)}`}>{score}/100</span>
            )}
          </div>

          {issues.length === 0 ? (
            <div className="p-4 text-center text-sm text-emerald-400">No issues found ✅</div>
          ) : (
            <div className="divide-y divide-white/5">
              {issues.map((issue, i) => {
                const sev = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.info;
                return (
                  <div key={i} className={`px-4 py-3 ${sev.bg} border-l-2`}>
                    <div className="flex items-start gap-2">
                      <span>{sev.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${sev.text}`}>
                          Line {issue.line}: {issue.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">💡 {issue.suggestion}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
