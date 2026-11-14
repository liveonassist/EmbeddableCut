<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { t } from '$lib/i18n.svelte'
  import MediaPickerDialogBody from './media-picker-dialog-body.svelte'

  interface MediaPickerDialogProps {
    open: boolean
    onClose: () => void
    onSelect: (mediaId: string) => void
    filterType?: 'video' | 'audio' | 'image'
    title?: string
  }

  let { open, onClose, onSelect, filterType, title }: MediaPickerDialogProps = $props()

  const handleSelect = (mediaId: string) => {
    onSelect(mediaId)
    onClose()
  }
</script>

<Dialog bind:open={() => open, (isOpen) => !isOpen && onClose()}>
  <DialogContent class="max-h-[70vh] w-[min(92vw,960px)] max-w-[960px]">
    <DialogHeader>
      <DialogTitle class="pr-8 leading-snug break-words">
        {title ?? t('media.picker.title')}
      </DialogTitle>
      <DialogDescription>
        {filterType ? t(`media.picker.descFiltered.${filterType}`) : t('media.picker.descAll')}
      </DialogDescription>
    </DialogHeader>
    <!-- Remount the body (resetting its search) per filter and per opening. -->
    {#key `${filterType ?? 'all'}:${open ? 'open' : 'closed'}`}
      <MediaPickerDialogBody {filterType} onSelect={handleSelect} />
    {/key}
  </DialogContent>
</Dialog>
