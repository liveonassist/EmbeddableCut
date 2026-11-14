<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import PickWhipOverlay from '@/shared/ui/pick-whip-overlay.svelte'
  import type { PropertyLinkDragState } from './property-link-pick-whip-overlay-types'

  let { drag }: { drag: PropertyLinkDragState } = $props()
</script>

<PickWhipOverlay presentation={drag.presentation} testId="property-link-pick-whip" />
