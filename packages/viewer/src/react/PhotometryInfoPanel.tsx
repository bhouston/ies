import type { ReactNode } from 'react';
import {
  humanizeUnit,
  humanizeBytes,
  humanizeLuminousFlux,
  humanizeLuminousIntensity,
  humanizeLuminousEfficacy,
  humanizePower,
} from 'humanize-units';
import type { PhotometryDiagnostic, PhotometryInspection } from '@ies-tools/core';
import { declaredColorTemperatures } from '../colorMetadata.js';

/** Validation result shown by {@link PhotometryInfoPanel} and {@link ValidationChecks}. */
export interface PhotometryValidation {
  valid: boolean;
  diagnostics: PhotometryDiagnostic[];
}
/** Props for {@link PhotometryInfoPanel}. */
export interface PhotometryInfoPanelProps {
  /** Result of `inspectPhotometry` from `@ies-tools/core`, or null before a file loads. */
  inspection: PhotometryInspection | null;
  /** Result of `validatePhotometry` from `@ies-tools/core`. */
  validation: PhotometryValidation | null;
  fileName?: string;
  /** Source size in bytes. */
  fileSize?: number;
  /** Parse or inspection failure to display. */
  inspectionError?: string | null;
  /** Viewer failure to display. */
  viewerError?: string | null;
  /** Whether strict validation is enabled. */
  strict?: boolean;
  /** Shows a strict-validation checkbox when provided. */
  onStrictChange?: (value: boolean) => void;
}
const countLabel = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;
const formatOptions = { significantDigits: 4, unitSeparator: ' ', emptyValue: 'Not available' };
const formatters = {
  lm: humanizeLuminousFlux,
  cd: humanizeLuminousIntensity,
  'lm/W': humanizeLuminousEfficacy,
  W: humanizePower,
};
const value = (number: number | null | undefined, unit = ''): string => {
  if (unit in formatters) return formatters[unit as keyof typeof formatters](number, formatOptions);
  return humanizeUnit(number, {
    ...formatOptions,
    units: [{ value: 1, unit }],
    unitSeparator: unit === '°' ? '' : ' ',
    useGrouping: true,
  });
};
const percent = (fraction: number | null): string => value(fraction === null ? null : fraction * 100, '%');
const bytes = (size: number): string => `${humanizeBytes(size, formatOptions)} (UTF-8)`;
// Format numeric temperature declarations while retaining descriptive source text verbatim.
const sourceColor = (text: string): string =>
  /^\d+(?:\.\d+)?$/.test(text.trim())
    ? value(Number(text), 'K')
    : text.replace(/(\d+(?:\.\d+)?)\s*K\b/gi, (_, temperature: string) => value(Number(temperature), 'K'));
const plane = (degrees: number): string => `C${value(degrees, '°')}–C${value((degrees + 180) % 360, '°')}`;
const specified = (text: string | null | undefined): text is string =>
  Boolean(text?.trim() && !/^not specified$/i.test(text.trim()));

function Details({
  title,
  hint,
  children,
  open = false,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group min-w-0 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <svg
          className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="min-w-0 flex-1">{title}</span>
        {hint && <span className="text-right text-xs font-normal text-muted-foreground">{hint}</span>}
      </summary>
      <div className="pt-3 pb-1">{children}</div>
    </details>
  );
}
function Rows({ rows, stacked = false }: { rows: [string, ReactNode][]; stacked?: boolean }) {
  return (
    <dl className="m-0 min-w-0 divide-y divide-border/50">
      {rows.map(([label, content]) => (
        <div
          key={label}
          className={
            stacked
              ? 'min-w-0 space-y-1 py-2 first:pt-0 last:pb-0'
              : 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-baseline gap-x-4 py-2 first:pt-0 last:pb-0'
          }
        >
          <dt className="text-xs leading-relaxed text-muted-foreground">{label}</dt>
          <dd
            className={`m-0 min-w-0 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere] ${stacked ? '' : 'text-right tabular-nums'}`}
          >
            {content}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Metric({
  label,
  content,
  note,
  wide = false,
}: {
  label: string;
  content: ReactNode;
  note: string;
  wide?: boolean;
}) {
  return (
    <div className={`${wide ? 'col-span-2 ' : ''}min-w-0 rounded-lg border border-border/60 bg-muted/30 px-3 py-3`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 mb-0 text-xl leading-tight font-semibold tracking-tight tabular-nums">
        {content}
        <span className="mt-1 block text-[11px] leading-snug font-normal tracking-normal text-muted-foreground">
          {note}
        </span>
      </dd>
    </div>
  );
}
const measurement = (number: number | null, unit: string): ReactNode =>
  number === null ? <span aria-label="Not available">—</span> : value(number, unit);
function validationSummary(validation: PhotometryValidation, strict: boolean) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of validation.diagnostics) counts[diagnostic.severity]++;
  return {
    counts,
    status: validation.valid ? 'Valid' : strict && counts.error === 0 ? 'Fails strict validation' : 'Invalid',
  };
}
/**
 * Validation status and diagnostic list, as shown in {@link PhotometryInfoPanel}.
 *
 * @param props - The validation result and whether strict validation is enabled.
 */
export function ValidationChecks({ validation, strict }: { validation: PhotometryValidation; strict: boolean }) {
  const { counts, status } = validationSummary(validation, strict);
  return (
    <div>
      <output className={`block font-medium ${validation.valid ? 'text-foreground' : 'text-destructive'}`}>
        {status}
      </output>
      <p className="mt-1 mb-0 text-xs text-muted-foreground">
        {countLabel(counts.error, 'error')} · {countLabel(counts.warning, 'warning')} ·{' '}
        {countLabel(counts.info, 'note')}
      </p>
      {validation.diagnostics.length ? (
        <ul className="mt-3 mb-0 list-none space-y-3 p-0" aria-label="Validation diagnostics">
          {validation.diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.code}-${index}`}
              className="space-y-1 border-l-2 border-border pl-3 [overflow-wrap:anywhere]"
            >
              <p className={diagnostic.severity === 'error' ? 'm-0 font-medium text-destructive' : 'm-0 font-medium'}>
                {diagnostic.message}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                {diagnostic.severity} · <code>{diagnostic.code}</code>
              </p>
              {diagnostic.field && <p className="m-0 text-xs text-muted-foreground">Field: {diagnostic.field}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 mb-0 text-muted-foreground">No validation issues.</p>
      )}
    </div>
  );
}

/**
 * Shared React inspection surface: identity and useful lighting metrics precede technical disclosures.
 * Source fields remain distinct from calculated values and renderer defaults.
 *
 * @param props - See {@link PhotometryInfoPanelProps}.
 */
export function PhotometryInfoPanel({
  inspection: info,
  validation,
  fileName,
  fileSize,
  inspectionError,
  viewerError,
  strict = false,
  onStrictChange,
}: PhotometryInfoPanelProps) {
  const lamp =
    info?.sourceFormat === 'ldt'
      ? info.selectedLampSetIndex !== null
        ? info.lampSets[info.selectedLampSetIndex]
        : info.lampSets.length === 1
          ? info.lampSets[0]
          : undefined
      : info?.lampSets[0];
  const color = lamp?.colorTemperature.trim() || declaredColorTemperatures(info?.metadata ?? {}).join(' / ');
  const colorRendering = lamp?.colorRendering.trim() || info?.metadata.CRI?.trim() || info?.metadata._CRI?.trim();
  const advisories =
    info?.diagnostics.filter(
      (item) =>
        !validation?.diagnostics.some(
          (existing) =>
            existing.code === item.code && existing.field === item.field && existing.message === item.message,
        ),
    ) ?? [];
  const check = validation ? validationSummary(validation, strict) : null;
  const title = specified(info?.luminaire) ? info.luminaire : fileName || 'File information';
  const configurationsUnselected =
    info?.sourceFormat === 'ldt' && info.selectedLampSetIndex === null && info.lampSets.length > 1;
  return (
    <div className="min-w-0 space-y-4 font-sans text-[length:var(--vscode-font-size,13px)] leading-relaxed text-foreground [overflow-wrap:anywhere]">
      <div className="space-y-2">
        <p className="m-0 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          File information
        </p>
        <h2 title={title} className="m-0 line-clamp-3 text-base leading-snug font-semibold tracking-tight">
          {title}
        </h2>
        {specified(info?.manufacturer) && <p className="m-0 text-xs text-muted-foreground">{info.manufacturer}</p>}
        {fileName && title !== fileName && <p className="m-0 text-xs text-muted-foreground">{fileName}</p>}
        {!info && fileSize !== undefined && <p className="m-0 text-xs text-muted-foreground">{bytes(fileSize)}</p>}
        {info && (
          <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] text-muted-foreground">
            {[
              info.sourceFormat.toUpperCase(),
              `Type ${info.photometricTypeName}`,
              info.photometry === 'unselected' ? 'No configuration selected' : `${info.photometry} photometry`,
            ].map((label) => (
              <span key={label} className="rounded-md border border-border px-2 py-0.5 capitalize">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      {inspectionError && (
        <p role="alert" className="m-0 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
          {inspectionError}
        </p>
      )}
      {viewerError && (
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
          <p className="m-0 font-medium">3D preview unavailable</p>
          <p role="alert" className="m-0 text-destructive">
            {viewerError}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            Inspection and validation remain available independently of rendering.
          </p>
        </div>
      )}
      {validation && !validation.valid && (
        <p role="alert" className="m-0 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
          {check!.status}. Review the validation details below.
        </p>
      )}
      {info ? (
        <>
          {configurationsUnselected && (
            <p className="m-0 rounded-lg border border-border bg-muted/30 p-3 text-muted-foreground">
              Select an alternative configuration to calculate intensity and flux. Configurations are not summed.
            </p>
          )}
          {!configurationsUnselected && (
            <>
              <section aria-label="Lighting overview">
                <dl className="m-0 grid grid-cols-2 gap-2">
                  <Metric
                    label="Output"
                    content={measurement(info.integratedFluxLumens, 'lm')}
                    note="Integrated luminaire output"
                  />
                  <Metric
                    label="Peak intensity"
                    content={measurement(info.peakCandela, 'cd')}
                    note="Source distribution"
                  />
                  {info.inputWatts !== null && (
                    <Metric label="Power" content={measurement(info.inputWatts, 'W')} note="Declared input power" />
                  )}
                  <Metric
                    label="Beam angle"
                    content={
                      info.beamAngles.some((cut) => cut.beamAngleDegrees !== null) ? (
                        info.beamAngles.map((cut) => (
                          <span key={cut.horizontalDegrees} className="block">
                            {measurement(cut.beamAngleDegrees, '°')}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              {plane(cut.horizontalDegrees)}
                            </span>
                          </span>
                        ))
                      ) : (
                        <span aria-label="Not available">—</span>
                      )
                    }
                    note="Full angles at 50% of each principal plane’s peak"
                  />
                  <Metric
                    wide
                    label="Source"
                    content={
                      <span className="block text-base leading-snug">
                        {specified(info.lightSource) ? info.lightSource : 'Not specified'}
                      </span>
                    }
                    note="Declared light source"
                  />
                </dl>
                {info.metricsUnsupportedReason && (
                  <p className="mt-2 mb-0 text-xs text-muted-foreground">{info.metricsUnsupportedReason}</p>
                )}
              </section>
              <Details title="Light source">
                {specified(info.lightSource) && <p className="mt-0 mb-3">{info.lightSource}</p>}
                <Rows
                  rows={[
                    ...(specified(color) ? [['Color', sourceColor(color)] as [string, ReactNode]] : []),
                    ...(specified(colorRendering) ? [['Color rendering', colorRendering] as [string, ReactNode]] : []),
                    ...(info.lampCount !== null ? [['Lamp count', value(info.lampCount)] as [string, ReactNode]] : []),
                    ...(specified(info.lampCatalog) ? [['Lamp catalog', info.lampCatalog] as [string, ReactNode]] : []),
                  ]}
                />
                {!specified(info.lightSource) &&
                  !specified(color) &&
                  !specified(colorRendering) &&
                  info.lampCount === null &&
                  !specified(info.lampCatalog) && (
                    <p className="m-0 text-xs text-muted-foreground">No light source details specified.</p>
                  )}
              </Details>
            </>
          )}
          {info.beamAngles.length > 0 && (
            <Details
              title="Beam & field"
              open={info.beamAngles.some((cut) => cut.beamAngleDegrees !== null || cut.fieldAngleDegrees !== null)}
              hint={
                info.beamAngles.every((cut) => cut.beamAngleDegrees === null && cut.fieldAngleDegrees === null)
                  ? 'Widths unavailable'
                  : undefined
              }
            >
              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse text-right text-xs tabular-nums"
                  aria-label="Beam and field angles"
                >
                  <thead>
                    <tr className="text-muted-foreground">
                      <th scope="col" className="pb-2 text-left font-normal">
                        Plane
                      </th>
                      <th scope="col" className="pb-2 pl-2 font-normal">
                        Beam (50%)
                      </th>
                      <th scope="col" className="pb-2 pl-2 font-normal">
                        Field (10%)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.beamAngles.map((cut) => (
                      <tr key={cut.horizontalDegrees} className="border-t border-border/50">
                        <th scope="row" className="py-2 text-left font-normal">
                          {plane(cut.horizontalDegrees)}
                        </th>
                        <td className="py-2 pl-2">
                          {cut.beamAngleDegrees === null ? '—' : value(cut.beamAngleDegrees, '°')}
                        </td>
                        <td className="py-2 pl-2">
                          {cut.fieldAngleDegrees === null ? '—' : value(cut.fieldAngleDegrees, '°')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 mb-0 text-[11px] text-muted-foreground">
                Estimated widths at 50% and 10% of each plane’s peak. Missing crossings are shown as —; details are in
                Distribution.
              </p>
            </Details>
          )}
        </>
      ) : (
        <p className="m-0 text-muted-foreground">
          No current inspection data. Correct the source to display its details.
        </p>
      )}
      <Details
        title="Validation"
        open={Boolean(validation && !validation.valid)}
        hint={
          check && (
            <span className={validation!.valid ? '' : 'text-destructive'}>
              {check.status}
              {check.counts.error > 0
                ? ` · ${countLabel(check.counts.error, 'error')}`
                : check.counts.warning > 0
                  ? ` · ${countLabel(check.counts.warning, 'warning')}`
                  : check.counts.info > 0
                    ? ` · ${countLabel(check.counts.info, 'note')}`
                    : ''}
            </span>
          )
        }
      >
        {onStrictChange && (
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={strict}
              className="size-3.5 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => onStrictChange(event.target.checked)}
            />
            Strict validation
          </label>
        )}
        {validation ? (
          <ValidationChecks validation={validation} strict={strict} />
        ) : (
          <p className="m-0 text-muted-foreground">
            {info ? 'Validation results not provided.' : 'Waiting for a photometric file.'}
          </p>
        )}
      </Details>
      {advisories.length > 0 && (
        <Details
          title="Inspection advisories"
          hint={String(advisories.length)}
          open={advisories.some((item) => item.severity === 'error')}
        >
          <ul className="m-0 list-none space-y-3 p-0">
            {advisories.map((item, index) => (
              <li key={index} className="space-y-1 border-l-2 border-border pl-3">
                <p className="m-0 font-medium">{item.message}</p>
                <p className="m-0 text-xs text-muted-foreground">
                  {item.severity} · <code>{item.code}</code>
                </p>
                {item.field && <p className="m-0 text-xs text-muted-foreground">Field: {item.field}</p>}
              </li>
            ))}
          </ul>
        </Details>
      )}
      {info && (
        <>
          {info.lampSets.length > 1 && (
            <Details
              title={`Lamp configurations (${info.lampSets.length})`}
              open={configurationsUnselected}
              hint={info.selectedLampSetIndex === null ? 'Choose one' : `#${info.selectedLampSetIndex + 1} selected`}
            >
              <p className="mt-0 mb-3 text-xs text-muted-foreground">
                Alternative configurations, not a combined lamp count.
              </p>
              <ul className="m-0 list-none space-y-4 p-0">
                {info.lampSets.map((set, index) => (
                  <li key={index} className="space-y-2">
                    <h3 className="m-0 font-medium">
                      {index + 1}. {set.description || 'Lamp configuration'}
                      {info.selectedLampSetIndex === index ? ' (selected)' : ''}
                    </h3>
                    <Rows
                      rows={[
                        ['Count', Math.abs(set.lampCount)],
                        [
                          set.lampCount < 0 ? 'Declared luminaire flux' : 'Reference lamp flux',
                          value(set.totalLumens, 'lm'),
                        ],
                        ['Power', value(set.watts, 'W')],
                        ...(specified(set.colorTemperature)
                          ? [['Color', sourceColor(set.colorTemperature)] as [string, ReactNode]]
                          : []),
                        ...(specified(set.colorRendering)
                          ? [['Color rendering', set.colorRendering] as [string, ReactNode]]
                          : []),
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </Details>
          )}
          <Details title="Flux & efficiency">
            <Rows
              rows={[
                ['Declared lamp flux', value(info.declaredLampFluxLumens, 'lm')],
                ['Declared luminaire flux', value(info.declaredLuminaireFluxLumens, 'lm')],
                ['Integrated luminaire flux', value(info.integratedFluxLumens, 'lm')],
                ['Integrated efficacy', value(info.luminousEfficacyLumensPerWatt, 'lm/W')],
                [
                  'Lumens per lamp',
                  info.lumensPerLamp === -1 ? 'Not specified (absolute photometry)' : value(info.lumensPerLamp, 'lm'),
                ],
              ]}
            />
            <p className="mt-3 mb-0 text-xs text-muted-foreground">
              Integrated values are estimates from the angular table. Declared lamp ratings are distinct from measured
              luminaire output.
            </p>
          </Details>
          {info.metricsSupported && (
            <Details
              title="Distribution"
              hint={info.downwardFluxFraction === null ? undefined : `${percent(info.downwardFluxFraction)} down`}
            >
              <Rows
                rows={[
                  ['Downward flux', value(info.downwardFluxLumens, 'lm')],
                  ['Upward flux', value(info.upwardFluxLumens, 'lm')],
                  ['Downward flux fraction', percent(info.downwardFluxFraction)],
                  [
                    'Light output ratio',
                    info.lightOutputRatio === null
                      ? 'Not available (no declared lamp flux)'
                      : `${info.lightOutputRatio.toFixed(3)} (DLOR ${info.downwardLightOutputRatio!.toFixed(3)} / ULOR ${info.upwardLightOutputRatio!.toFixed(3)})`,
                  ],
                  ['CIE flux code', info.cieFluxCode?.map((n) => n ?? '—').join(' ') ?? 'Not available'],
                  [
                    'Peak intensity (tilt applied)',
                    info.peakDirection
                      ? `${value(info.peakIntensityCandela, 'cd')} at C${value(info.peakDirection.horizontalDegrees, '°')} γ${value(info.peakDirection.verticalDegrees, '°')}`
                      : 'Not available',
                  ],
                  ['Nadir intensity', value(info.nadirCandela, 'cd')],
                  ['Metrics lamp tilt', value(info.metricsTiltDegrees, '°')],
                ]}
              />
              {info.beamAngles.map((cut) => (
                <div key={cut.horizontalDegrees} className="mt-4 space-y-3">
                  <h3 className="m-0 text-xs font-medium">{plane(cut.horizontalDegrees)} estimates</h3>
                  <Rows
                    rows={[
                      [
                        'Beam angle (50%)',
                        cut.beamAngleDegrees === null
                          ? `Not available (${cut.beamAngleStatus})`
                          : value(cut.beamAngleDegrees, '°'),
                      ],
                      [
                        'Field angle (10%)',
                        cut.fieldAngleDegrees === null
                          ? `Not available (${cut.fieldAngleStatus})`
                          : value(cut.fieldAngleDegrees, '°'),
                      ],
                      ['Peak direction', value(cut.peakDirectionDegrees, '°')],
                      ['Cut peak', value(cut.peakCandela, 'cd')],
                    ]}
                  />
                </div>
              ))}
            </Details>
          )}
          {info.zonalLumens && (
            <Details title="Zonal lumens">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right text-xs tabular-nums" aria-label="Zonal lumens">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-2 text-left font-normal">
                        Zone
                      </th>
                      <th scope="col" className="pb-2 pl-2 font-normal">
                        lm
                      </th>
                      <th scope="col" className="pb-2 pl-2 font-normal">
                        % lamp
                      </th>
                      <th scope="col" className="pb-2 pl-2 font-normal">
                        % luminaire
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.zonalLumens.map((zone) => (
                      <tr key={`${zone.fromDegrees}-${zone.toDegrees}`} className="border-t border-border/50">
                        <th scope="row" className="py-2 text-left font-normal">
                          {value(zone.fromDegrees, '°')}–{value(zone.toDegrees, '°')}
                        </th>
                        <td className="py-2 pl-2">{value(zone.lumens, 'lm')}</td>
                        <td className="py-2 pl-2">
                          {zone.percentOfLamp === null ? '—' : value(zone.percentOfLamp, '%')}
                        </td>
                        <td className="py-2 pl-2">
                          {zone.percentOfLuminaire === null ? '—' : value(zone.percentOfLuminaire, '%')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Details>
          )}
          <Details title="File & geometry" hint={`${info.verticalAngles} × ${info.horizontalAngles} angles`}>
            <Rows
              rows={[
                ...(fileName ? [['File', fileName] as [string, ReactNode]] : []),
                ...(fileSize !== undefined ? [['Source size', bytes(fileSize)] as [string, ReactNode]] : []),
                ['Format', info.format],
                ['Version', info.version],
                ['Coordinates', `Type ${info.photometricTypeName} (${info.photometricType})`],
                ['Photometry', info.photometry],
                ['Vertical angles', info.verticalAngles],
                ['Horizontal angles', info.horizontalAngles],
                ['Width', value(info.dimensions.width, info.units === 'feet' ? 'ft' : 'm')],
                ['Length', value(info.dimensions.length, info.units === 'feet' ? 'ft' : 'm')],
                ['Height', value(info.dimensions.height, info.units === 'feet' ? 'ft' : 'm')],
                ['Lamp TILT correction', info.hasTilt ? 'Embedded curve' : 'None'],
                [
                  'File generation type',
                  info.fileGenerationType === null
                    ? 'Not specified'
                    : `${info.fileGenerationType.toFixed(5)} (provenance)`,
                ],
              ]}
            />
          </Details>
          <Details title="Raw metadata" hint={String(Object.keys(info.metadata).length)}>
            {Object.keys(info.metadata).length ? (
              <Rows rows={Object.entries(info.metadata)} stacked />
            ) : (
              <p className="m-0 text-xs text-muted-foreground">No metadata specified.</p>
            )}
          </Details>
        </>
      )}
    </div>
  );
}
