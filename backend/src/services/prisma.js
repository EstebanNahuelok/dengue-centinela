import { PrismaClient } from '@prisma/client';

// Evita crear multiples instancias de PrismaClient con hot-reload de nodemon.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
