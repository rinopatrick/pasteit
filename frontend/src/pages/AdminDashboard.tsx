import { useEffect, useState } from "react";
import { useApiKey, fetchWithApiKey } from "../hooks/useApiKey";

interface Stats {
  total_pastes: number;
  total_views: number;
  pastes_today: number;
  top_languages: { language: string; count: number }[];
  storage_used_display: string;
  api_keys: { key: string; created_at: string; request_count: number }[];
}

interface DailyStat {
  date: string;
  views: number;
  pastes_created: number;
}

interface PasteItem {
  id: string;
  title: string | null;
  language: string;
  view_count: number;
  burn_after_read: boolean;
  is_encrypted: boolean;
  created_at: string;
  fork_count: number;
}

export default function AdminDashboard() {
  const { apiKey, ensureApiKey } = useApiKey();
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [pastes, setPastes] = useState<PasteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const fetchStats = async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) setStats(await res.json());
  };

  const fetchDailyStats = async () => {
    const res = await fetch("/api/admin/stats/daily");
    if (res.ok) setDailyStats(await res.json());
  };

  const fetchPastes = async (q = "") => {
    const url = q ? `/api/admin/pastes?limit=50&search=${encodeURIComponent(q)}` : "/api/admin/pastes?limit=50";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setPastes(data.pastes);
      setTotal(data.total);
    }
  };

  useEffect(() => {
    Promise.all([fetchStats(), fetchDailyStats(), fetchPastes()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchPastes(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete paste ${id}?`)) return;
    const key = await ensureApiKey();
    await fetchWithApiKey(`/api/pastes/${id}`, { method: "DELETE" }, key);
    fetchPastes(search);
    fetchStats();
  };

  const handleCreateApiKey = async () => {
    const key = await ensureApiKey();
    const res = await fetchWithApiKey("/api/keys/create", { method: "POST" }, key);
    if (res.ok) {
      const data = await res.json();
      setNewApiKey(data.key);
      fetchStats();
    }
  };

  const handleExport = async () => {
    const res = await fetch("/api/admin/export");
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pastebin-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const maxLangCount = stats?.top_languages?.length ? Math.max(...stats.top_languages.map((l) => l.count)) : 1;
  const maxDailyViews = dailyStats.length ? Math.max(...dailyStats.map((d) => d.views), 1) : 1;
  const maxDailyPastes = dailyStats.length ? Math.max(...dailyStats.map((d) => d.pastes_created), 1) : 1;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse text-slate-400">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm font-medium transition-colors"
        >
          Export All
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Pastes", value: stats?.total_pastes || 0, color: "text-blue-400" },
          { label: "Total Views", value: stats?.total_views || 0, color: "text-purple-400" },
          { label: "Today", value: stats?.pastes_today || 0, color: "text-green-400" },
          { label: "Storage", value: stats?.storage_used_display || "0 KB", color: "text-amber-400" },
        ].map((card) => (
          <div key={card.label} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{card.label}</p>
            <p className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Daily Stats Chart */}
      {dailyStats.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Activity (Last 7 Days)</h2>
          <div className="grid grid-cols-7 gap-2 h-40 items-end">
            {dailyStats.map((day) => (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <div className="flex flex-col items-center gap-1 flex-1 w-full justify-end">
                  <div
                    className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md transition-all"
                    style={{ height: `${(day.views / maxDailyViews) * 80}%`, minHeight: day.views > 0 ? 4 : 0 }}
                    title={`${day.views} views`}
                  />
                  <div
                    className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-md transition-all"
                    style={{ height: `${(day.pastes_created / maxDailyPastes) * 40}%`, minHeight: day.pastes_created > 0 ? 4 : 0 }}
                    title={`${day.pastes_created} pastes created`}
                  />
                </div>
                <span className="text-[10px] text-slate-500">{day.date.split("-")[2]}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Views</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Pastes Created</span>
          </div>
        </div>
      )}

      {/* Language Distribution */}
      {stats?.top_languages && stats.top_languages.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Language Distribution</h2>
          <div className="space-y-2">
            {stats.top_languages.map((lang) => (
              <div key={lang.language} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-24 truncate">{lang.language}</span>
                <div className="flex-1 bg-white/5 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                    style={{ width: `${(lang.count / maxLangCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-10 text-right font-mono">{lang.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API Keys */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">API Keys</h2>
          <button onClick={handleCreateApiKey} className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-medium rounded-lg transition-all">
            Generate Key
          </button>
        </div>
        {newApiKey && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-green-400 text-sm font-semibold mb-1">New API Key Created!</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-green-300 font-mono bg-slate-900/60 rounded px-2 py-1 break-all">{newApiKey}</code>
              <button onClick={() => { navigator.clipboard.writeText(newApiKey); }} className="shrink-0 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white">Copy</button>
            </div>
            <p className="text-xs text-green-400/60 mt-1">Save this key! Pass it as X-API-Key header for write operations.</p>
          </div>
        )}
        {stats?.api_keys && stats.api_keys.length > 0 ? (
          <div className="space-y-2">
            {stats.api_keys.map((k, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <code className="text-xs text-slate-300 font-mono">{k.key}</code>
                <span className="text-xs text-slate-500">{k.request_count} requests</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">No API keys yet. Generate one to use write endpoints.</p>
        )}
      </div>

      {/* Paste List */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">All Pastes ({total})</h2>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or ID..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <div className="divide-y divide-white/5">
          {pastes.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">No pastes found.</div>
          ) : (
            pastes.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
                <a href={`/${p.id}`} className="flex-1 min-w-0">
                  <span className="text-sm text-white truncate block">{p.title || "Untitled"}</span>
                  <span className="text-xs text-slate-500">{p.id}</span>
                </a>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">{p.language}</span>
                <span className="shrink-0 text-xs text-slate-500 w-12 text-right">{p.view_count}v</span>
                {p.fork_count > 0 && <span className="shrink-0 text-xs text-slate-500">{p.fork_count}f</span>}
                {p.is_encrypted && <span className="shrink-0 text-amber-400 text-xs">lock</span>}
                {p.burn_after_read && <span className="shrink-0 text-red-400 text-xs">burn</span>}
                <button onClick={() => handleDelete(p.id)} className="shrink-0 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors">
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
