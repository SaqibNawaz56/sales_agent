import { Controller, Get } from "@nestjs/common";

import { usageSnapshot } from "../usage";

/**
 * GET /api/usage
 *
 * What Groq last said about the remaining quota, plus what this process has
 * spent since it started.
 *
 * Read-only and dependency-free — it touches no draft, no database and no
 * model, so polling it costs nothing and cannot perturb a sale in progress.
 * That matters because the client polls it on a timer.
 *
 * `observedAt` is included deliberately. These figures are a reading taken
 * during the last call to Groq, not a live gauge: between calls the bucket
 * refills and this server has no way to know. The client shows the age so the
 * number is never mistaken for something it is not.
 */
@Controller("api")
export class UsageController {
  @Get("usage")
  usage() {
    return { ...usageSnapshot(), serverTime: Date.now() };
  }
}
