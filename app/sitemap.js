import { getAllProducts } from "@/lib/products";
import { SITE_URL, slugify } from "@/lib/utils";

export default async function sitemap() {
  const products = await getAllProducts();

  const productUrls = products.map((p) => ({
    url: `${SITE_URL}/products/${slugify(p.name)}`,
    lastModified: p.createdAt ? new Date(p.createdAt) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...productUrls,
  ];
}
