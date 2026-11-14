<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ClipContent from './clip-content.svelte'
  import type { ClipContentProps } from './types'

  /** Wraps ClipContent in a stand-in timeline item root, as TimelineItem mounts it. */
  let props: ClipContentProps = $props()
</script>

<div data-testid="timeline-item-root" data-item-id={props.item.id}>
  <ClipContent {...props} />
</div>
