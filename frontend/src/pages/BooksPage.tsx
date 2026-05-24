import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface Book {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  paste_count: number;
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    fetch("/api/books")
      .then((r) => r.json())
      .then(setBooks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: desc }),
      });
      if (res.ok) {
        const book = await res.json();
        setBooks([book, ...books]);
        setTitle("");
        setDesc("");
      }
    } catch {} finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Paste Books</h1>

      {/* Create form */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Create New Book</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Book title"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 mb-2"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none mb-3"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !title.trim()}
          className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create Book"}
        </button>
      </div>

      {/* Book list */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
          <span className="text-4xl">📚</span>
          <p className="text-slate-400 mt-4">No books yet. Create one above!</p>
          <p className="text-xs text-slate-500 mt-2">Books let you group related pastes into tutorials or guides.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {books.map((book) => (
            <Link
              key={book.id}
              to={`/books/${book.id}`}
              className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">📖</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold truncate group-hover:text-blue-400 transition-colors">
                    {book.title}
                  </h3>
                  {book.description && (
                    <p className="text-sm text-slate-400 mt-1 line-clamp-2">{book.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    <span>{book.paste_count} paste{book.paste_count !== 1 ? "s" : ""}</span>
                    <span>{timeAgo(book.created_at)}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
