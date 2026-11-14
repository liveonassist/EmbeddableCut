// SPDX-License-Identifier: MIT

/**
 * The hotkey editor's two motion/react animations: the selected-command
 * panel's blocks expanding and collapsing, and the command list's height
 * following its content on a spring.
 */

import type { TransitionConfig } from 'svelte/transition'
import { cubicBezier } from '@/shared/utils/easing'

const COLLAPSE_EASE = { x1: 0.22, y1: 1, x2: 0.36, y2: 1 }

/**
 * Height and opacity from nothing to the block's natural size, as the React
 * editor's `CollapseBlock` (200ms, ease [0.22, 1, 0.36, 1]). Reduced motion
 * swaps it in and out instantly.
 */
export function collapse(node: HTMLElement, { reduce }: { reduce: boolean }): TransitionConfig {
  if (reduce) return { duration: 0 }
  const height = node.offsetHeight
  return {
    duration: 200,
    easing: (t) => cubicBezier(t, COLLAPSE_EASE),
    css: (t) => `overflow: hidden; height: ${t * height}px; opacity: ${t};`,
  }
}

interface SpringOptions {
  stiffness: number
  damping: number
  mass: number
}

/**
 * A value that follows its target on a damped spring with motion's physical
 * parameters (stiffness, damping, mass), or jumps when told to.
 */
export class SpringValue {
  current = $state<number | undefined>(undefined)
  private velocity = 0
  private target: number | undefined = undefined
  private frame: number | null = null
  private last = 0

  constructor(private readonly options: SpringOptions) {}

  set(target: number | undefined, { instant = false } = {}): void {
    this.target = target
    if (target === undefined || instant || this.current === undefined) {
      this.stop()
      this.current = target
      this.velocity = 0
      return
    }
    if (this.frame === null) {
      this.last = performance.now()
      this.frame = requestAnimationFrame(this.step)
    }
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }

  private step = (now: number) => {
    const target = this.target
    const value = this.current
    if (target === undefined || value === undefined) {
      this.frame = null
      return
    }
    const { stiffness, damping, mass } = this.options
    // Integrate in small steps so a long frame can't blow up the spring.
    let remaining = Math.min(0.064, (now - this.last) / 1000)
    this.last = now
    let position = value
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 240)
      const acceleration = (-stiffness * (position - target) - damping * this.velocity) / mass
      this.velocity += acceleration * dt
      position += this.velocity * dt
      remaining -= dt
    }
    if (Math.abs(position - target) < 0.5 && Math.abs(this.velocity) < 5) {
      this.current = target
      this.velocity = 0
      this.frame = null
      return
    }
    this.current = position
    this.frame = requestAnimationFrame(this.step)
  }
}
