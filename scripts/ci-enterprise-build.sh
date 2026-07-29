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
[ci-enterprise-build] Missing enterprise module entry:
  $ENTERPRISE_MODULES_ENTRY

CI must checkout the private repositories next to octo-web:
  $WORKSPACE_ROOT/
    octo-web/
    octo-enterprise-modules/
    octo-loop-module/

This build only assembles loop/personal. Do not checkout or start docs for this step.
EOF
  exit 1
fi

if [[ ! -d "$ENTERPRISE_LOOP_DIR" ]]; then
  cat >&2 <<EOF
[ci-enterprise-build] Missing loop module directory:
  $ENTERPRISE_LOOP_DIR
EOF
  exit 1
fi

if [[ ! -f "$ENTERPRISE_HTML_HEAD_PATH" ]]; then
  ENTERPRISE_HTML_HEAD_PATH=""
fi

export VITE_ENTERPRISE_MODULES_ENTRY="$ENTERPRISE_MODULES_ENTRY"
export VITE_ENTERPRISE_HTML_HEAD_PATH="$ENTERPRISE_HTML_HEAD_PATH"
export VITE_ENTERPRISE_FS_ALLOW="${VITE_ENTERPRISE_FS_ALLOW:-"$ROOT:$ENTERPRISE_MODULES_DIR:$ENTERPRISE_LOOP_DIR:$ROOT/node_modules"}"

echo "[ci-enterprise-build] VITE_ENTERPRISE_MODULES_ENTRY=$VITE_ENTERPRISE_MODULES_ENTRY"
if [[ -n "$VITE_ENTERPRISE_HTML_HEAD_PATH" ]]; then
  echo "[ci-enterprise-build] VITE_ENTERPRISE_HTML_HEAD_PATH=$VITE_ENTERPRISE_HTML_HEAD_PATH"
fi
echo "[ci-enterprise-build] VITE_ENTERPRISE_FS_ALLOW=$VITE_ENTERPRISE_FS_ALLOW"

cd "$ROOT"
exec pnpm --filter @octo/web build
