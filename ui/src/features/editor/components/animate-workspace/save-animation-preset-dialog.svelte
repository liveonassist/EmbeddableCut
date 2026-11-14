<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'

  interface SaveAnimationPresetDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Existing preset names in the project — drives the overwrite warning. */
    existingNames: string[]
    /** Persist the preset. Resolves false to surface a save failure inline. */
    onSave: (name: string) => Promise<boolean> | boolean
    defaultName?: string
  }

  /**
   * Presentational capture dialog (U6/U7). Validates an empty name (save
   * disabled) and warns on a duplicate name, switching the confirm action to
   * "Overwrite". Disk-write failures are surfaced via the `onSave` result.
   */
  let { open, onOpenChange, existingNames, onSave, defaultName = '' }: SaveAnimationPresetDialogProps =
    $props()

  // svelte-ignore state_referenced_locally
  let name = $state(defaultName)
  let saving = $state(false)
  let failed = $state(false)

  $effect.pre(() => {
    if (open) {
      name = defaultName
      failed = false
      saving = false
    }
  })

  const trimmedName = $derived(name.trim())
  const isDuplicate = $derived(
    existingNames.some((existing) => existing.toLowerCase() === trimmedName.toLowerCase()),
  )
  const canSave = $derived(trimmedName.length > 0 && !saving)

  async function handleSave() {
    if (!canSave) return
    saving = true
    failed = false
    try {
      const ok = await onSave(trimmedName)
      if (ok) {
        onOpenChange(false)
        return
      }
      failed = true
    } catch {
      failed = true
    } finally {
      saving = false
    }
  }
</script>

<Dialog bind:open={() => open, onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('editor.animatePresets.dialog.title')}</DialogTitle>
      <DialogDescription>{t('editor.animatePresets.dialog.description')}</DialogDescription>
    </DialogHeader>

    <div class="grid gap-2">
      <Label for="animation-preset-name">
        {t('editor.animatePresets.dialog.nameLabel')}
      </Label>
      <!-- svelte-ignore a11y_autofocus -->
      <Input
        id="animation-preset-name"
        value={name}
        autofocus
        placeholder={t('editor.animatePresets.dialog.namePlaceholder')}
        oninput={(event) => (name = event.currentTarget.value)}
        onkeydown={(event) => {
          // Guard against committing mid-IME-composition (e.g. Japanese/Korean):
          // the Enter that confirms a candidate must not trigger the save.
          if (event.key === 'Enter' && !event.isComposing) {
            event.preventDefault()
            void handleSave()
          }
        }}
      />
      {#if isDuplicate}
        <p class="text-xs text-amber-500">
          {t('editor.animatePresets.dialog.duplicateWarning')}
        </p>
      {/if}
      {#if failed}
        <p class="text-xs text-destructive">{t('editor.animatePresets.saveFailed')}</p>
      {/if}
    </div>

    <DialogFooter>
      <Button variant="ghost" onclick={() => onOpenChange(false)} disabled={saving}>
        {t('editor.animatePresets.dialog.cancel')}
      </Button>
      <Button onclick={() => void handleSave()} disabled={!canSave}>
        {isDuplicate ? t('editor.animatePresets.dialog.overwrite') : t('editor.animatePresets.dialog.save')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
