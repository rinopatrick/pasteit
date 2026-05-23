# pasteit

Self-hosted pastebin with syntax highlighting, encryption, and a CLI tool.

**[Live Demo](http://localhost:5174)** | **[API Docs](http://localhost:8002/docs)**

## Features

- **Syntax Highlighting** — 16 languages, 4 themes (Tomorrow Night, Dracula, Monokai, Solarized)
- **AES-256-GCM Encryption** — password-protected pastes, content hidden until verified
- **Burn After Read** — paste deleted after first view
- **Expirable Pastes** — 10min, 1hr, 1day, 1week, never
- **Paste Editing** — edit token generated on creation
- **Paste Forking** — fork count tracking
- **Collections** — group related pastes into folders
- **Search + Pagination** — full-text search, paginated results
- **User Accounts** — optional login with JWT
- **API Key Auth** — rate limiting (100 req/hr)
- **Markdown Preview** — edit/preview toggle with DOMPurify
- **Diff View** — LCS-based line comparison
- **Admin Dashboard** — stats, language chart, paste management
- **RSS Feed** — subscribe to new pastes
- **Backup/Export** — JSON export of all pastes
- **Import from URL** — fetch content and create paste
- **CLI Tool** — `pb create`, `pb get`, `pb list`, `pb import`
- **Docker Compose** — one-command deployment

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8002

# Frontend
cd frontend
npm install
npm run dev -- --port 5174
```

Or use Docker:
```bash
docker-compose up
```

## CLI Tool

```bash
# Install
cp cli/pb /usr/local/bin/pb
chmod +x /usr/local/bin/pb

# Usage
pb create script.py                    # upload file
pb create -l python -t "My Code" -     # from stdin
pb get abc123                          # get paste
pb list                                # list recent
pb import https://example.com/code.py  # import from URL
pb fork abc123                         # fork a paste
```

## Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Prism.js, React Router
- **Backend:** Python FastAPI, SQLite (SQLAlchemy), AES-GCM encryption
- **CLI:** Python 3 (argparse)

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pastes` | POST | Create paste |
| `/api/pastes` | GET | List/search pastes |
| `/api/pastes/{id}` | GET | Get paste |
| `/api/pastes/{id}` | PUT | Edit paste (with token) |
| `/api/pastes/{id}/fork` | POST | Fork paste |
| `/api/pastes/{id}/verify` | POST | Decrypt encrypted paste |
| `/api/pastes/{id}/download` | GET | Download as file |
| `/api/pastes/import` | POST | Import from URL |
| `/api/collections` | CRUD | Manage collections |
| `/api/auth/register` | POST | Register user |
| `/api/auth/login` | POST | Login (JWT) |
| `/api/keys/create` | POST | Create API key |
| `/api/admin/stats` | GET | Dashboard stats |
| `/api/admin/export` | GET | Export all pastes |
| `/feed.xml` | GET | RSS feed |

## License

MIT
