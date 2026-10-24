import { getServerEnv } from "@repo/config/env";
import {
  ConsoleEmailProvider,
  ResendEmailProvider,
  SmtpEmailProvider,
  type EmailProvider,
} from "./providers";

export * from "./providers";
export * from "./templates";
export { renderLayout } from "./layout";

let instance: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  const env = getServerEnv();
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      instance = new ResendEmailProvider(env.EMAIL_API_KEY!, env.EMAIL_FROM);
      break;
    case "smtp":
      instance = new SmtpEmailProvider(env.SMTP_URL!, env.EMAIL_FROM);
      break;
    default:
      instance = new ConsoleEmailProvider();
  }
  return instance;
}

export function setEmailProviderForTesting(provider: EmailProvider | undefined): void {
  instance = provider;
}
