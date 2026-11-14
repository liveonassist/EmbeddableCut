<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Eye from 'lucide-svelte/icons/eye'
  import MessageSquareText from 'lucide-svelte/icons/message-square-text'
  import Palette from 'lucide-svelte/icons/palette'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Type from 'lucide-svelte/icons/type'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import type { SceneMatchSignals } from '@/features/scene-browser/utils/rank'
  import {
    IMAGE_TIER_FAIR,
    IMAGE_TIER_GOOD,
    IMAGE_TIER_STRONG,
    TEXT_TIER_FAIR,
    TEXT_TIER_GOOD,
    TEXT_TIER_STRONG,
    scoreTier,
    tierLabel,
  } from './shared'

  /**
   * Per-row surface that tells the user *why* a scene ranked — which
   * signal (keyword, semantic meaning, visual CLIP) fired and how
   * strongly. This is the main feedback loop that makes "I typed a query
   * and scrolled a list" feel like something is actually happening rather
   * than magic.
   *
   * Conventions:
   *   - Keyword matches get a single yellow "Word" chip (match spans are
   *     already highlighted in the caption text itself, so the chip is a
   *     reinforcement rather than the only signal).
   *   - Semantic-text matches get a blue "Meaning" chip with the percent.
   *   - Semantic-visual matches get a purple "Visual" chip with the percent.
   *   - When both semantic signals fire, both chips render — users see
   *     directly which side of the parallel vector store contributed.
   */

  interface SceneMatchBadgesProps {
    signals: SceneMatchSignals
    score: number
    rank?: 'top' | 'default'
    class?: string
  }

  type ChipTone = 'keyword' | 'text' | 'visual' | 'top' | 'palette'

  interface ChipProps {
    key: string
    tone: ChipTone
    icon: typeof Type
    label: string
    hint?: string
  }

  let { signals, score, rank = 'default', class: className }: SceneMatchBadgesProps = $props()

  const isTopRank = $derived(rank === 'top')

  const chips = $derived.by(() => {
    const result: ChipProps[] = []

    if (signals.ranker === 'keyword' && signals.keywordMatched) {
      result.push({
        key: 'keyword',
        tone: 'keyword',
        icon: Type,
        label: t('sceneBrowser.match.keyword'),
        hint: t('sceneBrowser.match.keywordHint', { score: score.toFixed(2) }),
      })
    }

    if (signals.ranker === 'semantic') {
      const textScore = signals.textScore
      const imageScore = signals.imageScore
      const textTier =
        typeof textScore === 'number'
          ? scoreTier(textScore, {
              strong: TEXT_TIER_STRONG,
              good: TEXT_TIER_GOOD,
              fair: TEXT_TIER_FAIR,
            })
          : null
      const imageTier =
        typeof imageScore === 'number'
          ? scoreTier(imageScore, {
              strong: IMAGE_TIER_STRONG,
              good: IMAGE_TIER_GOOD,
              fair: IMAGE_TIER_FAIR,
            })
          : null

      if (textTier) {
        result.push({
          key: 'semantic-text',
          tone: 'text',
          icon: MessageSquareText,
          label: t('sceneBrowser.match.meaningWithTier', { tier: tierLabel(textTier, t) }),
          hint: t('sceneBrowser.match.textEmbeddingHint', { score: (textScore ?? 0).toFixed(3) }),
        })
      }
      if (imageTier) {
        result.push({
          key: 'semantic-image',
          tone: 'visual',
          icon: Eye,
          label: t('sceneBrowser.match.visualWithTier', { tier: tierLabel(imageTier, t) }),
          hint: t('sceneBrowser.match.clipHint', { score: (imageScore ?? 0).toFixed(3) }),
        })
      }
      if (signals.colorMatch) {
        result.push({
          key: 'semantic-color',
          tone: 'palette',
          icon: Palette,
          label: t('sceneBrowser.match.colorWithName', { color: signals.colorMatch }),
          hint: t('sceneBrowser.match.paletteColorHint', { color: signals.colorMatch }),
        })
      }
      if (typeof signals.paletteDistance === 'number') {
        result.push({
          key: 'palette-similar',
          tone: 'palette',
          icon: Palette,
          label: t('sceneBrowser.match.paletteDistance', {
            distance: signals.paletteDistance.toFixed(1),
          }),
          hint: t('sceneBrowser.match.paletteDistanceHint'),
        })
      }

      if (!textTier && !imageTier && !signals.colorMatch && signals.paletteDistance === undefined) {
        // Shouldn't normally reach here — the ranker drops rows that clear
        // no threshold — but surface something so the row isn't silent.
        result.push({
          key: 'semantic-weak',
          tone: 'text',
          icon: Sparkles,
          label: t('sceneBrowser.match.belowThreshold'),
          hint: t('sceneBrowser.match.cosineHint', { score: score.toFixed(3) }),
        })
      }
    }

    return result
  })

  function toneClass(tone: ChipTone): string {
    switch (tone) {
      case 'keyword':
        return 'bg-amber-400/15 text-amber-300 border-amber-400/30'
      case 'text':
        return 'bg-sky-400/15 text-sky-300 border-sky-400/30'
      case 'visual':
        return 'bg-purple-400/15 text-purple-300 border-purple-400/30'
      case 'palette':
        return 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
      case 'top':
        return 'bg-primary/15 text-primary border-primary/40'
    }
  }
</script>

{#snippet chip({ tone, icon: Icon, label, hint }: Omit<ChipProps, 'key'>)}
  <span
    class={cn(
      'inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium leading-none',
      toneClass(tone),
    )}
    title={hint}><Icon class="h-2.5 w-2.5" />{label}</span
  >
{/snippet}

{#if chips.length > 0 || isTopRank}
  <div class={cn('flex flex-wrap items-center gap-1', className)}>
    {#if isTopRank}
      {@render chip({
        tone: 'top',
        icon: Sparkles,
        label: t('sceneBrowser.match.top'),
        hint: t('sceneBrowser.match.topHint'),
      })}
    {/if}
    {#each chips as entry (entry.key)}
      {@render chip(entry)}
    {/each}
  </div>
{/if}
