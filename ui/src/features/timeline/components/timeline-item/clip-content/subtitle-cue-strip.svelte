<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import type { SubtitleSegmentItem } from '@/types/timeline'

  /**
   * A caption segment drawn as its cues: one block per cue at its place in
   * time, the way a caption track reads in Premiere or Resolve, so where each
   * line starts and ends shows on the timeline itself.
   */
  let { item }: { item: SubtitleSegmentItem } = $props()

  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const segmentSeconds = $derived(Math.max(item.durationInFrames / fps.current, 1e-6))
  const cues = $derived(
    item.cues
      .filter((cue) => cue.endSeconds > 0 && cue.startSeconds < segmentSeconds)
      .map((cue) => {
        const start = Math.max(0, cue.startSeconds) / segmentSeconds
        const end = Math.min(segmentSeconds, cue.endSeconds) / segmentSeconds
        return { id: cue.id, text: cue.text, left: start * 100, width: (end - start) * 100 }
      }),
  )
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden">
  <div class="absolute inset-x-0 top-0 truncate px-2 pt-0.5 text-[10px] text-muted-foreground">
    {item.label || t('editor.subtitleSection.captions')} · {t('editor.subtitleSection.cueCount', {
      count: item.cues.length,
    })}
  </div>
  {#each cues as cue (cue.id)}
    <div
      class="absolute top-4 bottom-1 flex items-center overflow-hidden rounded-sm border border-foreground/20 bg-background/45 px-1 text-[11px] leading-tight text-foreground"
      style:left="{cue.left}%"
      style:width="max(2px, calc({cue.width}% - 1px))"
    >
      <span class="truncate">{cue.text}</span>
    </div>
  {/each}
</div>
