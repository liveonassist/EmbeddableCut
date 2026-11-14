<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { Dialog, DialogContent } from '@/components/ui/dialog'
  import { useBentoLayoutDialogStore } from '../bento-layout-dialog-store'
  import { useBentoPresetsStore } from '@/features/timeline/stores/bento-presets-store'
  import { useProjectStore } from '@/features/timeline/deps/projects'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
  import BentoLayoutDialogBody from './bento-layout-dialog-body.svelte'

  const isOpen = select(useBentoLayoutDialogStore, (s) => s.isOpen)
  const itemIds = select(useBentoLayoutDialogStore, (s) => s.itemIds)
  const close = select(useBentoLayoutDialogStore, (s) => s.close)

  const customPresets = select(useBentoPresetsStore, (s) => s.customPresets)
  const addPreset = select(useBentoPresetsStore, (s) => s.addPreset)
  const removePreset = select(useBentoPresetsStore, (s) => s.removePreset)

  const canvasWidth = select(
    useProjectStore,
    (s) => s.currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
  )
  const canvasHeight = select(
    useProjectStore,
    (s) => s.currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
  )

  // Build transition chains when dialog opens
  const transitions = select(useTransitionsStore, (s) => s.transitions)
  const dialogBodyKey = $derived(
    JSON.stringify({
      itemIds: itemIds.current,
      transitions: transitions.current.map((transition) => ({
        id: transition.id,
        leftClipId: transition.leftClipId,
        rightClipId: transition.rightClipId,
      })),
    }),
  )

  function handleOpenChange(open: boolean) {
    if (!open) {
      close.current()
    }
  }
</script>

<Dialog open={isOpen.current} onOpenChange={handleOpenChange}>
  <DialogContent class="max-w-lg">
    {#if isOpen.current}
      {#key dialogBodyKey}
        <BentoLayoutDialogBody
          itemIds={itemIds.current}
          transitions={transitions.current}
          close={close.current}
          customPresets={customPresets.current}
          addPreset={addPreset.current}
          removePreset={removePreset.current}
          canvasWidth={canvasWidth.current}
          canvasHeight={canvasHeight.current}
        />
      {/key}
    {/if}
  </DialogContent>
</Dialog>
