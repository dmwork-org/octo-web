#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${OCTO_LOCAL_MAC_PACKAGER_ENV:-$HOME/.config/octo-local-mac-packager.env}"

die() {
  echo "[local-mac-packager] Error: $*" >&2
  exit 1
}

info() {
  echo "[local-mac-packager] $*"
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    info "Loaded env: $ENV_FILE"
    return
  fi

  info "Env file not found: $ENV_FILE"
  info "Continuing with shell environment only. Copy signing.env.example there when signing/notarization is needed."
}

doctor() {
  [[ "$(uname -s)" == "Darwin" ]] || die "macOS is required."
  command -v corepack >/dev/null 2>&1 || die "corepack is required."
  [[ -f "$ROOT/package.json" ]] || die "Cannot find repo root package.json."

  if [[ -n "${APPLE_API_KEY:-}" && ! -f "$APPLE_API_KEY" ]]; then
    die "APPLE_API_KEY does not exist: $APPLE_API_KEY"
  fi
}

show_summary() {
  info "Repo root: $ROOT"
  info "VITE_API_URL=${VITE_API_URL:-<unset>}"
  info "VITE_ENABLE_ENTERPRISE_SSO=${VITE_ENABLE_ENTERPRISE_SSO:-<unset>}"
  info "VITE_ENTERPRISE_MODULES_ENTRY=${VITE_ENTERPRISE_MODULES_ENTRY:-<auto>}"
  info "CSC_NAME=${CSC_NAME:-<auto>}"

  if [[ -n "${APPLE_API_KEY_ID:-}" || -n "${APPLE_API_ISSUER:-}" || -n "${APPLE_TEAM_ID:-}" || -n "${APPLE_API_KEY:-}" ]]; then
    info "Notarization env: configured variables detected"
  else
    info "Notarization env: not configured"
  fi
}

main() {
  load_env

  export VITE_API_URL="${VITE_API_URL:-https://im.deepminer.com.cn}"
  export VITE_ENABLE_ENTERPRISE_SSO="${VITE_ENABLE_ENTERPRISE_SSO:-true}"

  doctor
  show_summary

  cd "$ROOT"
  local command_text="${OCTO_MAC_PACKAGE_COMMAND:-corepack pnpm build-ele:enterprise:mac}"
  info "Running: $command_text"
  exec bash -lc "$command_text"
}

main "$@"
