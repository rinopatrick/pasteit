import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { THEMES } from "./SyntaxHighlight";

interface Props {
  theme: string;
  onThemeChange: (theme: string) => void;
  username: string | null;
  onLogout: () => void;
}

export default function Navbar({ theme, onThemeChange, username, onLogout }: Props) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const links = [
    { to: "/", label: "New Paste" },
    { to: "/recent", label: "Recent" },
    { to: "/collections", label: "Collections" },
    { to: "/compare", label: "Compare" },
    { to: "/admin", label: "Admin" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <span className="font-mono font-bold text-lg text-white group-hover:text-blue-400 transition-colors">
            PasteBin
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === link.to
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Theme selector */}
          <div className="relative ml-2">
            <button
              onClick={() => { setThemeOpen(!themeOpen); setUserOpen(false); }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors border border-white/10"
            >
              Theme
            </button>
            {themeOpen && (
              <div className="absolute right-0 mt-1 bg-slate-800 border border-white/10 rounded-xl py-1 shadow-xl min-w-[160px]">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { onThemeChange(t.id); setThemeOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      theme === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative ml-1">
            {username ? (
              <>
                <Link
                  to={`/u/${username}`}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors"
                >
                  {username}
                </Link>
                <button
                  onClick={() => { setUserOpen(!userOpen); setThemeOpen(false); }}
                  className="text-slate-500 hover:text-slate-300 text-xs"
                >
                  ▾
                </button>
                {userOpen && (
                  <div className="absolute right-0 mt-1 bg-slate-800 border border-white/10 rounded-xl py-1 shadow-xl min-w-[120px]">
                    <button
                      onClick={() => { onLogout(); setUserOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                to="/auth"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Login
              </Link>
            )}
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-slate-400 hover:text-white"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            {menuOpen ? (
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 012 10z" clipRule="evenodd" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 bg-slate-900/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === link.to
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-slate-500 px-3 mb-2">Syntax Theme</p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => { onThemeChange(t.id); setMenuOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  theme === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-white/10">
            {username ? (
              <button onClick={() => { onLogout(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-red-400">
                Logout ({username})
              </button>
            ) : (
              <Link to="/auth" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-blue-400">
                Login / Register
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
