<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { KeyframeNavigatorViewport } from './compact-navigator-utils'

  interface CompactNavigatorProps {
    viewport: KeyframeNavigatorViewport
    currentFrame: number
    contentFrameMax: number
    minVisibleFrames: number
    disabled?: boolean
    onViewportChange: (viewport: KeyframeNavigatorViewport) => void
    onViewportPreviewStart?: () => void
    onViewportPreview?: (viewport: KeyframeNavigatorViewport | null) => void
  }

  const props: CompactNavigatorProps = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
