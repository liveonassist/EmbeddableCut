// SPDX-License-Identifier: MIT
// oxlint-disable react-hooks/rules-of-hooks -- hooks run in an effect root, not a component

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { toast } from 'svelte-sonner'

import type { TransitionBreakage } from '@/types/transition'
import { clearDomainEventListeners, emitDomainEvent } from '@/shared/utils/domain-events'

import { renderHook } from '../test/render-hook.svelte'
import { useTransitionBreakageNotifications } from './use-transition-breakage-notifications.svelte'

vi.mock('svelte-sonner', () => ({
  toast: {
    warning: vi.fn(),
  },
}))

const cleanups: Array<() => void> = []

function renderProbe() {
  cleanups.push(renderHook(() => useTransitionBreakageNotifications()).unmount)
}

function makeBreakage(message: string): TransitionBreakage {
  return {
    transitionId: crypto.randomUUID(),
    transition: {
      id: crypto.randomUUID(),
      type: 'crossfade',
      leftClipId: 'clip-left',
      rightClipId: 'clip-right',
      trackId: 'track-1',
      durationInFrames: 12,
      presentation: 'fade',
      timing: 'linear',
    },
    reason: 'not_adjacent',
    message,
    affectedClipIds: ['clip-left', 'clip-right'],
  }
}

describe('useTransitionBreakageNotifications', () => {
  afterEach(() => {
    for (const unmount of cleanups.splice(0)) unmount()
    clearDomainEventListeners()
    vi.mocked(toast.warning).mockReset()
  })

  it('shows the breakage message for a single transition breakage event', () => {
    renderProbe()

    emitDomainEvent('timeline.transitionBreakagesDetected', {
      breakages: [makeBreakage('Transition removed after trim')],
    })

    expect(toast.warning).toHaveBeenCalledWith('Transition removed after trim')
  })

  it('shows an aggregate warning for multiple transition breakages', () => {
    renderProbe()

    emitDomainEvent('timeline.transitionBreakagesDetected', {
      breakages: [makeBreakage('Transition A removed'), makeBreakage('Transition B removed')],
    })

    expect(toast.warning).toHaveBeenCalledWith('2 transitions removed due to clip changes')
  })
})
