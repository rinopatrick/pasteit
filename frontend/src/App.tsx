import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ViewPaste from "./pages/ViewPaste";
import RecentPastes from "./pages/RecentPastes";
import DiffView from "./components/DiffView";
import AdminDashboard from "./pages/AdminDashboard";
import CollectionsPage from "./pages/CollectionsPage";
import CollectionDetail from "./pages/CollectionDetail";
import AuthPage from "./pages/AuthPage";
import UserProfile from "./pages/UserProfile";
import BooksPage from "./pages/BooksPage";
import BookDetailPage from "./pages/BookDetailPage";
import MarketplacePage from "./pages/MarketplacePage";

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("pb-theme") || "tomorrow");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("pb-theme", theme);
  }, [theme]);

  useEffect(() => {
    const token = localStorage.getItem("pb-token");
    if (token) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.username) setUsername(data.username); })
        .catch(() => {});
    }
  }, []);

  const handleLogin = (token: string, user: string) => {
    localStorage.setItem("pb-token", token);
    setUsername(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("pb-token");
    setUsername(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <Navbar theme={theme} onThemeChange={setTheme} username={username} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/recent" element={<RecentPastes />} />
        <Route path="/books" element={<BooksPage />} />
        <Route path="/books/:id" element={<BookDetailPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/compare" element={<DiffView />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id" element={<CollectionDetail theme={theme} />} />
        <Route path="/auth" element={<AuthPage onLogin={handleLogin} />} />
        <Route path="/u/:username" element={<UserProfile />} />
        <Route path="/:id" element={<ViewPaste theme={theme} />} />
      </Routes>
    </div>
  );
}
