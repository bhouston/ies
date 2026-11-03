import type { ReactNode } from 'react';
import type { PhotometryDiagnostic, PhotometryInspection } from '@ies-tools/core';

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
const value = (number: number | null | undefined, unit = ''): string =>
  number === null || number === undefined
    ? 'Not available'
    : `${Number(number.toPrecision(7))}${unit ? ` ${unit}` : ''}`;
const percent = (fraction: number | null): string =>
  fraction === null ? 'Not available' : `${(fraction * 100).toFixed(1)} %`;
function Details({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-border bg-card p-3">
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-3 gap-y-2">
      {rows.map(([label, content]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{content}</dd>
        </div>
      ))}
    </dl>
  );
}
/**
 * Validation status and diagnostic list, as shown in {@link PhotometryInfoPanel}.
 *
 * @param props - The validation result and whether strict validation is enabled.
 */
export function ValidationChecks({ validation, strict }: { validation: PhotometryValidation; strict: boolean }) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of validation.diagnostics) counts[diagnostic.severity]++;
  const status = validation.valid ? 'Valid' : strict && counts.error === 0 ? 'Fails strict validation' : 'Invalid';
  return (
    <div>
      <output className={`block font-semibold ${validation.valid ? 'text-foreground' : 'text-destructive'}`}>
        {status}
      </output>
      <p className="mt-1 text-muted-foreground">
        {counts.error} errors · {counts.warning} warnings · {counts.info} informational
      </p>
      {validation.diagnostics.length ? (
        <ul className="mt-3 space-y-3" aria-label="Validation diagnostics">
          {validation.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`} className="[overflow-wrap:anywhere]">
              <p className={diagnostic.severity === 'error' ? 'font-medium text-destructive' : 'font-medium'}>
                {diagnostic.severity} · {diagnostic.code}
              </p>
              {diagnostic.field && <p className="text-muted-foreground">Field: {diagnostic.field}</p>}
              <p className="whitespace-pre-wrap">{diagnostic.message}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted-foreground">No validation issues.</p>
      )}
    </div>
  );
}

/**
 * Shared React inspection surface: the data is the same model consumed by the CLI.
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
  return (
    <div className="space-y-3 text-sm [overflow-wrap:anywhere]">
      <h2 className="text-base font-semibold">File information</h2>
      {fileName || fileSize !== undefined ? (
        <Rows
          rows={[
            ...(fileName ? [['File', fileName] as [string, ReactNode]] : []),
            ...(fileSize !== undefined ? [['Source size', `${fileSize} bytes (UTF-8)`] as [string, ReactNode]] : []),
          ]}
        />
      ) : null}
      <Details title="Validation">
        {onStrictChange && (
          <label className="mb-3 flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={strict} onChange={(event) => onStrictChange(event.target.checked)} />
            Strict validation
          </label>
        )}
        {validation ? (
          <ValidationChecks validation={validation} strict={strict} />
        ) : (
          <p className="text-muted-foreground">Waiting for a photometric file.</p>
        )}
      </Details>
      {inspectionError && (
        <p role="alert" className="rounded-lg border border-border p-3 text-destructive">
          {inspectionError}
        </p>
      )}
      {viewerError && (
        <Details title="3D preview">
          <p role="alert" className="text-destructive">
            {viewerError}
          </p>
          <p className="mt-2 text-muted-foreground">
            Inspection and validation remain available independently of rendering.
          </p>
        </Details>
      )}
      {info ? (
        <>
          {info.diagnostics.some(
            (item) =>
              !validation?.diagnostics.some(
                (existing) =>
                  existing.code === item.code && existing.field === item.field && existing.message === item.message,
              ),
          ) && (
            <Details title="Inspection advisories">
              <ul className="space-y-3">
                {info.diagnostics
                  .filter(
                    (item) =>
                      !validation?.diagnostics.some(
                        (existing) =>
                          existing.code === item.code &&
                          existing.field === item.field &&
                          existing.message === item.message,
                      ),
                  )
                  .map((item, index) => (
                    <li key={index}>
                      <p className="font-medium">
                        {item.severity} · {item.code}
                      </p>
                      {item.field && <p className="text-muted-foreground">Field: {item.field}</p>}
                      <p>{item.message}</p>
                    </li>
                  ))}
              </ul>
            </Details>
          )}
          <Details title="Photometric source">
            <Rows
              rows={[
                ['Format', info.format],
                ['Version', info.version],
                ['Coordinates', `Type ${info.photometricTypeName} (${info.photometricType})`],
                ['Photometry', info.photometry],
                ['Manufacturer', info.manufacturer],
                ['Luminaire', info.luminaire],
                ['Light source', info.lightSource],
                ['Lamp catalog', info.lampCatalog],
                ['Lamp count', value(info.lampCount)],
                [
                  'Lumens per lamp',
                  info.lumensPerLamp === -1 ? 'Not specified (absolute photometry)' : value(info.lumensPerLamp, 'lm'),
                ],
                ['Input power', value(info.inputWatts, 'W')],
                ['Peak intensity', value(info.peakCandela, 'cd')],
              ]}
            />
          </Details>
          <Details title="Calculated photometry">
            <Rows
              rows={[
                ['Declared lamp flux', value(info.declaredLampFluxLumens, 'lm')],
                ['Declared luminaire flux', value(info.declaredLuminaireFluxLumens, 'lm')],
                ['Integrated luminaire flux', value(info.integratedFluxLumens, 'lm')],
                ['Integrated efficacy', value(info.luminousEfficacyLumensPerWatt, 'lm/W')],
                ['Metrics lamp tilt', value(info.metricsTiltDegrees, '°')],
                ...(info.metricsSupported
                  ? ([
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
                          ? `${value(info.peakIntensityCandela, 'cd')} at C${info.peakDirection.horizontalDegrees}° γ${info.peakDirection.verticalDegrees}°`
                          : 'Not available',
                      ],
                      ['Nadir intensity', value(info.nadirCandela, 'cd')],
                    ] as [string, ReactNode][])
                  : []),
              ]}
            />
            <p className="mt-3 text-muted-foreground">
              Integrated values are estimates from the angular table. Declared lamp ratings are distinct from measured
              luminaire output.
            </p>
            {info.metricsUnsupportedReason && (
              <p className="mt-2 text-muted-foreground">{info.metricsUnsupportedReason}</p>
            )}
            {info.beamAngles.map((cut) => (
              <div key={cut.horizontalDegrees} className="mt-3 border-t border-border pt-3">
                <h3 className="mb-2 font-medium">
                  C{cut.horizontalDegrees}–C{(cut.horizontalDegrees + 180) % 360} estimates
                </h3>
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
          {info.zonalLumens && (
            <Details title="Zonal lumens" open={false}>
              <table className="w-full text-right tabular-nums">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">Zone</th>
                    <th className="font-normal">lm</th>
                    <th className="font-normal">% lamp</th>
                    <th className="font-normal">% luminaire</th>
                  </tr>
                </thead>
                <tbody>
                  {info.zonalLumens.map((zone) => (
                    <tr key={`${zone.fromDegrees}-${zone.toDegrees}`}>
                      <td className="text-left">
                        {zone.fromDegrees}–{zone.toDegrees}°
                      </td>
                      <td>{zone.lumens.toFixed(1)}</td>
                      <td>{zone.percentOfLamp === null ? '—' : zone.percentOfLamp.toFixed(1)}</td>
                      <td>{zone.percentOfLuminaire === null ? '—' : zone.percentOfLuminaire.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Details>
          )}
          <Details title="Angular data and geometry" open={false}>
            <Rows
              rows={[
                ['Vertical angles', info.verticalAngles],
                ['Horizontal angles', info.horizontalAngles],
                ['Width', value(info.dimensions.width, info.units)],
                ['Length', value(info.dimensions.length, info.units)],
                ['Height', value(info.dimensions.height, info.units)],
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
          <Details title={`Lamp configurations (${info.lampSets.length})`} open={info.sourceFormat === 'ldt'}>
            {info.sourceFormat === 'ldt' && info.selectedLampSetIndex === null && info.lampSets.length > 1 && (
              <p className="mb-3 text-muted-foreground">
                Select an alternative configuration to calculate intensity and flux. Configurations are not summed.
              </p>
            )}
            <ul className="space-y-3">
              {info.lampSets.map((set, index) => (
                <li key={index}>
                  <h3 className="font-medium">
                    {index + 1}. {set.description || 'Lamp configuration'}
                    {info.selectedLampSetIndex === index ? ' (selected)' : ''}
                  </h3>
                  <Rows
                    rows={[
                      ['Count', set.lampCount],
                      ['Reference flux', value(set.totalLumens, 'lm')],
                      ['Power', value(set.watts, 'W')],
                      ['Color temperature', set.colorTemperature || 'Not specified'],
                      ['Color rendering', set.colorRendering || 'Not specified'],
                    ]}
                  />
                </li>
              ))}
            </ul>
          </Details>
          <Details title={`Metadata (${Object.keys(info.metadata).length})`} open={false}>
            <Rows rows={Object.entries(info.metadata)} />
          </Details>
        </>
      ) : (
        <p className="text-muted-foreground">No current inspection data. Correct the source to display its details.</p>
      )}
    </div>
  );
}
