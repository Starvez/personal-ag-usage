import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_NAMESPACE } from './constants';
import { UsageData } from './types';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set content
        this._update();

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

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it.
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
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

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    public updateData(data: UsageData) {
        this._panel.webview.postMessage({ type: 'update', data });
    }

    private _update() {
        const webview = this._panel.webview;
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'style.css'));
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'index.html');

        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        htmlContent = htmlContent.replace('{{styleUri}}', styleUri.toString());

        webview.html = htmlContent;
    }
}
