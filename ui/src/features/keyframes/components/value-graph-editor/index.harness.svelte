<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { TooltipProvider } from '@/components/ui/tooltip'
  import { EmbeddedValueGraphEditor, ValueGraphEditor } from './index'
  import type { ValueGraphEditorSharedProps } from './value-graph-editor-props'

  // Test harness: renders an editor in a tooltip provider and, when
  // `initialSelection` is given, owns the selection like the React harnesses.
  let {
    chrome = 'embedded',
    initialSelection,
    selectionTestId = 'selection',
    ...props
  }: ValueGraphEditorSharedProps & {
    chrome?: 'full' | 'embedded'
    initialSelection?: string[]
    selectionTestId?: string
  } = $props()

  // svelte-ignore state_referenced_locally
  let selection = $state.raw<Set<string>>(new Set(initialSelection ?? []))
  // svelte-ignore state_referenced_locally
  const controlled = initialSelection !== undefined
  const Editor = $derived(chrome === 'full' ? ValueGraphEditor : EmbeddedValueGraphEditor)
</script>

<TooltipProvider>
  {#if controlled}
    <Editor {...props} selectedKeyframeIds={selection} onSelectionChange={(next) => (selection = next)} />
    <output data-testid={selectionTestId}>{[...selection].join(',')}</output>
  {:else}
    <Editor {...props} />
  {/if}
</TooltipProvider>
