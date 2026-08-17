#!/bin/sh
set -u

enterprise_entry=${VITE_ENTERPRISE_MODULES_ENTRY:-}
build_dir=${1:-/app/apps/web/build}

case "$enterprise_entry" in
  *octo-enterprise-modules/src/docs.ts*) ;;
  *) exit 0 ;;
esac

file_list=$(mktemp) || {
  echo 'Failed to create the enterprise Docs bundle scan file.' >&2
  exit 2
}
trap 'rm -f "$file_list"' EXIT HUP INT TERM

if ! find "$build_dir" -type f -name '*.js' -print >"$file_list"; then
  echo 'Failed to enumerate enterprise Docs production JavaScript artifacts.' >&2
  exit 2
fi

shapes_found=0
lines_found=0
scan_failed=0

while IFS= read -r file; do
  if grep -q 'toolbar-shapes-flyout' "$file"; then
    shapes_found=1
  else
    status=$?
    [ "$status" -eq 1 ] || scan_failed=1
  fi

  if grep -q 'toolbar-lines-flyout' "$file"; then
    lines_found=1
  else
    status=$?
    [ "$status" -eq 1 ] || scan_failed=1
  fi
done <"$file_list"

if [ "$scan_failed" -ne 0 ]; then
  echo 'Failed to scan enterprise Docs production JavaScript artifacts.' >&2
  exit 2
fi

if [ "$shapes_found" -ne 1 ] || [ "$lines_found" -ne 1 ]; then
  echo 'Enterprise Docs bundle is missing patched Excalidraw toolbar markers.' >&2
  exit 1
fi
