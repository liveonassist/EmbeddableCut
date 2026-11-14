<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useRafDeferredValue } from '@/shared/hooks/use-raf-deferred-value.svelte'
  import type { TimelineItem } from '@/types/timeline'
  import AlignmentToolbarCore from './alignment-toolbar-core.svelte'

  interface AlignmentToolbarProps {
    projectSize: { width: number; height: number }
  }

  interface DeferredAlignmentToolbarProps extends AlignmentToolbarProps {
    itemsSnapshot: TimelineItem[]
  }

  let { itemsSnapshot, projectSize }: DeferredAlignmentToolbarProps = $props()
  const deferredItems = useRafDeferredValue(() => itemsSnapshot)
</script>

<AlignmentToolbarCore projectSize={projectSize} items={deferredItems.current} />
