import { describe, expect, it } from 'vitest';
import { calculateLuminousFlux, computePhotometricMetrics, getBeamAngles, parseIES, summarizeIES } from './index.js';
import { iesSource } from '../test/iesSource.js';

describe('solid-angle flux integration', () => {
  it('integrates an isotropic source with only two polar samples to 4πI exactly', () => {
    const profile = parseIES(iesSource({ vertical: [0, 180] }));
    expect(calculateLuminousFlux(profile)).toBeCloseTo(4 * Math.PI * 100, 10);
  });
  it.each([
    [0, 90],
    [90, 180],
  ])('integrates a constant measured hemisphere %j to 2πI, leaving the other dark', (...vertical) => {
    const profile = parseIES(iesSource({ vertical }));
    expect(calculateLuminousFlux(profile)).toBeCloseTo(2 * Math.PI * 100, 10);
  });
  it('integrates irregular anisotropic piecewise-linear grids analytically rather than averaging planes', () => {
    const vertical = [0, 17, 72, 180];
    const horizontal = [0, 20, 97, 230, 360];
    const azimuthFactors = [1, 4, 2, 7, 1];
    // I(θ,φ)=(100+10θ)f(φ), θ in radians. ∫(100+10θ)sinθdθ=200+10π.
    // Piecewise-linear f has φ integral (50+231+598.5+520) degrees =1399.5π/180.
    const values = azimuthFactors.map((factor) => vertical.map((v) => (100 + (10 * v * Math.PI) / 180) * factor));
    const profile = parseIES(iesSource({ vertical, horizontal, values }));
    expect(calculateLuminousFlux(profile)).toBeCloseTo(((200 + 10 * Math.PI) * 1399.5 * Math.PI) / 180, 9);
    // Adding interpolated polar knots changes neither the represented function nor integrated energy.
    const refined = [0, 5, 17, 45, 72, 120, 180];
    const refinedProfile = parseIES(
      iesSource({
        vertical: refined,
        horizontal,
        values: azimuthFactors.map((factor) => refined.map((v) => (100 + (10 * v * Math.PI) / 180) * factor)),
      }),
    );
    expect(calculateLuminousFlux(refinedProfile)).toBeCloseTo(calculateLuminousFlux(profile), 9);
  });
  it('weights irregular quadrant intervals and expands all four quadrants exactly once', () => {
    const profile = parseIES(
      iesSource({
        vertical: [0, 180],
        horizontal: [0, 13, 90],
        values: [
          [100, 100],
          [200, 200],
          [400, 400],
        ],
      }),
    );
    expect(calculateLuminousFlux(profile)).toBeCloseTo((200 * (1.5 * 13 + 3 * 77) * 4 * Math.PI) / 180, 10);
  });
  it('mirrors a rotated bilateral domain exactly once', () => {
    const profile = parseIES(
      iesSource({
        vertical: [0, 180],
        horizontal: [90, 130, 270],
        values: [
          [100, 100],
          [200, 200],
          [300, 300],
        ],
      }),
    );
    expect(calculateLuminousFlux(profile)).toBeCloseTo((200 * (1.5 * 40 + 2.5 * 140) * 2 * Math.PI) / 180, 10);
  });
  it('closes an omitted azimuth seam and does not double-count an explicit duplicate 360° row', () => {
    const options = {
      vertical: [0, 180],
      horizontal: [0, 40, 200, 300],
      values: [
        [100, 100],
        [300, 300],
        [200, 200],
        [500, 500],
      ],
    };
    const open = parseIES(iesSource(options));
    const closed = parseIES(
      iesSource({
        ...options,
        horizontal: [...options.horizontal, 360],
        values: [...options.values, options.values[0]!],
      }),
    );
    expect(calculateLuminousFlux(open)).toBeCloseTo(calculateLuminousFlux(closed), 10);
    expect(calculateLuminousFlux(open)).toBeCloseTo(
      (2 * (200 * 40 + 250 * 160 + 350 * 100 + 300 * 60) * Math.PI) / 180,
      10,
    );
  });
  it('applies interpolated embedded lamp tilt exactly once and preserves raw candela', () => {
    const profile = parseIES(iesSource({ vertical: [0, 180], tilt: 'INCLUDE\n1\n3\n0 45 90\n0.8 1.2 0.6' }));
    expect(profile.candelaValues).toEqual([[100, 100]]);
    expect(calculateLuminousFlux(profile)).toBeCloseTo(4 * Math.PI * 80, 10);
    expect(calculateLuminousFlux(profile, 22.5)).toBeCloseTo(4 * Math.PI * 100, 10);
    expect(calculateLuminousFlux(profile, 180)).toBeCloseTo(4 * Math.PI * 60, 10);
    expect(computePhotometricMetrics(profile).integratedFluxLumens).toBeCloseTo(4 * Math.PI * 80, 10);
    expect(() => calculateLuminousFlux(profile, NaN)).toThrow('finite');
  });
  it('preserves the nonzero solid angle of very narrow measured cones', () => {
    const width = 1e-8;
    const profile = parseIES(iesSource({ vertical: [0, width] }));
    const expected = 4 * Math.PI * Math.sin((width * Math.PI) / 360) ** 2 * 100;
    expect(calculateLuminousFlux(profile) / expected).toBeCloseTo(1, 12);
  });
  it('accepts just a structurally compatible absolute photometric grid for reuse by converters', () => {
    expect(
      calculateLuminousFlux({
        photometricType: 1,
        verticalAngles: [0, 180],
        horizontalAngles: [0],
        candelaValues: [[10, 10]],
      }),
    ).toBeCloseTo(40 * Math.PI, 10);
  });
  it('distinguishes declared lamp flux from integrated luminaire output and efficacy', () => {
    const summary = summarizeIES(parseIES(iesSource({ lamps: 2, lumens: 1000, watts: 20, vertical: [0, 180] })));
    expect(summary.declaredLampFluxLumens).toBe(2000);
    expect(summary.integratedFluxLumens).toBeCloseTo(400 * Math.PI, 10);
    expect(summary.luminousEfficacyLumensPerWatt).toBeCloseTo(20 * Math.PI, 10);
    expect(summarizeIES(parseIES(iesSource())).declaredLampFluxLumens).toBeNull();
    expect(summarizeIES(parseIES(iesSource({ watts: 0 }))).luminousEfficacyLumensPerWatt).toBeNull();
  });
  it.each([2, 3])('reports metrics unavailable for Type %s without breaking inspection', (type) => {
    const profile = parseIES(iesSource({ type, vertical: [-90, 0, 90] }));
    expect(() => calculateLuminousFlux(profile)).toThrow('Type C');
    expect(() => getBeamAngles(profile)).toThrow('Type C');
    expect(summarizeIES(profile)).toMatchObject({
      metricsSupported: false,
      integratedFluxLumens: null,
      luminousEfficacyLumensPerWatt: null,
      beamAngles: [],
    });
  });
});

describe('principal-plane beam and field estimates', () => {
  it('finds full opposed-plane 50% and 10% threshold widths', () => {
    const profile = parseIES(iesSource({ vertical: [0, 15, 30, 60, 90], values: [[100, 75, 50, 10, 0]] }));
    expect(getBeamAngles(profile)).toMatchObject({
      horizontalDegrees: 0,
      peakDirectionDegrees: 0,
      peakCandela: 100,
      beamAngleDegrees: 60,
      fieldAngleDegrees: 120,
      beamAngleStatus: 'ok',
      fieldAngleStatus: 'ok',
      beamLeftDegrees: -30,
      beamRightDegrees: 30,
      fieldLeftDegrees: -60,
      fieldRightDegrees: 60,
    });
    expect(computePhotometricMetrics(profile).beamAngles.map((cut) => cut.horizontalDegrees)).toEqual([0, 90]);
  });
  it('reports the dominant off-axis peak and interpolates each crossing separately', () => {
    const profile = parseIES(
      iesSource({
        vertical: [0, 15, 30, 60, 90],
        horizontal: [0, 180],
        values: [
          [0, 20, 100, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      }),
    );
    const cut = getBeamAngles(profile);
    expect(cut.peakDirectionDegrees).toBe(30);
    expect(cut.beamAngleDegrees).toBeCloseTo(24.375, 10);
    expect(cut.beamRightDegrees! - cut.beamLeftDegrees!).toBeCloseTo(24.375, 10);
    expect(cut.beamLeftDegrees).toBeGreaterThan(0);
  });
  it('returns null and an explicit status for multiple disconnected lobes', () => {
    const profile = parseIES(iesSource({ vertical: [0, 15, 30, 60, 90], values: [[100, 0, 100, 0, 0]] }));
    expect(getBeamAngles(profile).beamLeftDegrees).toBeUndefined();
    expect(getBeamAngles(profile)).toMatchObject({
      beamAngleDegrees: null,
      beamAngleStatus: 'multiple-lobes',
      fieldAngleDegrees: null,
      fieldAngleStatus: 'multiple-lobes',
    });
  });
  it('does not invent crossings outside measured coverage or for an unbounded isotropic source', () => {
    const isotropic = parseIES(iesSource());
    expect(getBeamAngles(isotropic)).toMatchObject({ beamAngleDegrees: null, beamAngleStatus: 'no-crossing' });
    const partial = parseIES(iesSource({ vertical: [10, 45, 90], values: [[100, 10, 0]] }));
    expect(getBeamAngles(partial).beamAngleDegrees).toBeNull();
  });
  it('reports dark distributions without NaN or invented beam widths', () => {
    const profile = parseIES(iesSource({ values: [[0, 0, 0]] }));
    expect(getBeamAngles(profile)).toMatchObject({
      beamAngleDegrees: null,
      fieldAngleDegrees: null,
      beamAngleStatus: 'no-light',
    });
    expect(computePhotometricMetrics(profile)).toMatchObject({
      integratedFluxLumens: 0,
      luminousEfficacyLumensPerWatt: 0,
    });
  });
});
