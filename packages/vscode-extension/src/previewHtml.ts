export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

export function getPreviewHtml(cspSource: string, scriptUri: string, styleUri: string): string {
  const csp = [
    "default-src 'none'",
    `script-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    'img-src data: blob:',
    `connect-src ${cspSource} blob:`,
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IES Light Viewer</title>
<link rel="stylesheet" href="${escapeAttribute(styleUri)}">
</head>
<body>
<div id="root"></div>
<script type="module" src="${escapeAttribute(scriptUri)}"></script>
</body>
</html>`;
}
