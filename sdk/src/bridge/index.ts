// SPDX-License-Identifier: MIT

export {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  portTransport,
  stringTransport,
  type BinaryResult,
  type BridgeEvent,
  type BridgeMethod,
  type BridgeMethods,
  type BridgeTransport,
  type ProjectSummary,
} from './protocol'
export { acceptFrameConnection, serveBridge, type ServeBridgeOptions } from './guest'
export { BridgeError, RemoteEditor, connectToFrame } from './host'
