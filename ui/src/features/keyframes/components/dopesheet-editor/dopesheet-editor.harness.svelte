<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { TooltipProvider } from '@/components/ui/tooltip'
  import TimelinePreviewScrubberVisual from '@/shared/ui/timeline-preview-scrubber-visual.svelte'
  import { timelineSkimmerScrubSignal } from '@/shared/timeline/main-timeline-scrub'
  import { DopesheetEditor } from './index'
  import type { DopesheetEditorProps } from './dopesheet-editor-props'

  // Test host for the whole editor: the app's TooltipProvider (bits-ui tooltips
  // need one), plus an optional main-timeline skimmer rendered beside it.
  let {
    mainSkimmer = false,
    fps = 30,
    ...props
  }: DopesheetEditorProps & { mainSkimmer?: boolean } = $props()
</script>

<TooltipProvider>
  {#if mainSkimmer}
    <TimelinePreviewScrubberVisual
      frameToPixels={(frame) => frame}
      {fps}
      suppressSignal={timelineSkimmerScrubSignal}
    />
  {/if}
  <DopesheetEditor {fps} {...props} />
</TooltipProvider>
