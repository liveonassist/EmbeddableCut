<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ItemEffect } from '@/types/effects'

  /** Stands in for `GpuCurvesPanel` in tests: one committed master-curve change. */
  let {
    effect,
    onParamsBatchChange,
  }: {
    effect: ItemEffect
    onParamsBatchChange: (effectId: string, updates: Record<string, string>) => void
  } = $props()
</script>

<div data-testid="curves-panel" data-effect-id={effect.id}>
  <button
    type="button"
    onclick={() => onParamsBatchChange(effect.id, { masterPoints: '[[0,0],[1,1]]' })}
  >
    commit curves
  </button>
</div>
