<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import PickWhipOverlay from '@/shared/ui/pick-whip-overlay.svelte'
  import type { TransformParentDragState } from './use-transform-parent-pick-whip.svelte'

  let { drag }: { drag: TransformParentDragState } = $props()
</script>

<PickWhipOverlay presentation={drag.presentation} testId="transform-parent-pick-whip" />
