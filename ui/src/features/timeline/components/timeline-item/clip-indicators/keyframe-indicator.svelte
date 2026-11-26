<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Diamond from '@lucide/svelte/icons/diamond'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import { stopClipIndicatorEvent } from './types'

  let { expanded, onToggle }: { expanded: boolean; onToggle?: () => void } = $props()

  const label = $derived(
    t(
      expanded
        ? 'timeline.keyframeEditor.editLane.hide'
        : 'timeline.keyframeEditor.editLane.show',
      { defaultValue: expanded ? 'Hide keyframe panel' : 'Show keyframe panel' },
    ),
  )
</script>

<button
  type="button"
  class={cn(
    'pointer-events-auto rounded-sm p-0.5 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400',
    expanded && 'bg-amber-500/20',
  )}
  title={t('timeline.clipIndicators.hasKeyframes')}
  aria-label={label}
  aria-pressed={expanded}
  onpointerdown={stopClipIndicatorEvent}
  onmousedown={stopClipIndicatorEvent}
  onclick={(event) => {
    stopClipIndicatorEvent(event)
    onToggle?.()
  }}
>
  <Diamond class="w-3 h-3 text-amber-500 fill-amber-500/50" />
</button>
