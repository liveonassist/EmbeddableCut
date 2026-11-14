<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
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
  import { t } from '$lib/i18n.svelte'

  interface MotionBakeConfirmationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
  }

  let { open, onOpenChange, onConfirm }: MotionBakeConfirmationDialogProps = $props()
</script>

<AlertDialog bind:open={() => open, onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t('editor.motionGenerator.bakeConfirmTitle')}</AlertDialogTitle>
      <AlertDialogDescription>
        {t('editor.motionGenerator.bakeConfirmDescription')}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
      <AlertDialogAction onclick={onConfirm}>
        {t('editor.motionGenerator.bakeConfirmAction')}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
