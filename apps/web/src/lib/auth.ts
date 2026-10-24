import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { brand } from "@repo/config";
import { getServerEnv } from "@repo/config/env";
import { getDb } from "@repo/database";
import { resetPasswordEmail, verifyEmail } from "@repo/email";
import { jobQueue } from "@repo/queue";

const env = getServerEnv();

const trustedOrigins = [
  env.APP_URL,
  ...(env.AUTH_TRUSTED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? []),
];

/**
 * Recruiter authentication (spec Module A). Candidates never use these
 * accounts — they authenticate with invitation tokens + session credentials.
 */
export const auth = betterAuth({
  appName: brand.productName,
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(getDb(), { provider: "postgresql" }),
  user: {
    modelName: "user",
    additionalFields: {
      platformRole: { type: "string", required: false, input: false, defaultValue: "USER" },
      activeCompanyId: { type: "string", required: false, input: false },
    },
  },
  session: {
    modelName: "authSession",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  account: {
    modelName: "authAccount",
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  verification: { modelName: "verification" },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const email = resetPasswordEmail({ name: user.name, url });
      await jobQueue.enqueue("email.send", { to: user.email, ...email });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const email = verifyEmail({ name: user.name, url });
      await jobQueue.enqueue("email.send", { to: user.email, ...email });
    },
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
          },
        }
      : {},
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 300, max: 5 },
      "/forget-password": { window: 900, max: 5 },
      "/request-password-reset": { window: 900, max: 5 },
      "/reset-password": { window: 900, max: 10 },
      "/send-verification-email": { window: 300, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookiePrefix: "aii",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await getDb()
            .user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } })
            .catch(() => undefined);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
