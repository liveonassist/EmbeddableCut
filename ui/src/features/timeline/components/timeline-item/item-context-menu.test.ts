// SPDX-License-Identifier: MIT

import { createRawSnippet, tick, type ComponentProps } from 'svelte'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useSelectionStore } from '@/shared/state/selection'
import ItemContextMenu from './item-context-menu.svelte'

const { mockGetSceneVerificationModelOptions } = vi.hoisted(() => ({
  mockGetSceneVerificationModelOptions: vi.fn(() => [
    { value: 'gemma', label: 'Gemma Turbo' },
    { value: 'lfm', label: 'Liquid Vision' },
  ]),
}))

vi.mock('@/features/timeline/deps/analysis', () => ({
  getSceneVerificationModelOptions: mockGetSceneVerificationModelOptions,
}))

vi.mock('@/features/timeline/deps/settings-ui', () => ({
  useResolvedHotkeys: () => ({ current: {} }),
}))

vi.mock('@/config/hotkeys', () => ({
  formatHotkeyBinding: () => '',
}))

const clip = createRawSnippet(() => ({ render: () => '<div>Clip</div>' }))

async function renderContextMenu(overrides: Partial<ComponentProps<typeof ItemContextMenu>> = {}) {
  const onDetectScenes = vi.fn()

  render(ItemContextMenu, {
    children: clip,
    trackLocked: false,
    joinActions: {
      canJoinSelected: false,
      hasJoinableLeft: false,
      hasJoinableRight: false,
      closerEdge: null,
      onJoinSelected: () => {},
      onJoinLeft: () => {},
      onJoinRight: () => {},
    },
    destructiveActions: {
      isSelected: true,
      onRippleDelete: () => {},
      onDelete: () => {},
    },
    sceneDetectionActions: {
      canDetectScenes: true,
      isDetectingScenes: false,
      onDetectScenes,
    },
    ...overrides,
  })

  // The first right-click mounts the full menu and replays itself on its trigger.
  await fireEvent.contextMenu(screen.getByText('Clip'), { clientX: 10, clientY: 10 })
  await screen.findByRole('menu')

  return { onDetectScenes }
}

/** Opens the scene detection submenu, which bits-ui renders only while open. */
async function openSceneDetectionSubmenu() {
  await fireEvent.click(screen.getByText('Detect Scenes & Split'))
  await screen.findByRole('menuitem', { name: 'Fast (Histogram)' })
}

describe('ItemContextMenu scene detection', () => {
  beforeEach(() => {
    mockGetSceneVerificationModelOptions.mockClear()
    useSelectionStore.setState({
      selectedItemIds: [],
      selectedMarkerId: null,
      selectedTransitionId: null,
      selectedTrackId: null,
      selectedTrackIds: [],
      activeTrackId: null,
      selectionType: null,
    })
  })

  it('keeps the menu non-modal so dialog handoffs cannot strand pointer blocking', async () => {
    await renderContextMenu()
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // A modal menu's scroll lock sets `pointer-events: none` (and `overflow: hidden`) on body.
    expect(document.body.style.pointerEvents).not.toBe('none')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('renders scene verification submenu labels from shared options', async () => {
    await renderContextMenu()
    await openSceneDetectionSubmenu()

    expect(mockGetSceneVerificationModelOptions).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Detect Scenes & Split')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Fast (Histogram)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'AI (Gemma Turbo)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'AI (Liquid Vision)' })).toBeInTheDocument()
  })

  it('dispatches the selected verification model when a scene detection option is clicked', async () => {
    const { onDetectScenes } = await renderContextMenu()
    await openSceneDetectionSubmenu()

    await fireEvent.click(screen.getByRole('menuitem', { name: 'AI (Liquid Vision)' }))

    expect(onDetectScenes).toHaveBeenCalledWith('adaptive', 'lfm')
  })
})

describe('ItemContextMenu captions', () => {
  it('shows a single "Generate Captions" item when no transcript exists', async () => {
    const onOpenCaptionDialog = vi.fn()

    await renderContextMenu({
      captionActions: {
        canManageCaptions: true,
        hasCaptions: false,
        onOpenCaptionDialog,
      },
    })

    const item = screen.getByRole('menuitem', { name: 'Generate Captions' })
    expect(item).toBeInTheDocument()
    expect(screen.queryByText('Captions')).not.toBeInTheDocument()
    await fireEvent.click(item)
    expect(onOpenCaptionDialog).toHaveBeenCalledTimes(1)
  })

  it('shows a single "Generate Captions" item when captions are disabled', async () => {
    const onOpenCaptionDialog = vi.fn()

    await renderContextMenu({
      captionActions: {
        canManageCaptions: true,
        hasCaptions: false,
        onOpenCaptionDialog,
      },
    })

    const item = screen.getByRole('menuitem', { name: 'Generate Captions' })
    expect(item).toBeInTheDocument()
    expect(screen.queryByText('Captions')).not.toBeInTheDocument()

    await fireEvent.click(item)
    expect(onOpenCaptionDialog).toHaveBeenCalledTimes(1)
  })

  it('labels the generate item "Regenerate Captions" when the clip already has captions', async () => {
    await renderContextMenu({
      captionActions: {
        canManageCaptions: true,
        hasCaptions: true,
        onOpenCaptionDialog: vi.fn(),
      },
    })

    expect(screen.getByRole('menuitem', { name: 'Regenerate Captions' })).toBeInTheDocument()
  })

  it('does not show transcript visibility controls when the clip already has captions', async () => {
    await renderContextMenu({
      captionActions: {
        canManageCaptions: true,
        hasCaptions: true,
        onOpenCaptionDialog: vi.fn(),
      },
    })

    expect(
      screen.queryByRole('menuitem', { name: 'Hide Transcript Captions' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Show Transcript Captions' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Insert Existing Captions' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Regenerate Captions' })).toBeInTheDocument()
  })
})
