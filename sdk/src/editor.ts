// SPDX-License-Identifier: MIT

import type { Project, ProjectTimeline } from '@embeddablecut/engine/types/project'
import type { MediaMetadata } from '@embeddablecut/engine/types/storage'
import type {
  ClientExportSettings,
  RenderProgress,
} from '@embeddablecut/engine/runtime/renderer/client-renderer'
import {
  mediaFromAssetRecord,
  readProjectDocument,
  writeProjectDocument,
  type DocumentWarning,
  type ProjectDocument,
} from '@embeddablecut/engine/schema/index'
import { resetBoundStores } from '@embeddablecut/engine/shared/state/bound-store'
import {
  onNotification,
  type EngineNotification,
} from '@embeddablecut/engine/shared/notifications/index'
import { usePlaybackStore } from '@embeddablecut/engine/shared/state/playback/index'
import { useProjectStore } from '@embeddablecut/engine/features/projects/stores/project-store'
import { useMediaLibraryStore } from '@embeddablecut/engine/features/media-library/stores/media-library-store'
import { useItemsStore } from '@embeddablecut/engine/features/timeline/stores/items-store'
import { useTransitionsStore } from '@embeddablecut/engine/features/timeline/stores/transitions-store'
import { useKeyframesStore } from '@embeddablecut/engine/features/timeline/stores/keyframes-store'
import { useMarkersStore } from '@embeddablecut/engine/features/timeline/stores/markers-store'
import { useCompositionsStore } from '@embeddablecut/engine/features/timeline/stores/compositions-store'
import { useTimelineCommandStore } from '@embeddablecut/engine/features/timeline/stores/timeline-command-store'
import { captureSnapshot } from '@embeddablecut/engine/features/timeline/stores/commands/snapshot'
import {
  buildTimelineFromStores,
  hydrateTimelineStoresFromProject,
  loadTimeline,
  saveTimeline,
} from '@embeddablecut/engine/features/timeline/stores/timeline-persistence'
import { CURRENT_SCHEMA_VERSION } from '@embeddablecut/engine/shared/projects/migrations/index'
import { getProject } from '@embeddablecut/engine/infrastructure/storage/workspace-fs/projects'
import { clearPreviewAudioCache } from '@embeddablecut/engine/runtime/composition-runtime/utils/audio-decode-cache'
import { resolveMediaUrl } from '@embeddablecut/engine/features/media-library/utils/media-resolver'
import { blobUrlManager } from '@embeddablecut/engine/infrastructure/browser/blob-url-manager'
import { bootstrapWorkspace } from '@embeddablecut/engine/infrastructure/storage/workspace-fs/bootstrap'
import {
  getWorkspaceRoot,
  setWorkspaceRoot,
} from '@embeddablecut/engine/infrastructure/storage/workspace-fs/root'
import { applyEditOperations } from '@embeddablecut/engine/headless/edit'
import { editOperationNames } from '@embeddablecut/engine/headless/edit-ops'
import { setEditCanvas, type EditOp } from '@embeddablecut/engine/headless/edit-op-support'
import {
  createProjectForHeadless,
  renderFrame,
  renderProject,
  type HeadlessMediaSource,
  type HeadlessRenderWarning,
} from '@embeddablecut/engine/headless/main'
import { EditorError } from './errors'
import { Emitter } from './events'
import { ExtensionHost, requirementsOf, type Extension } from './extensions'
import {
  MediaApi,
  createRemoteResolver,
  type MediaAcceptOptions,
  type MediaResolver,
  type MediaSourcePolicy,
} from './media'
import { setMediaAcceptPolicy } from '@embeddablecut/engine/features/media-library/services/media-accept-policy'
import {
  clearSessionMedia,
  getSessionMediaBlob,
} from '@embeddablecut/engine/features/media-library/services/session-media'
import {
  resetRemoteMedia,
  setRemoteMediaResolver,
} from '@embeddablecut/engine/features/media-library/services/remote-media'
import { SDK_VERSION } from './version'

export interface EditorOptions {
  /**
   * Where projects' media and caches live. A directory the user picked keeps
   * FreeCut's workspace layout in it; `'opfs'` (the default where the browser
   * has it) uses the origin's private storage, so nothing is asked of the
   * user and filmstrips, waveforms and thumbnails survive a reload. `'none'`
   * keeps nothing: every cache is rebuilt each session, and only URL media
   * and documents can be opened.
   */
  workspace?: FileSystemDirectoryHandle | 'opfs' | 'none'
  /**
   * Which media sources the editor accepts, and how URL assets are resolved:
   * signed, renewed before they expire, or given the host's credentials.
   * Media providers from extensions are asked after `resolve`.
   */
  media?: Partial<MediaSourcePolicy> & MediaAcceptOptions & { resolve?: MediaResolver }
  /** Installed before anything loads; a document may depend on them. */
  extensions?: Extension[]
}

/** A wire edit operation: `op` names a built-in or extension op, the rest are its fields. */
export type EditOperation = Record<string, unknown> & { op: string }

export interface EditResult {
  op: string
  callerId?: string
  /** The op's own result, such as the `id` of what it created. */
  detail?: unknown
}

export interface ProjectInfo {
  id: string
  name: string
  width: number
  height: number
  fps: number
}

export interface NewProject {
  name: string
  width?: number
  height?: number
  fps?: number
  backgroundColor?: string
}

export interface FrameRequest {
  /** Project frame; takes precedence over `atSeconds`. Defaults to the playhead. */
  frame?: number
  atSeconds?: number
  width?: number
  height?: number
  format?: 'image/png' | 'image/jpeg' | 'image/webp'
  quality?: number
}

export type ExportSettings = ClientExportSettings

export interface ExportRequest {
  /** Defaults to an H.264 MP4 at the project's size and frame rate. */
  settings?: Partial<ExportSettings>
  /** Project frames; the whole project when omitted. */
  inFrame?: number
  outFrame?: number
  onProgress?: (progress: RenderProgress) => void
}

export interface ExportResult {
  blob: Blob
  fileName: string
  mimeType: string
  durationSeconds: number
  /** The settings actually used, after codec fallbacks for this browser. */
  settings: ExportSettings
  warnings: HeadlessRenderWarning[]
}

export interface EditorEvents extends Record<string, unknown> {
  /** A project was created or loaded. */
  project: ProjectInfo
  /** Anything on the timeline changed: an edit, undo or redo. */
  change: void
  /** The playhead moved or playback started or stopped. */
  playback: { frame: number; playing: boolean }
  /** A notice for the user, which a host without the editor UI shows itself. */
  notification: EngineNotification
}

export interface LoadResult {
  project: ProjectInfo
  /** True when the project was migrated from an older schema on the way in. */
  migrated: boolean
  warnings: DocumentWarning[]
}

let activeEditor: Editor | null = null

/**
 * An editor over FreeCut's engine: projects, the timeline, media, playback,
 * rendering and extensions, with or without the editor UI on screen.
 *
 * The engine's state is one per page, so one editor can be live at a time;
 * `createEditor` throws `EDITOR_ACTIVE` until the last one is disposed. Run
 * more side by side in iframes (`mountEditor` with `isolation: 'iframe'`).
 */
export class Editor {
  readonly version = SDK_VERSION
  readonly extensions = new ExtensionHost()
  readonly media: MediaApi

  private readonly events = new Emitter<EditorEvents>()
  private readonly teardown: Array<() => void> = []
  private readonly policy: MediaSourcePolicy
  /** Set while the loaded project is the workspace's own, which `save` writes back. */
  private workspaceProjectId: string | null = null
  private disposed = false

  /** @internal Use {@link createEditor}. */
  constructor(options: EditorOptions) {
    this.policy = { local: options.media?.local ?? true, url: options.media?.url ?? true }
    const resolver = createRemoteResolver(options.media?.resolve, () =>
      this.extensions.mediaProviders(),
    )
    setRemoteMediaResolver(resolver)
    this.teardown.push(() => {
      setRemoteMediaResolver(null)
      resetRemoteMedia()
    })
    this.media = new MediaApi(
      this.policy,
      () => this.requireProject(),
      resolver,
      () => referencedMediaIds(buildTimelineFromStores()),
    )
    setMediaAcceptPolicy(options.media?.accept ?? null)
    this.teardown.push(() => {
      setMediaAcceptPolicy(null)
      clearSessionMedia()
    })
    for (const extension of options.extensions ?? []) this.extensions.install(extension)

    this.teardown.push(onNotification((notice) => this.events.emit('notification', notice)))
    const emitChange = () => this.events.emit('change', undefined)
    for (const store of [
      useItemsStore,
      useTransitionsStore,
      useKeyframesStore,
      useMarkersStore,
      useCompositionsStore,
    ]) {
      this.teardown.push(store.subscribe(emitChange))
    }
    this.teardown.push(
      usePlaybackStore.subscribe((state, previous) => {
        if (state.currentFrame === previous.currentFrame && state.isPlaying === previous.isPlaying)
          return
        this.events.emit('playback', { frame: state.currentFrame, playing: state.isPlaying })
      }),
    )
  }

  /** @internal */
  async attachWorkspace(workspace: EditorOptions['workspace']): Promise<void> {
    if (workspace === 'none') return
    const root = workspace && workspace !== 'opfs' ? workspace : await openOpfsWorkspace(workspace)
    if (!root) return
    setWorkspaceRoot(root)
    this.teardown.push(() => setWorkspaceRoot(null))
    await bootstrapWorkspace(root)
  }

  /** Which media sources the host lets this editor use, so a UI can offer only those. */
  get mediaSources(): MediaSourcePolicy {
    return { local: this.policy.local, url: this.policy.url }
  }

  on<K extends keyof EditorEvents>(
    event: K,
    listener: (payload: EditorEvents[K]) => void,
  ): () => void {
    return this.events.on(event, listener)
  }

  // --- projects --------------------------------------------------------------

  /** The loaded project, or null before one is created or loaded. */
  get project(): ProjectInfo | null {
    const project = useProjectStore.getState().currentProject
    return project ? infoOf(project) : null
  }

  /** Starts an empty project and makes it current. */
  async createProject(init: NewProject): Promise<ProjectInfo> {
    const project = createProjectForHeadless(init)
    const { project: info } = await this.loadDocument(writeProjectDocument(project, []))
    return info
  }

  /**
   * Opens a project document, replacing whatever was loaded. The document is
   * read under docs/SCHEMAS.md's rules: older ones migrate, newer ones and
   * invalid ones are refused, repairs come back as warnings.
   *
   * @throws {SchemaError} when the document can't be read.
   * @throws {EditorError} `EXTENSION_MISSING` when it needs an extension that
   *   isn't installed, `MEDIA_SOURCE_DISABLED` when it uses a source the host
   *   turned off.
   */
  async loadDocument(input: unknown): Promise<LoadResult> {
    this.assertLive()
    const { document, migrated, warnings } = readProjectDocument(input)
    const missing = this.extensions.missing(document.requires)
    if (missing.length > 0) {
      throw new EditorError(
        'EXTENSION_MISSING',
        `The project needs ${missing.map((r) => `${r.kind} "${r.id}"`).join(', ')}, which no installed extension provides`,
        missing,
      )
    }
    const usesUrl = document.assets.some((asset) => asset.source.type === 'url')
    const usesLocal = document.assets.some((asset) => asset.source.type !== 'url')
    if ((usesUrl && !this.policy.url) || (usesLocal && !this.policy.local)) {
      throw new EditorError(
        'MEDIA_SOURCE_DISABLED',
        'The project uses a kind of media this editor does not accept',
      )
    }

    usePlaybackStore.getState().pause()
    this.workspaceProjectId = null
    const project = document.project as unknown as Project
    const media = document.assets.map((asset) => mediaFromAssetRecord(asset))
    useProjectStore.getState().setCurrentProject(project)
    useMediaLibraryStore.getState().setCurrentProject(project.id)
    useMediaLibraryStore.setState({
      mediaItems: media,
      mediaById: Object.fromEntries(media.map((item) => [item.id, item])),
      isLoading: false,
    })
    for (const item of media) {
      if (item.storageType === 'url' && item.remote)
        blobUrlManager.registerUrl(item.id, item.remote.url)
      // Memory assets from another editor's page have no bytes here.
      if (item.storageType === 'memory' && !getSessionMediaBlob(item.id)) {
        useMediaLibraryStore.getState().markMediaBroken(item.id, {
          mediaId: item.id,
          fileName: item.fileName,
          errorType: 'file_missing',
        })
      }
    }
    setEditCanvas({
      width: project.metadata.width,
      height: project.metadata.height,
      fps: project.metadata.fps,
    })
    await hydrateTimelineStoresFromProject(project)
    useTimelineCommandStore.getState().clearHistory()

    const info = infoOf(project)
    this.events.emit('project', info)
    return { project: info, migrated, warnings }
  }

  /**
   * Opens a project from the workspace folder, as FreeCut's editor does: its
   * media library, then its timeline. `save` writes it back there.
   *
   * @throws {EditorError} `WORKSPACE_REQUIRED`, `PROJECT_NOT_FOUND`, or
   *   `PROJECT_NEEDS_UPGRADE` for a project from an older schema unless
   *   `allowUpgrade` agrees to migrate it.
   */
  async openProject(
    projectId: string,
    options: { allowUpgrade?: boolean } = {},
  ): Promise<ProjectInfo> {
    this.assertLive()
    if (!getWorkspaceRoot()) {
      throw new EditorError('WORKSPACE_REQUIRED', 'Opening a workspace project needs a workspace')
    }
    const project = await getProject(projectId)
    if (!project)
      throw new EditorError('PROJECT_NOT_FOUND', `No project ${projectId} in the workspace`)
    const requiresUpgrade = (project.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION
    if (requiresUpgrade && !options.allowUpgrade) {
      throw new EditorError(
        'PROJECT_NEEDS_UPGRADE',
        `Project ${project.name} is schema v${project.schemaVersion ?? 1}; opening it migrates it to v${CURRENT_SCHEMA_VERSION}`,
      )
    }

    usePlaybackStore.getState().pause()
    usePlaybackStore.getState().setPreviewFrame(null)
    resetRemoteMedia()
    const media = useMediaLibraryStore.getState()
    media.setCurrentProject(projectId)
    await media.loadMediaItems()
    useProjectStore
      .getState()
      .setCurrentProject({ ...project, schemaVersion: CURRENT_SCHEMA_VERSION })
    setEditCanvas({
      width: project.metadata.width,
      height: project.metadata.height,
      fps: project.metadata.fps,
    })
    await loadTimeline(projectId, { allowProjectUpgrade: requiresUpgrade })
    this.workspaceProjectId = projectId

    const info = infoOf(project)
    this.events.emit('project', info)
    return info
  }

  /**
   * Writes the loaded workspace project back to the workspace. A project
   * loaded from a document has nowhere of its own: save `toDocument()` instead.
   *
   * @throws {EditorError} `NO_PROJECT` when no workspace project is open.
   */
  async save(): Promise<void> {
    this.requireProject()
    if (!this.workspaceProjectId) {
      throw new EditorError(
        'NO_PROJECT',
        'The loaded project is not a workspace project; save toDocument() instead',
      )
    }
    await saveTimeline(this.workspaceProjectId)
  }

  /** Closes the loaded project: playback stops and its media and timeline are released. */
  closeProject(): void {
    const playback = usePlaybackStore.getState()
    playback.setPreviewFrame(null)
    playback.pause()
    useMediaLibraryStore.getState().setCurrentProject(null)
    useProjectStore.getState().setCurrentProject(null)
    clearPreviewAudioCache()
    resetRemoteMedia()
    clearSessionMedia()
    this.workspaceProjectId = null
  }

  /** The loaded project as a portable document: its timeline now, and every asset it references. */
  toDocument(): ProjectDocument {
    const project = this.requireProject()
    const timeline = buildTimelineFromStores()
    const current: Project = { ...project, timeline, updatedAt: Date.now() }
    const referenced = referencedMediaIds(timeline)
    const assets = this.media.list().filter((asset) => referenced.has(asset.id))
    return writeProjectDocument(current, assets, {
      requires: requirementsOf(current),
      generator: { name: 'embeddablecut', version: SDK_VERSION },
    })
  }

  // --- the timeline ----------------------------------------------------------

  /** The loaded project's timeline as it would be saved. */
  get timeline(): ProjectTimeline {
    this.requireProject()
    return buildTimelineFromStores()
  }

  /** Every op name `apply` accepts: FreeCut's built-ins, then extensions'. */
  get operations(): string[] {
    return editOperationNames()
  }

  /**
   * Applies edit operations in order, as one undo step. An op can use an
   * earlier one's result: give that op a `callerId`, then pass
   * `{ "$ref": "<callerId>#/detail/id" }` for an id field.
   *
   * @throws {EditorError} `OPERATION_FAILED` at the first op refused; the ops
   *   before it stay applied and undo as a unit.
   */
  apply(operations: EditOperation | EditOperation[]): EditResult[] {
    this.requireProject()
    const ops = (Array.isArray(operations) ? operations : [operations]) as unknown as EditOp[]
    const history = useTimelineCommandStore.getState()
    const before = captureSnapshot()
    const depth = history.undoStack.length
    const finish = () => {
      // The actions each recorded their own step; fold them into one.
      const added = useTimelineCommandStore.getState().undoStack.length - depth
      if (added <= 0) return
      useTimelineCommandStore.setState((state) => ({ undoStack: state.undoStack.slice(0, depth) }))
      useTimelineCommandStore
        .getState()
        .addUndoEntry({ type: 'SDK_APPLY', payload: { ops: ops.length } }, before)
    }
    try {
      const results = applyEditOperations(ops)
      finish()
      return results.map(({ op, callerId, detail }) => ({
        op,
        ...(callerId ? { callerId } : {}),
        detail,
      }))
    } catch (error) {
      finish()
      throw new EditorError(
        'OPERATION_FAILED',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  undo(): void {
    useTimelineCommandStore.getState().undo()
  }

  redo(): void {
    useTimelineCommandStore.getState().redo()
  }

  get canUndo(): boolean {
    return useTimelineCommandStore.getState().canUndo
  }

  get canRedo(): boolean {
    return useTimelineCommandStore.getState().canRedo
  }

  // --- playback --------------------------------------------------------------

  /** The playhead, in project frames. */
  get frame(): number {
    return usePlaybackStore.getState().currentFrame
  }

  get playing(): boolean {
    return usePlaybackStore.getState().isPlaying
  }

  /** Starts playback. Picture and sound need a preview on screen: the editor UI's, or one a host mounts. */
  play(): void {
    usePlaybackStore.getState().play()
  }

  pause(): void {
    usePlaybackStore.getState().pause()
  }

  seek(frame: number): void {
    usePlaybackStore.getState().setCurrentFrame(Math.max(0, Math.round(frame)))
  }

  // --- rendering -------------------------------------------------------------

  /**
   * Renders one frame of the loaded project with the export engine, exactly
   * as an export or a server render draws it.
   */
  async renderFrame(request: FrameRequest = {}): Promise<Blob> {
    const document = this.toDocument()
    let image: Blob | null = null
    await renderFrame({
      project: document.project as unknown as Project,
      media: await this.renderSources(),
      frame: request.frame ?? (request.atSeconds === undefined ? this.frame : undefined),
      atSeconds: request.atSeconds,
      width: request.width,
      height: request.height,
      format: request.format,
      quality: request.quality,
      deliver: (blob) => {
        image = blob
      },
    })
    if (!image) throw new Error('The frame render produced no image')
    return image
  }

  /** Exports the loaded project in the browser, as FreeCut's export dialog does. */
  async export(request: ExportRequest = {}): Promise<ExportResult> {
    const document = this.toDocument()
    const { width, height, fps } = document.project.metadata
    const settings: ExportSettings = {
      mode: 'video',
      codec: 'avc',
      container: 'mp4',
      quality: 'high',
      resolution: { width, height },
      fps,
      ...request.settings,
    }
    let output: { blob: Blob; fileName: string } | null = null
    const summary = await renderProject({
      project: document.project as unknown as Project,
      media: await this.renderSources(),
      settings,
      inPoint: request.inFrame ?? null,
      outPoint: request.outFrame ?? null,
      onProgress: request.onProgress ?? (() => {}),
      deliver: (blob, fileName) => {
        output = { blob, fileName }
      },
    })
    const delivered = output as { blob: Blob; fileName: string } | null
    if (!delivered) throw new Error('The export produced no file')
    return {
      blob: delivered.blob,
      fileName: delivered.fileName,
      mimeType: summary.mimeType,
      durationSeconds: summary.durationSeconds,
      settings: summary.effectiveSettings,
      warnings: summary.warnings,
    }
  }

  /** Fetchable URLs for every media item, as the render path wants them. */
  private async renderSources(): Promise<HeadlessMediaSource[]> {
    const media = useMediaLibraryStore.getState().mediaItems
    const sources = await Promise.all(
      media.map(async (metadata: MediaMetadata) => {
        try {
          return { mediaId: metadata.id, url: await resolveMediaUrl(metadata.id), metadata }
        } catch {
          return null
        }
      }),
    )
    return sources.filter((source) => source !== null)
  }

  // --- lifecycle -------------------------------------------------------------

  /**
   * Stops playback, uninstalls extensions and puts the engine back as it
   * started, so another editor can be created. User preferences (persisted
   * settings) survive.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    usePlaybackStore.getState().pause()
    for (const step of this.teardown.splice(0).reverse()) step()
    this.extensions.uninstallAll()
    this.events.clear()
    blobUrlManager.releaseAll()
    resetBoundStores()
    if (activeEditor === this) activeEditor = null
  }

  private assertLive(): void {
    if (this.disposed) throw new EditorError('EDITOR_DISPOSED', 'This editor was disposed')
  }

  private requireProject(): Project {
    this.assertLive()
    const project = useProjectStore.getState().currentProject
    if (!project) throw new EditorError('NO_PROJECT', 'No project is loaded')
    return project
  }
}

/**
 * The origin-private workspace. Where the browser refuses it (private modes,
 * some WebViews), an editor that didn't ask for it runs without one.
 */
async function openOpfsWorkspace(
  requested: 'opfs' | undefined,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const storage = await navigator.storage.getDirectory()
    return await storage.getDirectoryHandle('embeddablecut', { create: true })
  } catch (error) {
    if (requested) throw error
    return null
  }
}

function infoOf(project: Project): ProjectInfo {
  const { width, height, fps } = project.metadata
  return { id: project.id, name: project.name, width, height, fps }
}

function referencedMediaIds(timeline: ProjectTimeline): Set<string> {
  const ids = new Set<string>()
  for (const item of timeline.items ?? []) if (item.mediaId) ids.add(item.mediaId)
  for (const composition of timeline.compositions ?? []) {
    for (const item of composition.items ?? []) if (item.mediaId) ids.add(item.mediaId)
  }
  return ids
}

/**
 * Creates the page's editor. Resolves once its workspace, if any, is ready.
 *
 * @throws {EditorError} `EDITOR_ACTIVE` while another editor is live.
 */
export async function createEditor(options: EditorOptions = {}): Promise<Editor> {
  if (activeEditor) {
    throw new EditorError(
      'EDITOR_ACTIVE',
      'An editor is already live in this page. Dispose it first, or mount editors in iframes to run several.',
    )
  }
  const editor = new Editor(options)
  activeEditor = editor
  try {
    await editor.attachWorkspace(options.workspace)
  } catch (error) {
    editor.dispose()
    throw error
  }
  return editor
}
