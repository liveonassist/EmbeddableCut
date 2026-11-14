// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vite-plus/test'
import HookHarness from '../hook.harness.svelte'
import { usePropertyFilters } from './use-property-filters.svelte'

const groups = [
  { id: 'transform', label: 'Transform', properties: ['x'] as const },
  {
    id: 'effects',
    label: 'Effects',
    properties: ['effect:gpu-exposure:fx-1:exposure'] as const,
  },
]

describe('usePropertyFilters', () => {
  it('uses a workspace-provided initial group selection without locking the menu', () => {
    const hook: { result?: ReturnType<typeof usePropertyFilters> } = {}
    function usePropertyFiltersUnderTest() {
      return usePropertyFilters(() => ({
        allPropertyGroups: groups.map((group) => ({ ...group, properties: [...group.properties] })),
        availableProperties: ['x', 'effect:gpu-exposure:fx-1:exposure'],
        initialVisibleGroupIds: ['effects'],
      }))
    }
    render(HookHarness, {
      setup: usePropertyFiltersUnderTest,
      onSetup: (result: unknown) => (hook.result = result as typeof hook.result),
    })
    flushSync()
    const result = hook.result!

    expect(result.visibleGroups).toEqual({ transform: false, effects: true })

    result.toggleVisibleGroup('transform')
    flushSync()
    expect(result.visibleGroups.transform).toBe(true)
  })
})
