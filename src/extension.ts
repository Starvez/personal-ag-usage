import * as vscode from 'vscode';
import { UsageService } from './UsageService';
import { DashboardPanel } from './DashboardPanel';
import { CONFIG_NAMESPACE } from './constants';

let myStatusBarItem: vscode.StatusBarItem;
let service: UsageService;

export function activate(context: vscode.ExtensionContext) {
    console.log('Personal AG Usage is active!');

    // Initialize Service with Storage
    service = new UsageService(context.globalState);

    // Status Bar
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    myStatusBarItem.command = 'personal-ag-usage.showDashboard';
    context.subscriptions.push(myStatusBarItem);

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('personal-ag-usage.showDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri);
            refreshData(); // Refresh on open
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('personal-ag-usage.refresh', () => {
            refreshData();
        })
    );

    // Initial Refresh
    refreshData();

    // Auto Refresh Loop (every 60s)
    setInterval(refreshData, 60000);

    myStatusBarItem.show();
}

const lastQuotas = new Map<string, number>();

async function refreshData() {
    try {
        myStatusBarItem.text = "$(sync~spin) AG";
        const data = await service.getUsageData();

        // Update Panel if open
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.updateData(data);
        }

        // Update Status Bar
        myStatusBarItem.text = `$(crown) ${data.global.planName}`;

        // Tooltip Generation
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        md.appendMarkdown(`### 👑 Plan: ${data.global.planName}\n`);
        // md.appendMarkdown(`**${credits}** / ${data.global.promptCreditsCode.total} Available\n\n`); // Removed
        md.appendMarkdown(`---\n`);

        // Sort and display models
        const models = data.models.sort((a, b) => a.label.localeCompare(b.label));
        models.forEach(m => {
            const q = Math.round(m.rawQuota * 100);

            // ALERT SYSTEM
            const prevQ = lastQuotas.get(m.label);
            if (prevQ !== undefined) {
                // RESET DETECTION (Low -> High jump)
                if (prevQ < 50 && q > 90) {
                    vscode.window.showInformationMessage(`🔄 Refreshed: ${m.label} quota has reset to ${q}%!`);
                }
                // CRITICAL DROP (Above 10 -> Below 10)
                if (prevQ >= 10 && q < 10) {
                    vscode.window.showWarningMessage(`⚠️ Low Quota: ${m.label} is down to ${q}%!`);
                }
            }
            lastQuotas.set(m.label, q);

            // 10% Bucket Logic (10 Tiers)
            const icon = q >= 90 ? '🟢' :
                (q >= 80 ? '🟢' :
                    (q >= 70 ? '🟡' : // High Yellow 
                        (q >= 60 ? '🟡' :
                            (q >= 50 ? '🟡' : // Mid Yellow
                                (q >= 40 ? '🟠' :
                                    (q >= 30 ? '🟠' :
                                        (q >= 20 ? '🟠' : // Low Orange
                                            (q >= 10 ? '🔴' : '🔴'))))))));

            let dateStr = 'Never';
            let countdown = '';

            if (m.resetTime) {
                const now = new Date();
                const reset = new Date(m.resetTime);
                dateStr = reset.toLocaleString();

                const diffMs = reset.getTime() - now.getTime();
                if (diffMs > 0) {
                    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                    const dStr = days > 0 ? `${days}d ` : '';
                    countdown = `\n_(in ${dStr}${hours}h ${mins}m)_`;
                } else {
                    countdown = `\n_(Resetting...)_`;
                }
            }

            // Add Tag to tooltip
            const tagSuffix = m.tag ? ` **(${m.tag})**` : '';
            md.appendMarkdown(`${icon} **${m.label}**${tagSuffix}: ${q}%\n`);
            if (m.resetTime) {
                // Formatting: Resets line, then Countdown line
                md.appendMarkdown(`_Resets: ${dateStr}_\n`);
                md.appendMarkdown(`_${countdown.trim()}_\n\n`);
            }
        });

        md.appendMarkdown(`---\n[Open Dashboard](command:personal-ag-usage.showDashboard)`);
        myStatusBarItem.tooltip = md;

    } catch (e) {
        console.error(e);
        myStatusBarItem.text = "$(error) AG";
        myStatusBarItem.tooltip = "Failed to fetch usage: " + e;
    }
}

export function deactivate() { }
