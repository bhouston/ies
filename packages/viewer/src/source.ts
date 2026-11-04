import {
  LampSetSelectionError,
  parsePhotometry,
  toPhotometricDocument,
  type IESProfile,
  type PhotometricDocument,
} from '@ies-tools/core';

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
          if (/^file:/i.test(source.src)) {
            throw new Error(
              'A file:// URL cannot be loaded by this viewer. Serve the file over HTTP(S), or read a local file with file.text() and pass photometryText (HTML element) or text (React).',
            );
          }
          let response: Awaited<ReturnType<PhotometryFetch>>;
          try {
            response = await fetcher(source.src, { signal: controller.signal });
          } catch (cause) {
            throw new Error(
              `Could not fetch photometry from ${source.src}. Check your connection and that the URL is reachable. The browser may also block cross-origin requests: the file server must allow this page's origin through CORS. Serve the file from the same origin, or read a local file with file.text() and pass photometryText (HTML element) or text (React).`,
              { cause },
            );
          }
          if (!response.ok) {
            const action =
              response.status === 404
                ? 'Check the source URL and deploy the .ies or .ldt file at that path.'
                : response.status === 401 || response.status === 403
                  ? 'The file server denied access. Check authentication and permissions, or serve an accessible copy of the file.'
                  : response.status >= 500
                    ? 'The file server failed to respond successfully. Retry later or serve the file from another location.'
                    : 'Check the source URL and the file server response.';
            throw new Error(`Failed to load photometry: HTTP ${response.status}. ${action}`);
          }
          try {
            text = await response.text();
          } catch (cause) {
            throw new Error(
              `Could not finish reading photometry from ${source.src}. Check your connection and retry the request.`,
              { cause },
            );
          }
        }
        if (controller.signal.aborted || current !== revision || text === undefined) return undefined;
        if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(text)) {
          throw new Error(
            'The source contains HTML instead of IES or EULUMDAT photometry. Check that the source URL returns the .ies or .ldt file itself, rather than an application fallback or sign-in page.',
          );
        }
        try {
          return parsePhotometry(text, source.format, { lampSetIndex: source.lampSetIndex });
        } catch (cause) {
          if (cause instanceof LampSetSelectionError) {
            throw new Error(
              `This LDT file has ${cause.lampSetCount} alternative lamp configurations. Choose one in the configuration selector if available, or set lamp-set-index (HTML) / lampSetIndex (JavaScript) to an integer from 0 to ${cause.lampSetCount - 1}. Configurations are alternatives and are not summed.`,
              { cause },
            );
          }
          throw cause;
        }
      } catch (error) {
        if (controller.signal.aborted || current !== revision) return undefined;
        throw error;
      }
    },
  };
}
