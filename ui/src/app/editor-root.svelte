<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { setEditorUi, type EditorUi } from '$lib/context'
  import { Toaster } from 'svelte-sonner'
  import { onNotification } from '@/shared/notifications'
  import { toast } from 'svelte-sonner'

  /** The root of a mounted editor: provides the editor UI context and the toaster. */
  let { ui, children }: { ui: EditorUi; children?: Snippet } = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi(ui)

  $effect(() => onNotification(({ level, message }) => toast[level](message)))
</script>

{@render children?.()}
<Toaster theme={ui.theme.mode} position="bottom-right" />
