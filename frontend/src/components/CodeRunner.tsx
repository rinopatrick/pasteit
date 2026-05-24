import { useState } from "react";

const EXECUTABLE_LANGS = ["python", "javascript", "bash"];

interface Props {
  code: string;
  language: string;
}

export default function CodeRunner({ code, language }: Props) {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [show, setShow] = useState(false);

  if (!EXECUTABLE_LANGS.includes(language.toLowerCase())) return null;

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    setError(null);
    setExitCode(null);
    setShow(true);
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: language.toLowerCase() }),
      });
      const data = await res.json();
      setOutput(data.output || "");
      setError(data.error || "");
      setExitCode(data.exit_code);
    } catch {
      setError("Failed to execute code");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={handleRun}
        disabled={running}
        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {running ? (
          <>
            <span className="animate-spin">⏳</span> Running...
          </>
        ) : (
          <>▶ Run</>
        )}
      </button>

      {show && (
        <div className="mt-3 bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Output</span>
            {exitCode !== null && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${exitCode === 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                exit: {exitCode}
              </span>
            )}
          </div>
          <pre className="p-4 text-sm font-mono text-slate-200 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
            {output || "(no output)"}
          </pre>
          {error && (
            <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
              <pre className="text-sm font-mono text-red-300 whitespace-pre-wrap break-words">{error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
