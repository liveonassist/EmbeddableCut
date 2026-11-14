<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Component } from 'svelte'
  import { TooltipProvider } from '@/components/ui/tooltip'
  import type { CanvasSettings } from '@/types/transform'
  import type { TimelineItem } from '@/types/timeline'

  let {
    section: Section,
    items,
    canvas,
  }: {
    section: Component<{ items: TimelineItem[]; canvas: CanvasSettings }>
    items: TimelineItem[]
    canvas: CanvasSettings
  } = $props()
</script>

<TooltipProvider>
  <Section {items} {canvas} />
</TooltipProvider>
