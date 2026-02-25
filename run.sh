#!/bin/bash
set -e
cd /root/mqttb
SERVER_PID=
POLL_INTERVAL=60

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

start_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Stopping server (PID: $SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  bun install --production --silent 2>/dev/null
  bun server.ts &
  SERVER_PID=$!
  log "Server started (PID: $SERVER_PID)"
}

cleanup() {
  log "Shutting down..."
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  exit 0
}
trap cleanup TERM INT

start_server

log "Git poll loop (every ${POLL_INTERVAL}s)"
while true; do
  sleep "$POLL_INTERVAL"

  # Check if server is alive
  if [ -n "$SERVER_PID" ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Server crashed, restarting..."
    start_server
    continue
  fi

  # Check for git changes
  git fetch origin main --quiet 2>/dev/null
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  if [ "$LOCAL" != "$REMOTE" ]; then
    log "New commits detected, updating..."
    git reset --hard origin/main
    start_server
  fi
done
