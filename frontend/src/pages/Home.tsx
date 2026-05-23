import { useState } from "react";
import PasteForm, { type PasteFormData } from "../components/PasteForm";
import { useApiKey, fetchWithApiKey } from "../hooks/useApiKey";

export default function Home() {
  const { apiKey, ensureApiKey } = useApiKey();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const handleSubmit = async (data: PasteFormData) => {
    setLoading(true);
    try {
      const key = await ensureApiKey();
      const res = await fetchWithApiKey("/api/pastes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }, key);
      if (!res.ok) throw new Error("Failed to create paste");
      const paste = await res.json();
      setCreatedId(paste.id);
      setEditToken(paste.edit_token || null);
    } catch {
      alert("Failed to create paste");
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = createdId ? `${window.location.origin}/${createdId}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyToken = async () => {
    if (!editToken) return;
    await navigator.clipboard.writeText(editToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  if (createdId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-green-400">
              <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Paste created!</h2>
          <p className="text-slate-400 mb-6">Share this link with anyone:</p>

          <div className="flex items-center gap-2 bg-slate-900/60 rounded-xl p-3 mb-4">
            <code className="flex-1 text-sm text-blue-400 font-mono truncate text-left">{shareUrl}</code>
            <button onClick={handleCopy} className="shrink-0 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {editToken && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4 text-left">
              <p className="text-amber-400 text-sm font-semibold mb-2">Edit Token: Save this to edit your paste later!</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-amber-300 font-mono bg-slate-900/60 rounded-lg px-3 py-2">{editToken}</code>
                <button onClick={handleCopyToken} className="shrink-0 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-sm text-amber-300 transition-colors">
                  {tokenCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-amber-400/60 mt-2">You'll need this token to edit the paste from the paste view page.</p>
            </div>
          )}

          <button onClick={() => { setCreatedId(null); setEditToken(null); }} className="text-slate-400 hover:text-white text-sm transition-colors">
            + Create another paste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">New Paste</h1>
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
        <PasteForm onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
}
