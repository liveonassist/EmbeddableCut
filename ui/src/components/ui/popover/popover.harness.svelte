<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { setEditorUi, type EditorUi } from '$lib/context'
  import { Popover, PopoverContent, PopoverTrigger } from '.'

  // Test harness: an editor context whose portal layer is `portalTarget`.
  let { portalTarget }: { portalTarget: HTMLElement } = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi({ portalTarget } as EditorUi)
</script>

<Popover open>
  <PopoverTrigger>Options</PopoverTrigger>
  <PopoverContent>Popover body</PopoverContent>
</Popover>
