import { z } from 'zod';

export const authContractVersion = 'v1' as const;

export const userIdSchema = z.string().uuid();
export const emailSchema = z.string().trim().email().max(320);

export const authRegisterRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const authLoginRequestSchema = authRegisterRequestSchema;

export const authUserSchema = z
  .object({
    userId: userIdSchema,
    email: emailSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const authSessionSchema = z
  .object({
    accessToken: z.string().min(32).max(128),
    user: authUserSchema,
  })
  .strict();

export type AuthRegisterRequest = z.infer<typeof authRegisterRequestSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
