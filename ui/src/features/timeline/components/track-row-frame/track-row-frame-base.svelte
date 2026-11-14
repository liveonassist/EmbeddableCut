<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import type { TrackRowFrameBaseProps } from './types'

  /**
   * Keeps the row separator outside the lane content so clips can fill the row.
   */
  let {
    children,
    class: className,
    onResizeMouseDown,
    onResizeDoubleClick,
    resizeHandleLabel,
    resizeHandlePosition = 'bottom',
    dividers,
  }: TrackRowFrameBaseProps = $props()

  const resizeHandlePositionClass = $derived(resizeHandlePosition === 'top' ? 'top-0' : 'bottom-0')
  const hasTopDivider = $derived(dividers === 'top-and-bottom')
</script>

<div class={cn('relative', className)}>
  {#if hasTopDivider}
    <div
      aria-hidden="true"
      data-testid="track-row-top-divider"
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-border"
    ></div>
  {/if}
  {@render children?.()}
  <div
    aria-hidden="true"
    data-testid="track-row-divider"
    class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border"
  ></div>
  {#if onResizeMouseDown}
    <button
      type="button"
      tabindex={-1}
      class={cn(
        'absolute inset-x-0 z-30 h-[6px] cursor-row-resize bg-transparent focus-visible:outline-none',
        resizeHandlePositionClass,
      )}
      aria-label={resizeHandleLabel ?? t('timeline.trackRow.resizeTrackHeight')}
      onmousedown={onResizeMouseDown}
      ondblclick={onResizeDoubleClick}
    ></button>
  {/if}
</div>
