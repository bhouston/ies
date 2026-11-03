import { writeLDT, type LDTProfile } from 'ies-core';

/** Authored mathematical fixture: 100 cd/klm × 2000 lm × 0.5 = 100 cd, isotropic. */
export function ldtSource(
  options: { alternatives?: boolean; absolute?: boolean; emptyDescriptions?: boolean } = {},
): string {
  const source: LDTProfile = {
    format: 'ldt',
    identification: options.emptyDescriptions ? '' : 'Synthetic manufacturer',
    typeIndicator: 1,
    symmetry: 1,
    cPlaneSpacing: 0,
    gammaSpacing: 90,
    reportNumber: 'Authored integration fixture',
    luminaireName: options.emptyDescriptions ? '' : 'Isotropic luminaire',
    luminaireNumber: 'SYNTHETIC',
    fileName: 'source.ldt',
    dateUser: '2026-11-03 / Test suite',
    luminaire: { width: 200, length: 400, height: 100 },
    luminousArea: { width: 150, length: 300, heights: [10, 20, 30, 40] },
    downwardFluxFraction: 50,
    lightOutputRatio: 75,
    conversionFactor: 0.5,
    measurementTilt: 0,
    lampSets: [
      {
        lampCount: options.absolute ? -1 : 2,
        description: 'First configuration',
        totalLumens: 2000,
        colorTemperature: '3000K',
        colorRendering: '90',
        watts: 20,
      },
    ],
    directRatios: Array.from({ length: 10 }, () => 0),
    cAngles: [0],
    gammaAngles: [0, 90, 180],
    intensities: [[100, 100, 100]],
  };
  if (options.alternatives)
    source.lampSets.push({
      lampCount: 1,
      description: 'Second configuration',
      totalLumens: 500,
      colorTemperature: '4000K',
      colorRendering: '80',
      watts: 5,
    });
  return writeLDT(source);
}
