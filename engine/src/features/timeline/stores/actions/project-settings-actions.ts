// SPDX-License-Identifier: MIT

/**
 * Changing the open project's canvas and frame rate, and taking the timeline
 * along: clips are refit to the new canvas and every frame count keeps its
 * time, in one undo step.
 */

import { getSourceDimensions } from '@/features/timeline/deps/composition-runtime'
import { useProjectStore } from '@/features/timeline/deps/projects'
import { updateProject } from '@/infrastructure/storage'
import { isDetachedProject } from '@/shared/projects/detached-project'
import { usePlaybackStore } from '@/shared/state/playback'
import type { Project, ProjectResolution } from '@/types/project'
import {
  convertFrame,
  convertTimelineFrameRate,
  convertWrapperSource,
} from '../../utils/convert-frame-rate'
import { readCanvasFraming, refitCanvas, type CanvasFraming } from '../../utils/refit-canvas'
import { useCompositionNavigationStore } from '../composition-navigation-store'
import { useCompositionsStore } from '../compositions-store'
import { useItemsStore } from '../items-store'
import { useKeyframesStore } from '../keyframes-store'
import { useMarkersStore } from '../markers-store'
import { useTimelineCommandStore } from '../timeline-command-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import { useTransitionsStore } from '../transitions-store'
import { getCurrentTimelineSnapshot, getLogger, getRootTimelineSnapshot } from './shared'

export type { CanvasFraming } from '../../utils/refit-canvas'

export interface ProjectSettingsChange {
  width?: number
  height?: number
  fps?: number
  backgroundColor?: string
  /**
   * How clips that fill the canvas meet its new shape; as they do now when
   * omitted, and `'keep'` leaves every clip where it is. Given without a new
   * size, it reframes them on the canvas as it is.
   */
  framing?: CanvasFraming | 'keep'
}

/** Encoders need even dimensions. */
function evenLength(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

function keyframesByItem() {
  return new Map(useKeyframesStore.getState().keyframes.map((entry) => [entry.itemId, entry]))
}

/** How Main's full-canvas clips meet the canvas now; see {@link readCanvasFraming}. */
export function getCanvasFraming(): CanvasFraming | 'mixed' | null {
  const project = useProjectStore.getState().currentProject
  if (!project) return null
  const root = getRootTimelineSnapshot(getCurrentTimelineSnapshot())
  return readCanvasFraming(
    root.items,
    project.metadata,
    getSourceDimensions,
    new Map(root.keyframes.map((entry) => [entry.itemId, entry])),
  )
}

/**
 * Main's framing is only visible where a clip's shape differs from the
 * canvas's, so a project that once filled its canvas keeps filling it after a
 * detour through a canvas its clips match.
 */
let lastFraming: { projectId: string; framing: CanvasFraming } | null = null

function currentFraming(project: Project): CanvasFraming {
  const framing = readCanvasFraming(
    useItemsStore.getState().items,
    project.metadata,
    getSourceDimensions,
    keyframesByItem(),
  )
  if (framing === 'fit' || framing === 'fill') return framing
  return lastFraming?.projectId === project.id ? lastFraming.framing : 'fit'
}

function writeProjectMetadata(project: Project, metadata: ProjectResolution): void {
  const updated: Project = { ...project, metadata, updatedAt: Date.now() }
  useProjectStore.setState((state) => ({
    currentProject: state.currentProject?.id === project.id ? updated : state.currentProject,
    projects: state.projects.map((entry) => (entry.id === project.id ? updated : entry)),
  }))
  if (isDetachedProject(project.id)) return
  void Promise.resolve(updateProject(project.id, { metadata })).catch((error: unknown) => {
    getLogger().error(`Failed to persist the settings of project ${project.id}:`, error)
  })
}

/** Moves Main, and every composition that runs at the project's rate, to `toFps`. */
function convertProjectFrameRate(fromFps: number, toFps: number): void {
  const items = useItemsStore.getState()
  const markers = useMarkersStore.getState()
  const compositions = useCompositionsStore.getState().compositions
  // One with a rate of its own is an independent clip, played at that rate.
  const followers = new Set(compositions.filter((c) => c.fps === fromFps).map((c) => c.id))
  const followWrappers = <T extends { compositionId?: string }>(item: T) =>
    item.compositionId !== undefined && followers.has(item.compositionId)

  const main = convertTimelineFrameRate(
    {
      items: items.items,
      transitions: useTransitionsStore.getState().transitions,
      keyframes: useKeyframesStore.getState().keyframes,
      markers: markers.markers,
      inPoint: markers.inPoint,
      outPoint: markers.outPoint,
    },
    fromFps,
    toFps,
  )
  const follow = (item: (typeof main.items)[number]) =>
    followWrappers(item) ? convertWrapperSource(item, fromFps, toFps) : item

  useCompositionsStore.getState().setCompositions(
    compositions.map((composition) => {
      if (!followers.has(composition.id)) {
        return { ...composition, items: composition.items.map(follow) }
      }
      const converted = convertTimelineFrameRate(
        {
          ...composition,
          markers: composition.markers ?? [],
          inPoint: composition.inPoint ?? null,
          outPoint: composition.outPoint ?? null,
        },
        fromFps,
        toFps,
      )
      return {
        ...converted,
        items: converted.items.map(follow),
        fps: toFps,
        durationInFrames: Math.max(
          composition.durationInFrames > 0 ? 1 : 0,
          convertFrame(composition.durationInFrames, fromFps, toFps),
        ),
      }
    }),
  )
  items.setItems(main.items.map(follow))
  useTransitionsStore.getState().setTransitions(main.transitions)
  useKeyframesStore.getState().setKeyframes(main.keyframes)
  useMarkersStore.getState().setMarkers(main.markers)
  useMarkersStore.getState().setInOutPoints(main.inPoint, main.outPoint)
  useTimelineSettingsStore.getState().setFps(toFps)
  usePlaybackStore
    .getState()
    .setCurrentFrame(convertFrame(usePlaybackStore.getState().currentFrame, fromFps, toFps))
}

/**
 * Changes the open project's canvas, frame rate or background as one undo
 * step. A new size or rate returns to the Main timeline first, whose content
 * and history it changes. Does nothing without a project, or when nothing
 * would change.
 */
export function changeProjectSettings(change: ProjectSettingsChange): void {
  const opened = useProjectStore.getState().currentProject
  if (!opened) return

  const { width, height, fps, backgroundColor } = opened.metadata
  const next: ProjectResolution = {
    width: change.width === undefined ? width : evenLength(change.width),
    height: change.height === undefined ? height : evenLength(change.height),
    fps: change.fps ?? fps,
    backgroundColor: change.backgroundColor ?? backgroundColor,
  }
  const resized = next.width !== width || next.height !== height
  const retimed = next.fps !== fps
  const reframed = change.framing !== undefined && change.framing !== 'keep'
  const recolored =
    change.backgroundColor !== undefined &&
    change.backgroundColor !== (backgroundColor ?? '#000000')
  if (!resized && !retimed && !reframed && !recolored) return

  const navigation = useCompositionNavigationStore.getState()
  if ((resized || retimed || reframed) && navigation.activeCompositionId !== null) {
    navigation.resetToRoot()
  }

  usePlaybackStore.getState().pause()
  const project = useProjectStore.getState().currentProject ?? opened
  const framing =
    change.framing === 'keep'
      ? null
      : (change.framing ?? (resized ? currentFraming(project) : null))
  useTimelineCommandStore
    .getState()
    .execute({ type: 'UPDATE_PROJECT_SETTINGS', payload: { ...change } }, () => {
      if (framing) {
        const refit = refitCanvas({
          items: useItemsStore.getState().items,
          keyframes: useKeyframesStore.getState().keyframes,
          from: { width, height },
          to: next,
          framing,
          sourceSizeOf: getSourceDimensions,
        })
        useItemsStore.getState().setItems(refit.items)
        useKeyframesStore.getState().setKeyframes(refit.keyframes)
        lastFraming = { projectId: project.id, framing }
      }
      if (retimed) convertProjectFrameRate(fps, next.fps)
      writeProjectMetadata(project, next)
      useTimelineSettingsStore.getState().markDirty()
    })
  if (retimed) useTimelineCommandStore.getState().dropInactiveContexts()
}
