<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { SliderInput } from '@/shared/ui/property-controls'
  import {
    DEFAULT_MOTION_GENERATOR_SETTINGS,
    type MotionGeneratorSettings,
  } from '@/features/editor/deps/keyframes'

  let {
    onSettingsChange,
    t,
  }: {
    onSettingsChange: (settings: MotionGeneratorSettings) => void
    t: (key: string, options?: Record<string, unknown>) => string
  } = $props()

  let settings = $state.raw<MotionGeneratorSettings>({ ...DEFAULT_MOTION_GENERATOR_SETTINGS })

  function update(partial: Partial<MotionGeneratorSettings>) {
    const next = { ...settings, ...partial }
    settings = next
    onSettingsChange(next)
  }
</script>

<div class="flex flex-col gap-1.5 rounded-md border border-border/60 bg-secondary/20 p-2">
  <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
    {t('editor.animateStages.presetParameters')}
  </span>
  <span class="text-[9px] leading-snug text-muted-foreground">
    {t('editor.animateStages.presetParametersHint')}
  </span>
  <SliderInput
    label={t('editor.motionGenerator.duration')}
    value={settings.durationScale}
    min={0.25}
    max={3}
    step={0.05}
    formatValue={(value) => `${Math.round(value * 100)}%`}
    onChange={(value) => update({ durationScale: value })}
    onLiveChange={(value) => update({ durationScale: value })}
  />
  <SliderInput
    label={t('editor.motionGenerator.intensity')}
    value={settings.intensityScale}
    min={0}
    max={2}
    step={0.05}
    formatValue={(value) => `${Math.round(value * 100)}%`}
    onChange={(value) => update({ intensityScale: value })}
    onLiveChange={(value) => update({ intensityScale: value })}
  />
  <SliderInput
    label={t('textMotion.stagger')}
    value={settings.staggerFrames}
    min={0}
    max={30}
    step={1}
    formatValue={(value) => `${Math.round(value)}f`}
    onChange={(value) => update({ staggerFrames: Math.round(value) })}
    onLiveChange={(value) => update({ staggerFrames: Math.round(value) })}
  />
</div>
