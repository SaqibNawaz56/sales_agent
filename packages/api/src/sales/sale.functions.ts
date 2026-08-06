import { sessionStore } from "../session";
import { SaleService } from "./sale.service";
import type { TurnResult } from "./sales.types";

/**
 * Function facade over a default SaleService.
 *
 * cli.ts and the Day 2–7 verification scripts are plain Node entrypoints with
 * no Nest container and call these directly. The instance below shares
 * `sessionStore` with the one Nest builds, so the CLI and the HTTP API see one
 * set of drafts, not two.
 */
const defaultService = new SaleService(sessionStore);

export function handleMessage(
  sessionId: string,
  message: string,
): Promise<TurnResult> {
  return defaultService.handle(sessionId, message);
}

export function confirmSale(sessionId: string): Promise<TurnResult> {
  return defaultService.confirm(sessionId);
}

export function cancelSale(sessionId: string): TurnResult {
  return defaultService.cancel(sessionId);
}
