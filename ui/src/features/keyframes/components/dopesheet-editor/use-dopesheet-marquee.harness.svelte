<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { KeyframeMarqueeOverlay } from '../keyframe-marquee'
  import { stateRef } from '../ref-state.svelte'
  import { useDopesheetMarquee } from './use-dopesheet-marquee.svelte'

  interface HarnessProps {
    onSelectionChange: (
      keyframeIds: Set<string>,
      options?: { preserveExternalSelection?: boolean },
    ) => void
    onSelectionPreviewChange: (keyframeIds: Set<string> | null) => void
    getKeyframePoints: () => Array<{ keyframeId: string; x: number; y: number }>
  }

  let { onSelectionChange, onSelectionPreviewChange, getKeyframePoints }: HarnessProps = $props()

  const scrollAreaRef = stateRef<HTMLDivElement | null>(null)
  const marquee = useDopesheetMarquee(() => ({
    getKeyframePoints,
    scrollAreaRef,
    getTimelineXFromClientX: (clientX) => clientX,
    getContentYFromClientY: (clientY) => clientY,
    onSelectionChange,
    onSelectionPreviewChange,
  }))
</script>

<div bind:this={scrollAreaRef.current}>
  <button
    type="button"
    onpointerdown={(event) =>
      marquee.beginMarqueeSelection(
        event.pointerId,
        event.clientX,
        event.clientY,
        'replace',
        new Set(),
      )}
  >
    Start marquee
  </button>
  <KeyframeMarqueeOverlay bind:ref={marquee.marqueeOverlayRef.current} rect={null} persistent />
</div>
