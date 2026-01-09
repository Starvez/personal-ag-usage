export interface QuotaGroup {
    rawQuota: number;
    resetTime: string | null;
    label: string;
    tierAllowed: boolean;
    isRecommended: boolean;
    tag?: string;
    skills: {
        image: boolean;
        video: boolean;
        audio: boolean;
        docs: boolean;
    };
}

// RAW API TYPES
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

export interface GlobalStats {
    planName: string;
    features: {
        fastAutocomplete: boolean;
        premiumModels: boolean;
        webSearch: boolean;
        chatInputLimit: string;
    };
    capabilities: {
        browser: boolean;
        knowledgeBase: boolean;
        mcp: boolean;
        autoRun: boolean;
    };
    promptCreditsCode: {
        total: number;
        available: number;
    };
    flowCredits: {
        total: number;
        available: number;
    };
}

export interface UsageData {
    global: {
        promptCreditsCode: { total: number; available: number }; // "Code" credits? Or just Prompt credits.
        flowCredits: { total: number; available: number };
        planName: string;
    };
    models: QuotaGroup[];
    weeklyUsage: number;
}

export interface CachedConnection {
    port: number;
    csrfToken: string;
    timestamp: number;
}
