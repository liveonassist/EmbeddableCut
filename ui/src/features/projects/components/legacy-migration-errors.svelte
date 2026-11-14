<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { MigrationReport } from '@/infrastructure/storage/legacy-idb'

  const logger = createLogger('LegacyMigrationErrors')

  type StoreError = MigrationReport['errors'][number]

  type MigrationState =
    | { kind: 'checking' }
    | { kind: 'idle' }
    | { kind: 'show'; errors: StoreError[] }
    | { kind: 'running' }
    | { kind: 'dismissed' }

  function groupByStore(errors: StoreError[]): Array<{ store: string; count: number }> {
    const counts = new Map<string, number>()
    for (const e of errors) {
      counts.set(e.store, (counts.get(e.store) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([store, count]) => ({ store, count }))
      .sort((a, b) => b.count - a.count)
  }
</script>

<script lang="ts">
  /**
   * LegacyMigrationErrors
   *
   * Surfaces per-store errors left over from a partial legacy-IDB migration.
   *
   * Context: `migrateFromLegacyIDB()` only sets the "migration complete"
   * marker when every record copied without error. Any per-store failures
   * are persisted to `.freecut-migration-errors.json` in the workspace so
   * the next launch can offer a targeted retry. Without this banner, a
   * user whose migration partially-failed would see the main migration
   * banner again and have to re-run everything blindly.
   *
   * Behavior:
   *  - On mount, read `getMigrationErrors()`. Empty → render nothing.
   *  - Non-empty → show a compact banner with the failure count, grouped
   *    by store, and a Retry button that re-runs the migration. Records
   *    that succeeded first time throw "already exists" and get pushed
   *    into the error list (caught per-store, harmless); records that
   *    previously failed get another shot.
   *  - On retry success (zero new errors), the migrate pipeline sets
   *    the migration marker and clears the error file; this component
   *    renders nothing again.
   */
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle'
  import RefreshCw from 'lucide-svelte/icons/refresh-cw'
  import { toast } from 'svelte-sonner'
  import { Button } from '@/components/ui/button'
  import { getMigrationErrors, migrateFromLegacyIDB } from '@/infrastructure/storage/legacy-idb'
  import { t } from '$lib/i18n.svelte'

  interface Props {
    onRetried?: () => Promise<void> | void
  }

  let { onRetried }: Props = $props()

  let migrationState = $state.raw<MigrationState>({ kind: 'checking' })
  let expanded = $state(false)

  $effect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const errors = await getMigrationErrors()
        if (cancelled) return
        migrationState = errors.length > 0 ? { kind: 'show', errors } : { kind: 'idle' }
      } catch (error) {
        logger.warn('getMigrationErrors failed', error)
        if (!cancelled) migrationState = { kind: 'idle' }
      }
    })()
    return () => {
      cancelled = true
    }
  })

  async function handleRetry() {
    migrationState = { kind: 'running' }
    try {
      const report = await migrateFromLegacyIDB()
      if (report.errors.length === 0) {
        toast.success(t('projects.legacyMigrationErrors.retrySucceeded'))
        migrationState = { kind: 'idle' }
      } else {
        toast.warning(
          t('projects.legacyMigrationErrors.retryStillFailing', { count: report.errors.length }),
        )
        migrationState = { kind: 'show', errors: report.errors }
      }
      await onRetried?.()
    } catch (error) {
      logger.error('retry migration failed', error)
      toast.error(t('projects.legacyMigrationErrors.retryFailed'), {
        description: error instanceof Error ? error.message : t('projects.unknownError'),
      })
      // Fall back to whatever the persisted state looks like now.
      const errors = await getMigrationErrors()
      migrationState = errors.length > 0 ? { kind: 'show', errors } : { kind: 'idle' }
    }
  }

  const grouped = $derived(migrationState.kind === 'show' ? groupByStore(migrationState.errors) : [])
</script>

{#if migrationState.kind === 'running'}
  <div class="panel-bg border border-border rounded-lg p-4 flex items-center gap-3 text-sm">
    <RefreshCw class="h-4 w-4 animate-spin" />
    <span>{t('projects.legacyMigrationErrors.retrying')}</span>
  </div>
{:else if migrationState.kind === 'show'}
  {@const total = migrationState.errors.length}
  <div class="panel-bg border border-yellow-500/40 rounded-lg p-4 text-sm">
    <div class="flex items-start gap-3">
      <AlertTriangle class="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="font-medium">
          {t('projects.legacyMigrationErrors.failedCount', { count: total })}
        </div>
        <div class="text-muted-foreground text-xs mt-1">
          {grouped.map(({ store, count }) => `${count} ${store}`).join(', ')}.
          {t('projects.legacyMigrationErrors.retryHint')}
        </div>

        {#if expanded}
          <ul class="mt-3 space-y-1 text-xs font-mono text-muted-foreground max-h-48 overflow-y-auto">
            {#each migrationState.errors as e, i (`${e.store}-${e.id}-${i}`)}
              <li class="truncate">
                <span class="text-foreground">{e.store}</span><span class="mx-1">·</span><span
                  >{e.id}</span
                ><span class="mx-1">·</span><span>{e.error}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <Button size="sm" onclick={() => void handleRetry()} class="gap-2">
        <RefreshCw class="h-3 w-3" />
        {t('projects.retry')}
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (expanded = !expanded)}>
        {expanded ? t('projects.hideDetails') : t('projects.showDetails')}
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (migrationState = { kind: 'dismissed' })}>
        {t('projects.dismiss')}
      </Button>
    </div>
  </div>
{/if}
