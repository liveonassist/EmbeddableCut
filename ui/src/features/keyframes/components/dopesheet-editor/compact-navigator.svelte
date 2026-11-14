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

  // Renders nothing until the keyframes port lands; the props type is the contract.
  // oxlint-disable-next-line no-empty-pattern -- only the props contract matters here
  let {}: CompactNavigatorProps = $props()
</script>
