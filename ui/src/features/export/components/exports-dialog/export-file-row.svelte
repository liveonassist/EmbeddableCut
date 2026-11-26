<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const AUDIO_EXTENSIONS = ['.mp3', '.aac', '.wav', '.m4a', '.opus']

  function isAudioFile(name: string): boolean {
    const lower = name.toLowerCase()
    return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
  }
</script>

<script lang="ts">
  import Download from '@lucide/svelte/icons/download'
  import FileVideo from '@lucide/svelte/icons/file-video'
  import Music from '@lucide/svelte/icons/music'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { toast } from 'svelte-sonner'
  import { Button } from '@/components/ui/button'
  import { createLogger } from '@/shared/logging/logger'
  import { deleteExportFile, readExportFile, type ExportFileEntry } from '@/infrastructure/storage'
  import { formatBytes } from '@/features/export/deps/renderer'
  import { t } from '$lib/i18n.svelte'

  const log = createLogger('Export')

  let { entry, onChanged }: { entry: ExportFileEntry; onChanged: () => void } = $props()

  let busy = $state(false)

  const handleDownload = async () => {
    busy = true
    try {
      const blob = await readExportFile(entry.path)
      if (!blob) {
        toast.error(t('export.renderQueue.missingFile'))
        onChanged()
        return
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = entry.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      requestIdleCallback(() => URL.revokeObjectURL(url))
    } catch (err) {
      log.error('Failed to download export', err)
      toast.error(t('export.renderQueue.downloadFailed'))
    } finally {
      busy = false
    }
  }

  const handleDelete = async () => {
    busy = true
    try {
      await deleteExportFile(entry.path)
      toast.success(t('export.renderQueue.deleted', { name: entry.name }))
      onChanged()
    } catch (err) {
      log.error('Failed to delete export', err)
      toast.error(t('export.renderQueue.deleteFailed'))
      busy = false
    }
  }

  const FileIcon = $derived(isAudioFile(entry.name) ? Music : FileVideo)
</script>

<div class="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
  <FileIcon class="h-4 w-4 flex-shrink-0 text-muted-foreground" />
  <div class="min-w-0 flex-1">
    <div class="truncate text-sm font-medium">{entry.name}</div>
    <div class="mt-0.5 text-xs text-muted-foreground tabular-nums">
      {formatBytes(entry.size)}{entry.lastModified > 0
        ? ` · ${new Date(entry.lastModified).toLocaleString()}`
        : ''}
    </div>
  </div>
  <div class="flex flex-shrink-0 items-center gap-0.5">
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      disabled={busy}
      onclick={handleDownload}
      aria-label={t('export.renderQueue.download')}
      data-tooltip={t('export.renderQueue.download')}
    >
      <Download class="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="h-7 w-7"
      disabled={busy}
      onclick={handleDelete}
      aria-label={t('export.renderQueue.delete')}
      data-tooltip={t('export.renderQueue.delete')}
    >
      <Trash2 class="h-4 w-4" />
    </Button>
  </div>
</div>
