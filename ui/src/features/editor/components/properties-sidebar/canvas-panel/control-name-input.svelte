<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'
  import type { CompositionControlDefinition } from '@/types/composition-controls'
  import { renameCompositionControl } from '@/features/editor/deps/timeline-store'

  let {
    compositionId,
    control,
  }: {
    compositionId: string
    control: CompositionControlDefinition
  } = $props()

  // svelte-ignore state_referenced_locally
  let draft = $state(control.name)
  $effect.pre(() => {
    draft = control.name
  })

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) draft = control.name
    else if (trimmed !== control.name) renameCompositionControl(compositionId, control.id, trimmed)
  }

  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Escape') {
      draft = control.name
      event.currentTarget.blur()
    }
  }
</script>

<Input
  value={draft}
  oninput={(event) => (draft = event.currentTarget.value)}
  onblur={commit}
  onkeydown={handleKeyDown}
  class="h-7 min-w-0 flex-1 text-xs"
  aria-label={`Rename ${control.name}`}
/>
