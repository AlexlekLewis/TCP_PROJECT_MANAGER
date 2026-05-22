import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * Financial visibility is the single most important permission in this app.
 * - Admin (Alex) sees: hourly rates, labour $, material $, quoted price,
 *   project budgets, gross margin, full CSV exports.
 * - Manager (Gavin) sees: labour hours only. No $, no margin, no quote,
 *   no per-project cost totals. He can still enter a material cost when
 *   logging a purchase (he's the one buying), but he doesn't see aggregated
 *   financials anywhere else.
 */
export function useCanSeeFinancials(): boolean {
  const { role } = useAuth();
  return role === 'admin';
}

/** Renders children only when the current user can see financials. */
export function FinancialOnly({ children }: { children: ReactNode }) {
  return useCanSeeFinancials() ? <>{children}</> : null;
}
