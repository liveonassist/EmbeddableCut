<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Save from 'lucide-svelte/icons/save'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { t } from '$lib/i18n.svelte'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import { Button } from '@/components/ui/button'
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('UnsavedChangesDialog')

  interface UnsavedChangesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: () => Promise<void>
    /**
     * Where leaving goes once the changes are saved or discarded. FreeCut
     * navigates to its projects page; an embedded editor has none, so the
     * host decides.
     */
    onLeave?: () => void
    projectName?: string
  }

  let { open, onOpenChange, onSave, onLeave, projectName }: UnsavedChangesDialogProps = $props()

  let isSaving = $state(false)

  // `<strong>` in the translation wraps the name (react-i18next's <Trans>).
  const NAME_TOKEN = '\u0000'
  const descriptionParts = $derived.by(() => {
    if (!projectName) return null
    const text = t('unsavedChanges.descriptionWithName', { name: NAME_TOKEN })
    const match = /^(.*?)<strong>(.*?)<\/strong>(.*)$/s.exec(text)
    if (!match) return { before: text.replace(NAME_TOKEN, projectName), strong: '', after: '' }
    return {
      before: match[1] ?? '',
      strong: (match[2] ?? '').replace(NAME_TOKEN, projectName),
      after: match[3] ?? '',
    }
  })

  async function handleSaveAndExit() {
    isSaving = true
    try {
      await onSave()
      onOpenChange(false)
      onLeave?.()
    } catch (error) {
      logger.error('Failed to save project:', error)
      // Keep dialog open on error
    } finally {
      isSaving = false
    }
  }

  function handleDiscard() {
    onOpenChange(false)
    onLeave?.()
  }
</script>

<AlertDialog bind:open={() => open, onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t('unsavedChanges.title')}</AlertDialogTitle>
      <AlertDialogDescription>
        {#if descriptionParts}{descriptionParts.before}<strong>{descriptionParts.strong}</strong
          >{descriptionParts.after}{:else}{t('unsavedChanges.description')}{/if}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter class="gap-2 sm:gap-0">
      <AlertDialogCancel disabled={isSaving}>{t('common.cancel')}</AlertDialogCancel>
      <Button variant="destructive" onclick={handleDiscard} disabled={isSaving} class="gap-2">
        <Trash2 class="w-4 h-4" />
        {t('unsavedChanges.discard')}
      </Button>
      <AlertDialogAction onclick={handleSaveAndExit} disabled={isSaving} class="gap-2">
        <Save class="w-4 h-4" />
        {isSaving ? t('unsavedChanges.saving') : t('unsavedChanges.saveAndExit')}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
