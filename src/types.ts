/**
 * Type Definitions for Personal AG Usage Extension
 * Defines interfaces for API responses, usage data, and internal structures
 */

/**
 * Represents a model's quota information and capabilities
 */
export interface QuotaGroup {
    /** Current quota as fraction (0.0 to 1.0) */
    rawQuota: number;
    /** ISO timestamp when quota resets, null for unlimited models */
    resetTime: string | null;
    /** Display name of the model */
    label: string;
    /** Whether user's tier allows access to this model */
    tierAllowed: boolean;
    /** Whether this is a recommended model for the user */
    isRecommended: boolean;
    /** Optional tag (e.g., "PRO", "PREVIEW") */
    tag?: string;
    /** Model capabilities */
    skills: {
        /** Supports image input (vision) */
        image: boolean;
        /** Supports video input */
        video: boolean;
        /** Supports audio input */
        audio: boolean;
        /** Supports document/PDF input */
        docs: boolean;
    };
}

/**
 * Raw API Response Types
 * These types match the structure returned by the AntiGravity API
 */
export interface QuotaInfo {
    remainingFraction?: number;
    resetTime?: string;
}

export interface ModelConfig {
    label: string;
    quotaInfo?: QuotaInfo;
    isRecommended?: boolean;
    supportsImages?: boolean;
    supportedMimeTypes?: Record<string, boolean>;
    tagTitle?: string;
}

export interface DefaultTeamConfig {
    allowMcpServers?: boolean;
    allowAutoRunCommands?: boolean;
    allowBrowserExperimentalFeatures?: boolean;
}

// Corrected based on raw JSON dump
export interface PlanInfo {
    planName: string;
    teamsTier: string;
    monthlyPromptCredits: number;
    monthlyFlowCredits: number;
    canBuyMoreCredits: boolean;
    hasAutocompleteFastMode: boolean;
    allowPremiumCommandModels: boolean;
    cascadeWebSearchEnabled: boolean;
    maxNumChatInputTokens: string;
    // New Capabilities
    browserEnabled?: boolean;
    knowledgeBaseEnabled?: boolean;
    cascadeCanAutoRunCommands?: boolean;
    defaultTeamConfig?: DefaultTeamConfig;
}

export interface PlanStatus {
    planInfo?: PlanInfo;
    availablePromptCredits?: number;
    availableFlowCredits?: number;
}

export interface ServerUserStatusResponse {
    userStatus?: {
        planStatus?: PlanStatus;
        cascadeModelConfigData?: {
            clientModelConfigs: ModelConfig[]
        };
    };
}

/**
 * Processed global plan and quota statistics
 */
export interface GlobalStats {
    /** Name of the current plan (e.g., "Pro", "Teams") */
    planName: string;
    /** Available features on the plan */
    features: {
        /** Fast autocomplete mode enabled */
        fastAutocomplete: boolean;
        /** Access to premium models */
        premiumModels: boolean;
        /** Web search capability */
        webSearch: boolean;
        /** Maximum chat input token limit */
        chatInputLimit: string;
    };
    /** Additional capabilities */
    capabilities: {
        /** Browser automation tool */
        browser: boolean;
        /** Knowledge base integration */
        knowledgeBase: boolean;
        /** MCP server support */
        mcp: boolean;
        /** Auto-run commands */
        autoRun: boolean;
    };
    /** Monthly prompt credits quota */
    promptCreditsCode: {
        total: number;
        available: number;
    };
    /** Monthly flow credits quota */
    flowCredits: {
        total: number;
        available: number;
    };
}

/**
 * Complete usage data structure returned by UsageService
 */
export interface UsageData {
    /** Global plan information and capabilities */
    global: GlobalStats;
    /** Array of model quota information */
    models: QuotaGroup[];
    /** Estimated weekly usage (rolling 7-day window) */
    weeklyUsage: number;
}

/**
 * Cached connection information for the AntiGravity API
 */
export interface CachedConnection {
    /** Port number of the local API server */
    port: number;
    /** CSRF token for authentication */
    csrfToken: string;
    /** Timestamp when this connection was established */
    timestamp: number;
}
