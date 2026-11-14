<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  interface Props {
    isOpen: boolean
    onToggle?: () => void
    onClose: () => void
    placement?: 'bottom' | 'top' | 'side'
    showCloseButton?: boolean
    splitView?: boolean
    isFocusMode?: boolean
    onFocusModeChange?: (isFocusMode: boolean) => void
    surface?: string
    initialVisibleGroupIds?: readonly string[]
    propertyColumnWidth?: number
    timelineScrollContainer?: HTMLDivElement | null
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
