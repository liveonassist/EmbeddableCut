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
  echo "UI files they change, to port into ui/src, and files with no counterpart here:"
  base="$(git merge-base HEAD "$ref")"
  git diff --name-only "$base" "$ref" -- src | while read -r path; do
    rel="${path#src/}"
    stem="${rel%.ts}"
    stem="${stem%.tsx}"
    [ -e "engine/src/$rel" ] && continue
    twin=""
    for candidate in "$stem.svelte" "$stem.svelte.ts" "$stem.ts" "$stem"; do
      if [ -e "ui/src/$candidate" ]; then
        twin="ui/src/$candidate"
        break
      fi
    done
    echo "  $path${twin:+ -> $twin}"
  done
  ;;
merge)
  ref="${2:-upstream/main}"
  ensure_remote
  # Rename detection follows FreeCut's src/ into engine/src; a high limit
  # keeps it from giving up on a release-sized diff. FreeCut's React UI was
  # ported to ui/src and removed, so a change to it is a modify/delete
  # conflict that leaves upstream's file under src/.
  git -c merge.renameLimit=20000 merge --no-ff --no-edit "$ref" || {
    echo
    echo "Resolve the conflicts. A \"file location\" conflict is a file upstream added in a"
    echo "directory that moved here: git has put it in engine/ or ui/; \`git add\` it there."
    echo "A modify/delete conflict is a React file the Svelte UI replaced: \`git add\` it"
    echo "under src/. Then run: just upstream place, port what it lists, and just check all."
    exit 1
  }
  node scripts/tasks/place-upstream-files.mjs
  ;;
*)
  echo "usage: upstream.sh fetch | status [ref] | merge [ref]" >&2
  exit 2
  ;;
esac
