import prisma from "../db.server";

interface ShopInfo {
  shop: string;
  name: string;
  accessToken: string;
}

/**
 * Ensures shop info is persisted and the access token is current.
 *
 * - No record yet → fetch shop name from Shopify, save everything.
 * - Record exists but token differs (rotated/refreshed) → update token.
 * - Record exists and token matches → no-op.
 *
 * `fetchShopName` is a callback so this service stays decoupled from the
 * Shopify admin client.
 */
export async function ensureShopInfo(
  shopDomain: string,
  currentToken: string,
  fetchShopName: () => Promise<string>,
): Promise<void> {
  const existing = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    select: { accessToken: true },
  });

  if (!existing) {
    const name = await fetchShopName();
    await prisma.shop.create({
      data: { shop: shopDomain, name, accessToken: currentToken },
    });
    return;
  }

  if (existing.accessToken !== currentToken) {
    await prisma.shop.update({
      where: { shop: shopDomain },
      data: { accessToken: currentToken },
    });
  }
}

export async function getShopInfo(
  shop: string,
): Promise<ShopInfo | null> {
  return prisma.shop.findUnique({
    where: { shop },
    select: { shop: true, name: true, accessToken: true },
  });
}
