<!-- SPDX-License-Identifier: MIT -->
<!--
  Sequence - Time-bounded visibility component

  Shows/hides children based on the current frame position.

  - Uses CSS visibility instead of conditional rendering
    (keeps DOM stable, prevents video element remounting)
  - Provides local frame context to children
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { useClockFrameSelector } from '../clock'
  import { setSequenceContext, useSequenceContext } from './sequence-context'

  interface SequenceProps {
    /** Children to render */
    children: Snippet
    /** Start frame (inclusive) */
    from: number
    /** Duration in frames */
    durationInFrames: number
    /** Optional name for debugging */
    name?: string
    /** Whether to use display:none instead of visibility:hidden */
    useDisplayNone?: boolean
    /** Layout style - absolute fill or inline */
    layout?: 'absolute-fill' | 'none'
    /** Custom style */
    style?: string
    /** Custom class name */
    class?: string
    /**
     * Number of frames to premount the sequence before it becomes visible.
     * Used for preloading content like videos.
     */
    premountFor?: number
  }

  let {
    children,
    from,
    durationInFrames,
    name,
    useDisplayNone = false,
    layout = 'absolute-fill',
    style,
    class: className,
    premountFor = 0,
  }: SequenceProps = $props()

  // Get parent sequence context (for nested sequences like sub-compositions)
  const parentContext = useSequenceContext()
  const parentFrom = $derived(parentContext?.from ?? 0)

  // When nested inside another Sequence (e.g. sub-comp items inside a CompositionItem),
  // `from` is relative to the parent. Convert to absolute frame for clock comparison.
  const absoluteFrom = $derived(parentFrom + from)
  const endFrame = $derived(absoluteFrom + durationInFrames)
  const premountStart = $derived(absoluteFrom - premountFor)

  // Keep one stable value while outside the mount range and one while
  // premounted. Active sequences still receive every frame. This prevents
  // inactive timeline items from fanning every Clock tick into component work.
  const relevantFrame = useClockFrameSelector((frame: number): number | null => {
    if (frame < premountStart || frame >= endFrame) return null
    if (frame < absoluteFrom) return absoluteFrom - 1
    return frame
  })

  // Calculate visibility using absolute frame positions
  const isVisible = $derived(relevantFrame.current !== null && relevantFrame.current >= absoluteFrom)
  // Mount content if visible OR within premount range
  const shouldMount = $derived(relevantFrame.current !== null)

  // Calculate local frame (0-based within this sequence)
  // NOTE: During premount, localFrame can be negative (before the sequence starts).
  // This allows children to detect premount phase and avoid rendering content.
  const localFrame = $derived((relevantFrame.current ?? absoluteFrom) - absoluteFrom)

  // Expose absoluteFrom so nested children can continue to offset their own
  // `from` correctly.
  setSequenceContext({
    get from() {
      return absoluteFrom
    },
    get durationInFrames() {
      return durationInFrames
    },
    get localFrame() {
      return localFrame
    },
    get parentFrom() {
      return parentFrom
    },
  })

  // Build style based on visibility and layout
  const computedStyle = $derived.by(() => {
    let result = style ? `${style};` : ''

    // Apply layout
    if (layout === 'absolute-fill') {
      result += 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%;'
    }

    // Apply visibility (hidden during premount phase)
    if (!isVisible) {
      if (useDisplayNone && !shouldMount) {
        // Only use display:none if not premounting
        result += ' display: none;'
      } else {
        // Keep in layout flow but invisible
        result += ' visibility: hidden; pointer-events: none;'
      }
    }

    return result.trim() || undefined
  })
</script>

<!-- Don't render anything if not in mount range -->
{#if shouldMount}
  <div
    data-sequence-name={name}
    data-sequence-from={from}
    data-sequence-duration={durationInFrames}
    class={className}
    style={computedStyle}
  >
    {@render children()}
  </div>
{/if}
