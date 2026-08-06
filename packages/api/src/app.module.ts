import { Module } from "@nestjs/common";

import { ChatController } from "./http/chat.controller";
import { HealthController } from "./http/health.controller";
import { SalesController } from "./http/sales.controller";
import { TranscribeController } from "./http/transcribe.controller";
import { UsageController } from "./http/usage.controller";
import { SaleService } from "./sales";
import { SessionStore, sessionStore } from "./session";

/**
 * The composition root.
 *
 * SessionStore is bound with useValue rather than left for Nest to construct.
 * The CLI and the verification scripts hold that same instance, so binding the
 * class would give the HTTP API a second, empty store and a sale started in one
 * would be invisible to the other.
 *
 * Only two things are providers, and that is the point. draft/, checklist/,
 * questions/, summary/ and reporting/ are pure functions; llm/, mcp/ and
 * catalogue/ are stateless callers of one process-wide client. Wrapping any of
 * them in @Injectable would add indirection without adding a seam worth
 * mocking. What DI buys here is exactly two things — one object that holds
 * state (SessionStore) and one that orchestrates the write (SaleService).
 */
@Module({
  controllers: [
    HealthController,
    ChatController,
    SalesController,
    TranscribeController,
    UsageController,
  ],
  providers: [SaleService, { provide: SessionStore, useValue: sessionStore }],
})
export class AppModule {}
