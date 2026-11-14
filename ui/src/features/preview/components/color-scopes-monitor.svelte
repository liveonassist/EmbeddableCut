<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x'
  import { ColorScopesPanel } from './color-scopes-panel'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'

  interface ColorScopesMonitorProps {
    onClose: () => void
  }

  let { onClose }: ColorScopesMonitorProps = $props()
</script>

<div class="flex flex-1 flex-col min-h-0 min-w-0">
  <div
    class="flex items-center justify-between border-b border-border px-3 shrink-0"
    style:height={EDITOR_LAYOUT_CSS_VALUES.previewSplitHeaderHeight}
  >
    <span class="text-xs text-muted-foreground truncate">
      Color Scopes
    </span>
    <button
      onclick={onClose}
      class="p-1 rounded hover:bg-muted transition-colors shrink-0"
      aria-label="Close color scopes"
    >
      <X class="w-3.5 h-3.5 text-muted-foreground" />
    </button>
  </div>
  <div class="flex-1 min-h-0 overflow-hidden p-2 bg-background/70">
    <ColorScopesPanel
      open
      embedded
      embeddedLayout="stack"
     />
  </div>
</div>
