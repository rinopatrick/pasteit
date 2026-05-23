import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Collection {
  id: string;
  name: string;
  created_at: string;
  paste_count: number;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCollections = () => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then(setCollections)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCollections(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setNewName("");
        fetchCollections();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection? Pastes will be unlinked, not deleted.")) return;
    await fetch(`/api/collections/${id}`, { method: "DELETE" });
    fetchCollections();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse text-slate-400">Loading collections...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Collections</h1>

      {/* Create collection */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New collection name..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-all text-sm"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-slate-400">No collections yet. Create one to organize your pastes.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((coll) => (
            <Link
              key={coll.id}
              to={`/collections/${coll.id}`}
              className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-white font-semibold text-sm truncate group-hover:text-blue-400 transition-colors">
                  {coll.name}
                </h3>
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(coll.id); }}
                  className="shrink-0 text-slate-600 hover:text-red-400 text-xs transition-colors"
                >
                  Delete
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {coll.paste_count} paste{coll.paste_count !== 1 ? "s" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
