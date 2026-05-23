import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LANG_COLORS } from "../components/PasteForm";

interface PasteSummary {
  id: string;
  title: string | null;
  language: string;
  burn_after_read: boolean;
  created_at: string;
  view_count: number;
  is_encrypted: boolean;
}

interface Collection {
  id: string;
  name: string;
  paste_count: number;
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

export default function CollectionDetail({ theme }: Props) {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [pastes, setPastes] = useState<PasteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/collections/${id}`).then((r) => r.json()),
      fetch(`/api/pastes?collection_id=${id}&per_page=100`).then((r) => r.json()),
    ])
      .then(([coll, paginated]) => {
        setCollection(coll);
        setPastes(paginated.pastes || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse text-slate-400">Loading collection...</div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-400">Collection not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/collections" className="text-slate-400 hover:text-white text-sm transition-colors">
          Collections
        </Link>
        <span className="text-slate-600">/</span>
        <h1 className="text-2xl font-bold text-white">{collection.name}</h1>
        <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
          {collection.paste_count} paste{collection.paste_count !== 1 ? "s" : ""}
        </span>
      </div>

      {pastes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-slate-400">No pastes in this collection yet.</p>
          <p className="text-xs text-slate-600 mt-2">Move pastes here from the Recent Pastes page.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pastes.map((paste) => {
            const langColor = LANG_COLORS[paste.language] || "bg-slate-500/20 text-slate-400";
            return (
              <Link
                key={paste.id}
                to={`/${paste.id}`}
                className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-white font-semibold text-sm truncate group-hover:text-blue-400 transition-colors">
                    {paste.title || "Untitled"}
                  </h3>
                  <div className="flex gap-1">
                    {paste.burn_after_read && <span className="text-red-400 text-xs">🔥</span>}
                    {paste.is_encrypted && <span className="text-amber-400 text-xs">🔒</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${langColor}`}>
                    {paste.language}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{timeAgo(paste.created_at)}</span>
                  <span>{paste.view_count} view{paste.view_count !== 1 ? "s" : ""}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
