<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { TooltipProvider } from '@/components/ui/tooltip'
  import type { TimelineItem } from '@/types/timeline'
  import ShapeSection from './shape-section.svelte'

  let { items }: { items: TimelineItem[] } = $props()
</script>

<TooltipProvider>
  <ShapeSection {items} />
</TooltipProvider>
