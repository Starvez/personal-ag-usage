/**
 * Personal AG Usage Extension
 * Tracks AntiGravity API usage quotas and displays real-time information
 * in the VSCode status bar and a dedicated dashboard
 */

import * as vscode from 'vscode';
import { UsageService } from './UsageService';
import { DashboardPanel } from './DashboardPanel';
import {
    AUTO_REFRESH_INTERVAL_MS,
    MS_PER_DAY,
    MS_PER_HOUR,
    MS_PER_MINUTE,
    QUOTA_CRITICAL_THRESHOLD,
    QUOTA_PERCENTAGE_MULTIPLIER,
    QUOTA_RESET_HIGH_THRESHOLD,
    QUOTA_RESET_LOW_THRESHOLD,
    QUOTA_THRESHOLDS
} from './constants';

let myStatusBarItem: vscode.StatusBarItem;
let service: UsageService;

/**
 * Extension activation function
 * Called when the extension is activated (on VSCode startup)
 * @param context Extension context for registering commands and storing state
 */
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

    // Auto Refresh Loop
    setInterval(refreshData, AUTO_REFRESH_INTERVAL_MS);

    myStatusBarItem.show();
}

const lastQuotas = new Map<string, number>();
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

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
        md.appendMarkdown(`---\n`);

        // Sort and display models
        const models = data.models.sort((a, b) => a.label.localeCompare(b.label));
        models.forEach(m => {
            const q = Math.round(m.rawQuota * QUOTA_PERCENTAGE_MULTIPLIER);

            // ALERT SYSTEM
            const prevQ = lastQuotas.get(m.label);
            if (prevQ !== undefined) {
                // RESET DETECTION (Low -> High jump)
                if (prevQ < QUOTA_RESET_LOW_THRESHOLD && q > QUOTA_RESET_HIGH_THRESHOLD) {
                    vscode.window.showInformationMessage(`🔄 Refreshed: ${m.label} quota has reset to ${q}%!`);
                }
                // CRITICAL DROP (Above threshold -> Below threshold)
                if (prevQ >= QUOTA_CRITICAL_THRESHOLD && q < QUOTA_CRITICAL_THRESHOLD) {
                    vscode.window.showWarningMessage(`⚠️ Low Quota: ${m.label} is down to ${q}%!`);
                }
            }
            lastQuotas.set(m.label, q);

            // Quota Icon Selection
            const icon = getQuotaIcon(q);

            let dateStr = 'Never';
            let countdown = '';

            if (m.resetTime) {
                const now = new Date();
                const reset = new Date(m.resetTime);
                dateStr = reset.toLocaleString();

                const diffMs = reset.getTime() - now.getTime();
                if (diffMs > 0) {
                    const days = Math.floor(diffMs / MS_PER_DAY);
                    const hours = Math.floor((diffMs % MS_PER_DAY) / MS_PER_HOUR);
                    const mins = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE);

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

        // Reset error counter on success
        consecutiveErrors = 0;

    } catch (e) {
        consecutiveErrors++;
        console.error(`Failed to refresh data (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, e);

        myStatusBarItem.text = "$(error) AG";
        const errorMsg = e instanceof Error ? e.message : String(e);
        const tooltip = new vscode.MarkdownString(
            `### ❌ Connection Error\n\n` +
            `Failed to fetch usage data.\n\n` +
            `**Error:** ${errorMsg}\n\n` +
            `**Attempts:** ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}\n\n` +
            `[Retry Now](command:personal-ag-usage.refresh)`
        );
        tooltip.isTrusted = true;
        myStatusBarItem.tooltip = tooltip;

        // Show warning if too many consecutive failures
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            vscode.window.showErrorMessage(
                `AG Usage: Failed to connect after ${MAX_CONSECUTIVE_ERRORS} attempts. ` +
                `Please ensure AntiGravity is running.`,
                'Retry'
            ).then(selection => {
                if (selection === 'Retry') {
                    consecutiveErrors = 0;
                    refreshData();
                }
            });
        }
    }
}

/**
 * Returns an appropriate icon emoji based on quota percentage
 * @param quota Quota percentage (0-100)
 * @returns Emoji icon representing quota level
 */
function getQuotaIcon(quota: number): string {
    if (quota >= QUOTA_THRESHOLDS.EXCELLENT) return '🟢';
    if (quota >= QUOTA_THRESHOLDS.VERY_GOOD) return '🟢';
    if (quota >= QUOTA_THRESHOLDS.GOOD) return '🟡';
    if (quota >= QUOTA_THRESHOLDS.MODERATE) return '🟡';
    if (quota >= QUOTA_THRESHOLDS.FAIR) return '🟡';
    if (quota >= QUOTA_THRESHOLDS.LOW) return '🟠';
    if (quota >= QUOTA_THRESHOLDS.VERY_LOW) return '🟠';
    if (quota >= QUOTA_THRESHOLDS.CRITICAL) return '🟠';
    if (quota >= QUOTA_THRESHOLDS.DEPLETED) return '🔴';
    return '🔴';
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated (cleanup hook)
 */
export function deactivate() { }
