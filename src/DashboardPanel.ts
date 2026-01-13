/**
 * Dashboard Panel Module
 * Manages the webview panel for displaying AntiGravity usage data
 *
 * Features:
 * - Singleton pattern ensures only one dashboard instance
 * - Secure webview with Content Security Policy
 * - Async file loading for better performance
 * - Auto-refresh when panel becomes visible
 * - Bidirectional messaging with webview content
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CONFIG_NAMESPACE } from './constants';
import { UsageData } from './types';

/**
 * Manages the webview panel for the AG Usage Dashboard
 * Implements singleton pattern to ensure only one dashboard is open at a time
 */
export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set content asynchronously
        this._update().catch(err => {
            console.error('Failed to initialize dashboard:', err);
            this._panel.webview.html = this._getErrorHtml(err);
        });

        // Listen for disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Message handling
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refresh':
                    vscode.commands.executeCommand('personal-ag-usage.refresh');
                    return;
            }
        }, null, this._disposables);

        // Auto-refresh when becoming visible
        this._panel.onDidChangeViewState(e => {
            if (e.webviewPanel.visible) {
                vscode.commands.executeCommand('personal-ag-usage.refresh');
            }
        }, null, this._disposables);
    }

    /**
     * Creates or reveals the dashboard panel
     * If a panel already exists, it will be revealed instead of creating a new one
     * @param extensionUri URI of the extension directory
     */
    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it.
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel with security settings
        const panel = vscode.window.createWebviewPanel(
            CONFIG_NAMESPACE,
            'AG Usage Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true, // Prevent blank screen on tab switch
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview')]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
    }

    /**
     * Disposes of the panel and cleans up all resources
     */
    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    /**
     * Sends updated usage data to the webview
     * @param data Current usage data from UsageService
     */
    public updateData(data: UsageData) {
        this._panel.webview.postMessage({ type: 'update', data });
    }

    private async _update(): Promise<void> {
        const webview = this._panel.webview;
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dashboard.js'));
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'index.html');

        // Generate nonce for inline scripts (CSP security)
        const nonce = this._getNonce();

        // Generate Content Security Policy
        const csp = this._getCSP(webview, nonce);

        try {
            let htmlContent = await fs.readFile(htmlPath, 'utf8');
            htmlContent = htmlContent.replace('{{styleUri}}', styleUri.toString());
            htmlContent = htmlContent.replace('{{scriptUri}}', scriptUri.toString());
            htmlContent = htmlContent.replace('{{csp}}', csp);
            htmlContent = htmlContent.replace(/(<script[^>]*>)/g, `$1 nonce="${nonce}"`);
            webview.html = htmlContent;
        } catch (err) {
            console.error('Failed to load dashboard HTML:', err);
            webview.html = this._getErrorHtml(err);
        }
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _getCSP(webview: vscode.Webview, nonce: string): string {
        return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">`;
    }

    private _getErrorHtml(error: any): string {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            padding: 2rem;
            color: #c9d1d9;
            background-color: #0d1117;
        }
        .error {
            background: #da3633;
            color: white;
            padding: 1rem;
            border-radius: 6px;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <h1>❌ Failed to Load Dashboard</h1>
    <div class="error">
        <strong>Error:</strong> ${errorMsg}
    </div>
    <p>Please try reopening the dashboard or check the extension logs.</p>
</body>
</html>`;
    }
}
