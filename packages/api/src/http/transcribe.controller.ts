import {
  BadGatewayException,
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { transcribeAudio } from "../transcription";

/** Comfortably above a spoken sale, far below Groq's 25 MB free-tier ceiling. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
];

/**
 * POST /api/transcribe   multipart, field "audio"
 *
 * Turns recorded speech into text and returns it. It does not touch a draft and
 * it cannot write anything: the transcript goes back to the browser, into the
 * composer, and the owner still presses Send. Dictation is a way of typing, not
 * a way of instructing the agent.
 *
 * The Groq key stays on this side. The browser only ever uploads audio.
 */
@Controller("api")
export class TranscribeController {
  private readonly logger = new Logger(TranscribeController.name);

  @Post("transcribe")
  @HttpCode(HttpStatus.OK)
  // FileInterceptor is a class, and @UploadedFile is an explicit parameter
  // decorator, so neither depends on the type metadata esbuild declines to emit.
  @UseInterceptors(FileInterceptor("audio", { limits: { fileSize: MAX_BYTES } }))
  async transcribe(@UploadedFile() file?: Express.Multer.File) {
    if (!file || file.size === 0) {
      throw new BadRequestException("No audio was uploaded.");
    }

    // The browser reports the container it recorded; anything else is a client
    // that is not this app.
    const mimeType = (file.mimetype ?? "").split(";")[0].trim();
    if (!ALLOWED.includes(mimeType)) {
      throw new BadRequestException(`Unsupported audio format: ${mimeType}`);
    }

    try {
      const text = await transcribeAudio(
        file.buffer,
        mimeType,
        file.originalname || "dictation",
      );
      return { text };
    } catch (error) {
      this.logger.error("transcription failed", error as Error);
      throw new BadGatewayException(
        "Could not transcribe that. Type it instead.",
      );
    }
  }
}
