<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'

  interface Props {
    items: TimelineItem[]
    layout?: 'sidebar' | 'dock'
    onCreateAdjustmentLayer?: () => void
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
