<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Dialog header for the export dialog: the title and description of the step
   * currently showing.
   */
  import AlertCircle from '@lucide/svelte/icons/alert-circle'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import X from '@lucide/svelte/icons/x'
  import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
  import { t } from '$lib/i18n.svelte'
  import type { DialogView } from '../hooks/use-export-dialog-view.svelte'

  let { view }: { view: DialogView } = $props()

  const description = $derived.by(() => {
    switch (view) {
      case 'settings':
        return t('export.dialog.descSettings')
      case 'progress':
        return t('export.dialog.descProgress')
      case 'complete':
        return t('export.dialog.descComplete')
      case 'error':
        return t('export.dialog.descError')
      case 'cancelled':
        return t('export.dialog.descCancelled')
    }
  })
</script>

<DialogHeader>
  <DialogTitle>
    {#if view === 'settings'}
      {t('export.dialog.titleSettings')}
    {:else if view === 'progress'}
      <span class="flex items-center gap-2">
        <Loader2 class="h-5 w-5 animate-spin text-primary" />
        {t('export.dialog.titleProgress')}
      </span>
    {:else if view === 'complete'}
      <span class="flex items-center gap-2">
        <CheckCircle2 class="h-5 w-5 text-green-500" />
        {t('export.dialog.titleComplete')}
      </span>
    {:else if view === 'error'}
      <span class="flex items-center gap-2">
        <AlertCircle class="h-5 w-5 text-destructive" />
        {t('export.dialog.titleError')}
      </span>
    {:else if view === 'cancelled'}
      <span class="flex items-center gap-2">
        <X class="h-5 w-5 text-muted-foreground" />
        {t('export.dialog.titleCancelled')}
      </span>
    {/if}
  </DialogTitle>
  <DialogDescription>{description}</DialogDescription>
</DialogHeader>
