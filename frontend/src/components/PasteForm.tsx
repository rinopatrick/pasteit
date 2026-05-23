import { useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

export interface PasteFormData {
  title: string;
  content: string;
  language: string;
  burn_after_read: boolean;
  expiry: string;
  password?: string;
}

const LANGUAGES = [
  "text", "javascript", "typescript", "python", "rust", "go", "java", "c", "cpp",
  "html", "css", "json", "yaml", "sql", "bash", "markdown",
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
  html: "bg-orange-500/20 text-orange-400",
  css: "bg-blue-500/20 text-blue-400",
  json: "bg-amber-500/20 text-amber-400",
  yaml: "bg-teal-500/20 text-teal-400",
  sql: "bg-violet-500/20 text-violet-400",
  bash: "bg-green-500/20 text-green-400",
  markdown: "bg-slate-500/20 text-slate-400",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit({
      title,
      content,
      language,
      burn_after_read: burnAfterRead,
      expiry,
      password: protectWithPassword ? pastePassword : undefined,
    });
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
        <textarea
          placeholder="Paste your code here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder-slate-500 font-mono text-sm min-h-[300px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all leading-relaxed"
          spellCheck={false}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={language}
          onChange={(e) => { setLanguage(e.target.value); setPreviewMode(false); }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none cursor-pointer"
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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
          Burn after read
        </button>

        <button
          type="button"
          onClick={() => setProtectWithPassword(!protectWithPassword)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            protectWithPassword ? "bg-amber-500/20 border-amber-500/30 text-amber-400" : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Encrypt
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
