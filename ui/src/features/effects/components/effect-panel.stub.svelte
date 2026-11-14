<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ItemEffect } from '@/types/effects'

  /** Stands in for a GPU effect panel in tests: exposes its move actions. */
  let {
    effect,
    onMove,
    canMoveUp,
    canMoveDown,
  }: {
    effect: ItemEffect
    onMove?: (effectId: string, direction: -1 | 1) => void
    canMoveUp?: boolean
    canMoveDown?: boolean
  } = $props()
</script>

<div data-testid={`effect-${effect.id}`}>
  <button type="button" disabled={!canMoveUp} onclick={() => onMove?.(effect.id, -1)}>
    move {effect.id} up
  </button>
  <button type="button" disabled={!canMoveDown} onclick={() => onMove?.(effect.id, 1)}>
    move {effect.id} down
  </button>
</div>
