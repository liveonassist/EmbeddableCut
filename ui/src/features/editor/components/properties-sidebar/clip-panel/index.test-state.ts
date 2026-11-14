// SPDX-License-Identifier: MIT

/** What the clip panel test's layout stub records, shared between the stub and the test. */
export const clipPanelTestState = {
  layoutRenderCount: 0,
  latestLayoutItemId: null as string | null,
  latestLayoutX: null as number | null,
  nextIdleCallbackId: 1,
  idleCallbacks: new Map<number, IdleRequestCallback>(),
}
