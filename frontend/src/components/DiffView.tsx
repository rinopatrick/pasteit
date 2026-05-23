import { useState } from "react";

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  lineNumA?: number;
  lineNumB?: number;
}

function computeDiff(textA: string, textB: string): DiffLine[] {
  const linesA = textA.split("\n");
  const linesB = textB.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const ops: { type: "add" | "remove" | "context"; lineA?: string; lineB?: string; lineNumA?: number; lineNumB?: number }[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.unshift({ type: "context", lineA: linesA[i - 1], lineNumA: i, lineNumB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "add", lineB: linesB[j - 1], lineNumB: j });
      j--;
    } else {
      ops.unshift({ type: "remove", lineA: linesA[i - 1], lineNumA: i });
      i--;
    }
  }

  let lineNumA = 1;
  let lineNumB = 1;
  for (const op of ops) {
    if (op.type === "context") {
      result.push({ type: "context", content: op.lineA || "", lineNumA, lineNumB });
      lineNumA++;
      lineNumB++;
    } else if (op.type === "remove") {
      result.push({ type: "remove", content: op.lineA || "", lineNumA });
      lineNumA++;
    } else {
      result.push({ type: "add", content: op.lineB || "", lineNumB });
      lineNumB++;
    }
  }

  return result;
}

function DiffLineComponent({ line }: { line: DiffLine }) {
  const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
  const cls =
    line.type === "add"
      ? "diff-add"
      : line.type === "remove"
        ? "diff-remove"
        : line.type === "header"
          ? "diff-header"
          : "diff-context";

  return (
    <div className={`diff-line ${cls}`}>
      <span className="inline-block w-8 text-right pr-2 text-slate-600 select-none">
        {line.type === "remove" || line.type === "context" ? line.lineNumA : ""}
      </span>
      <span className="inline-block w-8 text-right pr-2 text-slate-600 select-none">
        {line.type === "add" || line.type === "context" ? line.lineNumB : ""}
      </span>
      <span className="select-none mr-2">{prefix}</span>
      <span>{line.content}</span>
    </div>
  );
}

export default function DiffView() {
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [pasteIdA, setPasteIdA] = useState("");
  const [pasteIdB, setPasteIdB] = useState("");
  const [mode, setMode] = useState<"text" | "paste">("text");
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    setLoading(true);
    try {
      let a = textA;
      let b = textB;

      if (mode === "paste") {
        if (pasteIdA) {
          const res = await fetch(`/api/pastes/${pasteIdA}`);
          if (res.ok) {
            const data = await res.json();
            a = data.is_encrypted ? "[encrypted]" : data.content;
          }
        }
        if (pasteIdB) {
          const res = await fetch(`/api/pastes/${pasteIdB}`);
          if (res.ok) {
            const data = await res.json();
            b = data.is_encrypted ? "[encrypted]" : data.content;
          }
        }
      }

      setDiff(computeDiff(a, b));
    } catch {
      alert("Failed to load pastes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Compare / Diff</h1>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode("text")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            mode === "text" ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Paste Text
        </button>
        <button
          onClick={() => setMode("paste")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            mode === "paste" ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-transparent text-slate-400 hover:text-white"
          }`}
        >
          By Paste ID
        </button>
      </div>

      {mode === "text" ? (
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Original (A)</label>
            <textarea
              value={textA}
              onChange={(e) => setTextA(e.target.value)}
              placeholder="Paste original text..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm min-h-[200px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Modified (B)</label>
            <textarea
              value={textB}
              onChange={(e) => setTextB(e.target.value)}
              placeholder="Paste modified text..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm min-h-[200px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Paste ID A</label>
            <input
              value={pasteIdA}
              onChange={(e) => setPasteIdA(e.target.value)}
              placeholder="e.g. abc123"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Paste ID B</label>
            <input
              value={pasteIdB}
              onChange={(e) => setPasteIdB(e.target.value)}
              placeholder="e.g. def456"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleCompare}
        disabled={loading}
        className="mb-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-2 px-6 rounded-xl transition-all text-sm"
      >
        {loading ? "Comparing..." : "Compare"}
      </button>

      {diff && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-white/10 flex items-center gap-4 text-xs text-slate-500">
            <span className="text-green-400">+{diff.filter((l) => l.type === "add").length} additions</span>
            <span className="text-red-400">-{diff.filter((l) => l.type === "remove").length} deletions</span>
          </div>
          <div className="max-h-[500px] overflow-auto py-2">
            {diff.map((line, i) => (
              <DiffLineComponent key={i} line={line} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
