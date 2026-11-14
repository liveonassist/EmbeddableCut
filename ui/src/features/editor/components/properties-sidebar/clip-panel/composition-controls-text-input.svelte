<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'

  /** `TextControlInput` from FreeCut's composition-controls-section.tsx: commits on blur. */
  let {
    value,
    onCommit,
    label,
  }: {
    value: string
    onCommit: (value: string) => void
    label: string
  } = $props()

  // svelte-ignore state_referenced_locally
  let draft = $state(value)
  $effect.pre(() => {
    draft = value
  })
</script>

<Input
  value={draft}
  oninput={(event) => (draft = event.currentTarget.value)}
  onblur={() => onCommit(draft)}
  onkeydown={(event) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      draft = value
      event.currentTarget.blur()
    }
  }}
  class="h-7 text-xs"
  aria-label={label}
/>
