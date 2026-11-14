<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import type {
    TimelineItemOverlay,
    TimelineItemOverlayTone,
  } from '@/features/timeline/stores/timeline-item-overlay-store'

  interface SegmentStatusOverlaysProps {
    overlays: readonly TimelineItemOverlay[]
  }

  const TONE_CLASSES: Record<TimelineItemOverlayTone, string> = {
    neutral: 'bg-black/75 text-white ring-white/10',
    info: 'bg-sky-600/85 text-white ring-sky-100/20',
    success: 'bg-emerald-600/85 text-white ring-emerald-100/20',
    warning: 'bg-amber-500/90 text-black ring-amber-50/30',
    error: 'bg-destructive/90 text-destructive-foreground ring-destructive-foreground/20',
  }

  function formatOverlayProgress(progress: number): string {
    return `${Math.max(0, Math.min(100, Math.round(progress)))}%`
  }

  let { overlays }: SegmentStatusOverlaysProps = $props()

  const rangeOverlays = $derived(
    overlays.flatMap((overlay) =>
      (overlay.ranges ?? []).map((range, index) => ({
        id: `${overlay.id}:${index}`,
        startRatio: Math.max(0, Math.min(1, range.startRatio)),
        endRatio: Math.max(0, Math.min(1, range.endRatio)),
      })),
    ),
  )
</script>

{#if overlays.length > 0}
  <div class="absolute inset-0 z-20 pointer-events-none">
    {#each rangeOverlays as range (range.id)}
      {@const widthRatio = Math.max(0, range.endRatio - range.startRatio)}
      {#if widthRatio > 0}
        <div
          class="absolute inset-y-0 rounded-sm border-x border-red-200/70 bg-red-500/35 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.35)]"
          style:left="{range.startRatio * 100}%"
          style:width="{widthRatio * 100}%"
        ></div>
      {/if}
    {/each}
    <div class="absolute inset-0 flex items-center justify-center px-2">
      <div class="flex max-w-full flex-col items-center gap-1">
        {#each overlays as overlay (overlay.id)}
          <div
            class={cn(
              'flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-[10px] font-medium shadow-lg ring-1 backdrop-blur-sm',
              TONE_CLASSES[overlay.tone ?? 'neutral'],
            )}
            title={overlay.progress === undefined
              ? overlay.label
              : `${overlay.label} ${formatOverlayProgress(overlay.progress)}`}
          >
            <span class="truncate">{overlay.label}</span>
            {#if overlay.progress !== undefined}
              <span class="shrink-0 font-mono tabular-nums">
                {formatOverlayProgress(overlay.progress)}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
