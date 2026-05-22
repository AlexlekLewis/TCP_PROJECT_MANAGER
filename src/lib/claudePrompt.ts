// Builder for the Claude voice-log parse prompt. Kept in shared lib so the
// Edge Function and the unit tests build exactly the same string.

export interface PromptContext {
  workers: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  /** Reference date for interpreting relative phrases like "yesterday". */
  today: string; // YYYY-MM-DD
  /** Preferred locale for date parsing. */
  locale?: string;
}

export const SYSTEM_PROMPT = `You are a logging assistant for a painting and decorating business. You convert conversational end-of-day voice notes from an on-site manager into structured time entries and material purchases.

Rules:
- Output must go through the \`parse_voice_log\` tool. Do not respond in prose.
- Every time entry needs: date (YYYY-MM-DD), worker_name (exact name from the supplied list), project_name (exact name from list), hours (numeric), optional notes, confidence (0..1), source_phrase.
- If the speaker splits a worker's day across sites, emit one entry per site.
- If a worker or project name is ambiguous or missing from the supplied list, add it to "unresolved" and emit no entry for it.
- Resolve relative dates ("yesterday", "Monday") against the supplied today date; week starts Monday.
- Hours: reject anything > 14 as a single entry and add a note in "unresolved".
- Materials: description + cost only; cost in AUD, numeric, no currency symbols.
- Confidence reflects how sure you are in the worker + project match and hours value. Below 0.9 means the reviewer will be asked to double-check.
- Always include the source_phrase — the portion of the transcript this entry came from.`;

export function buildUserPrompt(ctx: PromptContext, transcript: string): string {
  const workers = ctx.workers.map((w) => `- ${w.name}`).join('\n') || '- (none)';
  const projects = ctx.projects.map((p) => `- ${p.name}`).join('\n') || '- (none)';
  return `Today is ${ctx.today}.\n\nWorkers on the team:\n${workers}\n\nActive projects:\n${projects}\n\nTranscript:\n"""\n${transcript.trim()}\n"""`;
}

export const TOOL_SCHEMA = {
  name: 'parse_voice_log',
  description: 'Return the parsed time entries and materials from the manager transcript.',
  input_schema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO YYYY-MM-DD' },
            worker_name: { type: 'string' },
            project_name: { type: 'string' },
            hours: { type: 'number' },
            notes: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            source_phrase: { type: 'string' },
          },
          required: ['date', 'worker_name', 'project_name', 'hours', 'confidence', 'source_phrase'],
        },
      },
      materials: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            project_name: { type: 'string' },
            description: { type: 'string' },
            cost: { type: 'number' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            source_phrase: { type: 'string' },
          },
          required: ['date', 'project_name', 'description', 'cost', 'confidence', 'source_phrase'],
        },
      },
      unresolved: {
        type: 'array',
        items: { type: 'string' },
        description: 'Phrases that could not be mapped to a known worker or project',
      },
    },
    required: ['entries', 'materials', 'unresolved'],
  },
} as const;
