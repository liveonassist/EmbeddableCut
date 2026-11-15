import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { useSettingsStore } from './settings-store'
import { installSettingsPolicy, isSettingLocked } from './settings-policy'

function persisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem('freecut-settings') ?? '{}').state ?? {}
}

describe('settings policy', () => {
  let remove: (() => void) | null = null

  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults()
    useSettingsStore.getState().setSetting('showWaveforms', false)
  })

  afterEach(() => {
    remove?.()
    remove = null
  })

  it('forces values and refuses changes to locked keys from every action', () => {
    remove = installSettingsPolicy({
      values: { showWaveforms: true, autoSaveInterval: 0 },
      locked: ['showWaveforms', 'hotkeyOverrides'],
    })
    const settings = useSettingsStore.getState()

    settings.setSetting('showWaveforms', false)
    settings.setHotkeyBinding('UNDO', 'mod+u')
    settings.resetToDefaults()
    useSettingsStore.getState().setSetting('autoSaveInterval', 10)

    expect(isSettingLocked('showWaveforms')).toBe(true)
    expect(useSettingsStore.getState()).toMatchObject({
      showWaveforms: true,
      autoSaveInterval: 10,
      hotkeyOverrides: {},
    })
  })

  it('persists the user’s own values while installed and restores them on removal', () => {
    remove = installSettingsPolicy({ values: { showWaveforms: true }, locked: ['showWaveforms'] })
    useSettingsStore.getState().setSetting('snapEnabled', false)

    expect(persisted()).toMatchObject({ showWaveforms: false, snapEnabled: false })

    remove()
    remove = null
    useSettingsStore.getState().setSetting('showWaveforms', true)
    expect(isSettingLocked('showWaveforms')).toBe(false)
    expect(useSettingsStore.getState().showWaveforms).toBe(true)
  })
})
