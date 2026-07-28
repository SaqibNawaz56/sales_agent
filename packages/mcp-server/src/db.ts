import { PrismaClient } from "@prisma/client";

/**
 * The only PrismaClient in the system. Nothing outside this package imports it,
 * which is what makes "all database access lives behind the MCP server" true.
 */
export const prisma = new PrismaClient();
