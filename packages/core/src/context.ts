import type { CompanyRole, PlatformRole } from "@repo/shared";
import { AppError } from "@repo/shared";
import { roleHasPermission, type Permission } from "./permissions";

/** The authenticated recruiter-side caller. Every service method takes one. */
export interface ActorContext {
  userId: string;
  userName: string;
  companyId: string;
  role: CompanyRole;
  platformRole: PlatformRole;
  requestId?: string;
  ipHash?: string;
}

export function can(ctx: ActorContext, permission: Permission): boolean {
  return roleHasPermission(ctx.role, permission);
}

export function requirePermission(ctx: ActorContext, permission: Permission): void {
  if (!can(ctx, permission)) {
    throw new AppError("FORBIDDEN", { message: "Your role doesn't allow this action." });
  }
}

export function requireSuperAdmin(ctx: { platformRole: PlatformRole }): void {
  if (ctx.platformRole !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
}
