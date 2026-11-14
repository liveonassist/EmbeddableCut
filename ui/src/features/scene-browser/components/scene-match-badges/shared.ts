// SPDX-License-Identifier: MIT

/**
 * all-MiniLM-L6-v2 and CLIP cosines both compress heavily — a 0.38 text
 * match is a *great* hit, not a "38% match". Showing raw percentages
 * scared users (see the bug report where `38%` on the top result
 * looked like the system was barely finding anything). We translate
 * raw cosines into qualitative tiers calibrated to each model's real
 * behavior and fill the strength bar proportionally to the tier's
 * reachable range rather than to the raw 0–1 cosine — so a strong
 * text hit actually looks full.
 */

export const TEXT_TIER_STRONG = 0.5
export const TEXT_TIER_GOOD = 0.4
export const TEXT_TIER_FAIR = 0.3

export const IMAGE_TIER_STRONG = 0.3
export const IMAGE_TIER_GOOD = 0.25
export const IMAGE_TIER_FAIR = 0.22

export type Tier = 'strong' | 'good' | 'fair'

export function scoreTier(
  score: number,
  thresholds: { strong: number; good: number; fair: number },
): Tier | null {
  if (score >= thresholds.strong) return 'strong'
  if (score >= thresholds.good) return 'good'
  if (score >= thresholds.fair) return 'fair'
  return null
}

export function tierLabel(tier: Tier, t: (key: string) => string): string {
  switch (tier) {
    case 'strong':
      return t('sceneBrowser.matchTiers.strong')
    case 'good':
      return t('sceneBrowser.matchTiers.good')
    case 'fair':
      return t('sceneBrowser.matchTiers.fair')
  }
}

/**
 * Map raw cosine to a 0-1 display fraction calibrated to the model's
 * real reachable range. For text embeddings we treat 0.3 (Fair floor)
 * as "empty bar" and 0.6 as "full bar"; for CLIP it's 0.22 → 0.35.
 * Users see a half-full bar on what's actually a ~0.4 text hit,
 * matching the intuition that it's a solid but not perfect match.
 */
function calibratedFraction(score: number, floor: number, ceiling: number): number {
  if (ceiling <= floor) return 0
  return Math.max(0, Math.min(1, (score - floor) / (ceiling - floor)))
}

export function textFraction(score: number): number {
  return calibratedFraction(score, TEXT_TIER_FAIR, 0.6)
}

export function imageFraction(score: number): number {
  return calibratedFraction(score, IMAGE_TIER_FAIR, 0.35)
}
