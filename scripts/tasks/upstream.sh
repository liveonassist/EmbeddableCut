#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Keeps EmbeddableCut level with FreeCut. See docs/UPSTREAM.md.
set -euo pipefail

UPSTREAM_URL=https://github.com/walterlow/freecut.git

ensure_remote() {
  if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream "$UPSTREAM_URL"
    # Nothing here is ever pushed to FreeCut.
    git remote set-url --push upstream DISABLED
  fi
}

case "${1:-}" in
fetch)
  ensure_remote
  git fetch upstream main
  ;;
status)
  ref="${2:-upstream/main}"
  echo "Upstream commits not merged into $(git rev-parse --abbrev-ref HEAD):"
  git log --oneline --no-merges "HEAD..$ref" | head -50
  echo
  echo "Files they change that have no counterpart here (ported or retired):"
  base="$(git merge-base HEAD "$ref")"
  git diff --name-only "$base" "$ref" -- src | while read -r path; do
    rel="${path#src/}"
    [ -e "engine/src/$rel" ] || [ -e "web/src/$rel" ] || echo "  $path"
  done
  ;;
merge)
  ref="${2:-upstream/main}"
  ensure_remote
  # Rename detection follows FreeCut's src/ into engine/src and web/src; a
  # high limit keeps it from giving up on a release-sized diff.
  git -c merge.renameLimit=20000 merge --no-ff --no-edit "$ref" || {
    echo
    echo "Resolve the conflicts. A \"file location\" conflict is a file upstream added in a"
    echo "directory that moved here: git has already put it in engine/ or web/, so check"
    echo "the package is right and \`git add\` it. Then run: just upstream place && just check all"
    exit 1
  }
  node scripts/tasks/place-upstream-files.mjs
  ;;
*)
  echo "usage: upstream.sh fetch | status [ref] | merge [ref]" >&2
  exit 2
  ;;
esac
