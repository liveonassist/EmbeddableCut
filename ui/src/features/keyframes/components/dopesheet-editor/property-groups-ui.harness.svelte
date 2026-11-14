<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { TooltipProvider } from '@/components/ui/tooltip'
  import { DopesheetEditor } from './index'
  import type { DopesheetEditorProps } from './dopesheet-editor-props'

  // Test host for the whole editor: the app's TooltipProvider (bits-ui tooltips
  // need one), an optional parent key listener, and an optional owner that
  // keeps the keyframe selection controlled the way the app does.
  let {
    onParentKeyDown,
    controlledSelection = false,
    ...props
  }: DopesheetEditorProps & {
    onParentKeyDown?: (event: KeyboardEvent) => void
    controlledSelection?: boolean
  } = $props()

  let selection = $state.raw<Set<string>>(new Set())
</script>

<TooltipProvider>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div onkeydown={onParentKeyDown}>
    {#if controlledSelection}
      <DopesheetEditor
        {...props}
        selectedKeyframeIds={selection}
        onSelectionChange={(ids) => {
          selection = ids
        }}
      />
    {:else}
      <DopesheetEditor {...props} />
    {/if}
  </div>
</TooltipProvider>
