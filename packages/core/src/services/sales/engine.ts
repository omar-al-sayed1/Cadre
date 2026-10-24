import { getLeadRecommendations } from "./context";
import { askSalesCopilot } from "./copilot";
import { changeLeadStatus, createLead, rescoreLead, updateLead } from "./leads";
import { generateOutreachDraft, logMessage } from "./messaging";
import { requestLeadResearch, runLeadResearch } from "./research";
import { aiChangeLeadStatus, suppressLead } from "./automation";

/**
 * SalesAgentEngine (spec §47): the single entry point to the AI Sales Agent's
 * capabilities. Each operation applies deterministic business rules around the
 * LLM — the model proposes, validated rules decide what changes.
 *
 *   processLead / researchLead → queue research, then score + (maybe) qualify
 *   scoreLead                  → deterministic, configurable score
 *   generateOutreach           → AI draft, stored for human review
 *   analyzeReply               → AI analysis + rule-based consequences
 *   recommendNextAction        → deterministic next-best actions
 *   updateLead / changeStatus  → validated through the lead state machine
 *
 * Sequences, follow-ups, tasks and sending arrive in later phases and plug in
 * here.
 */
export const SalesAgentEngine = {
  createLead,
  updateLead,
  changeStatus: changeLeadStatus,
  aiChangeStatus: aiChangeLeadStatus,
  processLead: requestLeadResearch,
  researchLead: requestLeadResearch,
  runResearch: runLeadResearch,
  scoreLead: rescoreLead,
  generateOutreach: generateOutreachDraft,
  analyzeReply: logMessage,
  recommendNextAction: getLeadRecommendations,
  askCopilot: askSalesCopilot,
  suppress: suppressLead,
} as const;
