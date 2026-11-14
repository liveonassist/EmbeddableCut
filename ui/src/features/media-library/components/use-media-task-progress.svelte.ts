// SPDX-License-Identifier: MIT

import {
  getTranscriptionOverallProgress,
  getTranscriptionProgressDetail,
  getTranscriptionProgressLabel,
  getTranscriptionStageLabel,
  isIndeterminateTranscriptionProgress,
} from '@/shared/utils/transcription-progress'
import { formatDuration } from '@/shared/utils/time-utils'
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
import { useMediaPreparationStore } from '@/features/media-library/stores/media-preparation-store'
import { select } from '$lib/store.svelte'
import { t } from '$lib/i18n.svelte'

type ItemRow = { id: string; name: string; percent: number }

function countGenerating(statuses: Map<string, string>): number {
  let count = 0
  for (const status of statuses.values()) {
    if (status === 'generating') count++
  }
  return count
}

function averageGenerating(statuses: Map<string, string>, progress: Map<string, number>): number {
  let total = 0
  let count = 0
  for (const [id, status] of statuses.entries()) {
    if (status === 'generating') {
      total += progress.get(id) ?? 0
      count++
    }
  }
  return count > 0 ? total / count : 0
}

function generatingRows(
  statuses: Map<string, string>,
  progress: Map<string, number>,
  mediaById: Record<string, { fileName: string } | undefined>,
): ItemRow[] {
  const rows: ItemRow[] = []
  for (const [id, status] of statuses.entries()) {
    if (status === 'generating') {
      rows.push({
        id,
        name: mediaById[id]?.fileName ?? id,
        percent: Math.round((progress.get(id) ?? 0) * 100),
      })
    }
  }
  return rows
}

/**
 * Only one job renders at a time, so the longest remaining estimate is the active job's.
 * Queued jobs have no estimate at all, which is why this is a max and not a sum.
 */
function longestEtaLabel(statuses: Map<string, string>, etaSeconds: Map<string, number>) {
  let longest: number | null = null
  for (const [id, status] of statuses.entries()) {
    if (status !== 'generating') continue
    const eta = etaSeconds.get(id)
    if (eta !== undefined && (longest === null || eta > longest)) longest = eta
  }
  if (longest === null || longest < 1) return null
  return t('media.library.timeRemaining', { time: formatDuration(longest) })
}

/**
 * Derives all background-task progress display state (proxy generation,
 * transcription, AI analysis, and media preparation): aggregate counts, average
 * progress, single-item stage labels, and the per-item rows shown when a
 * progress bar is expanded. Reads its own store slices.
 */
export function useMediaTaskProgress() {
  const proxyStatus = select(useMediaLibraryStore, (s) => s.proxyStatus)
  const proxyProgress = select(useMediaLibraryStore, (s) => s.proxyProgress)
  const interpolationStatus = select(useMediaLibraryStore, (s) => s.interpolationStatus)
  const interpolationProgress = select(useMediaLibraryStore, (s) => s.interpolationProgress)
  const interpolationStage = select(useMediaLibraryStore, (s) => s.interpolationStage)
  const interpolationEtaSeconds = select(useMediaLibraryStore, (s) => s.interpolationEtaSeconds)
  const upscaleStatus = select(useMediaLibraryStore, (s) => s.upscaleStatus)
  const upscaleProgress = select(useMediaLibraryStore, (s) => s.upscaleProgress)
  const upscaleEtaSeconds = select(useMediaLibraryStore, (s) => s.upscaleEtaSeconds)
  const transcriptStatus = select(useMediaLibraryStore, (s) => s.transcriptStatus)
  const transcriptProgress = select(useMediaLibraryStore, (s) => s.transcriptProgress)
  const analysisProgress = select(useMediaLibraryStore, (s) => s.analysisProgress)
  const mediaById = select(useMediaLibraryStore, (s) => s.mediaById)
  const preparationTasks = select(useMediaPreparationStore, (s) => s.tasks)

  const generatingCount = $derived(countGenerating(proxyStatus.current))
  const interpolatingCount = $derived(countGenerating(interpolationStatus.current))
  const interpolatingAvgProgress = $derived(
    interpolatingCount === 0
      ? 0
      : averageGenerating(interpolationStatus.current, interpolationProgress.current),
  )

  /**
   * The one-time 21MB RIFE download is worth calling out — otherwise the first run looks like
   * a stalled render. Any job still downloading flips the whole label.
   */
  const isDownloadingInterpolationModel = $derived.by(() => {
    const stages = interpolationStage.current
    for (const [id, status] of interpolationStatus.current.entries()) {
      if (status === 'generating' && stages.get(id) === 'downloading-model') return true
    }
    return false
  })

  const interpolationEtaLabel = $derived(
    longestEtaLabel(interpolationStatus.current, interpolationEtaSeconds.current),
  )
  const interpolationItemRows = $derived(
    generatingRows(interpolationStatus.current, interpolationProgress.current, mediaById.current),
  )

  const upscalingCount = $derived(countGenerating(upscaleStatus.current))
  const upscalingAvgProgress = $derived(
    upscalingCount === 0 ? 0 : averageGenerating(upscaleStatus.current, upscaleProgress.current),
  )
  const upscaleEtaLabel = $derived(
    longestEtaLabel(upscaleStatus.current, upscaleEtaSeconds.current),
  )
  const upscaleItemRows = $derived(
    generatingRows(upscaleStatus.current, upscaleProgress.current, mediaById.current),
  )

  const analysisPercent = $derived.by(() => {
    const progress = analysisProgress.current
    return progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 0
  })

  const activePreparationTasks = $derived(
    [...preparationTasks.current.values()].filter(
      (task) => task.type !== 'import' && (task.status === 'queued' || task.status === 'running'),
    ),
  )

  const transcribingCount = $derived.by(() => {
    let count = 0
    for (const status of transcriptStatus.current.values()) {
      if (status === 'queued' || status === 'transcribing') count++
    }
    return count
  })

  // Average progress of all generating proxies
  const generatingAvgProgress = $derived(
    generatingCount === 0 ? 0 : averageGenerating(proxyStatus.current, proxyProgress.current),
  )

  const transcribingAvgProgress = $derived.by(() => {
    if (transcribingCount === 0) return 0
    const progressById = transcriptProgress.current
    let total = 0
    let count = 0
    for (const [id, status] of transcriptStatus.current.entries()) {
      if (status === 'queued' || status === 'transcribing') {
        const progress = progressById.get(id)
        total += progress ? getTranscriptionOverallProgress(progress) : 0
        count++
      }
    }
    return count > 0 ? total / count : 0
  })

  // Only meaningful for a single job — with several in flight there is no one stage to name.
  const singleTranscriptionProgress = $derived.by(() => {
    if (transcribingCount !== 1) return null
    for (const [id, status] of transcriptStatus.current.entries()) {
      if (status === 'queued' || status === 'transcribing') {
        return transcriptProgress.current.get(id) ?? null
      }
    }
    return null
  })

  const singleTranscriptionStageLabel = $derived(
    singleTranscriptionProgress ? getTranscriptionProgressLabel(singleTranscriptionProgress) : null,
  )

  // Only the byte counter, never the compile prose: this bar lives in a ~250px panel, where
  // "Optimizing for your hardware" truncates to noise. The pulsing indeterminate bar alongside
  // "Preparing model" already says the compile is working. The dialog has room for the prose.
  const singleTranscriptionDetail = $derived(
    singleTranscriptionProgress?.stage === 'downloading'
      ? getTranscriptionProgressDetail(singleTranscriptionProgress)
      : null,
  )

  /** Some stages report no fraction at all — show a moving bar, not a stalled one. */
  const singleTranscriptionIndeterminate = $derived(
    singleTranscriptionProgress
      ? isIndeterminateTranscriptionProgress(singleTranscriptionProgress)
      : false,
  )

  // Per-item breakdowns shown when the aggregate progress bar is expanded.
  const proxyItemRows = $derived(
    generatingRows(proxyStatus.current, proxyProgress.current, mediaById.current),
  )

  const transcriptionItemRows = $derived.by(() => {
    const rows: Array<{ id: string; name: string; percent: number; stage: string | null }> = []
    const progressById = transcriptProgress.current
    const byId = mediaById.current
    for (const [id, status] of transcriptStatus.current.entries()) {
      if (status === 'queued' || status === 'transcribing') {
        const progress = progressById.get(id)
        rows.push({
          id,
          name: byId[id]?.fileName ?? id,
          percent: progress ? Math.round(getTranscriptionOverallProgress(progress) * 100) : 0,
          stage: progress ? getTranscriptionStageLabel(progress.stage) : null,
        })
      }
    }
    return rows
  })

  const preparationItemRows = $derived.by(() => {
    const groups = new Map<
      string,
      {
        id: string
        name: string
        kinds: string[]
        progress: number
        status: 'queued' | 'running'
        taskCount: number
      }
    >()
    const byId = mediaById.current

    for (const task of activePreparationTasks) {
      const kind =
        task.type === 'import'
          ? t('media.library.preparationType.import')
          : task.type === 'filmstrip'
            ? t('media.library.preparationType.filmstrip')
            : t('media.library.preparationType.waveform')
      const existing = groups.get(task.mediaId)
      if (existing) {
        existing.kinds.push(kind)
        existing.progress += task.progress
        existing.taskCount += 1
        if (task.status === 'running') {
          existing.status = 'running'
        }
        continue
      }

      groups.set(task.mediaId, {
        id: task.mediaId,
        name: byId[task.mediaId]?.fileName ?? task.mediaId,
        kinds: [kind],
        progress: task.progress,
        status: task.status === 'running' ? 'running' : 'queued',
        taskCount: 1,
      })
    }

    return [...groups.values()].map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kinds.join(' + '),
      percent: Math.round((row.progress / row.taskCount) * 100),
      progress: row.progress / row.taskCount,
      status: row.status,
    }))
  })

  const preparingAvgProgress = $derived(
    preparationItemRows.length === 0
      ? 0
      : preparationItemRows.reduce((sum, row) => sum + row.progress, 0) /
          preparationItemRows.length,
  )
  const hasRunningPreparationTasks = $derived(
    preparationItemRows.some((row) => row.status === 'running'),
  )

  return {
    get analysisProgress() {
      return analysisProgress.current
    },
    get analysisPercent() {
      return analysisPercent
    },
    get generatingCount() {
      return generatingCount
    },
    get generatingAvgProgress() {
      return generatingAvgProgress
    },
    get proxyItemRows() {
      return proxyItemRows
    },
    get interpolatingCount() {
      return interpolatingCount
    },
    get interpolatingAvgProgress() {
      return interpolatingAvgProgress
    },
    get interpolationItemRows() {
      return interpolationItemRows
    },
    get interpolationEtaLabel() {
      return interpolationEtaLabel
    },
    get isDownloadingInterpolationModel() {
      return isDownloadingInterpolationModel
    },
    get upscalingCount() {
      return upscalingCount
    },
    get upscalingAvgProgress() {
      return upscalingAvgProgress
    },
    get upscaleItemRows() {
      return upscaleItemRows
    },
    get upscaleEtaLabel() {
      return upscaleEtaLabel
    },
    get transcribingCount() {
      return transcribingCount
    },
    get transcribingAvgProgress() {
      return transcribingAvgProgress
    },
    get singleTranscriptionStageLabel() {
      return singleTranscriptionStageLabel
    },
    get singleTranscriptionDetail() {
      return singleTranscriptionDetail
    },
    get singleTranscriptionIndeterminate() {
      return singleTranscriptionIndeterminate
    },
    get transcriptionItemRows() {
      return transcriptionItemRows
    },
    get preparationItemRows() {
      return preparationItemRows
    },
    get preparingCount() {
      return preparationItemRows.length
    },
    get preparingAvgProgress() {
      return preparingAvgProgress
    },
    get hasRunningPreparationTasks() {
      return hasRunningPreparationTasks
    },
  }
}
