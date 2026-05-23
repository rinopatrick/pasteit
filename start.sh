#!/bin/bash
# Start Self-Hosted Pastebin (backend + frontend)
cd "$(dirname "$0")"

echo "Starting Pastebin backend on :8002..."
cd backend && uvicorn main:app --host 0.0.0.0 --port 8002 &
BACKEND_PID=$!
cd ..

echo "Starting Pastebin frontend on :5174..."
cd frontend && npx vite --host 0.0.0.0 --port 5174 &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== Self-Hosted Pastebin ==="
echo "  Frontend: http://localhost:5174"
echo "  Backend:  http://localhost:8002"
echo "  Press Ctrl+C to stop"
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
