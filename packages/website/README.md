# IES browser workbench

Run `pnpm dev` from the repository root. Open a local `.ies` file to inspect its measured photometric pattern on the black floor/wall scene and switch among polar, Cartesian, and full intensity topology plots. Controls choose the sampled axis and plane, topology up axis, and display exposure. Files are processed locally; there is no upload or login.

Vite bundles React 19 with `babel-plugin-react-compiler` enabled through `@vitejs/plugin-react`. Shared rendering lives in `ies-viewer`; shared parsing lives in `ies-core`.
