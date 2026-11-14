// SPDX-License-Identifier: MIT

export type SplashStatus =
  | { kind: 'initializing' }
  | { kind: 'unavailable' }
  | { kind: 'pick' }
  | { kind: 'reconnect'; handleName: string }

export type GateStatus =
  | { kind: 'initializing' }
  | { kind: 'unavailable' } // Non-Chromium browsers
  | { kind: 'pick' } // No saved handle
  | { kind: 'reconnect'; handleName: string } // Saved handle, permission revoked
  | { kind: 'ready' }
