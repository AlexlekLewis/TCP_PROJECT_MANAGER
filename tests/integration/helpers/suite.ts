import { describe } from 'vitest';
import { hasStack } from './env';

/**
 * `describe` that becomes `describe.skip` without a local stack, so the whole
 * suite — hooks included — sits out a plain `npm run test`.
 */
export const describeStack = hasStack ? describe : describe.skip;
