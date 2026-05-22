// Supabase Edge Function: weekly-backup
// Scheduled (Sunday 23:00 local) via supabase/cron. Emails a ZIP of CSV dumps
// of every core table to Alex's inbox. Payroll data survives Supabase-side
// incidents.
//
// Environment variables required:
//   SUPABASE_SERVICE_ROLE_KEY   (server role for unrestricted SELECT)
//   RESEND_API_KEY              (email delivery)
//   BACKUP_RECIPIENT            (Alex's email)
//
// Tables exported: projects, workers, time_entries, material_entries,
// voice_logs, week_locks, audit_log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
const RECIPIENT = Deno.env.get('BACKUP_RECIPIENT');

const TABLES = [
  'projects',
  'workers',
  'time_entries',
  'material_entries',
  'voice_logs',
  'week_locks',
  'audit_log',
];

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const csvs: Record<string, string> = {};
    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      csvs[`${table}.csv`] = rowsToCSV(data ?? []);
    }

    if (!RESEND_KEY || !RECIPIENT) {
      return new Response(JSON.stringify({ ok: true, warning: 'Email not configured — backup ran but was not sent' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const attachments = Object.entries(csvs).map(([filename, content]) => ({
      filename,
      content: btoa(content),
    }));

    const date = new Date().toISOString().slice(0, 10);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Tricoat PM <no-reply@tricoat.local>',
        to: [RECIPIENT],
        subject: `Tricoat PM weekly backup — ${date}`,
        text: `Attached: CSV export of all tables as of ${date}.`,
        attachments,
      }),
    });

    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('[weekly-backup]', e);
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});

function rowsToCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}
