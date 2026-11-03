# eulumdat-rs IES test data

Unmodified copies of the seven IES files in [holg/eulumdat-rs tests/files](https://github.com/holg/eulumdat-rs/tree/f07581600fcf339e5db14003d714f4b285d4d86d/tests/files), including its `aec/` subdirectory, pinned at commit `f07581600fcf339e5db14003d714f4b285d4d86d`.

The upstream workspace declares **AGPL-3.0-or-later**. Its complete LICENSE is retained here. No separate fixture license was found upstream. Manufacturer and laboratory metadata and notices remain byte-for-byte intact; these data files are not relabeled under the application's MIT license. `manifest.json` records original paths and SHA-256 hashes. No Rust implementation source is copied.

These fixtures are used only by tests and are excluded from npm packages, the VSIX and the demo build. The fixture set exercises LM-63-1995/2002, absolute/relative photometry, nontrivial multipliers, axial and asymmetric distributions, lower-hemisphere-only coverage, uppercase extensions, and dense irregular grids. The paired AEC MAXWELL files retain their CIE/IESNA measurement names; interpreting those labels is distinct from the IES file's declared Type C coordinates.
