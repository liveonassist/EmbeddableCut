// SPDX-License-Identifier: MIT

// The changelog is the editor app's (web/src/data), appended by its release
// scripts; the UI reads the same file rather than keeping a copy.
import changelogData from '../../../../../web/src/data/changelog.json'
import type { ChangelogFile } from '../../../../../web/src/data/changelog-types'

const data = changelogData as ChangelogFile
const LAST_SEEN_KEY = 'freecut:whatsNewLastSeen'

function getLatestIdentifier(): string {
  if (data.current) return `current:${data.current.date}`
  return data.releases[0]?.version ?? ''
}

export function hasUnseenChangelog(): boolean {
  if (typeof window === 'undefined') return false
  const latest = getLatestIdentifier()
  if (!latest) return false
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY) !== latest
  } catch {
    return false
  }
}

export function markChangelogSeen(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, getLatestIdentifier())
  } catch {
    // storage unavailable; ignore
  }
}
