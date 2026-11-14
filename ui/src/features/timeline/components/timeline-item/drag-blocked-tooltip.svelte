<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'

  interface DragBlockedTooltipProps {
    hint: { x: number; y: number; message: string; tone?: 'warning' | 'danger' } | null
  }

  /**
   * Tooltip shown when trying to drag in rate-stretch mode
   */
  let { hint }: DragBlockedTooltipProps = $props()

  const target = portalTarget()
</script>

{#if hint}
  <Portal to={target}>
    <div
      class="pointer-events-none"
      style:position="fixed"
      style:left="{hint.x}px"
      style:top="{hint.y - 8}px"
      style:transform="translate(-50%, -100%)"
      style:z-index="9999"
    >
      <div
        class={[
          'overflow-hidden rounded-md px-3 py-1.5 text-xs text-white shadow-lg',
          hint.tone === 'danger' ? 'bg-red-500' : 'bg-orange-500',
        ].join(' ')}
      >
        {hint.message}
      </div>
    </div>
  </Portal>
{/if}
