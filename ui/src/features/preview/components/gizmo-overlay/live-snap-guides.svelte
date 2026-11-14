<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import SnapGuides from '../snap-guides.svelte'
  import type { CoordinateParams } from '@/features/preview/types/gizmo'

  let { coordParams }: { coordParams: CoordinateParams } = $props()
  const snapLines = select(useGizmoStore, (state) => state.snapLines)
</script>

<SnapGuides snapLines={snapLines.current} coordParams={coordParams} />
