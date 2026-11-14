// SPDX-License-Identifier: MIT

/**
 * Adapter exports for timeline hook dependencies.
 * Editor modules should import timeline feature hooks from here.
 */

export { useTimelineShortcuts } from '@/features/timeline/hooks/use-timeline-shortcuts.svelte'
export { useTransitionBreakageNotifications } from '@/features/timeline/hooks/use-transition-breakage-notifications.svelte'
export { useFilmstrip } from '@/features/timeline/hooks/use-filmstrip.svelte'
export type { FilmstripFrame } from '@/features/timeline/hooks/use-filmstrip.svelte'
