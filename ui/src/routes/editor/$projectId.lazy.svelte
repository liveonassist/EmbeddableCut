<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger, createOperationId } from '@/shared/logging/logger'

  const logger = createLogger('Editor')

  const EDITOR_PROJECT_ROUTE_ID = '/editor/$projectId'

  /**
   * Tracks the in-flight (or completed) upgrade-backup job per project. Module-
   * scoped so it survives any remount — the async create can't be cancelled
   * once started, so without this the auto-backup could run twice and create
   * duplicate backups. Keyed by projectId so a re-running effect for the same
   * still-pending project reuses the existing job and can transition out of the
   * pending state, instead of a one-shot guard that would leave the project
   * stuck on the "upgrading" placeholder forever.
   */
  const startedUpgradeBackups = new Map<string, Promise<void>>()

  /**
   * Opening and closing projects one after another: the SDK can't cancel an
   * open in flight, so the next waits for it instead of racing its stores.
   */
  let openQueue: Promise<unknown> = Promise.resolve()
</script>

<script lang="ts">
  /**
   * The editor route. Legacy projects are upgraded automatically: a backup on
   * the original schema is snapshotted first (best-effort safety net), then
   * the SDK editor opens the project, allowed to migrate it. No prompt.
   */
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { getEditorUi } from '$lib/context'
  import { t } from '$lib/i18n.svelte'
  import { useRouter, type RouteComponentProps } from '@/app/router'
  import RouteErrorScreen from '@/app/route-error.svelte'
  import EditorView from '@/app/editor-view.svelte'
  import { createProjectUpgradeBackup } from '@/features/projects/services/project-upgrade-service'
  import { formatProjectUpgradeBackupName } from '@/features/projects/utils/project-helpers'
  import { rememberLastEditorProjectId } from '@/shared/projects/last-editor-project'
  import type { EditorLoaderData } from './$projectId'

  let { params, loaderData }: RouteComponentProps<EditorLoaderData> = $props()

  const ui = getEditorUi()
  const router = useRouter()

  const projectId = $derived(params.projectId!)
  const project = $derived(loaderData.project)
  const migration = $derived(loaderData.migration)
  const backupName = $derived(
    formatProjectUpgradeBackupName(
      project.name,
      migration.storedSchemaVersion,
      migration.currentSchemaVersion,
    ),
  )

  // Resets whenever the project or its migration state changes.
  let upgradeApproved = $derived.by(() => {
    void projectId
    return !migration.requiresUpgrade
  })
  let openedProjectId = $state<string | null>(null)
  let openError = $state.raw<unknown>(null)
  let openAttempt = $state(0)
  let hasRefreshedMigrationState = false

  $effect(() => {
    rememberLastEditorProjectId(projectId)
  })

  // Auto-backup then auto-upgrade. The backup keeps the pre-upgrade project on its
  // original schema; loading proceeds regardless so the user is never blocked.
  $effect(() => {
    if (!migration.requiresUpgrade || upgradeApproved) return

    // Reuse this project's in-flight job rather than bailing out permanently —
    // re-running the effect for the same still-pending project must still be
    // able to transition out of the placeholder state.
    const jobProjectId = projectId
    const fromVersion = migration.storedSchemaVersion
    const toVersion = migration.currentSchemaVersion
    const name = backupName
    let job = startedUpgradeBackups.get(jobProjectId)
    if (!job) {
      job = (async () => {
        const opId = createOperationId()
        const event = logger.startEvent('project.upgradeBackup', opId)
        event.merge({ projectId: jobProjectId, fromVersion, toVersion })
        try {
          const backup = await createProjectUpgradeBackup(jobProjectId, {
            fromVersion,
            toVersion,
            backupName: name,
          })
          event.success({ status: 'created', backupName: backup.name })
          toast.success(t('editor.editor.backupCreated'), { description: backup.name })
        } catch (error) {
          event.failure(error, { status: 'failed' })
          toast.error(t('editor.editor.backupFailed'), {
            description: error instanceof Error ? error.message : t('editor.editor.tryAgain'),
          })
        }
      })()
      startedUpgradeBackups.set(jobProjectId, job)
    }

    let active = true
    void job.then(() => {
      // Only approve the upgrade for the project this job was started for; a late
      // completion after navigation must not unblock a different project.
      if (active && untrack(() => projectId) === jobProjectId) {
        upgradeApproved = true
      }
    })
    return () => {
      active = false
    }
  })

  // Open the project through the SDK editor once any upgrade is approved; close
  // it when leaving the route or switching projects.
  $effect(() => {
    if (!upgradeApproved) return
    void openAttempt
    const id = projectId
    const allowUpgrade = untrack(() => migration.requiresUpgrade)
    let cancelled = false
    openError = null

    const open = openQueue.then(async () => {
      if (cancelled) return
      try {
        await ui.editor.openProject(id, { allowUpgrade })
      } catch (error) {
        if (cancelled) return
        logger.error('Failed to load timeline:', error)
        openError = error
        return
      }
      if (cancelled) {
        ui.editor.closeProject()
        return
      }
      openedProjectId = id

      if (!allowUpgrade || hasRefreshedMigrationState) return
      hasRefreshedMigrationState = true
      // Refresh the editor route metadata once the approved legacy project has
      // opened successfully so future reopens do not briefly show the upgrade prompt.
      await router.invalidate({
        filter: (match) =>
          match.routeId === EDITOR_PROJECT_ROUTE_ID && match.params.projectId === id,
      })
    })
    openQueue = open.catch(() => {})

    return () => {
      cancelled = true
      openedProjectId = null
      ui.editor.closeProject()
    }
  })
</script>

{#if !upgradeApproved}
  <div class="min-h-screen bg-background flex items-center justify-center">
    <div class="text-sm text-muted-foreground">
      {t('editor.editor.upgrading', { defaultValue: 'Upgrading project…' })}
    </div>
  </div>
{:else if openError}
  <RouteErrorScreen error={openError} reset={() => openAttempt++} />
{:else if openedProjectId === projectId}
  <EditorView />
{:else}
  <div class="min-h-screen bg-background" aria-hidden="true"></div>
{/if}
