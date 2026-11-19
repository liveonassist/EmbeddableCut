// SPDX-License-Identifier: MIT

export {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  portTransport,
  stringTransport,
  type BinaryResult,
  type BridgeActionEvent,
  type BridgeActionName,
  type BridgeActions,
  type BridgeEvent,
  type BridgeMethod,
  type BridgeMethods,
  type BridgeTransport,
  type ProjectSummary,
} from './protocol'
export {
  acceptFrameConnection,
  serveBridge,
  type ActionDispatch,
  type ServeBridgeOptions,
} from './guest'
export { BridgeError, RemoteEditor, connectToFrame } from './host'
