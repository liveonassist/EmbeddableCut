<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const log = createLogger('LocalModelCacheControl')
</script>

<script lang="ts">
  import Check from 'lucide-svelte/icons/check'
  import Loader2 from 'lucide-svelte/icons/loader-2'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { toast } from 'svelte-sonner'
  import { Button } from '@/components/ui/button'
  import {
    clearLocalModelCache,
    inspectAllLocalModelCaches,
    supportsLocalModelCacheInspection,
    type LocalModelCacheSummary,
  } from '@/shared/utils/local-model-cache'
  import { cn } from '@/shared/ui/cn'
  import { formatBytes } from '@/shared/utils/format-utils'
  import { t } from '$lib/i18n.svelte'

  interface LocalModelCacheControlProps {
    class?: string
  }

  let { class: className }: LocalModelCacheControlProps = $props()

  let cacheSummaries = $state.raw<LocalModelCacheSummary[]>([])
  let isLoading = $state(true)
  let clearingCacheId = $state<LocalModelCacheSummary['id'] | null>(null)
  let clearedCacheId = $state<LocalModelCacheSummary['id'] | null>(null)
  let resetTimer: number | null = null
  let mounted = true
  const inspectionSupported = supportsLocalModelCacheInspection()

  $effect(() => {
    mounted = true

    return () => {
      mounted = false
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer)
      }
    }
  })

  async function refreshCacheSummaries() {
    if (!inspectionSupported) {
      if (mounted) {
        cacheSummaries = []
        isLoading = false
      }
      return
    }

    if (mounted) {
      isLoading = true
    }

    try {
      const nextSummaries = await inspectAllLocalModelCaches()
      if (!mounted) return
      cacheSummaries = nextSummaries
    } catch (error) {
      log.error('Failed to inspect local model cache state', error)
      if (mounted) {
        toast.error(t('projects.settings.modelCache.inspectFailed'))
      }
    } finally {
      if (mounted) {
        isLoading = false
      }
    }
  }

  $effect(() => {
    void refreshCacheSummaries()
  })

  function scheduleReset(cacheId: LocalModelCacheSummary['id']) {
    if (resetTimer !== null) {
      window.clearTimeout(resetTimer)
      clearedCacheId = null
    }

    clearedCacheId = cacheId
    resetTimer = window.setTimeout(() => {
      if (mounted) {
        clearedCacheId = null
      }
      resetTimer = null
    }, 2000)
  }

  async function handleClear(summary: LocalModelCacheSummary) {
    clearingCacheId = summary.id

    try {
      const deleted = await clearLocalModelCache(summary)
      await refreshCacheSummaries()
      scheduleReset(summary.id)
      toast.success(
        deleted
          ? t('projects.settings.modelCache.clearedToast', { label: summary.label })
          : t('projects.settings.modelCache.alreadyEmptyToast', { label: summary.label }),
      )
    } catch (error) {
      log.error(`Failed to clear local model cache ${summary.id}`, error)
      toast.error(t('projects.settings.modelCache.clearFailed', { label: summary.label }))
    } finally {
      if (mounted) {
        clearingCacheId = null
      }
    }
  }

  function sizeLabelFor(summary: LocalModelCacheSummary): string {
    return summary.inspectionState === 'timed-out'
      ? t('projects.settings.modelCache.unavailable')
      : summary.inspectionState === 'error'
        ? t('projects.settings.modelCache.unavailable')
        : !summary.downloaded
          ? '0 B'
          : summary.sizeStatus === 'exact' || summary.sizeStatus === 'partial'
            ? t('projects.settings.modelCache.approxSize', {
                size: formatBytes(summary.totalBytes),
              })
            : t('projects.settings.modelCache.unavailable')
  }
</script>

<div class={cn('space-y-3', className)}>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="text-sm font-medium">{t('projects.settings.modelCache.title')}</p>
      <p class="mt-0.5 text-xs text-muted-foreground">
        {t('projects.settings.modelCache.description')}
      </p>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="h-8 w-28 shrink-0 gap-1.5"
      onclick={() => {
        void refreshCacheSummaries()
      }}
      disabled={!inspectionSupported || isLoading}
    >
      <RotateCcw class={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
      {isLoading
        ? t('projects.settings.modelCache.checking')
        : t('projects.settings.modelCache.refresh')}
    </Button>
  </div>

  {#if !inspectionSupported}
    <p class="text-xs text-muted-foreground">
      {t('projects.settings.modelCache.inspectionUnavailable')}
    </p>
  {/if}

  {#if inspectionSupported}
    {#each cacheSummaries as summary (summary.id)}
      {@const isClearing = clearingCacheId === summary.id}
      {@const isCleared = clearedCacheId === summary.id}
      <div
        class="flex items-center justify-between gap-4 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5"
      >
        <div class="flex min-w-0 items-center gap-2 text-sm">
          <span class="truncate font-medium">{summary.label}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{sizeLabelFor(summary)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="h-8 w-28 shrink-0 gap-1.5"
          onclick={() => {
            void handleClear(summary)
          }}
          disabled={isClearing}
        >
          {#if isClearing}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
          {#if isCleared && !isClearing}<Check class="h-3.5 w-3.5" />{/if}
          {#if !isClearing && !isCleared}<Trash2 class="h-3.5 w-3.5" />{/if}
          {isClearing
            ? t('common.clearing')
            : isCleared
              ? t('projects.settings.modelCache.cleared')
              : t('projects.settings.modelCache.clear')}
        </Button>
      </div>
    {/each}
  {/if}
</div>
