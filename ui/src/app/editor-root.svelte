<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { setEditorUi, type EditorUi } from '$lib/context'
  import { toast } from 'svelte-sonner'
  import { onNotification } from '@/shared/notifications'
  import { GlobalTooltip } from '@/components/ui/global-tooltip'
  import { Toaster } from '@/components/ui/sonner'
  import { TooltipProvider } from '@/components/ui/tooltip'

  /**
   * The root of a mounted editor: provides the editor UI context, and mounts
   * what FreeCut's app root does — the tooltip provider, the global
   * `data-tooltip` tooltip and the toaster.
   */
  let { ui, children }: { ui: EditorUi; children?: Snippet } = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi(ui)

  $effect(() => onNotification(({ level, message }) => toast[level](message)))
</script>

<TooltipProvider delayDuration={300}>
  {@render children?.()}
  <GlobalTooltip />
  <Toaster theme={ui.theme.mode} />
</TooltipProvider>
