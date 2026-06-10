"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

// ---------- Firebase Configuration ----------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ---------- Helpers ----------
const convertTimestamps = (data) => {
  if (!data) return data;
  const c = { ...data };
  for (const k in c) {
    if (c[k]?.toDate) c[k] = c[k].toDate();
  }
  return c;
};

const ensureUserInFirestore = async (user) => {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.displayName || "User",
      email: user.email || "",
      photoUrl: user.photoURL || "",
      isAdmin: false,
      userType: "customer",
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
    });
  } else {
    await updateDoc(ref, { lastLogin: Timestamp.now() });
  }
};

const CART_KEY = "ween_cart_v2";
const getCart = () => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveCart = (cart) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
};

// Helper to display user email from One Tap
const getUserEmailFromOneTap = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    return localStorage.getItem("ween_user_email") || null;
  }
  return null;
};

const setUserEmailFromOneTap = (email) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("ween_user_email", email);
  }
};

// ---------- Icons with Premium Blue/Yellow Theme ----------
const Icon = {
  Cart: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
    </svg>
  ),
  Star: ({ filled }) => (
    <svg
      className={`w-4 h-4 ${filled ? "text-[#E4BF1A] fill-[#E4BF1A]" : "text-gray-300 fill-gray-300"}`}
      viewBox="0 0 24 24"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  Grid: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  List: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Share: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path strokeLinecap="round" strokeWidth={2} d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  ),
  Back: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  Location: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <circle cx="12" cy="11" r="3" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Close: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Package: () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  QR: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 13h2v2h-2zM17 13h4M17 17v4M21 17h-4v4" />
    </svg>
  ),
  COD: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Phone: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Mail: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
};

// ---------- Stars Component ----------
const Stars = ({ rating, size = 4 }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => (
      <Icon.Star key={i} filled={i <= Math.round(rating)} />
    ))}
  </div>
);

// ---------- QR Payment Modal ----------
const QRPaymentModal = ({ amount, onSuccess, onClose }) => {
  const [txnId, setTxnId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!txnId.trim()) {
      alert("Please enter the transaction ID");
      return;
    }
    setSubmitted(true);
    await onSuccess(txnId);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] p-6 text-white text-center">
          <p className="text-sm opacity-80 mb-1">Pay via UPI</p>
          <p className="text-3xl font-bold">₹{amount.toLocaleString()}</p>
        </div>
        <div className="p-6">
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-3 mb-5">
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 49 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-sm ${
                    [
                      0, 1, 2, 7, 8, 9, 14, 3, 10, 4, 11, 5, 12, 6, 13, 15, 16,
                      17, 18, 19, 20, 21, 42, 43, 44, 45, 46, 47, 48, 28, 35,
                    ].includes(i)
                      ? "bg-gray-900"
                      : "bg-white"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 font-mono">ween@upi</p>
            <p className="text-xs text-gray-400">Scan & Pay with any UPI app</p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">Transaction ID / UTR</label>
            <input
              type="text"
              value={txnId}
              onChange={(e) => setTxnId(e.target.value)}
              placeholder="Enter 12-digit UTR number"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={submitted}
              className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:shadow-lg transition"
            >
              {submitted ? "Submitting..." : "Submit for Verification"}
            </button>
            <button onClick={onClose} className="w-full text-gray-400 text-sm py-2">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Map Picker Modal ----------
const MapPickerModal = ({ onSelect, onClose }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState("");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      const map = L.map(mapRef.current).setView([22.3511148, 78.6677428], 5);
      mapInstance.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const icon = L.divIcon({
        html: '<div style="background:#0E3F7A;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      });

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          map.setView([lat, lng], 15);
        });
      }

      map.on("click", async (e) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        setSelectedLocation({ lat, lng });
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          );
          const data = await res.json();
          const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setAddress(addr);
        } catch {
          setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      });
    };
    document.head.appendChild(script);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    return () => {
      if (mapInstance.current) mapInstance.current.remove();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-bold text-gray-800">Select Delivery Location</h3>
            <p className="text-xs text-gray-500 mt-0.5">Tap on map to pin your location</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icon.Close />
          </button>
        </div>
        <div ref={mapRef} style={{ height: "380px", flex: "0 0 380px" }} className="w-full" />
        <div className="p-4 border-t">
          {address ? (
            <div className="flex items-start gap-3 bg-[#E3ECF3] rounded-xl p-3 mb-3">
              <div className="text-[#0E3F7A] mt-0.5">
                <Icon.Location />
              </div>
              <div>
                <p className="text-xs text-[#0E3F7A] font-semibold mb-0.5">Selected Location</p>
                <p className="text-sm text-gray-700 leading-snug">{address}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center mb-3">Click anywhere on the map to set delivery location</p>
          )}
          <button
            onClick={() => selectedLocation && onSelect({ address, ...selectedLocation })}
            disabled={!selectedLocation}
            className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1975B1] transition"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Product Detail Page ----------
const ProductDetailPage = ({ product, user, onBack, onAddToCart, onBuyNow, feedbacks, onSignIn }) => {
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);
  const productFeedbacks = feedbacks.filter((f) => f.productId === product.id);
  const avgRating =
    productFeedbacks.length > 0
      ? (productFeedbacks.reduce((s, f) => s + f.rating, 0) / productFeedbacks.length).toFixed(1)
      : product.rating || 4.5;

  const handleShare = () => {
    const url = `${window.location.origin}?product=${product.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#E3ECF3] animate-fadeIn">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#0E3F7A] transition font-medium"
          >
            <Icon.Back /> Back
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <nav className="text-xs text-gray-400 flex items-center gap-1">
            <span>Home</span><span>/</span>
            <span className="text-[#0E3F7A]">{product.category}</span><span>/</span>
            <span className="text-gray-700 font-medium truncate max-w-[200px]">{product.name}</span>
          </nav>
          <div className="ml-auto">
            <button
              onClick={handleShare}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                copied
                  ? "bg-green-50 text-green-600"
                  : "bg-gray-100 text-gray-600 hover:bg-[#E3ECF3] hover:text-[#0E3F7A]"
              }`}
            >
              {copied ? (
                <>
                  <Icon.Check /> Copied!
                </>
              ) : (
                <>
                  <Icon.Share /> Share
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-8 bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="p-6">
            <div className="bg-[#E3ECF3] rounded-2xl overflow-hidden aspect-square flex items-center justify-center mb-4">
              {/* {product.imageUrl ? (
                <img
                  src={`data:image/jpeg;base64,${product.imageBase64}`}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
                />
              ) : (
                <div className="text-gray-300">
                  <Icon.Package />
                </div>
              )} */}
              {product.imageBase64 ? (
  <img
    src={`data:image/jpeg;base64,${product.imageBase64}`}
    alt={product.name}
    className="w-full h-full object-cover"
    onError={(e) =>
      (e.target.src = "https://placehold.co/400x400?text=Product")
    }
  />
) : (
  <div className="text-gray-300">
    <Icon.Package />
  </div>
)}
            </div>
            <span className="inline-flex px-3 py-1 bg-[#E3ECF3] text-[#0E3F7A] text-xs font-semibold rounded-full">
              {product.category}
            </span>
          </div>

          <div className="p-6 flex flex-col">
            <h1 className="text-2xl font-bold text-[#151B20] leading-tight">{product.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Stars rating={parseFloat(avgRating)} />
              <span className="text-sm text-gray-500">
                {avgRating} ({productFeedbacks.length || 0} reviews)
              </span>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-extrabold text-[#0E3F7A]">
                ₹{product.price.toLocaleString()}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-3 leading-relaxed">
              {product.description || "Premium quality product for everyday use."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${product.stock > 0 ? "bg-green-500" : "bg-red-500"}`}
              />
              <span
                className={`text-sm font-medium ${
                  product.stock > 0 ? "text-green-700" : "text-red-600"
                }`}
              >
                {product.stock > 5
                  ? "In Stock"
                  : product.stock > 0
                  ? `Only ${product.stock} left!`
                  : "Out of Stock"}
              </span>
            </div>

            {product.stock > 0 && (
              <>
                <div className="flex items-center gap-4 mt-6">
                  <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg"
                    >
                      −
                    </button>
                    <span className="px-5 py-2.5 font-semibold text-gray-800 min-w-[3rem] text-center">
                      {qty}
                    </span>
                    <button
                      onClick={() => setQty(Math.min(product.stock, qty + 1))}
                      className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm text-gray-400">Max: {product.stock}</span>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => onAddToCart(product, qty)}
                    className="flex-1 bg-[#0E3F7A] text-white py-4 rounded-2xl font-bold text-base shadow-lg hover:bg-[#1975B1] transition"
                  >
                    Add to Cart — ₹{(product.price * qty).toLocaleString()}
                  </button>
                  <button
                    onClick={() => onBuyNow(product, qty)}
                    className="flex-1 bg-[#E4BF1A] text-[#151B20] py-4 rounded-2xl font-bold text-base shadow-lg hover:bg-[#d4af10] transition"
                  >
                    Buy Now
                  </button>
                </div>
              </>
            )}

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                ["🚚", "Free Delivery", "Orders above ₹499"],
                ["↩️", "Easy Returns", "7 day policy"],
                ["🔒", "Secure Pay", "UPI & COD"],
              ].map(([icon, title, sub]) => (
                <div key={title} className="bg-[#E3ECF3] rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{icon}</div>
                  <p className="text-xs font-semibold text-[#151B20]">{title}</p>
                  <p className="text-xs text-gray-500">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-3xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-[#151B20] mb-4">Customer Reviews</h2>
          {productFeedbacks.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No reviews yet. Be the first to review!</p>
          ) : (
            <div className="space-y-4">
              {productFeedbacks.map((fb) => (
                <div key={fb.id} className="flex gap-4 pb-4 border-b border-gray-50 last:border-0">
                  <div className="w-10 h-10 rounded-full bg-[#E3ECF3] flex items-center justify-center text-[#0E3F7A] font-bold flex-shrink-0">
                    {fb.userName?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-800">{fb.userName}</span>
                      <Stars rating={fb.rating} size={3} />
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{fb.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Product Card ----------
const ProductCard = ({ product, onView, onAddToCart, view }) => {
  const isGrid = view === "grid";
  return isGrid ? (
    <div
      onClick={() => onView(product)}
      className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden cursor-pointer group hover:-translate-y-0.5"
    >
      <div className="relative bg-[#E3ECF3] aspect-square overflow-hidden">
        {/* <img
          src={product.imageUrl || "https://placehold.co/400x400?text=Product"}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
        /> */}
        <img
  src={
    product.imageBase64
      ? `data:image/jpeg;base64,${product.imageBase64}`
      : "https://placehold.co/400x400?text=Product"
  }
  alt={product.name}
  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
  onError={(e) =>
    (e.target.src = "https://placehold.co/400x400?text=Product")
  }
/>
        {product.stock <= 5 && product.stock > 0 && (
          <span className="absolute top-2 left-2 bg-[#E4BF1A] text-[#151B20] text-xs px-2 py-0.5 rounded-full font-semibold">
            Only {product.stock} left
          </span>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-gray-800 text-white text-xs px-3 py-1 rounded-full font-semibold">
              Out of Stock
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <span className="text-xs text-[#0E3F7A] font-semibold bg-[#E3ECF3] px-2 py-0.5 rounded-full">
          {product.category}
        </span>
        <h3 className="font-semibold text-gray-800 text-sm mt-1.5 line-clamp-2 leading-snug">
          {product.name}
        </h3>
        <div className="flex items-center gap-1 mt-1">
          <Stars rating={product.rating || 4.5} size={3} />
          <span className="text-xs text-gray-400">({product.rating || 4.5})</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-lg font-extrabold text-[#0E3F7A]">
            ₹{product.price.toLocaleString()}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(product, 1);
            }}
            disabled={product.stock === 0}
            className="bg-[#0E3F7A] hover:bg-[#1975B1] text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div
      onClick={() => onView(product)}
      className="bg-white rounded-2xl shadow-md hover:shadow-lg transition overflow-hidden cursor-pointer group flex gap-4 p-4"
    >
      <div className="w-24 h-24 bg-[#E3ECF3] rounded-xl flex-shrink-0 overflow-hidden">
    <img
  src={
    product.imageBase64
      ? `data:image/jpeg;base64,${product.imageBase64}`
      : "https://placehold.co/400x400?text=Product"
  }
  alt={product.name}
  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
  onError={(e) =>
    (e.target.src = "https://placehold.co/400x400?text=Product")
  }
/>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-[#0E3F7A] font-semibold">{product.category}</span>
        <h3 className="font-semibold text-gray-800 mt-0.5 line-clamp-1">{product.name}</h3>
        <Stars rating={product.rating || 4.5} size={3} />
        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{product.description}</p>
      </div>
      <div className="flex flex-col items-end justify-between flex-shrink-0">
        <span className="text-xl font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product, 1);
          }}
          disabled={product.stock === 0}
          className="bg-[#0E3F7A] text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 transition hover:bg-[#1975B1]"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};

// ---------- Cart Sidebar ----------
const CartSidebar = ({ cart, user, onClose, onRemove, onUpdateQty, onCheckout }) => {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white flex flex-col shadow-2xl animate-slideIn">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Your Cart</h2>
            <p className="text-xs text-gray-400">
              {cart.reduce((s, i) => s + i.quantity, 0)} items
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <Icon.Close />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-200 flex justify-center mb-3">
                <Icon.Package />
              </div>
              <p className="text-gray-400 font-medium">Your cart is empty</p>
              <p className="text-gray-300 text-sm mt-1">Add some products to get started</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="flex gap-3 bg-[#E3ECF3] rounded-2xl p-3">
                <div className="w-16 h-16 bg-white rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                <img
  src={
    item.imageBase64
      ? `data:image/jpeg;base64,${item.imageBase64}`
      : "https://placehold.co/400x400?text=Product"
  }
  className="w-full h-full object-cover"
  alt={item.name}
  onError={(e) =>
    (e.target.src = "https://placehold.co/400x400?text=Product")
  }
/>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-gray-800 line-clamp-1">{item.name}</h4>
                  <p className="text-[#0E3F7A] font-bold text-sm mt-0.5">₹{item.price.toLocaleString()}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => onUpdateQty(item.productId, item.quantity - 1)}
                      className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-gray-600 font-bold hover:bg-[#E3ECF3]"
                    >
                      −
                    </button>
                    <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(item.productId, item.quantity + 1)}
                      className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-gray-600 font-bold hover:bg-[#E3ECF3]"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onRemove(item.productId)}
                      className="text-xs text-red-400 hover:text-red-600 ml-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="font-bold text-sm text-gray-800 flex-shrink-0">
                  ₹{(item.price * item.quantity).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t px-5 py-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-500 font-medium">Total Amount</span>
              <span className="text-2xl font-extrabold text-[#0E3F7A]">₹{total.toLocaleString()}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-4 rounded-2xl font-bold shadow-lg hover:shadow-xl transition"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- Checkout Modal ----------
const CheckoutModal = ({ cart, user, onClose, onOrderPlaced }) => {
  const [step, setStep] = useState(1);
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
  });
  const [mapLocation, setMapLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [isPlacing, setIsPlacing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const handlePlaceOrder = async (txnId = null) => {
    if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) {
      alert("Please fill in complete address");
      return;
    }
    setIsPlacing(true);
    try {
      const items = cart.map((item) => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      }));
      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const orderData = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        orderId,
        items,
        totalAmount: total,
        status: paymentMethod === "qr" && txnId ? "payment_verification" : "pending",
        paymentMethod,
        paymentStatus: paymentMethod === "cod" ? "pending" : "verification_pending",
        transactionId: txnId || null,
        deliveryAddress: { ...deliveryAddress, mapLocation },
        orderDate: Timestamp.now(),
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, "orders"), orderData);
      const batch = writeBatch(db);
      for (const item of cart) {
        const ref = doc(db, "products", item.productId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          batch.update(ref, { stock: (snap.data().stock || 0) - item.quantity });
        }
      }
      await batch.commit();
      onOrderPlaced();
    } catch (err) {
      console.error(err);
      alert("Failed to place order. Try again.");
    }
    setIsPlacing(false);
  };

  return (
    <>
      {showMap && (
        <MapPickerModal
          onSelect={(loc) => {
            setMapLocation(loc);
            setDeliveryAddress((a) => ({ ...a, street: loc.address }));
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
      )}
      {showQR && (
        <QRPaymentModal
          amount={total}
          onSuccess={async (txnId) => {
            setShowQR(false);
            await handlePlaceOrder(txnId);
          }}
          onClose={() => setShowQR(false)}
        />
      )}

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
        <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h2 className="font-bold text-gray-800">Checkout</h2>
              <p className="text-xs text-gray-400">Step {step} of 2</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  step >= 1 ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                1
              </div>
              <div className={`w-6 h-0.5 ${step >= 2 ? "bg-[#E4BF1A]" : "bg-gray-200"}`} />
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  step >= 2 ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                2
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <Icon.Close />
            </button>
          </div>

          <div className="p-6">
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700 mb-3">Delivery Address</h3>
                <button
                  onClick={() => setShowMap(true)}
                  className="w-full flex items-center gap-2 border-2 border-dashed border-[#1975B1] rounded-xl px-4 py-3 text-[#0E3F7A] hover:bg-[#E3ECF3] transition text-sm font-medium"
                >
                  <Icon.Location />{" "}
                  {mapLocation ? "Location set — tap to change" : "Pin location on Map"}
                </button>
                {mapLocation && (
                  <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
                    <Icon.Check />
                    <span className="line-clamp-2">{mapLocation.address}</span>
                  </p>
                )}
                <input
                  type="text"
                  placeholder="Street / House No *"
                  value={deliveryAddress.street}
                  onChange={(e) => setDeliveryAddress((a) => ({ ...a, street: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="City *"
                    value={deliveryAddress.city}
                    onChange={(e) => setDeliveryAddress((a) => ({ ...a, city: e.target.value }))}
                    className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={deliveryAddress.state}
                    onChange={(e) => setDeliveryAddress((a) => ({ ...a, state: e.target.value }))}
                    className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Pincode *"
                    value={deliveryAddress.pincode}
                    onChange={(e) => setDeliveryAddress((a) => ({ ...a, pincode: e.target.value }))}
                    className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={deliveryAddress.phone}
                    onChange={(e) => setDeliveryAddress((a) => ({ ...a, phone: e.target.value }))}
                    className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) {
                      alert("Fill required fields");
                      return;
                    }
                    setStep(2);
                  }}
                  className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold mt-2 hover:bg-[#1975B1] transition"
                >
                  Continue to Payment
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700">Payment Method</h3>
                <div className="space-y-3">
                  {[
                    {
                      id: "cod",
                      label: "Cash on Delivery",
                      sub: "Pay when your order arrives",
                      Icon: Icon.COD,
                      color: "green",
                    },
                    {
                      id: "qr",
                      label: "UPI / QR Code",
                      sub: "Pay now via any UPI app",
                      Icon: Icon.QR,
                      color: "violet",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition ${
                        paymentMethod === opt.id
                          ? "border-[#0E3F7A] bg-[#E3ECF3]"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          paymentMethod === opt.id ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        <opt.Icon />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-gray-800">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.sub}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#0E3F7A]" : "border-gray-300"
                        }`}
                      >
                        {paymentMethod === opt.id && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="bg-[#E3ECF3] rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Order Summary</p>
                  {cart.map((i) => (
                    <div key={i.productId} className="flex justify-between text-xs text-gray-500 py-1">
                      <span className="truncate flex-1">
                        {i.name} × {i.quantity}
                      </span>
                      <span className="font-medium text-gray-700 ml-2">
                        ₹{(i.price * i.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-[#0E3F7A]">₹{total.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => (paymentMethod === "qr" ? setShowQR(true) : handlePlaceOrder())}
                    disabled={isPlacing}
                    className="flex-1 bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 hover:shadow-xl transition"
                  >
                    {isPlacing
                      ? "Placing..."
                      : paymentMethod === "cod"
                      ? "Place Order"
                      : "Pay Now"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- Main Page ----------
export default function HomePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(["all"]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("shop");
  const [orders, setOrders] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [newFeedback, setNewFeedback] = useState({ rating: 5, comment: "" });
  const [viewMode, setViewMode] = useState("grid");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [toast, setToast] = useState(null);

  const carouselSlides = [
    { bg: "from-[#0E3F7A] to-[#1975B1]", title: "Shop Smarter", sub: "Premium products at honest prices", emoji: "🛒" },
    { bg: "from-[#1975B1] to-[#0E3F7A]", title: "New Arrivals", sub: "Fresh picks every week", emoji: "✨" },
    { bg: "from-[#E4BF1A] to-[#d4af10]", title: "Fast Delivery", sub: "Right to your doorstep", emoji: "🚀" },
  ];

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshCart = useCallback(() => {
    const c = getCart();
    setCart(c);
    setCartCount(c.reduce((s, i) => s + i.quantity, 0));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("product");
    if (pid && products.length > 0) {
      const p = products.find((pr) => pr.id === pid);
      if (p) setSelectedProduct(p);
    }
  }, [products]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserInFirestore(firebaseUser);
        setUser(firebaseUser);
        loadUserOrders(firebaseUser.uid);
        if (firebaseUser.email) {
          setUserEmailFromOneTap(firebaseUser.email);
        }
      }
      setLoading(false);
    });
    loadProducts();
    loadFeedbacks();
    refreshCart();
    window.addEventListener("cartUpdated", refreshCart);
    const interval = setInterval(() => setCurrentSlide((s) => (s + 1) % carouselSlides.length), 5000);

    // Google One Tap - shows email ID directly
    const loadOneTap = () => {
      if (typeof window !== "undefined" && window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              const cred = GoogleAuthProvider.credential(response.credential);
              const result = await signInWithCredential(auth, cred);
              await ensureUserInFirestore(result.user);
              setUser(result.user);
              if (result.user.email) {
                setUserEmailFromOneTap(result.user.email);
              }
              setShowLoginPopup(false);
            } catch (e) {
              console.error(e);
            }
          },
        });
        window.google.accounts.id.prompt();
      }
    };
    if (window.google?.accounts?.id) loadOneTap();
    else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = loadOneTap;
      document.head.appendChild(s);
    }

    return () => {
      unsub();
      window.removeEventListener("cartUpdated", refreshCart);
      clearInterval(interval);
    };
  }, []);

  const loadProducts = async () => {
    try {
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) }));
      if (list.length === 0) {
        // Note: In production, all products come from Firebase with imageUrl containing Base64 data
        // For first-time setup, we create sample entries
        const samples = [
          { name: "Tide Plus Detergent Powder", price: 399, stock: 50, category: "Detergent", description: "Premium detergent for tough stains. Works great in all water types.", imageUrl: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=400", rating: 4.5 },
          { name: "Surf Excel Easy Wash", price: 449, stock: 40, category: "Detergent", description: "Quick stain removal formula. Gentle on fabrics.", imageUrl: "https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?w=400", rating: 4.3 },
          { name: "Comfort Fabric Softener", price: 299, stock: 60, category: "Softener", description: "Long-lasting freshness for your clothes.", imageUrl: "https://images.unsplash.com/photo-1610557886111-d88d6fe4fb07?w=400", rating: 4.2 },
          { name: "Harpic Power Cleaner", price: 249, stock: 45, category: "Cleaner", description: "Powerful toilet cleaner that kills 99.9% germs.", imageUrl: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400", rating: 4.4 },
          { name: "Lizol Disinfectant Floor Cleaner", price: 299, stock: 35, category: "Cleaner", description: "Kills 99.9% germs on floor surfaces.", imageUrl: "https://images.unsplash.com/photo-1616046221683-1f3bfe8a1b1c?w=400", rating: 4.5 },
          { name: "Vim Dishwash Gel", price: 149, stock: 80, category: "Dishwash", description: "Removes grease effectively from all utensils.", imageUrl: "https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400", rating: 4.1 },
          { name: "Dettol Hand Wash", price: 199, stock: 70, category: "Personal Care", description: "Gentle antibacterial hand wash for everyday use.", imageUrl: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400", rating: 4.6 },
          { name: "Colin Glass Cleaner", price: 179, stock: 55, category: "Cleaner", description: "Crystal clear shine on glass, mirrors, and tiles.", imageUrl: "https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400", rating: 4.0 },
        ];
        for (const p of samples) await addDoc(collection(db, "products"), { ...p, createdAt: Timestamp.now() });
        const snap2 = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
        list = snap2.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) }));
      }
      setProducts(list);
      setCategories(["all", ...new Set(list.map((p) => p.category).filter(Boolean))]);
    } catch (err) {
      console.error(err);
      setProducts([]);
    }
  };

  const loadFeedbacks = async () => {
    try {
      const snap = await getDocs(query(collection(db, "feedbacks"), orderBy("createdAt", "desc")));
      setFeedbacks(snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) })));
    } catch (e) {
      console.error(e);
    }
  };

  const loadUserOrders = async (uid) => {
    try {
      const snap = await getDocs(
        query(collection(db, "orders"), where("userId", "==", uid), orderBy("orderDate", "desc"))
      );
      setOrders(snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserInFirestore(result.user);
      setUser(result.user);
      if (result.user.email) {
        setUserEmailFromOneTap(result.user.email);
      }
      setShowLoginPopup(false);
      loadUserOrders(result.user.uid);
    } catch (e) {
      console.error(e);
      alert("Sign in failed. Try again.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setOrders([]);
    saveCart([]);
    refreshCart();
    showToast("Signed out successfully", "info");
  };

  const handleAddToCart = (product, qty = 1) => {
    if (!user) {
      setShowLoginPopup(true);
      return;
    }
    const c = getCart();
    const existing = c.find((i) => i.productId === product.id);
    if (existing) existing.quantity += qty;
    else
      // c.push({
      //   productId: product.id,
      //   name: product.name,
      //   price: product.price,
      //   imageUrl: product.imageUrl,
      //   quantity: qty,
      //   stock: product.stock,
      // });
      c.push({
  productId: product.id,
  name: product.name,
  price: product.price,
  imageBase64: product.imageBase64,
  quantity: qty,
  stock: product.stock,
});
    saveCart(c);
    showToast(`${product.name} added to cart!`);
  };

  const handleBuyNow = (product, qty = 1) => {
    if (!user) {
      setShowLoginPopup(true);
      return;
    }
    // Clear cart and add only this product, then proceed to checkout
    // saveCart([{
    //   productId: product.id,
    //   name: product.name,
    //   price: product.price,
    //   imageUrl: product.imageUrl,
    //   quantity: qty,
    //   stock: product.stock,
    // }]);

saveCart([{
  productId: product.id,
  name: product.name,
  price: product.price,
  imageBase64: product.imageBase64,
  quantity: qty,
  stock: product.stock,
}]);


    refreshCart();
    setShowCart(false);
    setShowCheckout(true);
    showToast("Proceeding to checkout!");
  };

  const handleRemoveFromCart = (pid) => {
    saveCart(getCart().filter((i) => i.productId !== pid));
  };

  const handleUpdateQty = (pid, qty) => {
    const c = getCart();
    const idx = c.findIndex((i) => i.productId === pid);
    if (idx >= 0) {
      if (qty <= 0) c.splice(idx, 1);
      else c[idx].quantity = qty;
    }
    saveCart(c);
  };

  const handleOrderPlaced = async () => {
    saveCart([]);
    refreshCart();
    setShowCheckout(false);
    setShowCart(false);
    setOrderSuccess(true);
    setTimeout(() => setOrderSuccess(false), 5000);
    if (user) loadUserOrders(user.uid);
    showToast("🎉 Order placed successfully!");
  };

  const handleSubmitFeedback = async () => {
    if (!user) {
      setShowLoginPopup(true);
      return;
    }
    if (!newFeedback.comment.trim()) {
      alert("Please write your feedback");
      return;
    }
    try {
      await addDoc(collection(db, "feedbacks"), {
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        rating: newFeedback.rating,
        comment: newFeedback.comment,
        productId: null,
        createdAt: Timestamp.now(),
      });
      setNewFeedback({ rating: 5, comment: "" });
      await loadFeedbacks();
      showToast("Thanks for your review!");
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = products.filter((p) => {
    const matchCat = selectedCategory === "all" || p.category === selectedCategory;
    const s = searchTerm.toLowerCase();
    const matchSearch =
      !s ||
      p.name?.toLowerCase().includes(s) ||
      p.category?.toLowerCase().includes(s) ||
      p.description?.toLowerCase().includes(s);
    return matchCat && matchSearch;
  });

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/80 text-sm font-medium">Loading Ween...</p>
        </div>
      </div>
    );

  if (selectedProduct)
    return (
      <ProductDetailPage
        product={selectedProduct}
        user={user}
        feedbacks={feedbacks}
        onBack={() => {
          setSelectedProduct(null);
          window.history.pushState({}, "", window.location.pathname);
        }}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onSignIn={() => setShowLoginPopup(true)}
      />
    );

  const statusColors = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    payment_verification: "bg-violet-100 text-violet-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.4,0,0.2,1); }
        .animate-toastIn { animation: toastIn 0.3s ease-out; }
        .line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
        .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
        .category-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] animate-toastIn px-5 py-3 rounded-full shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${
            toast.type === "info" ? "bg-gray-700" : "bg-gradient-to-r from-[#0E3F7A] to-[#1975B1]"
          }`}
        >
          {toast.type !== "info" && <Icon.Check />} {toast.msg}
        </div>
      )}

      {orderSuccess && (
        <div className="fixed inset-x-0 top-0 z-[250] bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
          <span className="text-xl">🎉</span>
          <span className="font-semibold">Order placed! We'll deliver it soon.</span>
        </div>
      )}

      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-4 py-3">
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white font-black text-base">W</span>
              </div>
              <div className="hidden sm:block">
                <p className="font-black text-gray-900 text-lg leading-none">Ween</p>
                <p className="text-gray-400 text-xs leading-none">Sam Riddhi Group</p>
              </div>
            </div>

            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                <Icon.Search />
              </div>
              <input
                type="text"
                placeholder="Search products, brands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-[#1975B1] focus:bg-white outline-none text-sm transition"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {user ? (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5">
                  <img src={user.photoURL} className="w-7 h-7 rounded-full" alt="" />
                  <span className="text-sm font-medium hidden md:block">
                    {user.displayName?.split(" ")[0]}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-red-500 hover:text-red-600 font-medium hidden sm:block"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLoginPopup(true)}
                  className="flex items-center gap-2 bg-[#0E3F7A] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1975B1] transition"
                >
                  <span>Sign In</span>
                </button>
              )}
              <button
                onClick={() => (user ? setShowCart(true) : setShowLoginPopup(true))}
                className="relative bg-gray-50 hover:bg-gray-100 p-2.5 rounded-xl transition"
              >
                <Icon.Cart />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#0E3F7A] text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-1 pb-2 overflow-x-auto category-scroll">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  selectedCategory === cat
                    ? "bg-[#0E3F7A] text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {cat === "all" ? "All Products" : cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-12">
        <div className="flex gap-0 border-b border-gray-100 mt-4 mb-6">
          {[
            ["shop", "🛍️ Shop"],
            ["orders", "📦 My Orders"],
            ["reviews", "💬 Reviews"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === tab
                  ? "border-[#0E3F7A] text-[#0E3F7A]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "shop" && (
          <div className="animate-fadeIn">
            {!searchTerm && selectedCategory === "all" && (
              <div className="relative rounded-3xl overflow-hidden mb-8 h-52 md:h-72">
                {carouselSlides.map((slide, idx) => (
                  <div
                    key={idx}
                    className={`absolute inset-0 bg-gradient-to-br ${slide.bg} flex items-center transition-opacity duration-700 ${
                      currentSlide === idx ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div className="px-10 text-white">
                      <p className="text-5xl mb-4">{slide.emoji}</p>
                      <h2 className="text-3xl md:text-5xl font-black leading-none mb-2">{slide.title}</h2>
                      <p className="text-white/70 text-base md:text-lg">{slide.sub}</p>
                    </div>
                    <div className="absolute right-8 bottom-8 hidden md:flex gap-2 opacity-20">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="w-16 h-16 rounded-full bg-white"
                          style={{ transform: `scale(${1 - i * 0.2})` }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {carouselSlides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        currentSlide === i ? "bg-white w-6" : "bg-white/40 w-1.5"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedCategory === "all" ? "All Products" : selectedCategory}
                  <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length})</span>
                </h2>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-lg transition ${
                    viewMode === "grid" ? "bg-white shadow-sm text-[#0E3F7A]" : "text-gray-400"
                  }`}
                >
                  <Icon.Grid />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-lg transition ${
                    viewMode === "list" ? "bg-white shadow-sm text-[#0E3F7A]" : "text-gray-400"
                  }`}
                >
                  <Icon.List />
                </button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
                <p className="text-4xl mb-4">🔍</p>
                <p className="font-semibold text-gray-700">No products found</p>
                <p className="text-gray-400 text-sm mt-1">Try searching for something else</p>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("all");
                  }}
                  className="mt-4 text-[#0E3F7A] text-sm font-medium"
                >
                  Clear filters
                </button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filtered.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onView={setSelectedProduct}
                    onAddToCart={handleAddToCart}
                    view="grid"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onView={setSelectedProduct}
                    onAddToCart={handleAddToCart}
                    view="list"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "orders" && (
          <div className="animate-fadeIn">
            {!user ? (
              <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
                <p className="text-6xl mb-4">🔐</p>
                <p className="font-semibold text-gray-700 text-lg">Sign in to view orders</p>
                <p className="text-gray-400 text-sm mt-1">Track all your purchases in one place</p>
                <button
                  onClick={handleGoogleSignIn}
                  className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition"
                >
                  Sign In with Google
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
                <p className="text-6xl mb-4">📦</p>
                <p className="font-semibold text-gray-700 text-lg">No orders yet</p>
                <p className="text-gray-400 text-sm mt-1">Start shopping to see your orders here</p>
                <button
                  onClick={() => setActiveTab("shop")}
                  className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition"
                >
                  Shop Now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-50 flex justify-between items-start">
                      <div>
                        <span className="font-mono text-xs bg-gray-100 px-2.5 py-1 rounded-lg text-gray-600">
                          #{order.orderId}
                        </span>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                              statusColors[order.status] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {order.status?.replace("_", " ")}
                          </span>
                          {order.paymentMethod === "qr" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#E3ECF3] text-[#0E3F7A] font-medium">
                              UPI
                            </span>
                          )}
                          {order.paymentMethod === "cod" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                              COD
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-extrabold text-gray-900">
                          ₹{order.totalAmount?.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          {order.orderDate
                            ? new Date(order.orderDate).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {item.productName} <span className="text-gray-400">× {item.quantity}</span>
                          </span>
                          <span className="font-semibold text-gray-800">
                            ₹{item.total?.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    {order.deliveryAddress && (
                      <div className="px-4 pb-4 flex items-start gap-2 text-xs text-gray-400">
                        <Icon.Location />
                        <span>
                          {order.deliveryAddress.street}, {order.deliveryAddress.city}{" "}
                          {order.deliveryAddress.pincode}
                        </span>
                      </div>
                    )}
                    {order.transactionId && (
                      <div className="px-4 pb-4 text-xs text-[#0E3F7A] font-medium">
                        UTR: {order.transactionId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="animate-fadeIn space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-3">Share Your Experience</h3>
              {user ? (
                <div>
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        onClick={() => setNewFeedback((f) => ({ ...f, rating: r }))}
                        className="text-2xl transition"
                      >
                        <span className={r <= newFeedback.rating ? "text-[#E4BF1A]" : "text-gray-200"}>
                          ★
                        </span>
                      </button>
                    ))}
                    <span className="ml-2 text-sm text-gray-500">{newFeedback.rating}/5</span>
                  </div>
                  <textarea
                    value={newFeedback.comment}
                    onChange={(e) => setNewFeedback((f) => ({ ...f, comment: e.target.value }))}
                    placeholder="Tell others about your experience..."
                    className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:border-[#1975B1] outline-none"
                    rows="3"
                  />
                  <button
                    onClick={handleSubmitFeedback}
                    className="mt-2 bg-[#0E3F7A] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#1975B1] transition"
                  >
                    Post Review
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLoginPopup(true)}
                  className="text-[#0E3F7A] font-semibold text-sm hover:underline"
                >
                  Sign in to leave a review →
                </button>
              )}
            </div>
            {feedbacks.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
                <p className="text-4xl mb-2">💬</p>
                <p className="text-gray-500">No reviews yet. Be the first!</p>
              </div>
            ) : (
              feedbacks.map((fb) => (
                <div key={fb.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {fb.userName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{fb.userName}</p>
                      <Stars rating={fb.rating} size={3} />
                    </div>
                    <span className="ml-auto text-xs text-gray-400">
                      {fb.createdAt
                        ? new Date(fb.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })
                        : ""}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{fb.comment}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <footer className="bg-[#151B20] text-gray-400 py-8 mt-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-sm">W</span>
                </div>
                <span className="text-white font-bold text-lg">Ween</span>
              </div>
              <p className="text-sm text-gray-400">Premium quality products delivered to your doorstep with love and care.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Contact Us</h4>
              <div className="space-y-2 text-sm">
                <p className="flex items-center justify-center md:justify-start gap-2"><Icon.Phone /> +91 98765 43210</p>
                <p className="flex items-center justify-center md:justify-start gap-2"><Icon.Mail /> care@ween.com</p>
                <p className="flex items-center justify-center md:justify-start gap-2"><Icon.Location /> Sam Riddhi Group, Mumbai, India</p>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => setActiveTab("shop")} className="hover:text-[#E4BF1A] transition">Shop</button></li>
                <li><button onClick={() => user ? setActiveTab("orders") : setShowLoginPopup(true)} className="hover:text-[#E4BF1A] transition">My Orders</button></li>
                <li><button onClick={() => setActiveTab("reviews")} className="hover:text-[#E4BF1A] transition">Reviews</button></li>
                <li><button className="hover:text-[#E4BF1A] transition">Track Order</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-3">Policies</h4>
              <ul className="space-y-2 text-sm">
                <li><button className="hover:text-[#E4BF1A] transition">Privacy Policy</button></li>
                <li><button className="hover:text-[#E4BF1A] transition">Terms & Conditions</button></li>
                <li><button className="hover:text-[#E4BF1A] transition">Return Policy</button></li>
                <li><button className="hover:text-[#E4BF1A] transition">Shipping Info</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-6 text-center text-xs text-gray-500">
            <p>© 2025 Ween by Sam Riddhi Group · Designed by Softmax.in</p>
            <p className="mt-1">📍 404, Well Street, Andheri East, Mumbai - 400069, Maharashtra, India</p>
          </div>
        </div>
      </footer>

      {showLoginPopup && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={() => setShowLoginPopup(false)}
        >
          <div
            className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
                <span className="text-3xl text-white font-black">W</span>
              </div>
              <h2 className="text-2xl font-extrabold text-gray-900">Welcome to Ween</h2>
              <p className="text-gray-500 mt-1 text-sm">Sign in to shop, track orders and more</p>
              <button
                onClick={handleGoogleSignIn}
                className="mt-6 w-full flex items-center justify-center gap-3 border-2 border-gray-200 py-3.5 rounded-2xl hover:bg-gray-50 font-semibold text-gray-700 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
              <p className="text-xs text-gray-400 mt-4">
                By signing in, you agree to our Terms & Privacy Policy
              </p>
            </div>
          </div>
        </div>
      )}

      {showCart && (
        <CartSidebar
          cart={cart}
          user={user}
          onClose={() => setShowCart(false)}
          onRemove={handleRemoveFromCart}
          onUpdateQty={handleUpdateQty}
          onCheckout={() => {
            setShowCart(false);
            setShowCheckout(true);
          }}
        />
      )}

      {showCheckout && user && (
        <CheckoutModal
          cart={cart}
          user={user}
          onClose={() => setShowCheckout(false)}
          onOrderPlaced={handleOrderPlaced}
        />
      )}
    </>
  );
}