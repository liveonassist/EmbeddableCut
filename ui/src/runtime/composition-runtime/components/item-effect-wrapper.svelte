<!-- SPDX-License-Identifier: MIT -->
<!--
  Legacy CSS effect rendering removed — all adjustment layer effects now render
  via GPU pipeline in client-render-engine (canvas-effects.ts).
  This wrapper simply passes children through with the same DOM structure.
  (React read the sequence frame here to isolate per-frame renders; nothing
  here depends on it.)
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { AdjustmentLayerWithTrackOrder } from './item-effect-wrapper-types'

  let {
    children,
  }: {
    /** The item's track order (used to determine if effects should apply) */
    itemTrackOrder: number
    /** All adjustment layers (from visible tracks) */
    adjustmentLayers: AdjustmentLayerWithTrackOrder[]
    /** The `from` value of the nearest parent Sequence (for converting local to global frame) */
    sequenceFrom: number
    /** Children to render */
    children: Snippet
  } = $props()
</script>

<div style="width: 100%; height: 100%; position: relative;">
  {@render children()}
</div>
