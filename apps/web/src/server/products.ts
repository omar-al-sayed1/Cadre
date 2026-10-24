import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { ProductKey } from "@repo/config";
import {
  can,
  getAgentDefinition,
  listProductAccess,
  type ActorContext,
  type ProductAccess,
} from "@repo/core";
import { requireActor } from "./auth-context";

/** Product access for the current workspace, cached per request. */
export const getWorkspaceProducts = cache(async (companyId: string): Promise<ProductAccess[]> =>
  listProductAccess(companyId),
);

/** Products this workspace subscribes to (including lapsed subscriptions, whose data stays). */
export async function getSubscribedProducts(companyId: string): Promise<Set<ProductKey>> {
  const products = await getWorkspaceProducts(companyId);
  return new Set(products.filter((p) => p.status !== null).map((p) => p.product.key));
}

/**
 * Gate for a product's settings pages: they exist only for workspaces that
 * subscribe to the product (a sales-only workspace has no interviewer settings,
 * and vice versa).
 */
export async function requireProductSettings(productKey: ProductKey): Promise<ActorContext> {
  const actor = await requireActor();
  if (!(await getSubscribedProducts(actor.companyId)).has(productKey))
    redirect("/settings/company");
  return actor;
}

export interface ProductPageContext {
  actor: ActorContext;
  access: ProductAccess;
  /** False when the subscription lapsed: data stays readable, new work is blocked by the services. */
  writable: boolean;
}

/**
 * Gate for a product's pages. Never-subscribed workspaces go to the product's
 * marketplace page; users whose role can't use the product go home. A lapsed
 * subscription keeps pages readable (the services refuse new work).
 */
export async function requireProductPage(productKey: ProductKey): Promise<ProductPageContext> {
  const actor = await requireActor();
  const access = (await getWorkspaceProducts(actor.companyId)).find(
    (p) => p.product.key === productKey,
  );
  const definition = getAgentDefinition(productKey);
  if (!access || !definition) redirect("/home");
  if (access.status === null) redirect(`/marketplace/${productKey}`);
  if (!can(actor, definition.readPermission)) redirect("/home");
  return { actor, access, writable: access.active };
}
