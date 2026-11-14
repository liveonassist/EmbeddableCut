<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import PlayheadMarks from '@/shared/ui/playhead-marks.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { MotionTimeViewport } from '../motion-time-viewport-controller'

  let { timeViewport }: { timeViewport: MotionTimeViewport } = $props()

  let playhead: HTMLDivElement | null = $state(null)

  // Positioned straight from the store so playback never re-renders the timeline.
  function updatePosition() {
    const element = playhead
    if (!element) return
    const viewport = timeViewport
    const playback = usePlaybackStore.getState()
    const displayFrame = playback.previewFrame ?? playback.currentFrame
    if (displayFrame < viewport.startFrame || displayFrame > viewport.endFrame) {
      element.hidden = true
      return
    }
    element.hidden = false
    const width = element.parentElement?.clientWidth ?? 0
    const visibleFrameRange = Math.max(1, viewport.endFrame - viewport.startFrame)
    const x = ((displayFrame - viewport.startFrame) / visibleFrameRange) * width
    element.style.transform = `translate3d(${x}px, 0, 0)`
  }

  $effect.pre(() => {
    void timeViewport
    void playhead
    updatePosition()
  })

  $effect(() =>
    usePlaybackStore.subscribe((state, previous) => {
      if (state.currentFrame !== previous.currentFrame || state.previewFrame !== previous.previewFrame) {
        updatePosition()
      }
    }),
  )
</script>

<div
  bind:this={playhead}
  data-testid="motion-playhead"
  class="pointer-events-none absolute inset-y-0 left-0 z-20 will-change-transform"
>
  <PlayheadMarks handle="flag" bleedBottom />
</div>
