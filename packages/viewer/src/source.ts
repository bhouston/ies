import { parsePhotometry, toPhotometricDocument, type IESProfile, type PhotometricDocument } from 'ies-core';

export type PhotometryFormat = 'ies' | 'ldt';
export interface PhotometrySource {
  /** Native-source document takes precedence and avoids serializing/reparsing. */
  document?: PhotometricDocument;
  profile?: IESProfile;
  text?: string;
  /** Compatibility alias for text. */
  iesText?: string;
  src?: string;
  format?: PhotometryFormat;
  /** Zero-based LDT alternative lamp configuration; required for multiple lamp sets. */
  lampSetIndex?: number;
}
export interface PhotometryLoadInfo {
  document: PhotometricDocument;
  sourceFormat: PhotometryFormat;
}
export type PhotometryFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

export function parseLampSetIndex(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new RangeError('lamp-set-index must be a nonnegative integer (zero-based)');
  }
  return Number(value);
}

/** Shared source selection and stale-request control. It performs no rendering and needs no GPU. */
export function createPhotometrySourceLoader(fetcher: PhotometryFetch = (url, init) => fetch(url, init)) {
  let revision = 0;
  let request: AbortController | undefined;
  const cancel = (): void => {
    ++revision;
    request?.abort();
    request = undefined;
  };
  return {
    cancel,
    async load(source: PhotometrySource): Promise<PhotometricDocument | undefined> {
      cancel();
      const current = revision;
      const controller = new AbortController();
      request = controller;
      try {
        // Let same-turn source changes cancel even in-memory parsing before publishing a result.
        await Promise.resolve();
        if (controller.signal.aborted || current !== revision) return undefined;
        if (source.format !== undefined && source.format !== 'ies' && source.format !== 'ldt') {
          throw new Error('Photometric format must be ies or ldt');
        }
        if (
          source.lampSetIndex !== undefined &&
          (!Number.isSafeInteger(source.lampSetIndex) || source.lampSetIndex < 0)
        ) {
          throw new RangeError('Lamp-set index must be a nonnegative integer (zero-based)');
        }
        if (source.document) return source.document;
        if (source.profile) return toPhotometricDocument(source.profile);
        let text = source.text ?? source.iesText;
        if (text === undefined && source.src) {
          const response = await fetcher(source.src, { signal: controller.signal });
          if (!response.ok) throw new Error(`Failed to load photometry: HTTP ${response.status}`);
          text = await response.text();
        }
        if (controller.signal.aborted || current !== revision || text === undefined) return undefined;
        return parsePhotometry(text, source.format, { lampSetIndex: source.lampSetIndex });
      } catch (error) {
        if (controller.signal.aborted || current !== revision) return undefined;
        throw error;
      }
    },
  };
}
