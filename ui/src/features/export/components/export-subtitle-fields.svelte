<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Subtitle fields for the export dialog: which subtitle mode the video carries,
   * or why there is nothing to offer when the timeline has no transcript.
   */
  import { Label } from '@/components/ui/label'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import type { SubtitleExportMode } from '@/types/export'
  import { t } from '$lib/i18n.svelte'
  import type { ExportSubtitleFieldsProps } from './types'

  let { mode, onModeChange, modeOptions, hasTranscriptSubtitles }: ExportSubtitleFieldsProps = $props()
</script>

<div class="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
  <div class="flex items-center justify-between gap-3">
    <Label for="subtitle-mode" class="text-sm font-medium">
      {t('export.settings.subtitles', { defaultValue: 'Subtitles' })}
    </Label>
    <Select
      value={mode}
      onValueChange={(value) => onModeChange(value as SubtitleExportMode)}
      disabled={!hasTranscriptSubtitles}
    >
      <SelectTrigger id="subtitle-mode" class="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {#each modeOptions as option (option)}
          <SelectItem value={option}>
            {t(`export.settings.subtitleMode.${option}`)}
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
  <p class="text-xs text-muted-foreground">
    {hasTranscriptSubtitles
      ? t(`export.settings.subtitleMode.${mode}Description`)
      : t('export.settings.noTranscriptSegments')}
  </p>
</div>
