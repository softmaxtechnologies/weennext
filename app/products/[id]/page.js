import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/products";
import { SITE_NAME, SITE_URL, slugify } from "@/lib/utils";
import ProductClient from "@/components/ProductClient";

// Revalidate this page every hour so new products / price changes
// get picked up without needing a full redeploy.
export const revalidate = 3600;

export async function generateMetadata({ params }) {
  // ✅ Await the params Promise before accessing properties
  const { id } = await params;
  const product = await getProductBySlug(id);

  if (!product) {
    return { title: `Product Not Found | ${SITE_NAME}` };
  }

  const title = `${product.name} - Buy Online | ${SITE_NAME}`;
  const description =
    (product.description
      ? `${product.description} `
      : `Buy ${product.name} online at the best price. `) +
    `₹${product.price} · ${product.category} · Fast delivery across India. Shop ${SITE_NAME}.`;

  const url = `${SITE_URL}/products/${slugify(product.name)}`;
  // NOTE: product images are stored as base64 in Firestore. Base64 data URIs
  // are not fetchable by crawlers for Open Graph previews — for real social
  // share thumbnails, store product images in Firebase Storage / a CDN and
  // use that public URL here instead. Falling back to the site logo for now.
  const ogImage = `${SITE_URL}/logo.png`;

  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: url },
    openGraph: {
      title,
      description: description.slice(0, 200),
      url,
      siteName: SITE_NAME,
      images: [{ url: ogImage }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description.slice(0, 200),
      images: [ogImage],
    },
  };
}

export default async function ProductPage({ params }) {
  // ✅ Await the params Promise before accessing properties
  const { id } = await params;
  const product = await getProductBySlug(id);
  if (!product) notFound();

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description || product.name,
    category: product.category,
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: product.price,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE_URL}/products/${slugify(product.name)}`,
    },
  };

  return (
    <>
      {/* Structured data helps Google show rich results (price, stock) in search */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductClient initialProduct={product} />
    </>
  );
}