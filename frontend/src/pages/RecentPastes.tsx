import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { LANG_COLORS } from "../components/PasteForm";

interface PasteSummary {
  id: string;
  title: string | null;
  language: string;
  burn_after_read: boolean;
  created_at: string;
  view_count: number;
  is_encrypted: boolean;
  collection_id: string | null;
}

interface Collection {
  id: string;
  name: string;
}

interface PaginatedResult {
  pastes: PasteSummary[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function RecentPastes() {
  const [data, setData] = useState<PaginatedResult | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);

  const collectionNameMap = Object.fromEntries(collections.map((c) => [c.id, c.name]));

  const fetchPastes = useCallback(async (q: string, p: number) => {
    const params = new URLSearchParams({ page: String(p), per_page: "20" });
    if (q) params.set("search", q);
    const res = await fetch(`/api/pastes?${params}`);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/collections").then((r) => r.json()).then(setCollections).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      fetchPastes(search, page).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, page, fetchPastes]);

  const handleMoveToCollection = async (pasteId: string, collId: string) => {
    await fetch(`/api/pastes/${pasteId}/move/${collId}`, { method: "POST" });
    setMoveTarget(null);
    fetchPastes(search, page);
  };

  if (loading && !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Recent Pastes</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-32" />
          ))}
        </div>
      </div>
    );
  }

  const pastes = data?.pastes || [];
  const totalPages = data?.total_pages || 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Recent Pastes</h1>

      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search pastes by title or ID..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
        />
      </div>

      {pastes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-slate-400 mb-4">{search ? `No pastes matching "${search}"` : "No pastes yet."}</p>
          <Link to="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
            Create your first paste →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pastes.map((paste) => {
              const langColor = LANG_COLORS[paste.language] || "bg-slate-500/20 text-slate-400";
              return (
                <div key={paste.id} className="relative group">
                  <Link
                    to={`/${paste.id}`}
                    className="block bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-white font-semibold text-sm truncate group-hover:text-blue-400 transition-colors">
                        {paste.title || "Untitled"}
                      </h3>
                      <div className="flex gap-1 shrink-0">
                        {paste.burn_after_read && <span className="text-red-400 text-xs">🔥</span>}
                        {paste.is_encrypted && <span className="text-amber-400 text-xs">🔒</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${langColor}`}>
                        {paste.language}
                      </span>
                      {paste.collection_id && collectionNameMap[paste.collection_id] && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                          {collectionNameMap[paste.collection_id]}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{timeAgo(paste.created_at)}</span>
                      <span>{paste.view_count} view{paste.view_count !== 1 ? "s" : ""}</span>
                    </div>
                  </Link>

                  {/* Move to collection button */}
                  {collections.length > 0 && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => { e.preventDefault(); setMoveTarget(moveTarget === paste.id ? null : paste.id); }}
                        className="px-2 py-1 bg-purple-600/80 hover:bg-purple-500 text-white text-xs rounded-lg transition-colors"
                        title="Move to collection"
                      >
                        Move
                      </button>
                      {moveTarget === paste.id && (
                        <div className="absolute right-0 mt-1 bg-slate-800 border border-white/10 rounded-xl py-1 shadow-xl min-w-[140px] z-20">
                          {collections.map((c) => (
                            <button
                              key={c.id}
                              onClick={(e) => { e.preventDefault(); handleMoveToCollection(paste.id, c.id); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition-colors"
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      pageNum === page ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
