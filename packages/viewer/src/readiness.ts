import type { LightViewerCaptureOptions, LightViewerController } from './viewer.js';

const notConnected = () => settled(Promise.reject(new Error('The viewer is not connected to a document')));

/**
 * Readiness and capture shared by `<light-viewer>` and the React `LightViewer`. The host marks loads with
 * {@link pending}/{@link finish}, and reports a new viewer with {@link attach} and teardown with {@link disconnect}.
 */
export class ViewerReadiness {
  /** Settles when the latest load settles; replaced by every load, so a superseded load never settles a waiter. */
  #ready = notConnected();
  #settle?: (error?: unknown) => void;
  #viewer?: LightViewerController;
  /** Whether a load is in progress. */
  get loading(): boolean {
    return this.#settle !== undefined;
  }
  async whenReady(): Promise<void> {
    let ready: Promise<void>;
    do {
      ready = this.#ready;
      await ready;
    } while (ready !== this.#ready);
    if (this.#viewer?.renderer.getContext().isContextLost()) throw new Error('The WebGL context was lost');
  }
  async toBlob(options?: LightViewerCaptureOptions): Promise<Blob> {
    await this.whenReady();
    const viewer = this.#viewer;
    if (!viewer) throw new Error('The viewer is not connected to a document');
    return viewer.capture(options);
  }
  /** Start waiting for a load. A superseded load resolves its promise so waiters move on to the new one. */
  pending(): void {
    let settle!: (error?: unknown) => void;
    const next = new Promise<void>((resolve, reject) => {
      settle = (error) => (error === undefined ? resolve() : reject(error));
    });
    this.#settle?.();
    this.#settle = settle;
    this.#ready = settled(next);
  }
  finish(error?: unknown): void {
    this.#settle?.(error);
    this.#settle = undefined;
  }
  /** Capture from a newly created viewer, and reject the current waiters if it loses its WebGL context. */
  attach(viewer: LightViewerController): void {
    this.#viewer = viewer;
    viewer.renderer.domElement.addEventListener('webglcontextlost', () =>
      this.finish(new Error('The WebGL context was lost')),
    );
  }
  disconnect(): void {
    this.finish(new Error('The viewer was disconnected'));
    this.#ready = notConnected();
    this.#viewer = undefined;
  }
}

/** Mark a stored promise handled, so an unawaited rejection is not reported; awaiting it still rejects. */
function settled(promise: Promise<void>): Promise<void> {
  promise.catch(() => {});
  return promise;
}
