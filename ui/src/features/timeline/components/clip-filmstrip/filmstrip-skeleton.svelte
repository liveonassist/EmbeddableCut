<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from '@/features/timeline/constants'

  interface FilmstripSkeletonProps {
    /** Width of the clip in pixels */
    clipWidth: number
    /** Height of the skeleton (defaults to THUMBNAIL_HEIGHT from constants) */
    height?: number
    /** Optional class for positioning */
    class?: string
  }

  /**
   * Filmstrip Skeleton Component
   *
   * Displays empty placeholder slots while filmstrip thumbnails are loading.
   * Uses a subtle gradient to indicate loading without visual noise from spinners.
   */
  let { clipWidth, height = THUMBNAIL_HEIGHT, class: className = '' }: FilmstripSkeletonProps =
    $props()
</script>

<!-- Subtle shimmer effect using CSS animation -->
<div
  class={`absolute left-0 right-0 overflow-hidden bg-zinc-900/30 ${className}`}
  style:height="{height}px"
  style:width="{clipWidth}px"
  style:background-image={`linear-gradient(
          90deg,
          transparent 0%,
          rgba(255,255,255,0.03) 50%,
          transparent 100%
        )`}
  style:background-size="{THUMBNAIL_WIDTH * 2}px 100%"
  style:animation="filmstrip-shimmer 1.5s ease-in-out infinite"
></div>
