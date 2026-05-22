import { describe, expect, it } from 'vitest';
import { resolveParsedVoice } from './voiceParser';

const workers = [
  { id: 'j', name: 'Jerry' },
  { id: 'p', name: 'Pierce' },
];
const projects = [
  { id: 'n', name: 'Northcote High School' },
  { id: 'pre', name: 'Preston High School' },
];

describe('resolveParsedVoice', () => {
  it('matches exact names and marks confidence', () => {
    const res = resolveParsedVoice(
      {
        entries: [
          {
            date: '2026-04-20',
            worker_name: 'Jerry',
            project_name: 'Northcote High School',
            hours: 10,
            confidence: 0.95,
            source_phrase: 'Jerry at Northcote for 10',
          },
        ],
        materials: [],
        unresolved: [],
      },
      workers,
      projects,
    );
    expect(res.entries[0].worker_id).toBe('j');
    expect(res.entries[0].project_id).toBe('n');
    expect(res.entries[0].needs_review).toBe(false);
  });

  it('flags review when worker match is weak', () => {
    const res = resolveParsedVoice(
      {
        entries: [
          {
            date: '2026-04-20',
            worker_name: 'Jermy',
            project_name: 'Northcote High School',
            hours: 10,
            confidence: 0.98,
            source_phrase: 'Jermy...',
          },
        ],
        materials: [],
        unresolved: [],
      },
      workers,
      projects,
    );
    expect(res.entries[0].worker_id).toBe('j');
    expect(res.entries[0].needs_review).toBe(true); // fuzzy match below 0.9
  });

  it('leaves unresolved when no match found', () => {
    const res = resolveParsedVoice(
      {
        entries: [
          {
            date: '2026-04-20',
            worker_name: 'Ringo',
            project_name: 'Mystery Site',
            hours: 5,
            confidence: 0.6,
            source_phrase: 'Ringo at Mystery',
          },
        ],
        materials: [],
        unresolved: [],
      },
      workers,
      projects,
    );
    expect(res.entries[0].worker_id).toBeNull();
    expect(res.entries[0].needs_review).toBe(true);
  });
});
