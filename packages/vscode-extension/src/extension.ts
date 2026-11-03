import * as vscode from 'vscode';
import { getPreviewHtml } from './previewHtml.js';
import { createPreviewUpdate } from './previewData.js';
import { isReadyMessage } from './protocol.js';

export function activate(context: vscode.ExtensionContext): void {
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');
  const provider: vscode.CustomTextEditorProvider = {
    async resolveCustomTextEditor(document, panel) {
      panel.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
      const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.js'));
      const style = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.css'));
      const update = (): void => {
        const message = createPreviewUpdate(document.getText(), /\.ldt$/i.test(document.uri.path) ? 'ldt' : 'ies');
        // VS Code's Webview.postMessage has no targetOrigin argument.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        void panel.webview.postMessage(message);
      };
      const messages = panel.webview.onDidReceiveMessage((message: unknown) => {
        if (isReadyMessage(message)) update();
      });
      const changes = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) update();
      });
      const visibility = panel.onDidChangeViewState(() => {
        if (panel.visible) update();
      });
      panel.onDidDispose(() => {
        messages.dispose();
        changes.dispose();
        visibility.dispose();
      });
      panel.webview.html = getPreviewHtml(panel.webview.cspSource, script.toString(), style.toString());
    },
  };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('ies.lightPreview', provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('ies.openPreview', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showInformationMessage('Open an IES or LDT file to preview its lighting distribution.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, 'ies.lightPreview');
    }),
  );
}
