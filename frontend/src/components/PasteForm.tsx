import { useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { TEMPLATES } from "../templates";

export interface PasteFormData {
  title: string;
  content: string;
  language: string;
  burn_after_read: boolean;
  expiry: string;
  password?: string;
  tags?: string[];
  e2e?: boolean;
}

const LANGUAGES = [
  "text", "javascript", "typescript", "python", "rust", "go", "java", "c", "cpp", "csharp",
  "html", "css", "json", "yaml", "sql", "bash", "powershell", "ruby", "php",
  "swift", "kotlin", "scala", "dart", "lua", "perl", "r", "matlab",
  "graphql", "dockerfile", "makefile", "markdown", "toml", "xml", "latex",
  "haskell", "elixir", "clojure",
];

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "10min", label: "10 minutes" },
  { value: "1hr", label: "1 hour" },
  { value: "1day", label: "1 day" },
  { value: "1week", label: "1 week" },
];

export const LANG_COLORS: Record<string, string> = {
  text: "bg-slate-500/20 text-slate-400",
  javascript: "bg-yellow-500/20 text-yellow-400",
  typescript: "bg-blue-500/20 text-blue-400",
  python: "bg-green-500/20 text-green-400",
  rust: "bg-orange-500/20 text-orange-400",
  go: "bg-cyan-500/20 text-cyan-400",
  java: "bg-red-500/20 text-red-400",
  c: "bg-gray-500/20 text-gray-400",
  cpp: "bg-pink-500/20 text-pink-400",
  csharp: "bg-purple-500/20 text-purple-400",
  html: "bg-orange-500/20 text-orange-400",
  css: "bg-blue-500/20 text-blue-400",
  json: "bg-amber-500/20 text-amber-400",
  yaml: "bg-teal-500/20 text-teal-400",
  sql: "bg-violet-500/20 text-violet-400",
  bash: "bg-green-500/20 text-green-400",
  powershell: "bg-blue-500/20 text-blue-400",
  ruby: "bg-red-500/20 text-red-400",
  php: "bg-indigo-500/20 text-indigo-400",
  swift: "bg-orange-500/20 text-orange-400",
  kotlin: "bg-purple-500/20 text-purple-400",
  scala: "bg-red-500/20 text-red-400",
  dart: "bg-cyan-500/20 text-cyan-400",
  lua: "bg-blue-500/20 text-blue-400",
  perl: "bg-indigo-500/20 text-indigo-400",
  r: "bg-blue-500/20 text-blue-400",
  matlab: "bg-orange-500/20 text-orange-400",
  graphql: "bg-pink-500/20 text-pink-400",
  dockerfile: "bg-blue-500/20 text-blue-400",
  makefile: "bg-gray-500/20 text-gray-400",
  markdown: "bg-slate-500/20 text-slate-400",
  toml: "bg-gray-500/20 text-gray-400",
  xml: "bg-orange-500/20 text-orange-400",
  latex: "bg-green-500/20 text-green-400",
  haskell: "bg-purple-500/20 text-purple-400",
  elixir: "bg-purple-500/20 text-purple-400",
  clojure: "bg-green-500/20 text-green-400",
};

interface Props {
  onSubmit: (data: PasteFormData) => void;
  loading?: boolean;
}

export default function PasteForm({ onSubmit, loading }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("text");
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expiry, setExpiry] = useState("never");
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [pastePassword, setPastePassword] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [tags, setTags] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: { line: number; message: string }[] } | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    onSubmit({
      title,
      content,
      language,
      burn_after_read: burnAfterRead,
      expiry,
      password: protectWithPassword ? pastePassword : undefined,
      tags: tagList.length > 0 ? tagList : undefined,
    });
  };

  const handleValidate = async () => {
    if (!content.trim()) return;
    setValidating(true);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, language }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setContent(template.content);
    setLanguage(template.language);
    setShowTemplates(false);
    setValidationResult(null);
  };

  const renderMarkdownPreview = () => {
    const html = marked.parse(content) as string;
    const clean = DOMPurify.sanitize(html);
    return (
      <div
        className="markdown-preview min-h-[300px] p-4 bg-white/5 rounded-xl border border-white/10"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
      />

      {/* Templates dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <span>Templates</span>
          <svg className={`w-4 h-4 transition-transform ${showTemplates ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showTemplates && (
          <div className="absolute z-10 mt-2 w-full bg-slate-800 border border-white/10 rounded-xl shadow-xl max-h-64 overflow-y-auto">
            {TEMPLATES.map((t, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyTemplate(t)}
                className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors flex items-center gap-3 border-b border-white/5 last:border-0"
              >
                <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-mono text-slate-300 shrink-0">{t.icon}</span>
                <div>
                  <p className="text-sm text-white font-medium">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.language}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Preview tabs for markdown */}
      {language === "markdown" && (
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => setPreviewMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              !previewMode ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              previewMode ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-transparent text-slate-400 hover:text-white"
            }`}
          >
            Preview
          </button>
        </div>
      )}

      {previewMode && language === "markdown" ? (
        renderMarkdownPreview()
      ) : (
        <div className="relative">
          <textarea
            placeholder="Paste your code here..."
            value={content}
            onChange={(e) => { setContent(e.target.value); setValidationResult(null); }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-slate-500 font-mono text-sm min-h-[300px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all leading-relaxed"
            spellCheck={false}
          />
          {/* Validation errors */}
          {validationResult && !validationResult.valid && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-xs font-semibold mb-2">Validation Errors:</p>
              {validationResult.errors.map((err, i) => (
                <p key={i} className="text-red-300 text-xs">Line {err.line}: {err.message}</p>
              ))}
            </div>
          )}
          {validationResult && validationResult.valid && (
            <div className="mt-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-green-400 text-xs font-semibold">Syntax is valid!</p>
            </div>
          )}
        </div>
      )}

      {/* Tags input */}
      <input
        type="text"
        placeholder="Tags (comma-separated, e.g. python, api, web)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={language}
          onChange={(e) => { setLanguage(e.target.value); setPreviewMode(false); setValidationResult(null); }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none cursor-pointer max-w-[200px]"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang} className="bg-slate-800 text-slate-200">{lang}</option>
          ))}
        </select>

        <select
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none cursor-pointer"
        >
          {EXPIRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-800 text-slate-200">Expires: {opt.label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setBurnAfterRead(!burnAfterRead)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            burnAfterRead ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
          }`}
        >
          Burn after read
        </button>

        <button
          type="button"
          onClick={() => setProtectWithPassword(!protectWithPassword)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            protectWithPassword ? "bg-amber-500/20 border-amber-500/30 text-amber-400" : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
          }`}
        >
          Encrypt
        </button>

        <button
          type="button"
          onClick={handleValidate}
          disabled={!content.trim() || validating}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
        >
          {validating ? "Checking..." : "Validate"}
        </button>
      </div>

      {protectWithPassword && (
        <input
          type="password"
          placeholder="Encryption password"
          value={pastePassword}
          onChange={(e) => setPastePassword(e.target.value)}
          className="w-full bg-white/5 border border-amber-500/30 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
        />
      )}

      <button
        type="submit"
        disabled={!content.trim() || loading}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:shadow-none"
      >
        {loading ? "Creating..." : "Create Paste"}
      </button>
    </form>
  );
}
