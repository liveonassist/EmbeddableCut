// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import * as keyframeEditorsUi from './keyframe-editors-ui'

describe('keyframe editor UI adapter', () => {
  it('loads the lazy timeline panels’ editor components', () => {
    expect(keyframeEditorsUi.DopesheetEditor).toBeDefined()
  })
})
