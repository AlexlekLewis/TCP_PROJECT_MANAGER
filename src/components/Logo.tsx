import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Visual size — controls the wordmark text size + image height. */
  size?: 'sm' | 'md' | 'lg';
  /** Show the "PAINTING AND DECORATING" tagline beside the wordmark. */
  withTagline?: boolean;
  className?: string;
}

/**
 * Tricoat logo.
 *
 * Renders the brand image from `/logo.svg` or `/logo.png` if either is
 * dropped into `/public/`. Falls back to a CSS wordmark using the brand
 * indigo (`--brand-indigo`).
 *
 * Image hierarchy:
 *   1. /logo.svg          (preferred — vector, scales clean)
 *   2. /logo.png
 *   3. CSS wordmark fallback
 */
export function Logo({ size = 'sm', withTagline = false, className }: Props) {
  const [imageStatus, setImageStatus] = useState<'svg' | 'png' | 'fallback'>('svg');

  const sizeClasses = {
    sm: { wrap: 'h-7', text: 'text-sm', tagline: 'text-[10px]' },
    md: { wrap: 'h-10', text: 'text-xl', tagline: 'text-xs' },
    lg: { wrap: 'h-16', text: 'text-3xl', tagline: 'text-sm' },
  }[size];

  if (imageStatus !== 'fallback') {
    return (
      <img
        src={imageStatus === 'svg' ? '/logo.svg' : '/logo.png'}
        alt="Tricoat Painting & Decorating"
        className={cn(sizeClasses.wrap, 'w-auto object-contain', className)}
        onError={() => setImageStatus(imageStatus === 'svg' ? 'png' : 'fallback')}
      />
    );
  }

  // CSS wordmark fallback — captures the brand identity without an image asset.
  return (
    <div
      aria-label="Tricoat Painting & Decorating"
      className={cn('flex items-center gap-2', className)}
    >
      <span
        className={cn(
          'font-semibold tracking-[0.18em] text-[hsl(var(--brand-indigo))]',
          sizeClasses.text,
        )}
      >
        TRICOAT
      </span>
      {withTagline && (
        <span
          className={cn(
            'hidden font-medium uppercase tracking-[0.18em] text-foreground sm:inline',
            sizeClasses.tagline,
          )}
        >
          Painting &amp; Decorating
        </span>
      )}
    </div>
  );
}
