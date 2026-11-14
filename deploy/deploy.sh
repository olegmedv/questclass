#!/usr/bin/env bash
# КвестКласс 2 — deploy on the VPS (FEAT-046). Runs ON THE SERVER from /opt/questclass.
#
#   ./deploy.sh up <tag>                 start image ghcr.io/olegmedv/questclass:<tag>
#   ./deploy.sh rollback                 go back to the previous tag
#   ./deploy.sh status                   tags, container state, health
#   ./deploy.sh logs [n]                 last n log lines (default 100)
#   ./deploy.sh restore-snapshot <file> --yes
#                                        put a pre-migration snapshot back and start the PREVIOUS tag
#
# Migrations are expand-only (CLAUDE.md 2), so the previous image runs on the new schema and
# `rollback` never touches data. `restore-snapshot` is the last resort for a broken migration:
# everything written after the snapshot is lost.
set -euo pipefail

ROOT=/opt/questclass
IMAGE=ghcr.io/olegmedv/questclass
NAME=questclass
DATA="$ROOT/data"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" -p questclass)
PUBLIC_URL=https://questclass.duckdns.org/api/health

cd "$ROOT"

current_tag() { cat "$ROOT/current-tag" 2>/dev/null || true; }
previous_tag() { cat "$ROOT/previous-tag" 2>/dev/null || true; }

ensure_image() {
  local tag=$1
  if docker image inspect "$IMAGE:$tag" >/dev/null 2>&1; then
    return 0
  fi
  echo "Pulling $IMAGE:$tag"
  docker pull "$IMAGE:$tag"
}

ensure_data_dir() {
  mkdir -p "$DATA"
  chown 1000:1000 "$DATA"
  chmod 700 "$DATA"
}

# Health from inside the container (fast), then through Caddy (the real path).
wait_healthy() {
  local i
  for i in $(seq 1 45); do
    if docker exec "$NAME" node /app/healthcheck.mjs >/dev/null 2>&1; then
      if curl -fsS --max-time 10 "$PUBLIC_URL" >/dev/null 2>&1; then
        echo "Healthy: $PUBLIC_URL"
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

start_tag() {
  local tag=$1
  ensure_image "$tag"
  ensure_data_dir
  QC_TAG=$tag "${COMPOSE[@]}" up -d --remove-orphans
}

cmd_up() {
  local tag=${1:?usage: deploy.sh up <tag>}
  local cur
  cur=$(current_tag)
  # A container with our name from another compose project (the FEAT-050 spike) blocks the name.
  if docker inspect "$NAME" >/dev/null 2>&1; then
    local project
    project=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$NAME" 2>/dev/null || true)
    if [ "$project" != "questclass" ]; then
      echo "Container '$NAME' belongs to project '${project:-none}'. Stop it first (see README)." >&2
      exit 1
    fi
  fi
  start_tag "$tag"
  if wait_healthy; then
    if [ -n "$cur" ] && [ "$cur" != "$tag" ]; then
      echo "$cur" > "$ROOT/previous-tag"
    fi
    echo "$tag" > "$ROOT/current-tag"
    echo "Running $IMAGE:$tag"
  else
    echo "NOT healthy after 90 s: $IMAGE:$tag" >&2
    docker logs --tail 50 "$NAME" >&2 || true
    if [ -n "$cur" ] && [ "$cur" != "$tag" ]; then
      echo "Going back to $cur" >&2
      start_tag "$cur"
      wait_healthy || echo "Previous tag is not healthy either — check logs." >&2
    fi
    exit 1
  fi
}

cmd_rollback() {
  local prev cur
  prev=$(previous_tag)
  cur=$(current_tag)
  if [ -z "$prev" ]; then
    echo "No previous tag recorded." >&2
    exit 1
  fi
  start_tag "$prev"
  if wait_healthy; then
    echo "$cur" > "$ROOT/previous-tag"
    echo "$prev" > "$ROOT/current-tag"
    echo "Rolled back to $IMAGE:$prev"
  else
    echo "Rollback target $prev is not healthy." >&2
    docker logs --tail 50 "$NAME" >&2 || true
    exit 1
  fi
}

cmd_status() {
  echo "current:  $(current_tag)"
  echo "previous: $(previous_tag)"
  docker ps -a --filter "name=^/${NAME}$" --format '{{.Names}}  {{.Image}}  {{.Status}}'
  docker stats --no-stream --format '{{.Name}}  mem {{.MemUsage}}  cpu {{.CPUPerc}}' "$NAME" 2>/dev/null || true
  curl -sS --max-time 10 -o /dev/null -w "public health: %{http_code}\n" "$PUBLIC_URL" || true
}

cmd_logs() {
  docker logs --tail "${1:-100}" "$NAME"
}

cmd_restore_snapshot() {
  local file=${1:?usage: deploy.sh restore-snapshot <file> --yes}
  local confirm=${2:-}
  local src="$DATA/snapshots/$(basename "$file")"
  local prev
  prev=$(previous_tag)
  if [ ! -f "$src" ]; then
    echo "No such snapshot: $src" >&2
    ls -1 "$DATA/snapshots" 2>/dev/null >&2 || true
    exit 1
  fi
  if [ "$confirm" != "--yes" ]; then
    echo "This replaces the database with $src." >&2
    echo "Everything written after that snapshot is LOST. Re-run with --yes." >&2
    exit 1
  fi
  if [ -z "$prev" ]; then
    echo "No previous tag recorded: the current image would re-apply the same migration." >&2
    exit 1
  fi
  local stamp
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  "${COMPOSE[@]}" stop
  for ext in "" "-wal" "-shm"; do
    if [ -f "$DATA/questclass.db$ext" ]; then
      mv "$DATA/questclass.db$ext" "$DATA/questclass.db$ext.before-restore-$stamp"
    fi
  done
  cp "$src" "$DATA/questclass.db"
  chown 1000:1000 "$DATA/questclass.db"
  chmod 600 "$DATA/questclass.db"
  echo "Restored $src (old files kept as *.before-restore-$stamp). Starting previous tag $prev."
  cmd_rollback
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  logs) shift; cmd_logs "$@" ;;
  restore-snapshot) shift; cmd_restore_snapshot "$@" ;;
  *)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
