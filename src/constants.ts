export const CONFIG_NAMESPACE = 'personal-ag-usage';
export const REFRESH_COMMAND = 'personal-ag-usage.refresh';
export const DASHBOARD_COMMAND = 'personal-ag-usage.showDashboard';

export const PROCESS_IDENTIFIERS = {
    LANGUAGE_SERVER: 'language_server',
    ANTIGRAVITY: 'antigravity',
    CSRF_TOKEN: '--csrf_token'
};

export const API_ENDPOINTS = {
    GET_USER_STATUS: '/exa.language_server_pb.LanguageServerService/GetUserStatus'
};

export const IDE_INFO = {
    NAME: 'antigravity',
    VERSION: '1.0.0'
};

export const CACHE_TTL_MS = 300000;
export const REQUEST_TIMEOUT_MS = 2500;
export const RETRY_DELAY_MS = 150;
export const MAX_VALID_PID = 0x7FFFFFFF;
export const MIN_PORT = 1;
export const MAX_PORT = 65535;
export const MAX_PORT_VALIDATION_ATTEMPTS = 2;
