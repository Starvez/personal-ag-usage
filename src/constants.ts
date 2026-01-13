/**
 * Extension Configuration Constants
 * Centralized configuration for the Personal AG Usage extension
 */

// Command Identifiers
export const CONFIG_NAMESPACE = 'personal-ag-usage';
export const REFRESH_COMMAND = 'personal-ag-usage.refresh';
export const DASHBOARD_COMMAND = 'personal-ag-usage.showDashboard';

// Process Discovery
export const PROCESS_IDENTIFIERS = {
    LANGUAGE_SERVER: 'language_server',
    ANTIGRAVITY: 'antigravity',
    CSRF_TOKEN: '--csrf_token'
};

// API Configuration
export const API_ENDPOINTS = {
    GET_USER_STATUS: '/exa.language_server_pb.LanguageServerService/GetUserStatus'
};

export const IDE_INFO = {
    NAME: 'antigravity',
    VERSION: '1.0.0'
};

// Network Configuration
export const LOCALHOST = '127.0.0.1';
export const REQUEST_TIMEOUT_MS = 2500;
export const RETRY_DELAY_MS = 150;
export const MAX_RETRY_ATTEMPTS = 3;

// HTTP Status Codes
export const HTTP_SUCCESS_MIN = 200;
export const HTTP_SUCCESS_MAX = 299;

// Connection Caching
/** Cache connection info for 5 minutes to reduce overhead */
export const CACHE_TTL_MS = 300000;

// Process and Port Validation
export const MAX_VALID_PID = 0x7FFFFFFF;
export const MIN_PORT = 1;
export const MAX_PORT = 65535;

// Auto-Refresh Configuration
/** Status bar refresh interval in milliseconds (60 seconds) */
export const AUTO_REFRESH_INTERVAL_MS = 60000;

// Quota Alert Thresholds
/** Quota percentage below which to show warning alerts */
export const QUOTA_CRITICAL_THRESHOLD = 10;
/** Quota percentage above which to detect a reset */
export const QUOTA_RESET_HIGH_THRESHOLD = 90;
/** Previous quota percentage below which to detect a reset */
export const QUOTA_RESET_LOW_THRESHOLD = 50;

// Quota Icon Thresholds (for status bar tooltip)
export const QUOTA_THRESHOLDS = {
    /** Green icon (excellent) */
    EXCELLENT: 90,
    /** Green icon (very good) */
    VERY_GOOD: 80,
    /** Yellow icon (good) */
    GOOD: 70,
    /** Yellow icon (moderate) */
    MODERATE: 60,
    /** Yellow icon (fair) */
    FAIR: 50,
    /** Orange icon (low) */
    LOW: 40,
    /** Orange icon (very low) */
    VERY_LOW: 30,
    /** Orange icon (critical) */
    CRITICAL: 20,
    /** Red icon (depleted) */
    DEPLETED: 10
};

// Usage Tracking Configuration
/** Rolling window for local usage tracking (7 days in milliseconds) */
export const USAGE_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Minimum quota drop to count as usage (filters noise) */
export const USAGE_DETECTION_MIN_THRESHOLD = 0.0001;
/** Maximum quota drop to count as usage (filters resets) */
export const USAGE_DETECTION_MAX_THRESHOLD = 0.9;
/** Storage key for usage history */
export const STORAGE_KEY_HISTORY = 'usage_history_v1';
/** Storage key for last known quotas */
export const STORAGE_KEY_LAST_QUOTAS = 'last_quotas_v1';

// Time Calculation Constants
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

// UI Display Constants
/** Divisor for converting context tokens to thousands (k) */
export const CONTEXT_DISPLAY_DIVISOR = 1024;
/** Maximum HSL hue for color gradient (green) */
export const HSL_MAX_HUE = 120;
/** Quota percentage multiplier for display */
export const QUOTA_PERCENTAGE_MULTIPLIER = 100;
/** Quota step size for color bucketing */
export const QUOTA_COLOR_STEP = 10;
