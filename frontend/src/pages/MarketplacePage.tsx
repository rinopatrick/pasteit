import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface MarketItem {
  id: number;
  paste_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  category: string;
  created_at: string;
  downloads: number;
}

const CATEGORIES = ["all", "general", "snippet", "template", "utility", "library"];

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function MarketplacePage() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (search) params.set("search", search);
    fetch(`/api/marketplace?${params}`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, search]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Marketplace</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search marketplace..."
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "bg-white/5 text-slate-400 border border-transparent hover:text-white"
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <span className="text-4xl">🏪</span>
          <p className="text-slate-400 mt-4">No items found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-white font-semibold truncate group-hover:text-blue-400 transition-colors">
                  {item.title}
                </h3>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                  item.price_cents === 0
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}>
                  {item.price_cents === 0 ? "Free" : `$${(item.price_cents / 100).toFixed(2)}`}
                </span>
              </div>

              {item.description && (
                <p className="text-sm text-slate-400 line-clamp-2 mb-3">{item.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="px-2 py-0.5 rounded-full bg-white/5">{item.category}</span>
                <div className="flex items-center gap-3">
                  <span>⬇ {item.downloads}</span>
                  <span>{timeAgo(item.created_at)}</span>
                </div>
              </div>

              <Link
                to={`/${item.paste_id}`}
                className="mt-3 block text-center py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                View Paste
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
