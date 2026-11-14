// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'

export const JOIN_INDICATOR_MIN_ZOOM_PPS = 30

const TIMELINE_JOIN_INDICATORS_ENABLED_KEY = Symbol('timeline-join-indicators-enabled')

interface JoinIndicatorsEnabled {
  readonly current: boolean
}

const ALWAYS_ENABLED: JoinIndicatorsEnabled = { current: true }

export function setTimelineJoinIndicatorsEnabled(enabled: JoinIndicatorsEnabled): void {
  setContext(TIMELINE_JOIN_INDICATORS_ENABLED_KEY, enabled)
}

/** Enabled unless a zoom gate above says otherwise, as React's context default. */
export function getTimelineJoinIndicatorsEnabled(): JoinIndicatorsEnabled {
  return (
    getContext<JoinIndicatorsEnabled | undefined>(TIMELINE_JOIN_INDICATORS_ENABLED_KEY) ??
    ALWAYS_ENABLED
  )
}
