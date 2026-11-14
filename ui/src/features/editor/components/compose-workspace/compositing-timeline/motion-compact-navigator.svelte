<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { CompactNavigator } from '@/features/editor/deps/timeline-motion'
  import type { MotionTimeViewport } from '../motion-time-viewport-controller'
  import { useSettledMotionFrame } from '../motion-timeline-primitives'

  let {
    viewport,
    contentFrameMax,
    minVisibleFrames,
    onViewportChange,
    onViewportPreviewStart,
    onViewportPreview,
  }: {
    viewport: MotionTimeViewport
    contentFrameMax: number
    minVisibleFrames: number
    onViewportChange: (viewport: MotionTimeViewport) => void
    onViewportPreviewStart: () => void
    onViewportPreview: (viewport: MotionTimeViewport | null) => void
  } = $props()

  const currentFrame = useSettledMotionFrame()
</script>

<CompactNavigator
  {viewport}
  currentFrame={currentFrame.current}
  {contentFrameMax}
  {minVisibleFrames}
  {onViewportChange}
  {onViewportPreviewStart}
  {onViewportPreview}
/>
