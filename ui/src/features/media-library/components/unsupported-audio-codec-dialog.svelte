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
  import Volume2 from '@lucide/svelte/icons/volume-2'
  import VolumeX from '@lucide/svelte/icons/volume-x'
  import { cn } from '$lib/cn'
  import { t } from '$lib/i18n.svelte'

  interface UnsupportedCodecFile {
    fileName: string
    audioCodec: string
  }

  interface UnsupportedAudioCodecDialogProps {
    open: boolean
    files: UnsupportedCodecFile[]
    onConfirm: () => void
    onCancel: () => void
  }

  /**
   * Dialog shown when importing media files with unsupported audio codecs.
   * Informs the user that waveform visualization won't be available for these files.
   */
  let { open, files, onConfirm, onCancel }: UnsupportedAudioCodecDialogProps = $props()
</script>

<AlertDialog bind:open={() => open, (isOpen) => !isOpen && onCancel()}>
  <AlertDialogContent class="sm:max-w-[500px] overflow-hidden">
    <AlertDialogHeader class="overflow-hidden">
      <AlertDialogTitle class="flex items-center gap-2">
        <VolumeX class="w-5 h-5 text-yellow-500 shrink-0" />
        {t('media.unsupportedCodec.title')}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {#snippet child({ props })}
          <div {...props} class={cn(props.class as string, 'space-y-3')}>
            <p>
              {files.length === 1
                ? t('media.unsupportedCodec.bodySingle')
                : t('media.unsupportedCodec.bodyMultiple', { count: files.length })}
            </p>

            <div class="max-h-[200px] overflow-y-auto overflow-x-hidden space-y-2">
              {#each files as file, index (index)}
                <div
                  class="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2 bg-secondary/50 rounded text-sm"
                >
                  <Volume2 class="w-4 h-4 text-muted-foreground" />
                  <span class="truncate" title={file.fileName}>
                    {file.fileName}
                  </span>
                  <span
                    class="text-xs text-muted-foreground px-1.5 py-0.5 bg-secondary rounded uppercase whitespace-nowrap"
                  >
                    {file.audioCodec}
                  </span>
                </div>
              {/each}
            </div>

            <p class="text-xs text-muted-foreground">{t('media.unsupportedCodec.note')}</p>
          </div>
        {/snippet}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onclick={onCancel}>
        {t('media.unsupportedCodec.cancelImport')}
      </AlertDialogCancel>
      <AlertDialogAction onclick={onConfirm}>
        {t('media.unsupportedCodec.importAnyway')}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
