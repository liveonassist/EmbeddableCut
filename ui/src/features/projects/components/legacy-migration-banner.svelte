<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { MigrationProgress, MigrationReport } from '@/infrastructure/storage/legacy-idb'

  const logger = createLogger('LegacyMigrationBanner')

  type BannerState =
    | { kind: 'checking' }
    | { kind: 'idle' }
    | { kind: 'prompt' }
    | { kind: 'running'; progress: MigrationProgress | null }
    | { kind: 'done'; report: MigrationReport }
    | { kind: 'dismissed' }

  /**
   * Clamp to [0, 100] for the progress bar. A `total` of 0 (no work) maps to
   * full progress so the bar doesn't appear stuck at 0 while the finalizing
   * step runs against an empty legacy DB.
   */
  function computePercent(progress: MigrationProgress | null): number {
    if (!progress) return 0
    if (progress.total === 0) return 100
    const pct = (progress.processed / progress.total) * 100
    return Math.max(0, Math.min(100, pct))
  }
</script>

<script lang="ts">
  import Database from '@lucide/svelte/icons/database'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { toast } from 'svelte-sonner'
  import { Button } from '@/components/ui/button'
  import { Progress } from '@/components/ui/progress'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import Trans from '@/components/trans.svelte'
  import {
    deleteLegacyIDB,
    getMigrationStatus,
    hasLegacyData,
    migrateFromLegacyIDB,
  } from '@/infrastructure/storage/legacy-idb'
  import { t } from '$lib/i18n.svelte'

  interface Props {
    onMigrated?: () => Promise<void> | void
  }

  let { onMigrated }: Props = $props()

  let banner = $state.raw<BannerState>({ kind: 'checking' })
  let confirmDelete = $state(false)

  $effect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await getMigrationStatus()
        if (status.migrated) {
          if (!cancelled) banner = { kind: 'idle' }
          return
        }
        const has = await hasLegacyData()
        if (cancelled) return
        banner = { kind: has ? 'prompt' : 'idle' }
      } catch (error) {
        logger.warn('detect legacy data failed', error)
        if (!cancelled) banner = { kind: 'idle' }
      }
    })()
    return () => {
      cancelled = true
    }
  })

  async function handleMigrate() {
    banner = { kind: 'running', progress: null }
    try {
      const report = await migrateFromLegacyIDB({
        onProgress: (progress) => {
          // Only update while the banner is in the running state: a late
          // progress event after the run resolved must not flip it back.
          if (banner.kind !== 'running') return
          banner = { kind: 'running', progress }
        },
      })
      banner = { kind: 'done', report }
      toast.success(
        t('projects.legacyMigration.migratedToast', {
          projects: report.projects,
          media: report.media,
        }),
      )
      await onMigrated?.()
    } catch (error) {
      logger.error('Migration failed', error)
      toast.error(t('projects.legacyMigration.migrationFailed'), {
        description: error instanceof Error ? error.message : t('projects.unknownError'),
      })
      banner = { kind: 'prompt' }
    }
  }

  async function handleDeleteLegacy() {
    try {
      await deleteLegacyIDB()
      toast.success(t('projects.legacyMigration.storageCleared'))
      banner = { kind: 'dismissed' }
    } catch (error) {
      logger.error('Failed to delete legacy IDB', error)
      toast.error(t('projects.legacyMigration.storageClearFailed'), {
        description: error instanceof Error ? error.message : t('projects.unknownError'),
      })
    } finally {
      confirmDelete = false
    }
  }
</script>

{#if banner.kind === 'running'}
  {@const progress = banner.progress}
  {@const percent = computePercent(progress)}
  <!--
    Show label from progress if available; fall back to a generic line
    during the brief gap before the first tick arrives.
  -->
  {@const label = progress?.phaseLabel ?? t('projects.legacyMigration.preparing')}
  {@const countsLine = progress
    ? t('projects.legacyMigration.counts', {
        processed: progress.processed,
        total: progress.total,
      })
    : null}
  <div
    class="panel-bg border border-border rounded-lg p-4 space-y-3 text-sm"
    role="status"
    aria-live="polite"
  >
    <div class="flex items-center gap-3">
      <Database class="h-4 w-4 animate-pulse shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="font-medium truncate">{label}</div>
        <div class="text-muted-foreground text-xs mt-0.5">
          {t('projects.legacyMigration.runningHint')}
        </div>
      </div>
      <div class="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
        {Math.round(percent)}%
      </div>
    </div>
    <Progress
      value={percent}
      class="h-2"
      aria-label={label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    />
    {#if countsLine}
      <div class="text-xs text-muted-foreground font-mono tabular-nums">{countsLine}</div>
    {/if}
  </div>
{:else if banner.kind === 'done'}
  {@const report = banner.report}
  <div class="panel-bg border border-border rounded-lg p-4 text-sm space-y-2">
    <div class="flex items-start gap-3">
      <Database class="h-4 w-4 mt-0.5" />
      <div class="flex-1">
        <div class="font-medium">{t('projects.legacyMigration.completeTitle')}</div>
        <div class="text-muted-foreground text-xs mt-1">
          {t('projects.legacyMigration.completeSummary', {
            projects: report.projects,
            media: report.media,
            thumbnails: report.thumbnails,
            transcripts: report.transcripts,
          })}{report.errors.length > 0
            ? ` · ${t('projects.legacyMigration.errorsLogged', { count: report.errors.length })}`
            : ''}
        </div>
      </div>
      <Button variant="destructive" size="sm" class="gap-2" onclick={() => (confirmDelete = true)}>
        <Trash2 class="h-3 w-3" />
        {t('projects.legacyMigration.deleteStorage')}
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (banner = { kind: 'dismissed' })}>
        {t('projects.dismiss')}
      </Button>
    </div>
  </div>

  <AlertDialog bind:open={confirmDelete}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {t('projects.legacyMigration.deleteStorageConfirmTitle')}
        </AlertDialogTitle>
        <AlertDialogDescription>
          <Trans i18nKey="projects.legacyMigration.deleteStorageConfirmDescription">
            {#snippet code(text: string)}<span class="font-mono">{text}</span>{/snippet}
          </Trans>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction onclick={() => void handleDeleteLegacy()}>
          {t('common.delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
{:else if banner.kind === 'prompt'}
  <div class="panel-bg border border-border rounded-lg p-4 text-sm">
    <div class="flex items-start gap-3">
      <Database class="h-4 w-4 mt-0.5 text-muted-foreground" />
      <div class="flex-1">
        <div class="font-medium">{t('projects.legacyMigration.promptTitle')}</div>
        <div class="text-muted-foreground text-xs mt-1">
          {t('projects.legacyMigration.promptDescription')}
        </div>
      </div>
      <Button size="sm" onclick={() => void handleMigrate()}>
        {t('projects.legacyMigration.migrate')}
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (banner = { kind: 'dismissed' })}>
        {t('projects.later')}
      </Button>
    </div>
  </div>
{/if}
