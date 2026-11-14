<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('ErrorBoundary')
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import { Button } from '@/components/ui/button'
  import { i18n } from '@/i18n'

  interface Props {
    children: Snippet
    fallback?: Snippet
    onError?: (error: Error) => void
    level?: 'app' | 'feature' | 'component'
  }

  let { children, fallback, onError, level = 'component' }: Props = $props()

  function handleError(cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    // Log to console in development
    if (import.meta.env.DEV) {
      logger.error('ErrorBoundary caught:', error)
    }

    onError?.(error)
  }

  function asError(cause: unknown): Error | null {
    return cause instanceof Error ? cause : null
  }
</script>

<svelte:boundary onerror={handleError}>
  {@render children()}

  {#snippet failed(cause, reset)}
    {@const error = asError(cause)}
    {#if fallback}
      {@render fallback()}
    {:else}
      <div class="flex flex-col items-center justify-center p-8 gap-4 text-center">
        <AlertTriangle class="h-12 w-12 text-destructive" />
        <div>
          <h2 class="text-lg font-semibold">
            {#if level === 'app'}{i18n.t('app.errorBoundary.appError')}{/if}
            {#if level === 'feature'}{i18n.t('app.errorBoundary.featureError')}{/if}
            {#if level === 'component'}{i18n.t('app.errorBoundary.componentError')}{/if}
          </h2>
          <p class="text-sm text-muted-foreground mt-1">
            {error?.message || i18n.t('app.errorBoundary.unexpectedError')}
          </p>
        </div>
        <div class="flex gap-2">
          <Button onclick={reset} variant="outline">
            <RefreshCw class="h-4 w-4 mr-2" />
            {i18n.t('app.errorBoundary.tryAgain')}
          </Button>
          {#if level === 'app'}
            <Button onclick={() => window.location.reload()}>
              {i18n.t('app.errorBoundary.reloadPage')}
            </Button>
          {/if}
        </div>
        {#if import.meta.env.DEV && error?.stack}
          <pre
            class="mt-4 p-4 bg-muted rounded text-xs text-left overflow-auto max-w-full max-h-48">{error.stack}</pre>
        {/if}
      </div>
    {/if}
  {/snippet}
</svelte:boundary>
