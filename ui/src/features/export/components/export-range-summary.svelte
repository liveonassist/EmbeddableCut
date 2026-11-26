<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Export range readout for the export dialog: the in/out frame window the
   * render covers, plus the whole-project switch when a range is set.
   */
  import Scissors from '@lucide/svelte/icons/scissors'
  import { Label } from '@/components/ui/label'
  import { Switch } from '@/components/ui/switch'
  import { formatTimecode, framesToSeconds } from '@/shared/utils/time-utils'
  import { formatTime } from '@/features/export/utils/export-format'
  import { t } from '$lib/i18n.svelte'
  import type { ExportRangeSummaryProps } from './types'

  let { range, fps, hasInOutPoints, renderWholeProject, onRenderWholeProjectChange }: ExportRangeSummaryProps =
    $props()
</script>

<div class="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Scissors class="h-4 w-4 text-muted-foreground" />
      <span class="text-sm font-medium">{t('export.settings.exportRange')}</span>
    </div>
    {#if hasInOutPoints}
      <div class="flex items-center gap-2">
        <Label for="render-whole" class="text-xs text-muted-foreground">
          {t('export.settings.renderWholeProject')}
        </Label>
        <Switch
          id="render-whole"
          checked={renderWholeProject}
          onCheckedChange={onRenderWholeProjectChange}
        />
      </div>
    {/if}
  </div>
  <div class="grid grid-cols-3 gap-3 text-sm">
    <div>
      <div class="text-xs text-muted-foreground mb-0.5">{t('export.settings.in')}</div>
      <div class="font-mono text-foreground">{formatTimecode(range.start, fps)}</div>
    </div>
    <div>
      <div class="text-xs text-muted-foreground mb-0.5">{t('export.settings.out')}</div>
      <div class="font-mono text-foreground">{formatTimecode(range.end, fps)}</div>
    </div>
    <div>
      <div class="text-xs text-muted-foreground mb-0.5">
        {t('export.settings.duration')}
      </div>
      <div class="font-mono text-foreground">
        {formatTime(framesToSeconds(range.duration, fps))}
      </div>
    </div>
  </div>
  {#if hasInOutPoints && !renderWholeProject}
    <p class="text-xs text-muted-foreground">{t('export.settings.inOutRangeHint')}</p>
  {/if}
</div>
