import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { convertTimestamps, slugify } from "./utils";

// Fetch every product. Used both by the shop page and to resolve slugs.
export async function getAllProducts() {
  try {
    const snap = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) }));
  } catch (e) {
    console.error("getAllProducts error:", e);
    return [];
  }
}

// Resolve a product by its SEO slug (e.g. "tide-plus-detergent-powder"),
// falling back to a raw Firestore doc id for backwards compatibility with
// old ?product=<id> style links.
export async function getProductBySlug(slugOrId) {
  const products = await getAllProducts();
  return (
    products.find((p) => slugify(p.name) === slugOrId) ||
    products.find((p) => p.id === slugOrId) ||
    null
  );
}
