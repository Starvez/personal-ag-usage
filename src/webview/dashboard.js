/**
 * Dashboard Client-Side Logic
 * Handles UI updates and user interactions for the AG Usage Dashboard
 */

// Initialize when DOM is ready
(function () {
    'use strict';

    // Time calculation constants (matching server-side)
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const MS_PER_HOUR = 60 * 60 * 1000;
    const MS_PER_MINUTE = 60 * 1000;
    const CONTEXT_DISPLAY_DIVISOR = 1024;
    const QUOTA_PERCENTAGE_MULTIPLIER = 100;
    const HSL_MAX_HUE = 120;
    const QUOTA_COLOR_STEP = 10;

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'update') {
            updateUI(message.data);
        }
    });

    // Refresh button handler
    document.getElementById('refresh')?.addEventListener('click', () => {
        window.vscodeApi?.postMessage({ command: 'refresh' });
    });

    /**
     * Generates HSL color based on quota percentage
     * Uses stepped logic for smooth color transitions
     * @param {number} percentage Quota percentage (0-100)
     * @returns {string} HSL color string
     */
    function getHSL(percentage) {
        // Snap to floor of 10 (e.g., 96 -> 90, 82 -> 80)
        const stepped = Math.floor(percentage / QUOTA_COLOR_STEP) * QUOTA_COLOR_STEP;
        const hue = (stepped / QUOTA_PERCENTAGE_MULTIPLIER) * HSL_MAX_HUE; // 0 (Red) -> 120 (Green)
        return `hsl(${hue}, 85%, 45%)`;
    }

    /**
     * Calculates time remaining until reset
     * @param {string} resetTime ISO timestamp of reset
     * @returns {object} Object containing display strings
     */
    function calculateCountdown(resetTime) {
        const now = new Date();
        const reset = new Date(resetTime);
        const resetDisplay = reset.toLocaleString();
        const diffMs = reset.getTime() - now.getTime();

        let countdownDisplay = '';
        if (diffMs > 0) {
            const days = Math.floor(diffMs / MS_PER_DAY);
            const hours = Math.floor((diffMs % MS_PER_DAY) / MS_PER_HOUR);
            const mins = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE);

            const dStr = days > 0 ? `${days}d ` : '';
            countdownDisplay = `<div class="metric-sub" style="opacity:0.8; color: var(--accent); margin-top: 2px;">(in ${dStr}${hours}h ${mins}m)</div>`;
        }

        return { resetDisplay, countdownDisplay };
    }

    /**
     * Creates an SVG skill badge
     * @param {string} type Badge type (image, docs, audio, video)
     * @param {string} title Tooltip title
     * @returns {string} HTML string for badge
     */
    function createBadge(type, title) {
        const paths = {
            image: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
            docs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',
            audio: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>',
            video: '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>'
        };

        const path = paths[type] || '';
        return `<div class="skill-icon" title="${title}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${path}
            </svg>
        </div>`;
    }

    /**
     * Updates the entire UI with new data from the extension
     * @param {object} data Usage data from UsageService
     */
    function updateUI(data) {
        updatePlanInfo(data.global);
        updateWeeklyUsage(data.weeklyUsage);
        updateModelsGrid(data.models);
    }

    /**
     * Updates the plan information card
     * @param {object} global Global plan data
     */
    function updatePlanInfo(global) {
        const creditsCard = document.querySelector('.card');
        if (!creditsCard) return;

        const feats = global.features;
        const caps = global.capabilities;
        const contextK = parseInt(feats.chatInputLimit) / CONTEXT_DISPLAY_DIVISOR;

        creditsCard.innerHTML = `
            <div class="card-title">Current Plan</div>
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 24px; margin-right: 12px;">👑</div>
                <div class="metric-large">${global.planName}</div>
            </div>
            <div class="metric-sub" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div>${feats.fastAutocomplete ? '⚡ Fast Autocomplete' : '❌ Fast Autocomplete'}</div>
                <div>${feats.webSearch ? '🌐 Web Search' : '❌ Web Search'}</div>
                <div>${feats.premiumModels ? '🧠 Premium Models' : '❌ Premium Models'}</div>
                <div>📝 ${contextK}k Context</div>
            </div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div class="card-title" style="font-size: 0.8em; margin-bottom: 5px;">Capabilities</div>
                <div class="metric-sub" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.85em;">
                     <div>${caps.browser ? '🟢 Browser Tool' : '⚪ Browser Tool'}</div>
                     <div>${caps.knowledgeBase ? '🟢 Knowledge Base' : '⚪ Knowledge Base'}</div>
                     <div>${caps.mcp ? '🟢 MCP Servers' : '⚪ MCP Servers'}</div>
                     <div>${caps.autoRun ? '🟢 Auto-Run' : '⚪ Global Auto-Run'}</div>
                </div>
            </div>
        `;
    }

    /**
     * Updates the weekly usage display
     * @param {number} weeklyUsage Weekly quota usage
     */
    function updateWeeklyUsage(weeklyUsage) {
        const element = document.getElementById('weekly-usage');
        if (element) {
            element.innerText = (weeklyUsage || 0).toFixed(2);
        }
    }

    /**
     * Updates the models grid with quota information
     * @param {array} models Array of model quota data
     */
    function updateModelsGrid(models) {
        const grid = document.getElementById('models-grid');
        if (!grid) return;

        grid.innerHTML = ''; // Clear existing content

        // Sort models: Recommended first, then alphabetical
        const sortedModels = [...models].sort((a, b) => {
            if (a.isRecommended && !b.isRecommended) return -1;
            if (!a.isRecommended && b.isRecommended) return 1;
            return a.label.localeCompare(b.label);
        });

        sortedModels.forEach(model => {
            const card = createModelCard(model);
            grid.appendChild(card);
        });
    }

    /**
     * Creates a model quota card element
     * @param {object} model Model data
     * @returns {HTMLElement} Card element
     */
    function createModelCard(model) {
        const q = Math.round(model.rawQuota * QUOTA_PERCENTAGE_MULTIPLIER);
        const colorStyle = `background: ${getHSL(q)}; box-shadow: 0 0 10px ${getHSL(q)}`;

        // Calculate reset time display
        let resetDisplay = 'N/A';
        let countdownDisplay = '';
        if (model.resetTime) {
            const countdown = calculateCountdown(model.resetTime);
            resetDisplay = countdown.resetDisplay;
            countdownDisplay = countdown.countdownDisplay;
        }

        // Build skills badges
        const skillsList = [];
        if (model.skills.image) skillsList.push(createBadge('image', 'Vision: Supports Images'));
        if (model.skills.docs) skillsList.push(createBadge('docs', 'Context: Supports Docs/PDFs'));
        if (model.skills.audio) skillsList.push(createBadge('audio', 'Audio: Supports Voice/Audio'));
        if (model.skills.video) skillsList.push(createBadge('video', 'Video: Supports Video Input'));

        const skillsHtml = skillsList.length
            ? `<div style="display:flex; gap:6px; margin-top:8px;">${skillsList.join('')}</div>`
            : '';

        // Build tag display
        const tagHtml = model.tag
            ? `<span style="background:var(--accent); color:black; font-size:0.7em; padding:2px 6px; border-radius:4px; font-weight:bold; margin-left:8px; vertical-align:middle;">${model.tag.toUpperCase()}</span>`
            : '';

        // Create card element
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
            <div class="card-title" style="display:flex; align-items:center;">${model.label}${tagHtml}</div>
            <div class="metric-large">${q}%</div>
            <div class="bar-container">
                <div class="bar-fill" style="width: ${q}%; ${colorStyle}"></div>
            </div>
            ${skillsHtml}
            <div class="metric-sub" style="margin-top: 8px;">Resets: ${resetDisplay}</div>
            ${countdownDisplay}
        `;

        return el;
    }
})();
