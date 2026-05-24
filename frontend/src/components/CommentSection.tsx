import { useState, useEffect } from "react";

interface Comment {
  id: number;
  paste_id: string;
  author: string;
  content: string;
  parent_id: number | null;
  created_at: string;
  replies: Comment[];
}

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function CommentItem({ comment, pasteId, onReply }: { comment: Comment; pasteId: string; onReply: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyAuthor, setReplyAuthor] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [sending, setSending] = useState(false);

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/pastes/${pasteId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: replyAuthor || "Anonymous", content: replyContent, parent_id: comment.id }),
      });
      setReplyContent("");
      setReplyOpen(false);
      onReply();
    } catch {} finally {
      setSending(false);
    }
  };

  return (
    <div className="group">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {comment.author[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{comment.author}</span>
            <span className="text-xs text-slate-500">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{comment.content}</p>
          <button onClick={() => setReplyOpen(!replyOpen)} className="text-xs text-slate-500 hover:text-blue-400 mt-1 transition-colors">Reply</button>
        </div>
      </div>

      {replyOpen && (
        <div className="ml-11 mb-3 space-y-2">
          <input value={replyAuthor} onChange={(e) => setReplyAuthor(e.target.value)} placeholder="Name (optional)" className="w-full max-w-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none" />
          <div className="flex gap-2">
            <input value={replyContent} onChange={(e) => setReplyContent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleReply()} placeholder="Write a reply..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none" />
            <button onClick={handleReply} disabled={sending || !replyContent.trim()} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-xs font-medium disabled:opacity-50">{sending ? "..." : "Reply"}</button>
          </div>
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 border-l border-white/5">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} pasteId={pasteId} onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  pasteId: string;
}

export default function CommentSection({ pasteId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const loadComments = async () => {
    try {
      const res = await fetch(`/api/pastes/${pasteId}/comments`);
      if (res.ok) setComments(await res.json());
    } catch {}
  };

  useEffect(() => { loadComments(); }, [pasteId]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/pastes/${pasteId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: author || "Anonymous", content }),
      });
      setContent("");
      loadComments();
    } catch {} finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10">
        <h3 className="text-sm font-medium text-white">Comments ({comments.length})</h3>
      </div>

      {/* New comment form */}
      <div className="px-5 py-4 border-b border-white/10 space-y-2">
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name (optional)" className="w-full max-w-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
        <div className="flex gap-2">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write a comment..." rows={2} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none" />
          <button onClick={handleSubmit} disabled={sending || !content.trim()} className="self-end px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">{sending ? "..." : "Post"}</button>
        </div>
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">No comments yet. Be the first!</div>
      ) : (
        <div className="divide-y divide-white/5">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} pasteId={pasteId} onReply={loadComments} />
          ))}
        </div>
      )}
    </div>
  );
}
