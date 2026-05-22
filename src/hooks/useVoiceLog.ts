import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { toISODate } from '@/lib/dates';
import type { ParsedVoiceResult } from '@/types/db';

// ---------- Web Speech API typings ----------
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { 0: SpeechRecognitionAlternative; isFinal: boolean };
type SpeechRecognitionResultList = { length: number; [i: number]: SpeechRecognitionResult };
type SpeechRecognitionEvent = { results: SpeechRecognitionResultList };
type SpeechRecognitionErrorEvent = { error: string };

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ---------- Hook ----------
export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'done' | 'error';

interface UseVoiceLogOptions {
  onResult: (transcript: string, parsed: ParsedVoiceResult) => void;
  onError?: (message: string) => void;
}

export function useVoiceLog({ onResult, onError }: UseVoiceLogOptions) {
  const [state, setState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = !!getRecognitionCtor();

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // already stopped
    }
  }, []);

  const cancel = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch { /* noop */ }
    setState('idle');
    setTranscript('');
    setError(null);
  }, []);

  const parse = useCallback(
    async (t: string) => {
      setState('parsing');
      try {
        const parsed = env.demoMode
          ? await demoParse(t)
          : await callEdgeFunction(t);
        onResult(t, parsed);
        setState('done');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Parse failed';
        setError(msg);
        setState('error');
        onError?.(msg);
      }
    },
    [onError, onResult],
  );

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      const msg = 'Speech recognition not supported on this browser. Type entries manually.';
      setError(msg);
      setState('error');
      onError?.(msg);
      return;
    }

    const rec = new Ctor();
    rec.lang = 'en-AU';
    rec.continuous = true;
    rec.interimResults = true;
    let buffer = '';

    rec.onresult = (e) => {
      const results = e.results;
      let finalText = '';
      let interim = '';
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      buffer = (finalText + ' ' + interim).trim();
      setTranscript(buffer);
    };
    rec.onerror = (e) => {
      setError(e.error);
      setState('error');
      onError?.(e.error);
    };
    rec.onend = () => {
      const final = buffer.trim();
      if (final) {
        setState('transcribing');
        parse(final);
      } else {
        setState('idle');
      }
    };

    recRef.current = rec;
    setState('recording');
    setError(null);
    setTranscript('');
    rec.start();
  }, [parse, onError]);

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    },
    [],
  );

  return { state, transcript, error, supported, start, stop, cancel, parseText: parse };
}

// ---------- Edge Function call ----------
async function callEdgeFunction(transcript: string): Promise<ParsedVoiceResult> {
  const { data, error } = await supabase.functions.invoke<ParsedVoiceResult>('parse-voice-log', {
    body: { transcript, today: toISODate(new Date()) },
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Empty response from parse-voice-log');
  return data;
}

// ---------- Demo mode: run a local heuristic parser ----------
async function demoParse(transcript: string): Promise<ParsedVoiceResult> {
  // Simple regex-based fallback — good enough to showcase the review flow.
  const today = toISODate(new Date());
  const lower = transcript.toLowerCase();
  const knownWorkers = ['Jerry', 'Pierce', 'Gavin', 'Alex'];
  const knownProjects = [
    'Northcote High School',
    'Preston High School',
    'Belmore School',
    'Ivanhoe Heritage Terrace',
  ];
  const entries: ParsedVoiceResult['entries'] = [];

  for (const worker of knownWorkers) {
    if (!lower.includes(worker.toLowerCase())) continue;
    for (const project of knownProjects) {
      const projKey = project.toLowerCase().split(' ')[0];
      const projRe = new RegExp(
        `${worker.toLowerCase()}[^.]*${projKey}[^.]*?(\\d+(?:\\.\\d+)?)\\s*(?:hours?|hrs?|h\\b)`,
        'i',
      );
      const m = transcript.match(projRe);
      if (m) {
        entries.push({
          date: today,
          worker_name: worker,
          project_name: project,
          hours: Number.parseFloat(m[1]),
          confidence: 0.85,
          source_phrase: m[0],
        });
      }
    }
  }

  return {
    entries,
    materials: [],
    unresolved: entries.length === 0 ? ['Could not parse any entries from the transcript'] : [],
  };
}
