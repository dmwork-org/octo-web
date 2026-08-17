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
AUTO_DISCOVERED_ENTERPRISE_ENTRY="false"
DISCOVERED_ENTERPRISE_MODULE_DIRS=()

TARGET="${1:-all}"
case "$TARGET" in
  all) ELECTRON_BUILD_SCRIPT="build-ele" ;;
  mac) ELECTRON_BUILD_SCRIPT="build-ele:mac" ;;
  win) ELECTRON_BUILD_SCRIPT="build-ele:win" ;;
  linux) ELECTRON_BUILD_SCRIPT="build-ele:linux" ;;
  linux-arm64) ELECTRON_BUILD_SCRIPT="build-ele:linux-arm64" ;;
  *)
    cat >&2 <<EOF
[ci-enterprise-electron-build] Unknown target: $TARGET

Usage:
  pnpm build-ele:enterprise
  pnpm build-ele:enterprise:mac
  pnpm build-ele:enterprise:win
  pnpm build-ele:enterprise:linux
  pnpm build-ele:enterprise:linux-arm64
EOF
    exit 1
    ;;
esac

is_bare_module_entry() {
  local entry="$1"
  [[ "$entry" != .* && "$entry" != /* && ( "$entry" == @* || ( "$entry" != *"/"* && "$entry" != *"\\"* ) ) ]]
}

resolve_from_root() {
  local file_path="$1"
  node -e "const path = require('path'); const root = process.argv[1]; const target = process.argv[2]; console.log(path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target));" "$ROOT" "$file_path"
}

# On Windows (Git Bash/MSYS), bash pwd yields /e/... style paths that native
# node/vite cannot resolve. cygpath -m converts them to E:/...; elsewhere
# cygpath doesn't exist and the path is already native.
to_win_path() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$path"
  else
    echo "$path"
  fi
}

discover_local_enterprise_entries() {
  local entries=()

  if [[ -d "$ENTERPRISE_LOOP_DIR" && -f "$ENTERPRISE_MODULES_DIR/src/loop.ts" ]]; then
    entries+=("$ENTERPRISE_MODULES_DIR/src/loop.ts")
    DISCOVERED_ENTERPRISE_MODULE_DIRS+=("$ENTERPRISE_LOOP_DIR")
  fi

  if [[ -d "$ENTERPRISE_DRIVE_DIR" && -f "$ENTERPRISE_MODULES_DIR/src/drive.ts" ]]; then
    entries+=("$ENTERPRISE_MODULES_DIR/src/drive.ts")
    DISCOVERED_ENTERPRISE_MODULE_DIRS+=("$ENTERPRISE_DRIVE_DIR")
  fi

  if [[ -d "$ENTERPRISE_DOCS_DIR" && -f "$ENTERPRISE_MODULES_DIR/src/docs.ts" ]]; then
    entries+=("$ENTERPRISE_MODULES_DIR/src/docs.ts")
    DISCOVERED_ENTERPRISE_MODULE_DIRS+=("$ENTERPRISE_DOCS_DIR")
  fi

  if [[ ${#entries[@]} -eq 0 ]]; then
    cat >&2 <<EOF
[ci-enterprise-electron-build] No local enterprise entries were discovered.

Expected local layout:
  $WORKSPACE_ROOT/
    octo-web/
    octo-enterprise-modules/
    octo-loop-module/   # optional, enables src/loop.ts
    octo-drive-module/  # optional, enables src/drive.ts
    octo-docs-module/   # optional, enables src/docs.ts

Set VITE_ENTERPRISE_MODULES_ENTRY explicitly for CI or custom builds.
EOF
    exit 1
  fi

  ENTERPRISE_MODULES_ENTRY="$(IFS="$PATH_DELIMITER"; echo "${entries[*]}")"
  AUTO_DISCOVERED_ENTERPRISE_ENTRY="true"
}

if [[ -n "${VITE_ENTERPRISE_MODULES_ENTRY+x}" ]]; then
  ENTERPRISE_MODULES_ENTRY="$VITE_ENTERPRISE_MODULES_ENTRY"
elif [[ -z "${CI:-}" || "${CI:-}" == "false" ]]; then
  discover_local_enterprise_entries
else
  ENTERPRISE_MODULES_ENTRY="$ENTERPRISE_MODULES_DIR/src/loop.ts"
fi

IFS="$PATH_DELIMITER" read -r -a ENTERPRISE_ENTRY_ITEMS <<< "$ENTERPRISE_MODULES_ENTRY"
NORMALIZED_ENTERPRISE_ENTRY_ITEMS=()
for entry in "${ENTERPRISE_ENTRY_ITEMS[@]}"; do
  [[ -z "$entry" ]] && continue
  if is_bare_module_entry "$entry"; then
    NORMALIZED_ENTERPRISE_ENTRY_ITEMS+=("$entry")
    continue
  fi

  resolved_entry="$(resolve_from_root "$entry")"

  if [[ ! -f "$resolved_entry" ]]; then
    cat >&2 <<EOF
[ci-enterprise-electron-build] Missing enterprise module entry:
  $resolved_entry

CI must checkout the enterprise assembly repository next to octo-web, or pass
VITE_ENTERPRISE_MODULES_ENTRY explicitly.

Expected default layout:
  $WORKSPACE_ROOT/
    octo-web/
    octo-enterprise-modules/

Only modules imported by the selected enterprise entry files are bundled.
EOF
    exit 1
  fi

  NORMALIZED_ENTERPRISE_ENTRY_ITEMS+=("$resolved_entry")
done

ENTERPRISE_MODULES_ENTRY="$(IFS="$PATH_DELIMITER"; echo "${NORMALIZED_ENTERPRISE_ENTRY_ITEMS[*]}")"

if [[ -n "$ENTERPRISE_HTML_HEAD_PATH" ]]; then
  ENTERPRISE_HTML_HEAD_PATH="$(resolve_from_root "$ENTERPRISE_HTML_HEAD_PATH")"
fi

if [[ -n "$ENTERPRISE_HTML_HEAD_PATH" && ! -f "$ENTERPRISE_HTML_HEAD_PATH" ]]; then
  ENTERPRISE_HTML_HEAD_PATH=""
fi

if [[ -z "${VITE_ENTERPRISE_FS_ALLOW:-}" ]]; then
  allow_paths=("$ROOT" "$ENTERPRISE_MODULES_DIR")
  if [[ "$AUTO_DISCOVERED_ENTERPRISE_ENTRY" == "true" ]]; then
    allow_paths+=("${DISCOVERED_ENTERPRISE_MODULE_DIRS[@]}")
  else
    [[ "$ENTERPRISE_MODULES_ENTRY" == *"$ENTERPRISE_MODULES_DIR/src/loop.ts"* && -d "$ENTERPRISE_LOOP_DIR" ]] && allow_paths+=("$ENTERPRISE_LOOP_DIR")
    [[ "$ENTERPRISE_MODULES_ENTRY" == *"$ENTERPRISE_MODULES_DIR/src/drive.ts"* && -d "$ENTERPRISE_DRIVE_DIR" ]] && allow_paths+=("$ENTERPRISE_DRIVE_DIR")
    [[ "$ENTERPRISE_MODULES_ENTRY" == *"$ENTERPRISE_MODULES_DIR/src/docs.ts"* && -d "$ENTERPRISE_DOCS_DIR" ]] && allow_paths+=("$ENTERPRISE_DOCS_DIR")
  fi
  allow_paths+=("$ROOT/node_modules")

  WINDOWS_ALLOW_PATHS=()
  for allow_path in "${allow_paths[@]}"; do
    WINDOWS_ALLOW_PATHS+=("$(to_win_path "$allow_path")")
  done
  VITE_ENTERPRISE_FS_ALLOW="$(IFS="$PATH_DELIMITER"; echo "${WINDOWS_ALLOW_PATHS[*]}")"
else
  IFS="$PATH_DELIMITER" read -r -a FS_ALLOW_ITEMS <<< "$VITE_ENTERPRISE_FS_ALLOW"
  NORMALIZED_FS_ALLOW_ITEMS=()
  for allow_path in "${FS_ALLOW_ITEMS[@]}"; do
    [[ -z "$allow_path" ]] && continue
    NORMALIZED_FS_ALLOW_ITEMS+=("$(to_win_path "$(resolve_from_root "$allow_path")")")
  done
  VITE_ENTERPRISE_FS_ALLOW="$(IFS="$PATH_DELIMITER"; echo "${NORMALIZED_FS_ALLOW_ITEMS[*]}")"
fi

export VITE_ENTERPRISE_MODULES_ENTRY="$ENTERPRISE_MODULES_ENTRY"
export VITE_ENTERPRISE_HTML_HEAD_PATH="$ENTERPRISE_HTML_HEAD_PATH"
export VITE_ENTERPRISE_FS_ALLOW

echo "[ci-enterprise-electron-build] VITE_ENTERPRISE_MODULES_ENTRY=$VITE_ENTERPRISE_MODULES_ENTRY"
if [[ -n "$VITE_ENTERPRISE_HTML_HEAD_PATH" ]]; then
  echo "[ci-enterprise-electron-build] VITE_ENTERPRISE_HTML_HEAD_PATH=$VITE_ENTERPRISE_HTML_HEAD_PATH"
fi
echo "[ci-enterprise-electron-build] VITE_ENTERPRISE_FS_ALLOW=$VITE_ENTERPRISE_FS_ALLOW"
echo "[ci-enterprise-electron-build] electron build script=$ELECTRON_BUILD_SCRIPT"

cd "$ROOT"
exec pnpm --filter @octo/web "$ELECTRON_BUILD_SCRIPT"
