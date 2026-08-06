import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Normalises every error response to `{ error: string }`.
 *
 * Not decoration. The React client reads `payload.error` and nothing else
 * (packages/frontend/src/api/post-json.ts), while Nest's default body is
 * `{ statusCode, message, error }` — and for a ValidationPipe rejection
 * `message` is an *array* of strings. Without this filter, every 400 the pipe
 * produces would render in the UI as "Bad Request" with the actual reason
 * discarded.
 *
 * Anything that is not an HttpException is a bug or an upstream failure, so it
 * becomes a 502 with a fixed message: an unhandled error's text may contain
 * internals, and the owner cannot act on it either way.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json({ error: flatten(body, exception.message) });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.BAD_GATEWAY)
      .json({ error: "The assistant is unavailable. Try again." });
  }
}

/** ValidationPipe hands back `{ message: string[] }`; everything else varies. */
function flatten(body: unknown, fallback: string): string {
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join("; ");
    if (typeof message === "string") return message;
  }
  return fallback;
}
