---
sidebar_position: 7
---

# Photometric compatibility comparison and plan

This is a historical baseline and research plan from before the incremental implementation PRs. It is retained to explain the original comparison and priorities, rather than describe current feature support. For the implemented behavior, see [Core](./core.md), [Conversion](./conversion.md), [Graphs](./graphs.md) and [CLI](./cli.md). Research was performed on November 3, 2026 against:

- This project's initial implementation, including the expanded real-file tests.
- [eulumdat-rs](https://github.com/holg/eulumdat-rs/tree/f07581600fcf339e5db14003d714f4b285d4d86d), commit `f07581600fcf339e5db14003d714f4b285d4d86d`.
- Installed Three.js **0.186.1**, resolved from the workspace's `^0.186.0` dependency range.
- The clean local three.js source checkout at [commit 95e853bc](https://github.com/mrdoob/three.js/tree/95e853bc12ce6d519c6ade688149f66e8228d722), whose package identifies itself as **0.187.0**. This is a source snapshot, not a claim that this version is published.

## Findings

Supporting `.ldt` and `.ies` in `<light-viewer>` does not require adding EULUMDAT to Three.js. Both can supply the angular intensity distribution used by our existing Three.js scene. Prefer parsing into a shared profile over converting to text and reparsing it during rendering. Bidirectional file conversion is feasible, but metadata, lamp sets, coordinate systems, tilt and normalization need explicit treatment; arbitrary files cannot be promised a lossless round trip.

Our current viewer uses classic Three.js `WebGLRenderer` and a calibrated receiver shader. Three.js's native `IESSpotLight` is a different integration: it requires the `WebGPURenderer` node pipeline and a normalized attenuation map, with light strength supplied separately. That renderer can use a hardware WebGPU backend or its WebGL2 backend. See the [native light contract](https://threejs.org/docs/pages/IESSpotLight.html) and [renderer source](https://github.com/mrdoob/three.js/blob/95e853bc12ce6d519c6ade688149f66e8228d722/src/renderers/webgpu/WebGPURenderer.js).

## Core features

| Area        | ies at research baseline                                                                                    | eulumdat-rs reference                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| IES input   | Headerless 1986, 1991, 1995, 2002                                                                           | 1991, 1995, 2002, 2019; headerless input treated as 1991                                   |
| Coordinates | Parse A/B/C; sample and render Type C                                                                       | Raw parser represents A/B/C; IES-to-LDT path does not transform those coordinates          |
| Symmetry    | Axial, quadrant, bilateral and full Type C; missing 360° seam supported                                     | Five LDT symmetry modes, expansion and diagram utilities                                   |
| Tilt        | NONE and embedded INCLUDE; core sampling applies interpolated lamp correction; external references rejected | Raw IES parser stores embedded tilt; conversion to its LDT structure drops that curve      |
| Metadata    | Generic keyword preservation and basic typed statistics                                                     | Rich typed IES fields, luminous shape interpretation and 2019 generation data              |
| Validation  | Strict numeric/count/table checks with parse errors                                                         | Broader structured diagnostics with codes, severity and strict mode                        |
| Statistics  | Peak cd, lamp/power descriptions, counts, dimensions; receiver lux calculation                              | Flux, efficacy, beam/field angles, zonal lumens, spacing, BUG, UGR/CU and roadway analysis |
| Output      | Parsed JSON                                                                                                 | IES/LDT readers and writers, plus ATLA/TM-33 paths                                         |

These findings come from the reference [IES parser/exporter](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/ies.rs), [validation](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/validation.rs), and [calculations](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/calculations.rs). Parsing A/B tags should not be confused with correctly converting or rendering their distributions.

## Graphs

| Graph capability     | ies at research baseline                           | Reference                                                            |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Polar                | One 0–180° vertical meridian or a horizontal sweep | Complete opposed-plane cuts; paired C0–C180 and C90–C270 curves      |
| Cartesian            | One configurable sweep                             | Multiple C-plane overlays with scales and legends                    |
| Topology / butterfly | SVG isometric wireframe with X/Y/Z up              | Filled, colored C-plane wings and adjustable view tilt               |
| Principal planes     | Choose a fixed plane manually                      | Dedicated principal-plane comparison with shared scaling             |
| Heatmap / isocandela | Not implemented                                    | Angular heatmaps and Type B iso-intensity contours                   |
| Isolux               | Physical receiver preview, without contour graph   | Ground-plane lux maps with height, aiming and contours               |
| Specialized          | Not implemented                                    | Beam/cone, BUG/LCS, floodlight H/V, spectral and greenhouse diagrams |

Source modules: [polar](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/diagram/polar.rs), [butterfly](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/diagram/butterfly.rs), [principal planes](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/diagram/principal_planes.rs), [isocandela](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/diagram/isocandela.rs), and [isolux](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/diagram/isolux.rs).

Our polar view is a slice plot, not yet the conventional two-sided principal-plane photometric diagram. Complete opposed-plane curves, labels, units and overlays would be the most useful first graph improvement.

## Conversion requirements

[DIAL's format description](https://evo.support-en.dial.de/support/solutions/articles/9000074164-description-of-the-eulumdat-format) defines LDT intensity in **cd/klm**, separate luminaire and luminous-area geometry, lamp sets, conversion factors, symmetry and utilization data. Absolute candela requires the appropriate reference flux: `cd = cd/klm × reference lumens / 1000 × intensity conversion factor`, with each factor applied exactly once. Do not apply the light-output ratio a second time to an already normalized intensity distribution.

For absolute LDT photometry, the [DIAL/Lighting Analysts proposal](https://www.agi32.com/Downloads/PressReleases/EULUMDAT_Absolute_Photometry.pdf) uses a negative lamp count and the luminaire's measured luminous flux while retaining cd/klm intensities. IES instead uses a `-1` lumens-per-lamp sentinel and absolute candela. Preserve the declared flux separately from any flux estimated by integrating the distribution.

A converter should therefore:

1. Normalize to absolute candela and an explicit coordinate convention, preserving source metadata and units.
2. Expand/reduce symmetry without swapping C-plane orientation; handle the special LDT C90–C270 intensity ordering. Avoid blanket 90° rotations based only on filename or file format.
3. Preserve usable luminous dimensions and distinguish them from housing dimensions. Report mappings or losses in geometry, lamp sets, keywords and utilization data.
4. Treat measurement aiming separately from an IES lamp-dependent TILT correction curve. Report any baked-in correction or omitted curve.
5. Preserve Type A/B coordinates or transform them with a separately tested spherical coordinate conversion; never relabel them Type C.
6. Integrate flux using angular intervals and solid-angle weighting, including irregular grids, symmetry, absent hemispheres and the duplicate 360° seam. Apply explicit precision/tolerance rules to serialization.

The reference is useful for feature discovery, but its conversion is not a correctness oracle. Static inspection of [IES-to-LDT conversion](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/ies.rs#L899) shows omitted tilt/generic metadata, copied angle arrays without coordinate conversion, and assumed luminous geometry/LOR. Its absolute-flux estimator averages horizontal planes equally. [Export](https://github.com/holg/eulumdat-rs/blob/f07581600fcf339e5db14003d714f4b285d4d86d/crates/eulumdat/src/ies.rs#L1226) emits Type C and TILT=NONE. Import applies the IES multiplier to intensities and retains it as the conversion factor; export writes that factor with a minimum of one. This appears to double-apply factors above one on an IES round trip. These conversion findings are source-derived; we did not execute the Rust converter to establish numerical round-trip errors.

## Three.js gaps and regressions

CPU texture generation compared the installed loader with the local source snapshot. No GPU context, software rasterizer or rendering benchmark was used.

| Native behavior              | Installed 0.186.1                                        | Local 0.187.0 source snapshot              |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Relative intensity ratio     | A half-peak value becomes approximately quarter-peak     | Correct linear ratio                       |
| Texture dimensions           | Declares 180×1 despite 64,800 stored values              | Correct 180×360 or axial 180×1             |
| Bilateral/wrap fixture maps  | 16,020 nonfinite values for `02a…`; 2,520 for `06b…`     | Finite maps on those fixtures              |
| Asymmetric native light node | Samples azimuth zero                                     | Samples both tilt and twist                |
| Unmeasured vertical ranges   | Extrapolates, including negative intensities             | Still extrapolates; negative values remain |
| Dense `Preliminar` fixture   | Throws at EOF                                            | Still throws at EOF                        |
| Type A/B                     | Reads type field without coordinate conversion           | Same gap                                   |
| Lamp TILT corrections        | Reads embedded data without exposing correction controls | Same gap                                   |

The `Preliminar` file has 263 vertical samples; its first candela row ends inside physical line 58, where 264 values have been read. The native `readArray` expects an exact array length at a newline, overshoots and eventually accesses undefined input. Our token-based parser accepts it. This is a real-file robustness finding, not a claim that the fixture meets every normative LM-63 formatting rule.

The newer native loader still creates **16,809 negative texture values** for each lower-hemisphere MAXWELL fixture (minimum approximately −0.274965 normalized intensity). Our sampler returns zero outside measured coverage, and all eleven fixture receiver textures are finite and nonnegative. The old loader's normalization/layout problems are already addressed in the local source; an upstream proposal should focus on remaining gaps rather than duplicating those fixes.

Evidence: [source-snapshot loader](https://github.com/mrdoob/three.js/blob/95e853bc12ce6d519c6ade688149f66e8228d722/examples/jsm/loaders/IESLoader.js), [source-snapshot light node](https://github.com/mrdoob/three.js/blob/95e853bc12ce6d519c6ade688149f66e8228d722/src/nodes/lighting/IESSpotLightNode.js), and [installed-version loader source](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/examples/jsm/loaders/IESLoader.js). Modern LM-63-2019 field interpretation and explicit unsupported-type errors also merit review. The native loader currently treats the second factor uniformly, while our future 2019 reader must distinguish file-generation information from legacy factors.

Reproduce the diagnostics after `pnpm build`:

```sh
node scripts/compare-ies-loaders.mjs
node scripts/compare-ies-loaders.mjs ../three.js
```

The script reports exact package versions, native errors, texture dimensions, nonfinite/negative counts and calibrated results. It does not modify the Three.js checkout or generate its build artifacts. These checks establish CPU data behavior; hardware rendering and native light orientation still require a confirmed real GPU.

## Proposed implementation sequence

1. **IES foundations:** add LM-63-2019 interpretation and structured validation diagnostics. Extend `ies inspect` with properly integrated flux, efficacy and beam/field angles, distinguishing declared and calculated values.
2. **Shared photometry and conversion:** retain compatibility with IESProfile while adding a format-neutral profile with absolute candela, explicit source coordinates and source-specific metadata. Implement LDT parsing/writing from published specifications and an IES writer. Provide conversion warnings for unavoidable losses.
3. **Dual-format entry points:** add content detection or an explicit format hint to the core, CLI, React component, custom element and VS Code preview. Route both parsers directly into the same viewer profile. File conversion can serialize IES or LDT when requested; viewing need not serialize either format.
4. **Graphs:** complete principal-plane polar cuts, overlays, units and ticks; then richer configurable topology and isolux. Keep graph calculations and geometry reusable outside React. Add Type B isocandela only with a validated coordinate model.
5. **Optional native Three.js adapter:** produce the native normalized map plus peak candela, test its orientation/energy behavior on hardware, and contribute remaining loader fixes separately. EULUMDAT stays in this library.

Acceptance tests should compare sampled candela and physical receiver lux before and after conversion; cover relative and absolute photometry, all LDT symmetry modes, irregular grids, multipliers above/below one, black distributions, hemispheres, units, metadata warnings and Type A/B policy. Byte-identical file round trips and lossless photometry round trips are different claims.

## Imported test data

Seven unmodified IES files from the reference's `tests/files`, including `aec/`, are now test fixtures. They add a subunit-multiplier axial luminaire, asymmetric roadway data, a dense irregular grid, rich floodlight metadata, and paired lower-hemisphere manufacturer measurements. All parse and produce finite/nonnegative calibrated receiver textures. Source paths, the pinned commit and SHA-256 hashes are in `fixtures/eulumdat-rs/manifest.json`.

The reference workspace declares **AGPL-3.0-or-later** and provides no separate fixture license. The copied data retain its complete license and manufacturer notices in their own fixture directory; no Rust implementation source is included. Runtime npm packages, the demo and the VSIX exclude these test files. See THIRD_PARTY_NOTICES.md in the repository.
