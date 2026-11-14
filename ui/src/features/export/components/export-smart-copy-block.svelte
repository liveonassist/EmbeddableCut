<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Smart copy block for the export dialog: the pass-through switch, why it is or
   * isn't available, and the bitrate/size the export will end up with.
   */
  import { Label } from '@/components/ui/label'
  import { Switch } from '@/components/ui/switch'
  import { formatFileSize } from '@/features/export/utils/export-format'
  import { t } from '$lib/i18n.svelte'
  import type { ExportSmartCopyBlockProps } from './types'

  let {
    settings,
    setSettings,
    assessment,
    willRun,
    resolvedVideoBitrate,
    estimatedFileSizeBytes,
    sourceVideo,
  }: ExportSmartCopyBlockProps = $props()
</script>

<div class="flex items-start justify-between gap-4 border-t border-border pt-3">
  <div class="space-y-1">
    <Label for="smart-copy" class="text-sm font-medium">
      {t('export.settings.smartCopy')}
    </Label>
    <p class="text-xs text-muted-foreground">
      {t(`export.settings.smartCopyStatus.${assessment.reason}`)}
    </p>
  </div>
  <Switch
    id="smart-copy"
    checked={settings.smartCopy !== false}
    onCheckedChange={(checked) => setSettings((previous) => ({ ...previous, smartCopy: checked }))}
  />
</div>

<div
  class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-background/60 px-3 py-2 text-xs"
>
  <span class="font-medium text-foreground">
    {willRun
      ? t('export.settings.smartCopyPath')
      : `${(resolvedVideoBitrate / 1_000_000).toFixed(2)} Mbps ${
          (settings.rateControl ?? 'auto') === 'constant' ? 'CBR' : 'VBR'
        }`}
  </span>
  <span class="text-muted-foreground">
    {t('export.settings.estimatedSize', { size: formatFileSize(estimatedFileSizeBytes) })}
  </span>
  {#if sourceVideo}
    <span class="text-muted-foreground">
      {t('export.settings.sourceBitrate', {
        bitrate: (sourceVideo.bitrate / 1_000_000).toFixed(2),
      })}
    </span>
  {/if}
</div>
