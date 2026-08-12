#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT/.." && pwd)"
ENTERPRISE_ROOT="${ENTERPRISE_ROOT:-"$WORKSPACE_ROOT"}"
ENTERPRISE_MODULES_DIR="${ENTERPRISE_MODULES_DIR:-"$ENTERPRISE_ROOT/octo-enterprise-modules"}"
ENTERPRISE_LOOP_DIR="${ENTERPRISE_LOOP_DIR:-"$ENTERPRISE_ROOT/octo-loop-module"}"
ENTERPRISE_DRIVE_DIR="${ENTERPRISE_DRIVE_DIR:-"$ENTERPRISE_ROOT/octo-drive-module"}"
ENTERPRISE_DOCS_DIR="${ENTERPRISE_DOCS_DIR:-"$ENTERPRISE_ROOT/octo-docs-module"}"
ENTERPRISE_HTML_HEAD_PATH="${VITE_ENTERPRISE_HTML_HEAD_PATH:-"$ENTERPRISE_MODULES_DIR/html/head.html"}"
PATH_DELIMITER="$(node -p "require('path').delimiter")"

resolve_from_root() {
  local file_path="$1"
  node -e "const path = require('path'); const root = process.argv[1]; const target = process.argv[2]; console.log(path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target));" "$ROOT" "$file_path"
}

discover_enterprise_entries() {
  local entries=()
  local allow_paths=("$ROOT" "$ENTERPRISE_MODULES_DIR")

  if [[ -d "$ENTERPRISE_LOOP_DIR" && -f "$ENTERPRISE_MODULES_DIR/src/loop.ts" ]]; then
    entries+=("$ENTERPRISE_MODULES_DIR/src/loop.ts")
    allow_paths+=("$ENTERPRISE_LOOP_DIR")
  fi

  if [[ -d "$ENTERPRISE_DRIVE_DIR" && -f "$ENTERPRISE_MODULES_DIR/src/drive.ts" ]]; then
    entries+=("$ENTERPRISE_MODULES_DIR/src/drive.ts")
    allow_paths+=("$ENTERPRISE_DRIVE_DIR")
  fi

  if [[ -d "$ENTERPRISE_DOCS_DIR" && -f "$ENTERPRISE_MODULES_DIR/src/docs.ts" ]]; then
    entries+=("$ENTERPRISE_MODULES_DIR/src/docs.ts")
    allow_paths+=("$ENTERPRISE_DOCS_DIR")
  fi

  if [[ ${#entries[@]} -eq 0 ]]; then
    cat >&2 <<EOF
[dev-enterprise] No local enterprise entries were discovered.

Expected local layout:
  $(dirname "$ROOT")/
    octo-web/
    octo-enterprise-modules/
    octo-loop-module/   # optional, enables src/loop.ts
    octo-drive-module/  # optional, enables src/drive.ts
    octo-docs-module/   # optional, enables src/docs.ts

Set VITE_ENTERPRISE_MODULES_ENTRY explicitly if you want to use a custom entry.
EOF
    exit 1
  fi

  ENTERPRISE_MODULES_ENTRY="$(IFS="$PATH_DELIMITER"; echo "${entries[*]}")"
  if [[ -z "${VITE_ENTERPRISE_FS_ALLOW:-}" ]]; then
    allow_paths+=("$ROOT/node_modules")
    VITE_ENTERPRISE_FS_ALLOW="$(IFS="$PATH_DELIMITER"; echo "${allow_paths[*]}")"
  fi
}

normalize_enterprise_entries() {
  IFS="$PATH_DELIMITER" read -r -a ENTERPRISE_ENTRY_ITEMS <<< "$ENTERPRISE_MODULES_ENTRY"
  local normalized_entries=()

  for entry in "${ENTERPRISE_ENTRY_ITEMS[@]}"; do
    [[ -z "$entry" ]] && continue
    local resolved_entry
    resolved_entry="$(resolve_from_root "$entry")"

    if [[ ! -f "$resolved_entry" ]]; then
      cat >&2 <<EOF
[dev-enterprise] Missing enterprise module entry:
  $resolved_entry
EOF
      exit 1
    fi

    normalized_entries+=("$resolved_entry")
  done

  ENTERPRISE_MODULES_ENTRY="$(IFS="$PATH_DELIMITER"; echo "${normalized_entries[*]}")"
}

normalize_fs_allow() {
  if [[ -n "${VITE_ENTERPRISE_FS_ALLOW:-}" ]]; then
    IFS="$PATH_DELIMITER" read -r -a FS_ALLOW_ITEMS <<< "$VITE_ENTERPRISE_FS_ALLOW"
    local normalized_allow=()
    for allow_path in "${FS_ALLOW_ITEMS[@]}"; do
      [[ -z "$allow_path" ]] && continue
      normalized_allow+=("$(resolve_from_root "$allow_path")")
    done
    VITE_ENTERPRISE_FS_ALLOW="$(IFS="$PATH_DELIMITER"; echo "${normalized_allow[*]}")"
    return
  fi

  local allow_paths=("$ROOT" "$ENTERPRISE_MODULES_DIR")
  [[ "$ENTERPRISE_MODULES_ENTRY" == *"$ENTERPRISE_MODULES_DIR/src/loop.ts"* && -d "$ENTERPRISE_LOOP_DIR" ]] && allow_paths+=("$ENTERPRISE_LOOP_DIR")
  [[ "$ENTERPRISE_MODULES_ENTRY" == *"$ENTERPRISE_MODULES_DIR/src/drive.ts"* && -d "$ENTERPRISE_DRIVE_DIR" ]] && allow_paths+=("$ENTERPRISE_DRIVE_DIR")
  [[ "$ENTERPRISE_MODULES_ENTRY" == *"$ENTERPRISE_MODULES_DIR/src/docs.ts"* && -d "$ENTERPRISE_DOCS_DIR" ]] && allow_paths+=("$ENTERPRISE_DOCS_DIR")
  allow_paths+=("$ROOT/node_modules")
  VITE_ENTERPRISE_FS_ALLOW="$(IFS="$PATH_DELIMITER"; echo "${allow_paths[*]}")"
}

if [[ -n "${VITE_ENTERPRISE_MODULES_ENTRY+x}" ]]; then
  ENTERPRISE_MODULES_ENTRY="$VITE_ENTERPRISE_MODULES_ENTRY"
  normalize_enterprise_entries
  normalize_fs_allow
else
  discover_enterprise_entries
fi

if [[ ! -f "$ENTERPRISE_HTML_HEAD_PATH" ]]; then
  ENTERPRISE_HTML_HEAD_PATH=""
fi

export VITE_ENTERPRISE_MODULES_ENTRY="$ENTERPRISE_MODULES_ENTRY"
export VITE_ENTERPRISE_HTML_HEAD_PATH="$ENTERPRISE_HTML_HEAD_PATH"
export VITE_ENTERPRISE_FS_ALLOW

echo "[dev-enterprise] VITE_ENTERPRISE_MODULES_ENTRY=$VITE_ENTERPRISE_MODULES_ENTRY"
if [[ -n "$VITE_ENTERPRISE_HTML_HEAD_PATH" ]]; then
  echo "[dev-enterprise] VITE_ENTERPRISE_HTML_HEAD_PATH=$VITE_ENTERPRISE_HTML_HEAD_PATH"
fi
echo "[dev-enterprise] VITE_ENTERPRISE_FS_ALLOW=$VITE_ENTERPRISE_FS_ALLOW"

cd "$ROOT"
exec pnpm --filter @octo/web dev "$@"
