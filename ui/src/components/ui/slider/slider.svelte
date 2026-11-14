<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Slider as SliderPrimitive } from 'bits-ui'
  import { cn } from '$lib/cn'

  /** Radix's Slider: `value`/`defaultValue` are arrays, one thumb per the kit. */
  type Props = Omit<
    SliderPrimitive.RootProps,
    'type' | 'value' | 'onValueChange' | 'onValueCommit' | 'children'
  > & {
    value?: number[]
    defaultValue?: number[]
    onValueChange?: (value: number[]) => void
    onValueCommit?: (value: number[]) => void
  }

  let {
    ref = $bindable(null),
    value = $bindable(),
    defaultValue,
    onValueChange,
    onValueCommit,
    class: className,
    ...rest
  }: Props = $props()

  // svelte-ignore state_referenced_locally
  if (value === undefined) value = defaultValue ?? [rest.min ?? 0]

  // bits-ui snaps a value that's off its step grid and reports the snap as a
  // change; Radix leaves a controlled value as given. A value set from outside
  // (an audio player's progress, say) isn't the user's change: reporting it
  // made such a slider seek its media on every time update. So the value goes
  // to bits-ui already on the grid, built as bits-ui builds it.
  const decimals = (n: number) =>
    Number.isInteger(n) ? 0 : (n.toString().split('.')[1]?.length ?? 0)

  function snap(v: number): number {
    const min = rest.min ?? 0
    const max = rest.max ?? 100
    const step = rest.step ?? 1
    if (Array.isArray(step)) {
      const steps = step.filter((s) => s >= min && s <= max)
      return steps.reduce(
        (best, s) => (Math.abs(v - s) < Math.abs(v - best) ? s : best),
        steps[0] ?? v,
      )
    }
    if (!(step > 0) || !Number.isFinite(v)) return v
    const factor = 10 ** decimals(step)
    const divisible = Math.round((max - min) * factor) % Math.round(step * factor) === 0
    const last = Math.ceil((max - min) / step) - (divisible ? 0 : 1)
    const index = Math.min(Math.max(Math.round((v - min) / step), 0), last)
    return Math.round((min + index * step) * factor) / factor
  }
</script>

<SliderPrimitive.Root
  bind:ref
  type="multiple"
  bind:value={
    () => (value ?? []).map(snap),
    (next) => {
      value = next
      onValueChange?.(next)
    }
  }
  {onValueCommit}
  class={cn('relative flex w-full touch-none select-none items-center', className)}
  {...rest}
>
  <!-- bits-ui has no Track part; this is Radix's. -->
  <span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
    <SliderPrimitive.Range class="absolute h-full bg-primary" />
  </span>
  <SliderPrimitive.Thumb
    index={0}
    class="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
  />
</SliderPrimitive.Root>
