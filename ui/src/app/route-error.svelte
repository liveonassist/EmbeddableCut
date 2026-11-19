<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('RouteError')

  /** Known DOMException names get a plain-language explanation; others don't. */
  const CAUSE_EXPLANATION_KEYS: Record<string, string> = {
    NotAllowedError: 'app.routeError.causePermission',
    NotFoundError: 'app.routeError.causeMissing',
    NotSupportedError: 'app.routeError.causeUnsupported',
    SecurityError: 'app.routeError.causePermission',
  }
</script>

<script lang="ts">
  /**
   * Router-level error screen.
   *
   * Route loaders fail before a component mounts, so the router owns their
   * recovery UI. Expected failures such as a stale project link get a specific
   * path forward, while technical details stay available through a copy action
   * instead of taking over the screen.
   */
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle'
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import Check from 'lucide-svelte/icons/check'
  import Copy from 'lucide-svelte/icons/copy'
  import FileQuestion from 'lucide-svelte/icons/file-question'
  import FolderOpen from 'lucide-svelte/icons/folder-open'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import EmbeddableCutLogo from '@/components/brand/embeddablecut-logo.svelte'
  import { Button } from '@/components/ui/button'
  import {
    ensureKnownWorkspaceForCurrent,
    getWorkspaceHandleRecord,
    removeKnownWorkspace,
  } from '@/infrastructure/storage/handles-db'
  import { t } from '$lib/i18n.svelte'
  import { Link, findRouter, type ErrorComponentProps } from '$lib/router'
  import {
    formatRouteErrorDetails,
    getProjectNotFoundError,
    getStorageFailureName,
  } from './route-error-cause'

  let { error, reset }: ErrorComponentProps = $props()

  const router = findRouter()
  let isSwitchingFolder = $state(false)
  let copyStatus = $state<'idle' | 'copied' | 'failed'>('idle')
  let copyResetTimer: ReturnType<typeof setTimeout> | null = null

  const projectNotFound = $derived(getProjectNotFoundError(error))
  const failureName = $derived(getStorageFailureName(error))
  const explanationKey = $derived(failureName ? CAUSE_EXPLANATION_KEYS[failureName] : undefined)
  const title = $derived(
    projectNotFound ? t('app.routeError.projectNotFoundTitle') : t('app.routeError.title'),
  )
  const description = $derived(
    projectNotFound
      ? t('app.routeError.projectNotFoundDescription')
      : explanationKey
        ? t(explanationKey)
        : t('app.routeError.description'),
  )

  $effect(() => () => {
    if (copyResetTimer) clearTimeout(copyResetTimer)
  })

  function handleRetry() {
    reset()
    void router?.invalidate()
  }

  async function handleCopyDetails() {
    try {
      await navigator.clipboard.writeText(formatRouteErrorDetails(error, window.location.href))
      copyStatus = 'copied'
    } catch (cause) {
      logger.error('Failed to copy route error details', cause)
      copyStatus = 'failed'
    }

    if (copyResetTimer) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => (copyStatus = 'idle'), 2000)
  }

  /**
   * Forget the active workspace so `WorkspaceGate` reverts to its pick-folder
   * state on the next render. This only deletes the handle registry record,
   * never the user's files.
   */
  async function handleChooseDifferentFolder() {
    isSwitchingFolder = true
    try {
      await ensureKnownWorkspaceForCurrent()
      const record = await getWorkspaceHandleRecord()
      if (record?.activeWorkspaceId) {
        await removeKnownWorkspace(record.activeWorkspaceId)
      }
      window.location.reload()
    } catch (cause) {
      logger.error('Failed to release the active workspace', cause)
      isSwitchingFolder = false
    }
  }
</script>

<div
  class="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12"
>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
  ></div>

  <div class="w-full max-w-md">
    <EmbeddableCutLogo variant="full" size="md" class="mb-6 justify-center" />

    <main
      class="rounded-2xl border border-border/80 bg-card/70 px-6 py-8 text-center shadow-2xl shadow-black/20 backdrop-blur-sm sm:px-8"
    >
      <div
        class={projectNotFound
          ? 'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary'
          : 'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive'}
      >
        {#if projectNotFound}
          <FileQuestion class="h-8 w-8" />
        {:else}
          <AlertTriangle class="h-8 w-8" />
        {/if}
      </div>

      <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
      <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <div class="mt-7 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        <Button variant="outline" onclick={handleRetry}>
          <RefreshCw />
          {t('app.errorBoundary.tryAgain')}
        </Button>

        {#if projectNotFound}
          <Button>
            {#snippet child({ props })}
              <Link {...props} to="/projects">
                <ArrowLeft />
                {t('app.routeError.backToProjects')}
              </Link>
            {/snippet}
          </Button>
        {:else}
          <Button onclick={() => window.location.reload()}>
            {t('app.errorBoundary.reloadPage')}
          </Button>
        {/if}
      </div>

      {#if failureName}
        <Button
          variant="ghost"
          size="sm"
          class="mt-3"
          disabled={isSwitchingFolder}
          onclick={() => void handleChooseDifferentFolder()}
        >
          <FolderOpen />
          {t('projects.workspaceGate.chooseDifferentFolder')}
        </Button>
      {/if}

      <div class="mt-6 border-t border-border/70 pt-5">
        <p class="text-xs leading-5 text-muted-foreground">
          {t('app.routeError.supportHint')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          class="mt-1"
          aria-live="polite"
          onclick={() => void handleCopyDetails()}
        >
          {#if copyStatus === 'copied'}<Check />{:else}<Copy />{/if}
          {copyStatus === 'copied'
            ? t('app.routeError.detailsCopied')
            : copyStatus === 'failed'
              ? t('app.routeError.copyFailed')
              : t('app.routeError.copyDetails')}
        </Button>
      </div>
    </main>
  </div>
</div>
