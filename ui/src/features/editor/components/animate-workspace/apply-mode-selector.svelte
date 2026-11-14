<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { MotionApplyMode } from './types'

  const APPLY_MODES: readonly MotionApplyMode[] = ['replace', 'merge', 'layer']

  interface ApplyModeSelectorProps {
    mode: MotionApplyMode
    onChange: (mode: MotionApplyMode) => void
    t: (key: string, options?: Record<string, unknown>) => string
  }
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  /** Replace / merge / layer switch for keyframe-preset applications. */
  let { mode, onChange, t }: ApplyModeSelectorProps = $props()
</script>

<div class="flex items-center justify-between gap-2">
  <span class="text-[10px] text-muted-foreground">{t('editor.animateStages.onApply')}</span>
  <div class="inline-flex overflow-hidden rounded-md border border-border/60">
    {#each APPLY_MODES as candidate (candidate)}
      <button
        type="button"
        aria-pressed={mode === candidate}
        onclick={() => onChange(candidate)}
        class={cn(
          'px-2 py-0.5 text-[10px] font-medium',
          mode === candidate ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/40',
        )}
      >
        {t(`editor.animateStages.applyMode.${candidate}`)}
      </button>
    {/each}
  </div>
</div>
