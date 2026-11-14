<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import { needsTranscriptWordSeparator } from '@/shared/utils/transcript-text'
  import type { TranscriptToken } from '@/features/timeline/utils/transcript-edit-model'
  import { formatTimecode, type TranscriptSegment } from './transcript-segments'

  interface TranscriptSegmentRowProps {
    segment: TranscriptSegment
    tokens: readonly TranscriptToken[]
    /** Global index of the active word, or -1 when it falls outside this segment. */
    activeIndex: number
    selectedKeys: ReadonlySet<string>
    matchKeys: ReadonlySet<string>
    ignoredKeys: ReadonlySet<string>
    matchesApproximate: boolean
    onSeek: (frame: number) => void
    onPointerDown: (index: number, event: PointerEvent) => void
  }

  /**
   * One timestamped paragraph. The parent passes activeIndex={-1} to every
   * segment that doesn't hold the active word, so the per-frame playhead
   * highlight only updates the segment that gains/loses it — the full transcript
   * doesn't reconcile each frame during playback/skim.
   */
  let {
    segment,
    tokens,
    activeIndex,
    selectedKeys,
    matchKeys,
    ignoredKeys,
    matchesApproximate,
    onSeek,
    onPointerDown,
  }: TranscriptSegmentRowProps = $props()

  function tokenClass(index: number, key: string): string {
    const isActive = index === activeIndex
    const isSelected = selectedKeys.has(key)
    const isMatch = matchKeys.has(key)
    const isIgnored = ignoredKeys.has(key)
    return cn(
      'cursor-text rounded px-0.5',
      isSelected
        ? 'bg-primary text-primary-foreground'
        : isActive
          ? 'bg-yellow-300 text-neutral-900 shadow-sm'
          : isMatch
            ? matchesApproximate
              ? 'text-foreground ring-1 ring-inset ring-amber-500/40'
              : 'text-foreground ring-1 ring-inset ring-amber-500/70'
            : 'text-foreground/85 hover:bg-secondary/60 hover:text-foreground',
      isIgnored && 'line-through decoration-from-font opacity-45',
    )
  }

  function separatorAfter(index: number, token: TranscriptToken): string {
    const nextToken = index < segment.lastIndex ? tokens[index + 1] : undefined
    return nextToken && needsTranscriptWordSeparator(token.text, nextToken.text) ? ' ' : ''
  }
</script>

{#if segment.isClipStart}
  <div class="flex items-center gap-2 pt-4 pb-1 first:pt-0" aria-hidden="true">
    <span class="h-px flex-1 bg-border"></span>
    <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {t('transcript.boundaryClip', { defaultValue: 'New clip' })}
    </span>
    <span class="h-px flex-1 bg-border"></span>
  </div>
{/if}
<div class="group grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 py-1.5">
  <button
    type="button"
    onpointerdown={(event) => event.stopPropagation()}
    onclick={() => onSeek(segment.startFrame)}
    aria-label={t('transcript.jumpTo', {
      defaultValue: 'Jump to {{time}}',
      time: formatTimecode(segment.startSeconds),
    })}
    class="mt-px h-fit select-none rounded text-right font-mono text-[11px] tabular-nums leading-7 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
  >
    {formatTimecode(segment.startSeconds)}
  </button>
  <p class="min-w-0 break-words text-[13px] leading-7">
    {#each segment.indices as index (tokens[index]?.key ?? index)}
      {@const token = tokens[index]}
      {#if token}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          data-token-key={token.key}
          data-token-index={index}
          onpointerdown={(event) => onPointerDown(index, event)}
          class={tokenClass(index, token.key)}>{token.text}{separatorAfter(index, token)}</span
        >
      {/if}
    {/each}
  </p>
</div>
