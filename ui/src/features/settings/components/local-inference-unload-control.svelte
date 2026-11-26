<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const log = createLogger('LocalInferenceUnloadControl')

  type UnloadState = 'idle' | 'unloading' | 'done'
</script>

<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { toast } from 'svelte-sonner'
  import { Button } from '@/components/ui/button'
  import { Label } from '@/components/ui/label'
  import {
    formatEstimatedBytes,
    getLocalInferenceSummary,
    localInferenceRuntimeRegistry,
    useLocalInferenceStore,
  } from '@/shared/state/local-inference'
  import { cn } from '@/shared/ui/cn'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'

  interface LocalInferenceUnloadControlProps {
    class?: string
    labelClass?: string
    descriptionClass?: string
    buttonClass?: string
  }

  let {
    class: className,
    labelClass,
    descriptionClass,
    buttonClass,
  }: LocalInferenceUnloadControlProps = $props()

  const runtimesById = select(useLocalInferenceStore, (s) => s.runtimesById)
  const summary = $derived(getLocalInferenceSummary(runtimesById.current))
  let unloadState = $state<UnloadState>('idle')
  let resetTimer: number | null = null

  $effect(() => () => {
    if (resetTimer !== null) {
      window.clearTimeout(resetTimer)
    }
  })

  function scheduleReset() {
    if (resetTimer !== null) {
      window.clearTimeout(resetTimer)
    }

    resetTimer = window.setTimeout(() => {
      unloadState = 'idle'
      resetTimer = null
    }, 2000)
  }

  const description = $derived.by(() => {
    if (!summary) {
      return t('projects.settings.localInference.noRuntimes')
    }

    const estimateLabel = formatEstimatedBytes(summary.totalEstimatedBytes)
    const detailParts = [
      summary.primaryLabel,
      summary.backendLabel,
      summary.activeJobs > 0
        ? t('projects.settings.localInference.activeJobs', { count: summary.activeJobs })
        : null,
      estimateLabel,
    ].filter(Boolean)

    return detailParts.join(' | ')
  })

  async function handleUnload() {
    if (!summary || summary.unloadableCount === 0 || unloadState === 'unloading') {
      return
    }

    unloadState = 'unloading'

    try {
      const unloadedCount = await localInferenceRuntimeRegistry.unloadAll()
      unloadState = 'done'
      toast.success(t('projects.settings.localInference.unloadedToast', { count: unloadedCount }))
      scheduleReset()
    } catch (error) {
      log.error('Failed to unload local inference runtimes', error)
      unloadState = 'idle'
      toast.error(t('projects.settings.localInference.unloadFailed'))
    }
  }
</script>

<div class={cn('flex items-start justify-between gap-4', className)}>
  <div class="min-w-0">
    <Label class={cn('text-sm', labelClass)}>
      {t('projects.settings.localInference.unloadLabel')}
    </Label>
    <p class={cn('mt-0.5 text-xs text-muted-foreground', descriptionClass)}>
      {description}
    </p>
  </div>
  <Button
    variant="outline"
    size="sm"
    class={cn('h-8 w-28 shrink-0 gap-1.5', buttonClass)}
    onclick={() => {
      void handleUnload()
    }}
    disabled={!summary || summary.unloadableCount === 0 || unloadState === 'unloading'}
  >
    {#if unloadState === 'unloading'}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
    {#if unloadState === 'done'}<Check class="h-3.5 w-3.5" />{/if}
    {#if unloadState === 'idle'}<Trash2 class="h-3.5 w-3.5" />{/if}
    {unloadState === 'unloading'
      ? t('projects.settings.localInference.unloading')
      : unloadState === 'done'
        ? t('projects.settings.localInference.unloaded')
        : t('projects.settings.localInference.unload')}
  </Button>
</div>
