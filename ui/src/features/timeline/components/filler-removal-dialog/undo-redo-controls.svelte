<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'

  interface Props {
    canUndo: boolean
    canRedo: boolean
    onUndo: () => void
    onRedo: () => void
  }

  let { canUndo, canRedo, onUndo, onRedo }: Props = $props()
</script>

<div class="flex items-center gap-1">
  <Button
    type="button"
    variant="ghost"
    size="sm"
    disabled={!canUndo}
    onclick={onUndo}
    class="h-6 px-2 text-xs"
    title={t('timeline.fillerRemoval.undoEditTitle')}
  >
    {t('timeline.fillerRemoval.undo')}
  </Button>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    disabled={!canRedo}
    onclick={onRedo}
    class="h-6 px-2 text-xs"
    title={t('timeline.fillerRemoval.redoEditTitle')}
  >
    {t('timeline.fillerRemoval.redo')}
  </Button>
</div>
