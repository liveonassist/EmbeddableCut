/**
 * Lazy, once-per-realm bootstrap of onnxruntime-web.
 *
 * The wasm binaries are pulled from a CDN pinned to the exact dev build in `package.json` — a
 * mismatch between the JS glue and the wasm is a silent, confusing failure, so the two move
 * together. `numThreads = 1` because every model run through `getOrt` is already GPU-bound on the
 * WebGPU EP, and its wasm fallback is a correctness net rather than a performance one. Parakeet,
 * which does run on the CPU, loads its own builds and threads them with `getWasmThreadCount`.
 *
 * Worker-safe, and intended to be imported by workers rather than the main thread: each worker
 * bundle gets its own module instance and therefore its own single initialization.
 */

export const ORT_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260410-5e55544225/dist/'

export type OrtModule = typeof import('onnxruntime-web')
export type OrtSession = Awaited<ReturnType<OrtModule['InferenceSession']['create']>>

let ortPromise: Promise<OrtModule> | null = null

export function getOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web').then((module) => {
      module.env.wasm.wasmPaths = ORT_WASM_PATH
      module.env.wasm.numThreads = 1
      return module
    })
  }
  return ortPromise
}

// Parakeet stops getting faster here, and its decoder, many tiny steps, gets slower past it.
const MAX_WASM_THREADS = 8

/**
 * How many threads a model on the CPU should use on this machine: half its logical processors,
 * about its physical (or performance) cores, which leaves the rest for playback. One where the
 * page isn't cross-origin isolated, as threads share memory.
 */
export function getWasmThreadCount(
  environment: { crossOriginIsolated?: boolean; hardwareConcurrency?: number } = {
    crossOriginIsolated: globalThis.crossOriginIsolated,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
  },
): number {
  if (!environment.crossOriginIsolated) return 1
  const cores = Math.floor((environment.hardwareConcurrency ?? 1) / 2)
  return Math.min(MAX_WASM_THREADS, Math.max(1, cores))
}
