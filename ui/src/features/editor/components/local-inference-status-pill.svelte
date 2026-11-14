<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { fly } from 'svelte/transition'
  import { prefersReducedMotion } from 'svelte/motion'
  import Cpu from 'lucide-svelte/icons/cpu'
  import Loader2 from 'lucide-svelte/icons/loader-circle'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import {
    formatEstimatedBytes,
    getLocalInferenceSummary,
    useLocalInferenceStore,
    type LocalInferenceSummary,
  } from '@/shared/state/local-inference'
  import { formatBytes } from '@/shared/utils/format-utils'

  const runtimesById = select(useLocalInferenceStore, (state) => state.runtimesById)
  const summary = $derived(getLocalInferenceSummary(runtimesById.current))
  const enterY = $derived(prefersReducedMotion.current ? 0 : -4)

  // motion's `[0.23, 1, 0.32, 1]` curve.
  const easeOutQuint = (x: number) => {
    // Solve the cubic bezier for y at progress x (Newton iterations).
    const p1x = 0.23
    const p1y = 1
    const p2x = 0.32
    const p2y = 1
    const bx = (s: number) => 3 * (1 - s) ** 2 * s * p1x + 3 * (1 - s) * s ** 2 * p2x + s ** 3
    const by = (s: number) => 3 * (1 - s) ** 2 * s * p1y + 3 * (1 - s) * s ** 2 * p2y + s ** 3
    let s = x
    for (let i = 0; i < 6; i++) {
      const d = (bx(s + 1e-4) - bx(s - 1e-4)) / 2e-4
      if (d === 0) break
      s = Math.min(1, Math.max(0, s - (bx(s) - x) / d))
    }
    return by(s)
  }

  function getStateLabel(summary: LocalInferenceSummary): string {
    switch (summary.state) {
      case 'loading':
        // "Loading" hides a multi-minute weight download behind the same word as a 20 s
        // graph compile. Name whichever one is actually happening — and never call a
        // seconds-long read from local cache a download.
        if (summary.loadingPhase === 'downloading') {
          return summary.loadingFromCache
            ? t('editor.localInferencePill.loadingCache')
            : t('editor.localInferencePill.downloading')
        }
        if (summary.loadingPhase === 'preparing') {
          return t('editor.localInferencePill.preparing')
        }
        return t('editor.localInferencePill.loading')
      case 'running':
        return t('editor.localInferencePill.active')
      case 'error':
        return t('editor.localInferencePill.error')
      case 'ready':
        return t('editor.localInferencePill.ready')
    }
  }

  // While weights stream in, the size slot shows how far along the transfer is rather than a
  // static "~1.2 GB est" that never changes.
  const sizeLabel = $derived(
    summary && summary.loadingPhase === 'downloading' && summary.totalEstimatedBytes > 0
      ? `${formatBytes(summary.loadedBytes)} of ${formatBytes(summary.totalEstimatedBytes)}`
      : summary
        ? formatEstimatedBytes(summary.totalEstimatedBytes)
        : null,
  )

  const detailParts = $derived(
    summary
      ? [
          summary.primaryLabel,
          summary.backendLabel,
          summary.activeJobs > 0
            ? t('editor.localInferencePill.jobs', { count: summary.activeJobs })
            : null,
          sizeLabel,
        ].filter(Boolean)
      : [],
  )
</script>

<!-- The out transition keeps the pill mounted long enough to fade when local
     inference finishes, so it eases out instead of popping away. -->
{#if summary}
  <div
    transition:fly={{ y: enterY, duration: 200, easing: easeOutQuint }}
    class="hidden items-center gap-2 rounded-md border border-border/70 bg-secondary/35 px-2.5 py-1 lg:flex"
  >
    {#if summary.state === 'loading' || summary.state === 'running'}
      <Loader2 class="h-3.5 w-3.5 animate-spin text-orange-500" />
    {:else}
      <Cpu class="h-3.5 w-3.5 text-orange-500" />
    {/if}
    <div class="min-w-0">
      <div class="text-[10px] font-medium leading-none">{getStateLabel(summary)}</div>
      <div class="mt-0.5 truncate text-[9px] text-muted-foreground">
        {detailParts.join(' | ')}
      </div>
    </div>
  </div>
{/if}
