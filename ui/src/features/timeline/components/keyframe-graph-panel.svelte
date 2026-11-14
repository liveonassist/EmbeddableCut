<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface KeyframeGraphPanelProps {
    isOpen: boolean
    onToggle?: () => void
    onClose: () => void
    placement?: 'bottom' | 'top' | 'side'
    showCloseButton?: boolean
    splitView?: boolean
    isFocusMode?: boolean
    onFocusModeChange?: (isFocusMode: boolean) => void
    surface?: 'default' | 'edit' | 'motion'
    initialVisibleGroupIds?: readonly string[]
    propertyColumnWidth?: number
    timelineScrollContainer?: HTMLDivElement | null
  }

  let props: KeyframeGraphPanelProps = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>

<div></div>
