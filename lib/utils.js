// ---- Brand / SEO constants ----
// Update SITE_URL to your real production domain.
export const SITE_NAME = "Samruddhi Group of Industries - Ween";
export const SITE_SHORT = "Ween";
export const SITE_URL = "https://getween.in";
export const SITE_DESCRIPTION =
  "Samruddhi Group of Industries - Ween: Premium household products (detergents, cleaners, personal care) at honest prices, delivered across India.";

// ---- Slug helper (used to build /products/[slug] URLs) ----
export const slugify = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

// ---- Firestore timestamp -> JS Date ----
export const convertTimestamps = (data) => {
  if (!data) return data;
  const c = { ...data };
  for (const k in c) {
    if (c[k]?.toDate) c[k] = c[k].toDate();
  }
  return c;
};

// ---- Cart (localStorage) ----
export const CART_KEY = "ween_cart_v2";

export const getCart = () => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveCart = (cart) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
};

export const setUserEmailFromOneTap = (email) => {
  if (typeof window !== "undefined") localStorage.setItem("ween_user_email", email);
};
