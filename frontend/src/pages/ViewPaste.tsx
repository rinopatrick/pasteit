import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import SyntaxHighlight from "../components/SyntaxHighlight";
import { LANG_COLORS } from "../components/PasteForm";
import { useApiKey, fetchWithApiKey } from "../hooks/useApiKey";
import CodeRunner from "../components/CodeRunner";
import CodeReviewPanel from "../components/CodeReviewPanel";
import CommentSection from "../components/CommentSection";

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
  user_id?: number;
  username?: string;
}

interface Version {
  id: number;
  version_number: number;
  title: string;
  language: string;
  created_at: string;
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

  // WebSocket
  const [viewers, setViewers] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Versioning
  const [versions, setVersions] = useState<Version[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // QR / Embed
  const [showQR, setShowQR] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedCode, setEmbedCode] = useState("");

  // Tags
  const [tags, setTags] = useState<string[]>([]);

  // Analytics
  const [analytics, setAnalytics] = useState<{ views_by_day: { date: string; views: number }[]; referrers: { referrer: string; count: number }[] } | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

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

    // Fetch tags
    fetch(`/api/pastes/${id}/tags`).then(r => r.ok ? r.json() : []).then(setTags).catch(() => {});

    // WebSocket connection
    const ws = new WebSocket(`ws://${window.location.host}/ws/paste/${id}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "users") setViewers(data.count);
      if (data.type === "content_update" && data.user_id !== String(myId)) {
        setEditContent(data.content);
        if (paste) setPaste({ ...paste, content: data.content });
      }
    };
    ws.onerror = () => {};
    const myId = Math.random();
    return () => { ws.close(); };
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
      // Broadcast update
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "content_update", content: editContent }));
      }
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadVersions = async () => {
    try {
      const res = await fetch(`/api/pastes/${id}/versions`);
      const data = await res.json();
      setVersions(data);
      setShowVersions(true);
    } catch {}
  };

  const loadVersionContent = async (versionNum: number) => {
    try {
      const res = await fetch(`/api/pastes/${id}/versions/${versionNum}`);
      const data = await res.json();
      setSelectedVersion(data.content);
    } catch {}
  };

  const handleQR = async () => {
    try {
      const res = await fetch(`/api/pastes/${id}/qr`);
      const svg = await res.text();
      setQrSvg(svg);
      setShowQR(true);
    } catch {}
  };

  const handleEmbed = async () => {
    try {
      const res = await fetch(`/api/pastes/${id}/embed?theme=${theme}`);
      const data = await res.json();
      setEmbedCode(data.embed_code);
      setShowEmbed(true);
    } catch {}
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetch(`/api/pastes/${id}/analytics?days=30`);
      const data = await res.json();
      setAnalytics(data);
      setShowAnalytics(true);
    } catch {}
  };

  const displayContent = selectedVersion || decryptedContent || paste?.content;

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
          <a href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">Create a new paste</a>
        </div>
      </div>
    );
  }

  const langColor = LANG_COLORS[paste.language] || "bg-slate-500/20 text-slate-400";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {paste.burn_after_read && paste.view_count <= 1 && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-sm">
          This paste was set to burn after read — it has been deleted.
        </div>
      )}

      {paste.forked_from && (
        <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-2 text-purple-400 text-sm">
          <span>Forked from</span>
          <a href={`/${paste.forked_from}`} className="underline hover:text-purple-300">{paste.forked_from}</a>
        </div>
      )}

      {/* Modals */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowQR(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">QR Code</h3>
            <div className="bg-white rounded-xl p-4 flex justify-center" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <button onClick={() => setShowQR(false)} className="mt-4 w-full py-2 bg-white/10 text-white rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}

      {showEmbed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowEmbed(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">Embed Code</h3>
            <textarea readOnly value={embedCode} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-slate-300 font-mono h-24 resize-none" />
            <button onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="mt-3 w-full py-2 bg-blue-500/20 text-blue-300 rounded-lg text-sm">{copied ? "Copied!" : "Copy Code"}</button>
            <button onClick={() => setShowEmbed(false)} className="mt-2 w-full py-2 bg-white/10 text-white rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}

      {showAnalytics && analytics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAnalytics(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">Analytics (Last 30 Days)</h3>
            <div className="flex items-end gap-1 h-32 mb-4">
              {analytics.views_by_day.map((d, i) => {
                const max = Math.max(...analytics.views_by_day.map(v => v.views), 1);
                const h = (d.views / max) * 100;
                return <div key={i} className="flex-1 bg-blue-500/60 rounded-t" style={{ height: `${h}%`, minHeight: d.views > 0 ? 4 : 1 }} title={`${d.date}: ${d.views} views`} />;
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-500 mb-4">
              <span>{analytics.views_by_day[0]?.date}</span>
              <span>{analytics.views_by_day[analytics.views_by_day.length - 1]?.date}</span>
            </div>
            {analytics.referrers.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase mb-2">Top Referrers</p>
                {analytics.referrers.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-300 py-1 border-b border-white/5">
                    <span className="truncate">{r.referrer}</span>
                    <span className="text-slate-500">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowAnalytics(false)} className="mt-4 w-full py-2 bg-white/10 text-white rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}

      {showVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowVersions(false); setSelectedVersion(null); }}>
          <div className="bg-slate-800 rounded-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">Version History</h3>
            {versions.length === 0 ? (
              <p className="text-slate-400 text-sm">No previous versions.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {versions.map((v) => (
                  <button key={v.id} onClick={() => loadVersionContent(v.version_number)} className="w-full text-left px-4 py-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                    <div className="flex justify-between">
                      <span className="text-white text-sm font-medium">Version {v.version_number}</span>
                      <span className="text-slate-500 text-xs">{timeAgo(v.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedVersion && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">Preview:</p>
                <pre className="bg-white/5 rounded-xl p-4 text-sm text-slate-300 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">{selectedVersion}</pre>
              </div>
            )}
            <button onClick={() => { setShowVersions(false); setSelectedVersion(null); }} className="mt-4 w-full py-2 bg-white/10 text-white rounded-lg text-sm">Close</button>
          </div>
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
            {viewers > 1 && <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">{viewers} viewing</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            {paste.username && (
              <Link to={`/u/${paste.username}`} className="text-blue-400 hover:text-blue-300 transition-colors">{paste.username}</Link>
            )}
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

        {/* Tags */}
        {tags.length > 0 && (
          <div className="px-5 py-2 border-b border-white/10 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">#{tag}</span>
            ))}
          </div>
        )}

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
              <input type="password" value={decryptPassword} onChange={(e) => setDecryptPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleDecrypt()} placeholder="Enter password" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
              <button onClick={handleDecrypt} disabled={decrypting} className="px-4 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">{decrypting ? "..." : "Unlock"}</button>
            </div>
            {decryptError && <p className="text-red-400 text-sm mt-3">{decryptError}</p>}
          </div>
        )}

        {/* Edit mode */}
        {editing && (
          <div className="p-5 space-y-3 border-b border-white/10">
            <p className="text-sm text-slate-400">Enter edit token to save changes:</p>
            <input type="text" value={editToken} onChange={(e) => setEditToken(e.target.value)} placeholder="Edit token" className="w-full max-w-xs bg-white/5 border border-amber-500/30 rounded-lg px-3 py-2 text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 font-mono text-sm focus:outline-none" />
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white placeholder-slate-500 font-mono text-sm min-h-[200px] resize-y focus:outline-none" spellCheck={false} />
            {editError && <p className="text-red-400 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving || !editToken.trim()} className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => { setEditing(false); setSelectedVersion(null); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-sm transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {!editing && (
          <div className="px-5 py-2 border-b border-white/10 flex items-center gap-2 flex-wrap">
            <button onClick={() => setRaw(!raw)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${raw ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-transparent text-slate-400 hover:text-white"}`}>Raw</button>
            <button onClick={handleCopyContent} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">{copied ? "Copied!" : "Copy"}</button>
            <button onClick={handleCopyUrl} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Share URL</button>
            <button onClick={handleStartEdit} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Edit</button>
            <button onClick={handleFork} disabled={forking} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50">{forking ? "Forking..." : "Fork"}</button>
            <button onClick={handleQR} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">QR Code</button>
            <button onClick={handleEmbed} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Embed</button>
            <button onClick={loadVersions} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">History</button>
            <button onClick={loadAnalytics} className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Analytics</button>
            {selectedVersion && (
              <button onClick={() => setSelectedVersion(null)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">Viewing old version</button>
            )}
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
