<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'
  import { select } from '$lib/store.svelte'
  import { useTransitionDragStore } from '@/shared/state/transition-drag'

  const target = portalTarget()
  const invalidHint = select(useTransitionDragStore, (s) => s.invalidHint)
</script>

{#if invalidHint.current}
  <Portal to={target}>
    <div
      class="pointer-events-none"
      style:position="fixed"
      style:left="{invalidHint.current.x}px"
      style:top="{invalidHint.current.y - 12}px"
      style:transform="translate(-50%, -100%)"
      style:z-index="10000"
    >
      <div
        class="max-w-[220px] rounded-md border border-slate-200/70 bg-slate-900/92 px-2.5 py-1.5 text-[11px] font-medium text-slate-50 shadow-xl backdrop-blur-sm"
      >
        {invalidHint.current.message}
      </div>
    </div>
  </Portal>
{/if}
