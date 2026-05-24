import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LANG_COLORS } from "../components/PasteForm";

interface UserInfo {
  id: number;
  username: string;
  created_at: string;
  paste_count: number;
}

interface PasteSummary {
  id: string;
  title: string | null;
  language: string;
  created_at: string;
  view_count: number;
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [pastes, setPastes] = useState<PasteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/users/${username}`).then((r) => r.ok ? r.json() : Promise.reject(r)),
      fetch(`/api/users/${username}/pastes`).then((r) => r.ok ? r.json() : Promise.reject(r)),
    ])
      .then(([userData, pasteData]) => {
        setUser(userData);
        setPastes(pasteData.pastes || []);
      })
      .catch(() => setError("User not found"))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse text-slate-400">Loading profile...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">User Not Found</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <a href="/" className="text-blue-400 hover:text-blue-300 text-sm">Go home</a>
        </div>
      </div>
    );
  }

  const joinDate = new Date(user.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Profile Header */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
            {username?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{user.username}</h1>
            <p className="text-slate-400 text-sm">Joined {joinDate} &middot; {user.paste_count} public paste{user.paste_count !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Pastes List */}
      <h2 className="text-lg font-semibold text-white mb-4">Public Pastes</h2>
      {pastes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-slate-400">No public pastes yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pastes.map((paste) => {
            const langColor = LANG_COLORS[paste.language] || "bg-slate-500/20 text-slate-400";
            return (
              <Link
                key={paste.id}
                to={`/${paste.id}`}
                className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <h3 className="text-white font-semibold text-sm truncate group-hover:text-blue-400 transition-colors mb-2">
                  {paste.title || "Untitled"}
                </h3>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${langColor}`}>
                    {paste.language}
                  </span>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>{timeAgo(paste.created_at)}</span>
                    <span>&middot;</span>
                    <span>{paste.view_count} views</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
