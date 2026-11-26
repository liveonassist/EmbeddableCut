<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /** Chunk lengths the queue menu offers for splitting a sequence. */
  const SPLIT_CHUNK_SECONDS = [10, 30, 60]
</script>

<script lang="ts">
  /**
   * Footer actions for the settings step: cancel, the render-queue menu that adds
   * whole/segment jobs, and the export button. The queue handlers live in the
   * dialog — this only places the buttons that call them.
   */
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ListPlus from '@lucide/svelte/icons/list-plus'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { t } from '$lib/i18n.svelte'
  import type { ExportSettingsFooterProps } from './types'

  let {
    mode,
    actionsDisabled,
    onClose,
    onExport,
    onAddCurrentRange,
    onAddMarkerSegments,
    onSplitChunks,
  }: ExportSettingsFooterProps = $props()
</script>

<div class="mt-6 flex justify-end gap-2 border-t border-border pt-4">
  <Button variant="outline" onclick={onClose}>
    {t('common.cancel')}
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger disabled={actionsDisabled}>
      {#snippet child({ props })}
        <Button {...props} variant="outline" class="gap-1.5" disabled={actionsDisabled}>
          <ListPlus class="h-4 w-4" />
          {t('export.renderQueue.addToQueue')}
          <ChevronDown class="h-3 w-3" />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={onAddCurrentRange}>
        {t('export.renderQueue.addCurrentRange')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel class="text-xs text-muted-foreground">
        {t('export.renderQueue.segmentsHeading')}
      </DropdownMenuLabel>
      <DropdownMenuItem onSelect={onAddMarkerSegments}>
        {t('export.renderQueue.perMarker')}
      </DropdownMenuItem>
      {#each SPLIT_CHUNK_SECONDS as seconds (seconds)}
        <DropdownMenuItem onSelect={() => onSplitChunks(seconds)}>
          {t('export.renderQueue.splitChunks', { seconds })}
        </DropdownMenuItem>
      {/each}
    </DropdownMenuContent>
  </DropdownMenu>
  <Button onclick={onExport} disabled={actionsDisabled}>
    {mode === 'audio' ? t('export.settings.exportAudio') : t('export.settings.exportVideo')}
  </Button>
</div>
