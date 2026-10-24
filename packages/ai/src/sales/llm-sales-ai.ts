import { LLMError, type LLMProvider } from "../llm/types";
import { StructuredCaller } from "../service/structured-caller";
import type { AiCallMeta, AiResult } from "../service/types";
import type { AiTelemetrySink } from "../telemetry";
import { comparableUrl, keepSourcedProspects } from "./discovery-filter";
import {
  buildDiscoveryExtractPrompt,
  buildDiscoveryExtractSystem,
  buildDiscoverySearchPrompt,
  buildDiscoverySearchSystem,
  DISCOVERY_BLOCKED_DOMAINS,
  SALES_DISCOVERY_PROMPT_VERSION,
} from "./prompts/discovery.v1";
import {
  buildAssessPrompt,
  buildAssessSystem,
  buildPlanPrompt,
  buildPlanSystem,
  buildReadPrompt,
  buildReadSystem,
  SALES_PROSPECTING_PROMPT_VERSION,
} from "./prompts/prospecting.v1";
import {
  listingReadSchema,
  prospectAssessmentSchema,
  prospectDiscoverySchema,
  prospectSearchPlanSchema,
  type DiscoveryMode,
  type ProspectDiscovery,
} from "./schemas-discovery";
import {
  buildSalesCopilotSystem,
  buildSalesCopilotUserMessage,
  SALES_COPILOT_PROMPT_VERSION,
} from "./prompts/copilot.v1";
import { salesCopilotAnswerSchema } from "./schemas";
import {
  conversationAnalysisSchema,
  leadResearchSchema,
  outreachDraftSchema,
} from "./schemas-core";
import {
  buildAnalysisSystem,
  buildAnalysisUserMessage,
  buildOutreachSystem,
  buildOutreachUserMessage,
  buildResearchSystem,
  buildResearchUserMessage,
  SALES_ANALYSIS_PROMPT_VERSION,
  SALES_OUTREACH_PROMPT_VERSION,
  SALES_RESEARCH_PROMPT_VERSION,
} from "./prompts/core.v1";
import type {
  AnalyzeConversationInput,
  AssessProspectsInput,
  DiscoverProspectsInput,
  ProspectPlanInput,
  ReadListingInput,
  OutreachInput,
  ResearchInput,
  SalesAI,
  SalesCopilotInput,
} from "./types";

export interface LlmSalesAIOptions {
  provider: LLMProvider;
  /** Model for latency-sensitive assistant answers; defaults to the provider's model. */
  fastModel?: string;
  telemetry?: AiTelemetrySink;
  maxAttempts?: number;
}

/** Production SalesAI: versioned prompts over any LLMProvider, validated JSON out. */
export class LlmSalesAI implements SalesAI {
  readonly providerName: string;
  readonly modelName: string;
  private readonly caller: StructuredCaller;

  constructor(private readonly options: LlmSalesAIOptions) {
    this.providerName = options.provider.name;
    this.modelName = options.provider.defaultModel;
    this.caller = new StructuredCaller({
      provider: options.provider,
      telemetry: options.telemetry,
      maxAttempts: options.maxAttempts,
    });
  }

  copilot(input: SalesCopilotInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_COPILOT",
        promptVersion: SALES_COPILOT_PROMPT_VERSION,
        system: buildSalesCopilotSystem(input),
        user: buildSalesCopilotUserMessage(input),
        schema: salesCopilotAnswerSchema,
        schemaName: "sales_copilot_answer",
        effort: "low",
        maxTokens: 8_000,
        model: this.options.fastModel,
      },
      { ...meta, agentType: "SALES" },
    );
  }

  research(input: ResearchInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_RESEARCH",
        promptVersion: SALES_RESEARCH_PROMPT_VERSION,
        system: buildResearchSystem(input),
        user: buildResearchUserMessage(input),
        schema: leadResearchSchema,
        schemaName: "lead_research",
        effort: "medium",
        maxTokens: 12_000,
      },
      { ...meta, agentType: "SALES" },
    );
  }

  generateOutreach(input: OutreachInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_GENERATE_MESSAGE",
        promptVersion: SALES_OUTREACH_PROMPT_VERSION,
        system: buildOutreachSystem(input),
        user: buildOutreachUserMessage(input),
        schema: outreachDraftSchema,
        schemaName: "outreach_draft",
        effort: "low",
        maxTokens: 6_000,
        model: this.options.fastModel,
      },
      { ...meta, agentType: "SALES" },
    );
  }

  readonly canReason = true;

  planProspectSearch(input: ProspectPlanInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_DISCOVER",
        promptVersion: SALES_PROSPECTING_PROMPT_VERSION,
        system: buildPlanSystem(input),
        user: buildPlanPrompt(input),
        schema: prospectSearchPlanSchema,
        schemaName: "prospect_search_plan",
        effort: "low",
        maxTokens: 4_000,
        model: this.options.fastModel,
      },
      { ...meta, agentType: "SALES" },
    );
  }

  readListingPage(input: ReadListingInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_DISCOVER",
        promptVersion: SALES_PROSPECTING_PROMPT_VERSION,
        system: buildReadSystem(input),
        user: buildReadPrompt(input),
        schema: listingReadSchema,
        schemaName: "listing_read",
        effort: "low",
        maxTokens: 8_000,
        model: this.options.fastModel,
      },
      { ...meta, agentType: "SALES" },
    );
  }

  assessProspects(input: AssessProspectsInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_DISCOVER",
        promptVersion: SALES_PROSPECTING_PROMPT_VERSION,
        system: buildAssessSystem(input),
        user: buildAssessPrompt(input),
        schema: prospectAssessmentSchema,
        schemaName: "prospect_assessment",
        effort: "low",
        maxTokens: 10_000,
        model: this.options.fastModel,
      },
      { ...meta, agentType: "SALES" },
    );
  }

  get discoveryMode(): DiscoveryMode {
    return this.caller.canSearchWeb ? "web" : "unavailable";
  }

  /**
   * Two steps: (1) Claude searches the web and writes notes; (2) a structured
   * call turns the notes into JSON. Every source URL is then checked against
   * the URLs the search tool actually returned, so a remembered or invented
   * company can't get through.
   */
  async discoverProspects(
    input: DiscoverProspectsInput,
    meta: AiCallMeta = {},
  ): Promise<AiResult<ProspectDiscovery>> {
    const callMeta = { ...meta, agentType: "SALES" as const };
    if (!this.caller.canSearchWeb) {
      throw new LLMError("BAD_REQUEST", "This AI provider has no web search tool", {
        retryable: false,
      });
    }
    const ownDomain = comparableUrl(input.business.website)?.split("/")[0];
    const search = await this.caller.searchWeb(
      {
        operation: "SALES_DISCOVER",
        promptVersion: SALES_DISCOVERY_PROMPT_VERSION,
        system: buildDiscoverySearchSystem(input),
        prompt: buildDiscoverySearchPrompt(input),
        maxSearches: Math.min(12, 3 + Math.ceil(input.criteria.count / 2)),
        blockedDomains: [...DISCOVERY_BLOCKED_DOMAINS, ...(ownDomain ? [ownDomain] : [])],
        effort: "medium",
        maxTokens: 16_000,
        timeoutMs: 240_000,
      },
      callMeta,
    );
    if (search.results.length === 0 || !search.text) {
      return {
        data: {
          prospects: [],
          searchSummary: "The web search didn't return usable results for these criteria.",
          notes: ["Try broader criteria (more industries or countries) and search again."],
        },
        promptVersion: SALES_DISCOVERY_PROMPT_VERSION,
        provider: this.providerName,
        model: search.model,
      };
    }
    const extracted = await this.caller.call(
      {
        operation: "SALES_DISCOVER",
        promptVersion: SALES_DISCOVERY_PROMPT_VERSION,
        system: buildDiscoveryExtractSystem(),
        user: buildDiscoveryExtractPrompt(input, search.text, search.results),
        schema: prospectDiscoverySchema,
        schemaName: "prospect_discovery",
        effort: "low",
        maxTokens: 12_000,
        model: this.options.fastModel,
      },
      callMeta,
    );
    return {
      ...extracted,
      data: keepSourcedProspects(extracted.data, search.results, input.criteria.count),
    };
  }

  analyzeConversation(input: AnalyzeConversationInput, meta: AiCallMeta = {}) {
    return this.caller.call(
      {
        operation: "SALES_ANALYZE_CONVERSATION",
        promptVersion: SALES_ANALYSIS_PROMPT_VERSION,
        system: buildAnalysisSystem(input),
        user: buildAnalysisUserMessage(input),
        schema: conversationAnalysisSchema,
        schemaName: "conversation_analysis",
        effort: "low",
        maxTokens: 6_000,
        model: this.options.fastModel,
      },
      { ...meta, agentType: "SALES" },
    );
  }
}
