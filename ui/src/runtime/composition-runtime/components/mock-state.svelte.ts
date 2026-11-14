// SPDX-License-Identifier: MIT

/**
 * Test helper: a reactive box for mocked hook results. React tests re-render
 * after changing a mock's value; a component reading a box re-runs on its own
 * when the test assigns `current`.
 */
export function mockState<T>(initial: T): { current: T } {
  let current = $state(initial)
  return {
    get current() {
      return current
    },
    set current(value: T) {
      current = value
    },
  }
}
