<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { formatFpsValue, getProjectFpsOptions } from '@/features/editor/deps/projects'
  import { useFeatures } from '../../../../../extensions/feature-gate.svelte'

  /** The project's frame rate, which a host may make read-only (`project.frame-rate`). */
  let { fps, onFpsChange }: { fps: number; onFpsChange: (fps: number) => void } = $props()

  const features = useFeatures()
  const mode = $derived(features.mode('project.frame-rate'))
  const options = $derived.by(() => {
    const offered = getProjectFpsOptions(fps)
    return offered.some((option) => option.value === fps)
      ? offered
      : [...offered, { label: `${formatFpsValue(fps)} fps`, value: fps }]
  })
</script>

{#if mode === 'on'}
  <Select value={String(fps)} onValueChange={(value) => onFpsChange(Number(value))}>
    <SelectTrigger class="h-7 text-xs" aria-label={t('editor.canvasPanel.frameRate')}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {#each options as option (option.value)}
        <SelectItem value={String(option.value)} class="text-xs">{option.label}</SelectItem>
      {/each}
    </SelectContent>
  </Select>
{:else}
  <span class="text-xs text-muted-foreground tabular-nums">{formatFpsValue(fps)} fps</span>
{/if}
