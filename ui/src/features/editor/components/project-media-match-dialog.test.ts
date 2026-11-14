// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import type { MediaMetadata } from '@/types/storage'
import { useProjectMediaMatchDialogStore } from '@/shared/state/project-media-match-dialog'

const mocks = vi.hoisted(() => ({
  updateProject: vi.fn(),
  markDirty: vi.fn(),
  setFps: vi.fn(),
  addUndoEntry: vi.fn(),
  captureSnapshot: vi.fn(() => ({
    items: [],
    tracks: [],
    transitions: [],
    keyframes: [],
    markers: [],
    compositions: [],
    inPoint: null,
    outPoint: null,
    fps: 30,
    scrollPosition: 0,
    snapEnabled: true,
    currentFrame: 0,
    projectId: 'project-1',
    projectMetadata: {
      width: 1280,
      height: 720,
      fps: 30,
      backgroundColor: '#000000',
    },
  })),
  toastError: vi.fn(),
}))

const stores = vi.hoisted(
  () =>
    ({}) as {
      media: import('zustand/vanilla').StoreApi<{ mediaItems: MediaMetadata[]; isLoading: boolean }>
      project: import('zustand/vanilla').StoreApi<{
        currentProject: {
          id: string
          metadata: { width: number; height: number; fps: number }
        } | null
        updateProject: (...args: unknown[]) => unknown
      }>
    },
)

vi.mock('@/features/editor/deps/media-library', async () => {
  const { createStore } = await import('zustand/vanilla')
  stores.media = createStore(() => ({ mediaItems: [] as MediaMetadata[], isLoading: true }))
  return { useMediaLibraryStore: stores.media }
})

vi.mock('@/features/editor/deps/projects', async () => {
  const { createStore } = await import('zustand/vanilla')
  stores.project = createStore(() => ({
    currentProject: null,
    updateProject: (...args: unknown[]) => mocks.updateProject(...args),
  }))
  return {
    useProjectStore: stores.project,
    formatFpsValue: (fps: number) =>
      Number.isInteger(fps) ? `${fps}` : fps.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''),
    resolveAutoMatchProjectFps: (sourceFps: number) => {
      const candidates = [24, 25, 30, 50, 60]
      let closest: number = candidates[0] ?? 30
      let smallestDelta = Math.abs(sourceFps - closest)

      for (const candidate of candidates.slice(1)) {
        const delta = Math.abs(sourceFps - candidate)
        if (delta < smallestDelta) {
          closest = candidate
          smallestDelta = delta
        }
      }

      return { fps: closest, exact: Math.abs(sourceFps - closest) < 0.001 }
    },
  }
})

vi.mock('@/features/editor/deps/timeline-store', () => ({
  markDirty: mocks.markDirty,
  useTimelineSettingsStore: { getState: () => ({ setFps: mocks.setFps }) },
  useTimelineCommandStore: { getState: () => ({ addUndoEntry: mocks.addUndoEntry }) },
  captureSnapshot: mocks.captureSnapshot,
}))

vi.mock('svelte-sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}))

import ProjectMediaMatchDialog from './project-media-match-dialog.svelte'

function makeVideo(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    id: 'video-1',
    storageType: 'handle',
    fileName: 'clip.mp4',
    fileSize: 1_000,
    fileLastModified: 1,
    mimeType: 'video/mp4',
    duration: 10,
    width: 1920,
    height: 1080,
    fps: 59.94,
    codec: 'h264',
    bitrate: 10_000_000,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function setMedia(mediaItems: MediaMetadata[], isLoading = false) {
  stores.media.setState({ mediaItems, isLoading })
  flushSync()
}

describe('ProjectMediaMatchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    useProjectMediaMatchDialogStore.getState().resetProjectMediaMatchDialog()

    stores.media.setState({ mediaItems: [], isLoading: true })
    stores.project.setState({
      currentProject: {
        id: 'project-1',
        metadata: {
          width: 1280,
          height: 720,
          fps: 30,
        },
      },
    })

    mocks.updateProject.mockImplementation(async (_id: string, data: Record<string, unknown>) => {
      const current = stores.project.getState().currentProject!
      return { ...current, metadata: { ...current.metadata, ...data } }
    })
  })

  it('prompts on the first imported video and can match both size and fps', async () => {
    render(ProjectMediaMatchDialog, { projectId: 'project-1' })

    setMedia([])
    setMedia([makeVideo()])

    await waitFor(() =>
      expect(screen.getByText('Match Project To First Video?')).toBeInTheDocument(),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Match Both' }))

    await waitFor(() =>
      expect(mocks.updateProject).toHaveBeenCalledWith('project-1', {
        width: 1920,
        height: 1080,
        fps: 60,
      }),
    )
    expect(mocks.setFps).toHaveBeenCalledWith(60)
    expect(mocks.markDirty).toHaveBeenCalledTimes(1)
  })

  it('does not prompt again once the project already had a video', async () => {
    stores.media.setState({ mediaItems: [makeVideo({ id: 'existing-video' })], isLoading: false })

    render(ProjectMediaMatchDialog, { projectId: 'project-1' })

    setMedia([
      makeVideo({ id: 'new-video', createdAt: 2 }),
      makeVideo({ id: 'existing-video', createdAt: 1 }),
    ])

    await waitFor(() =>
      expect(screen.queryByText('Match Project To First Video?')).not.toBeInTheDocument(),
    )
    expect(mocks.updateProject).not.toHaveBeenCalled()
  })

  it('can be requested imperatively before import flows continue', async () => {
    render(ProjectMediaMatchDialog, { projectId: 'project-1' })

    const pendingChoice = useProjectMediaMatchDialogStore
      .getState()
      .requestProjectMediaMatch('project-1', {
        fileName: 'drop.mp4',
        width: 1920,
        height: 1080,
        fps: 59.94,
      })

    await waitFor(() =>
      expect(screen.getByText('Match Project To First Video?')).toBeInTheDocument(),
    )

    await fireEvent.click(screen.getByRole('button', { name: 'FPS Only' }))

    await expect(pendingChoice).resolves.toBe('fps-only')
    expect(mocks.updateProject).toHaveBeenCalledWith('project-1', { fps: 60 })
    expect(mocks.setFps).toHaveBeenCalledWith(60)
  })
})
