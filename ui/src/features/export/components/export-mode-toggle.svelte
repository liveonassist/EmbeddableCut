<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const TOGGLE_CLASS = 'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors'
</script>

<script lang="ts">
  /**
   * Export type switch for the export dialog: whether the render carries video
   * (with its container/codec settings) or audio only.
   */
  import Music from 'lucide-svelte/icons/music'
  import Video from 'lucide-svelte/icons/video'
  import { Label } from '@/components/ui/label'
  import { t } from '$lib/i18n.svelte'
  import type { ExportModeToggleProps } from './types'

  let { mode, onChange }: ExportModeToggleProps = $props()
</script>

<div class="flex items-center justify-between">
  <Label class="text-sm font-medium">{t('export.settings.exportType')}</Label>
  <div class="flex rounded-md border border-border p-0.5 bg-muted/30">
    <button
      type="button"
      onclick={() => onChange('video')}
      class="{TOGGLE_CLASS} {mode === 'video'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'}"
    >
      <Video class="h-3.5 w-3.5" />
      {t('export.settings.video')}
    </button>
    <button
      type="button"
      onclick={() => onChange('audio')}
      class="{TOGGLE_CLASS} {mode === 'audio'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'}"
    >
      <Music class="h-3.5 w-3.5" />
      {t('export.settings.audio')}
    </button>
  </div>
</div>
