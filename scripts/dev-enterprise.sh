#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ROOT/.." && pwd)"
ENTERPRISE_ROOT="${ENTERPRISE_ROOT:-"$WORKSPACE_ROOT"}"
ENTERPRISE_MODULES_DIR="${ENTERPRISE_MODULES_DIR:-"$ENTERPRISE_ROOT/octo-enterprise-modules"}"
ENTERPRISE_LOOP_DIR="${ENTERPRISE_LOOP_DIR:-"$ENTERPRISE_ROOT/octo-loop-module"}"
ENTERPRISE_MODULES_ENTRY="${VITE_ENTERPRISE_MODULES_ENTRY:-"$ENTERPRISE_MODULES_DIR/src/loop.ts"}"
ENTERPRISE_HTML_HEAD_PATH="${VITE_ENTERPRISE_HTML_HEAD_PATH:-"$ENTERPRISE_MODULES_DIR/html/head.html"}"

if [[ ! -f "$ENTERPRISE_MODULES_ENTRY" ]]; then
  cat >&2 <<EOF
[dev-enterprise] Missing enterprise module entry:
  $ENTERPRISE_MODULES_ENTRY

Expected local layout:
  $(dirname "$ROOT")/
    octo-web/
    octo-enterprise-modules/
    octo-loop-module/

This preparation only loads the loop/personal enterprise entry. Docs are still
host-owned in this branch and must not be cloned or started for this check.

Clone or link the private modules first, then rerun this script.
EOF
  exit 1
fi

if [[ ! -d "$ENTERPRISE_LOOP_DIR" ]]; then
  cat >&2 <<EOF
[dev-enterprise] Missing loop module directory:
  $ENTERPRISE_LOOP_DIR

The enterprise entry may import this module during Vite build/dev.
EOF
  exit 1
fi

if [[ ! -f "$ENTERPRISE_HTML_HEAD_PATH" ]]; then
  ENTERPRISE_HTML_HEAD_PATH=""
fi

export VITE_ENTERPRISE_MODULES_ENTRY="$ENTERPRISE_MODULES_ENTRY"
export VITE_ENTERPRISE_HTML_HEAD_PATH="$ENTERPRISE_HTML_HEAD_PATH"
export VITE_ENTERPRISE_FS_ALLOW="$ROOT:$ENTERPRISE_MODULES_DIR:$ENTERPRISE_LOOP_DIR:$ROOT/node_modules"

echo "[dev-enterprise] VITE_ENTERPRISE_MODULES_ENTRY=$VITE_ENTERPRISE_MODULES_ENTRY"
if [[ -n "$VITE_ENTERPRISE_HTML_HEAD_PATH" ]]; then
  echo "[dev-enterprise] VITE_ENTERPRISE_HTML_HEAD_PATH=$VITE_ENTERPRISE_HTML_HEAD_PATH"
fi
echo "[dev-enterprise] VITE_ENTERPRISE_FS_ALLOW=$VITE_ENTERPRISE_FS_ALLOW"

cd "$ROOT"
exec pnpm --filter @octo/web dev "$@"
