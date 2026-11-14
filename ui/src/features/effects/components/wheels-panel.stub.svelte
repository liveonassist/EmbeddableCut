<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ItemEffect } from '@/types/effects'

  /** Stands in for `GpuWheelsPanel` in tests: one live and one committed lift change. */
  let {
    effect,
    onParamsBatchChange,
    onParamsBatchLiveChange,
  }: {
    effect: ItemEffect
    onParamsBatchChange: (effectId: string, updates: Record<string, number>) => void
    onParamsBatchLiveChange: (effectId: string, updates: Record<string, number>) => void
  } = $props()
</script>

<div data-testid="wheels-panel" data-effect-id={effect.id}>
  <button type="button" onclick={() => onParamsBatchLiveChange(effect.id, { lift: 0.1 })}>
    live wheels
  </button>
  <button type="button" onclick={() => onParamsBatchChange(effect.id, { lift: 0.1 })}>
    commit wheels
  </button>
</div>
