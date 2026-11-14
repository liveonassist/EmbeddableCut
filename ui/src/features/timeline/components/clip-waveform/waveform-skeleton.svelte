<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  // Waveform dimensions
  const WAVEFORM_HEIGHT = 32
</script>

<script lang="ts">
  interface WaveformSkeletonProps {
    /** Width of the clip in pixels */
    clipWidth: number
    /** Height of the skeleton (default: 32px) */
    height?: number
    /** Optional class for positioning */
    class?: string
  }

  /**
   * Waveform Skeleton Component
   *
   * Displays a subtle shimmer placeholder while waveform data is loading.
   * Uses the same animation style as filmstrip skeleton for consistency.
   */
  let { clipWidth, height = WAVEFORM_HEIGHT, class: className = '' }: WaveformSkeletonProps =
    $props()
</script>

<!-- Subtle shimmer effect matching filmstrip -->
<div
  class={`absolute left-0 right-0 overflow-hidden bg-timeline-audio/10 ${className}`}
  style:height="{height}px"
  style:width="{clipWidth}px"
  style:background-image={`linear-gradient(
          90deg,
          transparent 0%,
          rgba(158, 107, 214, 0.1) 50%,
          transparent 100%
        )`}
  style:background-size="120px 100%"
  style:animation="filmstrip-shimmer 1.5s ease-in-out infinite"
></div>
