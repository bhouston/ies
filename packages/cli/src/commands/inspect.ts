import { defineCommand } from 'yargs-file-commands';
import { inputOptions, readInput } from '../options.js';
import { inspectPhotometry } from '../photometry.js';

export const command = defineCommand({
  command: 'inspect <file>',
  describe: 'Show source metadata and photometric statistics',
  builder: (yargs) =>
    inputOptions(yargs).option('json', { type: 'boolean', describe: 'Emit a machine-readable summary' }),
  handler: async (argv) => {
    const { text, format, lampSetIndex } = await readInput(argv);
    const summary = inspectPhotometry(text, format, lampSetIndex);
    if (argv.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const dimensions = summary.dimensions;
    const lines = [
      argv.file,
      `Format: ${summary.format}`,
      `Version: ${summary.version}`,
      `Photometric type: Type ${summary.photometricTypeName} (${summary.photometricType})`,
      `Photometry: ${summary.photometry}`,
      `Manufacturer: ${summary.manufacturer}`,
      `Luminaire: ${summary.luminaire}`,
      `Light source: ${summary.lightSource}`,
      `Lamp catalog: ${summary.lampCatalog}`,
      `Lamp count: ${summary.lampCount ?? 'select a lamp configuration'}`,
      `Lumens per lamp: ${summary.lumensPerLamp === null ? 'select a lamp configuration' : summary.lumensPerLamp === -1 ? 'not specified (absolute photometry)' : `${summary.lumensPerLamp} lm`}`,
      `Input power: ${summary.inputWatts === null ? 'select a lamp configuration' : `${summary.inputWatts} W`}`,
      `Peak intensity: ${summary.peakCandela === null ? 'select a lamp configuration' : `${summary.peakCandela} cd`}`,
      `Declared lamp flux: ${summary.declaredLampFluxLumens === null ? 'not specified (absolute photometry)' : `${summary.declaredLampFluxLumens} lm (lamp rating, not luminaire output)`}`,
      ...(summary.declaredLuminaireFluxLumens === null
        ? []
        : [`Declared luminaire flux: ${summary.declaredLuminaireFluxLumens} lm (source rating)`]),
      `Integrated luminaire flux: ${summary.integratedFluxLumens === null ? (summary.photometricType === 1 ? 'unavailable (select a lamp configuration)' : 'unavailable (Type C only)') : `${summary.integratedFluxLumens.toFixed(3)} lm (angular table estimate)`}`,
      `Integrated luminous efficacy: ${summary.luminousEfficacyLumensPerWatt === null ? 'unavailable (unsupported coordinates or zero input power)' : `${summary.luminousEfficacyLumensPerWatt.toFixed(3)} lm/W`}`,
      `Metrics lamp tilt: ${summary.metricsTiltDegrees}°`,
      ...(summary.metricsUnsupportedReason ? [`Metrics: ${summary.metricsUnsupportedReason}`] : []),
      ...summary.beamAngles.map(
        (cut) =>
          `C${cut.horizontalDegrees}–C${(cut.horizontalDegrees + 180) % 360} beam / field estimate: ${cut.beamAngleDegrees === null ? `unavailable (${cut.beamAngleStatus})` : `${cut.beamAngleDegrees.toFixed(3)}°`} / ${cut.fieldAngleDegrees === null ? `unavailable (${cut.fieldAngleStatus})` : `${cut.fieldAngleDegrees.toFixed(3)}°`} (peak direction ${cut.peakDirectionDegrees}°)`,
      ),
      `Angles: ${summary.verticalAngles} vertical × ${summary.horizontalAngles} horizontal`,
      `Dimensions (width × length × height): ${dimensions.width} × ${dimensions.length} × ${dimensions.height} ${summary.units}`,
      `Tilt correction: ${summary.hasTilt ? 'embedded' : 'none'}`,
      ...(summary.fileGenerationType === null
        ? []
        : [`File generation type: ${summary.fileGenerationType.toFixed(5)} (provenance, not an intensity multiplier)`]),
    ];
    const metadata = Object.entries(summary.metadata).map(([key, value]) => `${key}: ${value}`);
    const diagnostics = summary.diagnostics.map((item) => `${item.severity} [${item.code}]: ${item.message}`);
    const lampSets =
      summary.sourceFormat === 'ldt'
        ? summary.lampSets.map(
            (set, index) =>
              `Lamp configuration ${index + 1}${summary.selectedLampSetIndex === index ? ' (selected)' : ''}: ${set.description || 'not specified'}; ${set.totalLumens} lm; ${set.watts} W`,
          )
        : [];
    console.log(
      [...lines, ...lampSets, ...(metadata.length ? ['Metadata:', ...metadata] : []), ...diagnostics].join('\n'),
    );
  },
});
