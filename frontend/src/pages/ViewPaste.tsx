import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SyntaxHighlight from "../components/SyntaxHighlight";
import { LANG_COLORS } from "../components/PasteForm";
import { useApiKey, fetchWithApiKey } from "../hooks/useApiKey";

interface Paste {
  id: string;
  title: string | null;
  content: string;
  language: string;
  burn_after_read: boolean;
  expires_at: string | null;
  created_at: string;
  view_count: number;
  is_encrypted: boolean;
  fork_count: number;
  forked_from: string | null;
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface Props {
  theme: string;
}

export default function ViewPaste({ theme }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { ensureApiKey } = useApiKey();
  const [paste, setPaste] = useState<Paste | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Encrypted paste
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decryptPassword, setDecryptPassword] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const [decrypting, setDecrypting] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editToken, setEditToken] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editLanguage, setEditLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Fork
  const [forking, setForking] = useState(false);

  useEffect(() => {
    fetch(`/api/pastes/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Paste not found");
        }
        return res.json();
      })
      .then(setPaste)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCopyContent = async () => {
    if (!paste) return;
    const text = decryptedContent || paste.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDecrypt = async () => {
    if (!decryptPassword.trim()) return;
    setDecrypting(true);
    setDecryptError("");
    try {
      const res = await fetch(`/api/pastes/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: decryptPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Wrong password");
      }
      const data = await res.json();
      setDecryptedContent(data.content);
    } catch (err: any) {
      setDecryptError(err.message);
    } finally {
      setDecrypting(false);
    }
  };

  const handleFork = async () => {
    setForking(true);
    try {
      const key = await ensureApiKey();
      const res = await fetchWithApiKey(`/api/pastes/${id}/fork`, { method: "POST" }, key);
      if (!res.ok) throw new Error("Failed to fork");
      const data = await res.json();
      navigate(`/${data.id}`);
    } catch {
      alert("Failed to fork paste");
    } finally {
      setForking(false);
    }
  };

  const handleStartEdit = () => {
    if (!paste) return;
    setEditTitle(paste.title || "");
    setEditContent(decryptedContent || paste.content);
    setEditLanguage(paste.language);
    setEditing(true);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/pastes/${id}?edit_token=${encodeURIComponent(editToken)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, content: editContent, language: editLanguage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update");
      }
      const data = await res.json();
      setPaste(data);
      setEditing(false);
      setEditToken("");
      if (decryptedContent) setDecryptedContent(editContent);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const displayContent = decryptedContent || paste?.content;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse text-slate-400">Loading paste...</div>
      </div>
    );
  }

  if (error || !paste) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-red-400">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {error === "This paste has expired" ? "Paste Expired" : "Paste Not Found"}
          </h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
            Create a new paste
          </a>
        </div>
      </div>
    );
  }

  const langColor = LANG_COLORS[paste.language] || "bg-slate-500/20 text-slate-400";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {paste.burn_after_read && paste.view_count <= 1 && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          This paste was set to burn after read — it has been deleted.
        </div>
      )}

      {paste.forked_from && (
        <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-2 text-purple-400 text-sm">
          <span>Forked from</span>
          <a href={`/${paste.forked_from}`} className="underline hover:text-purple-300">{paste.forked_from}</a>
        </div>
      )}

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-lg font-bold text-white truncate">{paste.title || "Untitled"}</h1>
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${langColor}`}>{paste.language}</span>
            {paste.burn_after_read && <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">burned</span>}
            {paste.is_encrypted && <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">encrypted</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>{timeAgo(paste.created_at)}</span>
            <span>&middot;</span>
            <span>{paste.view_count} view{paste.view_count !== 1 ? "s" : ""}</span>
            {paste.fork_count > 0 && (
              <>
                <span>&middot;</span>
                <span>{paste.fork_count} fork{paste.fork_count !== 1 ? "s" : ""}</span>
              </>
            )}
          </div>
        </div>

        {/* Encrypted paste: show password prompt */}
        {paste.is_encrypted && !decryptedContent && (
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-amber-400">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">This paste is password-protected</h2>
            <p className="text-slate-400 text-sm mb-6">Enter the password to decrypt and view the content.</p>
            <div className="max-w-sm mx-auto flex gap-2">
              <input
                type="password"
                value={decryptPassword}
                onChange={(e) => setDecryptPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDecrypt()}
                placeholder="Enter password"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <button onClick={handleDecrypt} disabled={decrypting} className="px-4 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                {decrypting ? "..." : "Unlock"}
              </button>
            </div>
            {decryptError && <p className="text-red-400 text-sm mt-3">{decryptError}</p>}
          </div>
        )}

        {/* Edit mode */}
        {editing && (
          <div className="p-5 space-y-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <span>Enter edit token to save changes:</span>
            </div>
            <input
              type="text"
              value={editToken}
              onChange={(e) => setEditToken(e.target.value)}
              placeholder="Edit token"
              className="w-full max-w-xs bg-white/5 border border-amber-500/30 rounded-lg px-3 py-2 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 font-mono text-sm focus:outline-none"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white placeholder-slate-500 font-mono text-sm min-h-[200px] resize-y focus:outline-none"
              spellCheck={false}
            />
            {editError && <p className="text-red-400 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving || !editToken.trim()} className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {!editing && (
          <div className="px-5 py-2 border-b border-white/10 flex items-center gap-2 flex-wrap">
            <button onClick={() => setRaw(!raw)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${raw ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-transparent text-slate-400 hover:text-white"}`}>
              Raw
            </button>
            <button onClick={handleCopyContent} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={handleCopyUrl} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              Share URL
            </button>
            <button onClick={handleStartEdit} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              Edit
            </button>
            <button onClick={handleFork} disabled={forking} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50">
              {forking ? "Forking..." : "Fork"}
            </button>
          </div>
        )}

        {/* Content */}
        {!paste.is_encrypted || decryptedContent ? (
          <div className="p-0">
            {raw ? (
              <pre className="p-5 text-sm font-mono text-slate-200 whitespace-pre-wrap break-words overflow-x-auto">{displayContent}</pre>
            ) : (
              <SyntaxHighlight code={displayContent || ""} language={paste.language} showLineNumbers={true} theme={theme} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
