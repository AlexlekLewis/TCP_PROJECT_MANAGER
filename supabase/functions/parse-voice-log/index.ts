// Supabase Edge Function: parse-voice-log
// Accepts { transcript, today } from an authenticated client, calls Claude
// Haiku with the parse_voice_log tool, fuzzy-matches worker/project names to
// IDs, and returns a ResolvedVoiceResult the review screen renders.
//
// Environment variables required:
//   ANTHROPIC_API_KEY   (required) — set via `supabase secrets set`
//   CLAUDE_MODEL        (optional) — defaults to claude-haiku-4-5
//
// This runs in Deno. Do not import Node-only modules.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.39.0';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const CLAUDE_MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-haiku-4-5';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// CORS — explicit allowlist. Set ALLOWED_ORIGINS via `supabase secrets set`
// to a comma-separated list, e.g.
//   ALLOWED_ORIGINS=https://tcpprojectmanagerbuild.vercel.app,http://localhost:5173
// Defaults below cover the known prod + dev origins.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://tcpprojectmanagerbuild.vercel.app',
  'https://tcpprojectmanagerbuild-alex-lewis-projects-6e9bb13b.vercel.app',
  'http://localhost:5173',
];
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ORIGIN_ALLOWLIST.includes(origin);
  return {
    // Only echo back the origin if it's in the allowlist; otherwise empty header
    // which the browser will reject for cross-origin requests.
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const SYSTEM_PROMPT = `You are a logging assistant for a painting and decorating business. You convert conversational end-of-day voice notes from an on-site manager into structured time entries and material purchases.

Rules:
- Output must go through the parse_voice_log tool. Do not respond in prose.
- Every time entry needs: date (YYYY-MM-DD), worker_name (exact name from the supplied list), project_name (exact name from list), hours (numeric), optional notes, confidence (0..1), source_phrase.
- If the speaker splits a worker's day across sites, emit one entry per site.
- If a worker or project name is ambiguous or missing from the supplied list, add it to "unresolved" and emit no entry for it.
- Resolve relative dates ("yesterday", "Monday") against the supplied today date; week starts Monday.
- Hours: reject anything > 14 as a single entry and add a note in "unresolved".
- Materials: description + cost only; cost in AUD, numeric, no currency symbols.
- Confidence reflects how sure you are in the worker + project match and hours value. Below 0.9 means the reviewer will be asked to double-check.
- Always include the source_phrase — the portion of the transcript this entry came from.`;

const TOOL_SCHEMA = {
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
            date: { type: 'string' },
            worker_name: { type: 'string' },
            project_name: { type: 'string' },
            hours: { type: 'number' },
            notes: { type: 'string' },
            confidence: { type: 'number' },
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
            confidence: { type: 'number' },
            source_phrase: { type: 'string' },
          },
          required: ['date', 'project_name', 'description', 'cost', 'confidence', 'source_phrase'],
        },
      },
      unresolved: { type: 'array', items: { type: 'string' } },
    },
    required: ['entries', 'materials', 'unresolved'],
  },
};

Deno.serve(async (req) => {
  const headers = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return json(headers, { error: 'Method not allowed' }, 405);
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return json(headers, { error: 'voice_parse_unavailable' }, 503);
    }

    const auth = req.headers.get('Authorization');
    if (!auth) return json(headers, { error: 'unauthorized' }, 401);

    // Verify the caller is an authenticated user and fetch workers/projects on their behalf.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json(headers, { error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => null) as
      | { transcript?: string; today?: string }
      | null;
    const transcript = body?.transcript?.trim();
    const today = body?.today ?? new Date().toISOString().slice(0, 10);
    if (!transcript) return json(headers, { error: 'empty_transcript' }, 400);
    if (transcript.length > 4000) return json(headers, { error: 'transcript_too_long' }, 413);

    const [{ data: workers }, { data: projects }] = await Promise.all([
      supabase.from('workers').select('id,name').eq('active', true),
      supabase.from('projects').select('id,name').eq('status', 'active'),
    ]);

    const userContent =
      `Today is ${today}.\n\n` +
      `Workers on the team:\n${(workers ?? []).map((w) => `- ${w.name}`).join('\n') || '- (none)'}\n\n` +
      `Active projects:\n${(projects ?? []).map((p) => `- ${p.name}`).join('\n') || '- (none)'}\n\n` +
      `Transcript:\n"""\n${transcript}\n"""`;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'parse_voice_log' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return json(headers, { error: 'parse_failed' }, 502);
    }

    return json(headers, toolBlock.input, 200);
  } catch (e) {
    // Log the raw error server-side, but never echo it to the client. Driver
    // strings, model names, key prefixes etc must not leak out of the function.
    console.error('[parse-voice-log]', e);
    return json(headers, { error: 'internal_error' }, 500);
  }
});

function json(headers: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
