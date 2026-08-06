import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { ErrorFilter } from "./http/error.filter";

const PORT = Number(process.env.API_PORT ?? 3000);

/**
 * Builds the Nest application without starting it.
 *
 * Separated from bootstrap() for the same reason createApp() was separated from
 * the listen() call: Supertest mounts the real routes in-process. A test that
 * binds a port would be testing the network as much as the handlers, and would
 * collide with the running container.
 *
 * There is deliberately no global ValidationPipe. It would validate nothing
 * here — it infers the DTO class from `design:paramtypes`, which esbuild does
 * not emit and `tsx watch` is what runs this in the container — while looking
 * like the request bodies were checked. Each route names its own zod schema
 * instead; see http/request.schemas.ts.
 */
export async function createApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.useGlobalFilters(new ErrorFilter());

  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(PORT, "0.0.0.0");
  new Logger("bootstrap").log(`api listening on http://0.0.0.0:${PORT}`);
}

// Guarded so Supertest can import createApp without starting a listener.
if (require.main === module) {
  bootstrap();
}
