import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";

interface BookPaste {
  id: string;
  title: string | null;
  language: string;
  order_index: number;
}

interface Book {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  paste_count: number;
  pastes: BookPaste[];
}

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/books/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Book not found");
        return r.json();
      })
      .then(setBook)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse text-slate-400">Loading book...</div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
          <span className="text-4xl">📖</span>
          <h2 className="text-xl font-bold text-white mt-4">Book Not Found</h2>
          <p className="text-slate-400 mt-2">{error}</p>
          <Link to="/books" className="text-blue-400 hover:text-blue-300 text-sm mt-4 inline-block">
            ← Back to Books
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/books" className="text-sm text-slate-500 hover:text-slate-300 mb-4 inline-block">← Back to Books</Link>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📖</span>
            <div>
              <h1 className="text-2xl font-bold text-white">{book.title}</h1>
              {book.description && <p className="text-slate-400 mt-1">{book.description}</p>}
              <p className="text-xs text-slate-500 mt-2">{book.paste_count} paste{book.paste_count !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {book.pastes.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No pastes in this book yet.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {book.pastes.map((paste, idx) => (
              <Link
                key={paste.id}
                to={`/${paste.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors"
              >
                <span className="text-sm font-mono text-slate-500 w-8 text-right">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{paste.title || "Untitled"}</p>
                  <p className="text-xs text-slate-500">{paste.language}</p>
                </div>
                <span className="text-xs text-slate-600 font-mono">/{paste.id}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
