<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import DeferredAlignmentToolbar from './alignment-hud/deferred-alignment-toolbar.svelte'

  interface AlignmentToolbarProps {
    projectSize: { width: number; height: number }
  }

  let { projectSize }: AlignmentToolbarProps = $props()
  const itemsSnapshot = select(useItemsStore, (state) => state.items)
</script>

<DeferredAlignmentToolbar itemsSnapshot={itemsSnapshot.current} projectSize={projectSize} />
