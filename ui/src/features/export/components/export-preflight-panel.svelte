<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { ExportPreflightCheck } from '@/features/export/utils/export-preflight'

  /** Tailwind text colour for a preflight severity (icon and check label alike). */
  function severityTextClass(severity: ExportPreflightCheck['severity']): string {
    switch (severity) {
      case 'error':
        return 'text-destructive'
      case 'warning':
        return 'text-amber-500'
      case 'info':
        return 'text-blue-500'
      case 'ok':
        return 'text-green-500'
    }
  }
</script>

<script lang="ts">
  /**
   * Preflight report shown on the settings step: the worst severity found, the
   * render path the export will take, and the checks worth reading.
   */
  import AlertCircle from '@lucide/svelte/icons/alert-circle'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import {
    summarizePreflightSeverity,
    type ExportPreflightResult,
  } from '@/features/export/utils/export-preflight'
  import { t } from '$lib/i18n.svelte'

  let { preflight }: { preflight: ExportPreflightResult | null } = $props()

  const summarySeverity = $derived(preflight ? summarizePreflightSeverity(preflight.checks) : 'ok')
  const checksToRender = $derived.by(() => {
    if (!preflight) return []
    const visibleChecks = preflight.checks.filter((check) => check.severity !== 'ok').slice(0, 4)
    return visibleChecks.length > 0 ? visibleChecks : preflight.checks.slice(0, 2)
  })
</script>

{#if !preflight}
  <div class="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
    {t('export.preflight.checking')}
  </div>
{:else}
  <div class="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        {#if summarySeverity === 'ok'}
          <CheckCircle2 class="h-4 w-4 {severityTextClass(summarySeverity)}" />
        {:else}
          <AlertCircle class="h-4 w-4 {severityTextClass(summarySeverity)}" />
        {/if}
        <span class="text-sm font-medium">{t('export.preflight.title')}</span>
      </div>
      <span class="text-xs text-muted-foreground">
        {preflight.predictedRenderPath === 'smart-copy'
          ? t('export.preflight.smartCopyPath')
          : preflight.predictedRenderPath === 'worker'
            ? t('export.preflight.workerPath')
            : t('export.preflight.fallback')}
      </span>
    </div>
    <div class="space-y-1.5">
      {#each checksToRender as check (check.id)}
        <div class="text-xs leading-relaxed">
          <span class={severityTextClass(check.severity)}>{t(check.titleKey, check.titleParams)}</span><span
            class="text-muted-foreground">{' '}— {t(check.detailKey, check.detailParams)}</span
          >{#if check.fixKey}<span class="text-muted-foreground">{' '}{t(check.fixKey, check.fixParams)}</span>{/if}
        </div>
      {/each}
    </div>
  </div>
{/if}
