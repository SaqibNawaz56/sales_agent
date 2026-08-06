import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Validates a request body against a schema handed to it explicitly.
 *
 * The schema arrives as a constructor argument, not through reflection, so this
 * pipe works identically under tsx, tsc, SWC or anything else. There is no
 * configuration under which it quietly does nothing.
 *
 * The message is flattened to a single string because the ErrorFilter renders
 * `{ error: string }` and the React client reads exactly that field.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => issue.message)
        .join("; ");
      throw new BadRequestException(detail);
    }

    return result.data;
  }
}
