<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import PickWhipOverlay from '@/shared/ui/pick-whip-overlay.svelte'
  import type { MotionPickWhipPresentation } from '@/shared/hooks/use-pick-whip-drag.svelte'

  interface PropertyLinkDragState {
    startX: number
    startY: number
    currentX: number
    currentY: number
    sourceItemId: string | null
    clipBounds: {
      left: number
      top: number
      right: number
      bottom: number
    }
    presentation: MotionPickWhipPresentation
  }

  let { drag }: { drag: PropertyLinkDragState } = $props()
</script>

<PickWhipOverlay presentation={drag.presentation} testId="property-link-pick-whip" />
