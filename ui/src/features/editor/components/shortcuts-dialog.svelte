<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { HotkeyEditor } from '@/features/editor/deps/settings'

  interface ShortcutsDialogProps {
    open: boolean
    onOpenChange?: (open: boolean) => void
  }

  let { open = $bindable(), onOpenChange }: ShortcutsDialogProps = $props()
</script>

<Dialog
  bind:open={
    () => open,
    (next) => {
      open = next
      onOpenChange?.(next)
    }
  }
>
  <DialogContent
    hideCloseButton
    onInteractOutside={(e) => e.preventDefault()}
    class="top-[1vh] max-h-[98vh] max-w-[min(1600px,98vw)] origin-top translate-y-0 gap-0 overflow-hidden border-white/10 bg-[#09090b]/96 p-0 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:rounded-lg"
  >
    <DialogHeader class="sr-only">
      <DialogTitle>{t('editor.shortcutsDialog.title')}</DialogTitle>
      <DialogDescription>{t('editor.shortcutsDialog.description')}</DialogDescription>
    </DialogHeader>
    <div class="flex min-h-0 flex-1 flex-col">
      <HotkeyEditor />
    </div>
  </DialogContent>
</Dialog>
