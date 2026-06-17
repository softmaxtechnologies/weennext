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
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

// ─── Firebase ────────────────────────────────────────────────
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

// ─── FCM ──────────────────────────────────────────────────────
const FCM_SERVER_KEY = process.env.NEXT_PUBLIC_FCM_SERVER_KEY;

const sendFCMToAdmins = async (title, body, data = {}) => {
  try {
    console.log("🔍 Checking for admin FCM tokens...");
    
    const adminsSnap = await getDocs(
      query(collection(db, "users"), where("isAdmin", "==", true))
    );
    
    const tokens = [];
    adminsSnap.forEach((doc) => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
        console.log(`✅ Found admin token for: ${userData.email}`);
      }
    });

    if (tokens.length === 0) {
      console.log("⚠️ No admin FCM tokens found");
      return;
    }

    if (!FCM_SERVER_KEY) {
      console.error("❌ FCM_SERVER_KEY not found");
      return;
    }

    console.log(`📤 Sending FCM to ${tokens.length} admin(s)`);

    const results = await Promise.allSettled(
      tokens.map(async (token) => {
        const response = await fetch(`https://fcm.googleapis.com/fcm/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `key=${FCM_SERVER_KEY}`,
          },
          body: JSON.stringify({
            to: token,
            priority: "high",
            notification: {
              title: title,
              body: body,
              icon: "https://ween-3e2ac.firebaseapp.com/logo.png",
              sound: "default",
            },
            data: {
              ...data,
              title: title,
              body: body,
              click_action: "FLUTTER_NOTIFICATION_CLICK",
              screen: "orders",
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`FCM error: ${response.status} - ${errorText}`);
        }
        return await response.json();
      })
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        console.log(`✅ Admin ${index + 1}: FCM sent`);
      } else {
        console.error(`❌ Admin ${index + 1}: FCM failed -`, result.reason?.message);
      }
    });

  } catch (error) {
    console.error("❌ FCM error:", error);
  }
};

// ─── Email ────────────────────────────────────────────────────
const MAIL_API = "/api/send-mail";

const sendMail = async ({ to, subject, body, isHtml = false }) => {
  try {
    console.log(`📧 Sending email to ${to}...`);
    
    const response = await fetch(MAIL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body, isHtml }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Email sent to ${to}`);
    return result;
    
  } catch (e) {
    console.error(`❌ Mail error for ${to}:`, e.message);
    return null;
  }
};

// ─── Email Templates ──────────────────────────────────────────
const buildOrderEmailText = (order, items, total) => {
  return `
============================================
🎉 ORDER CONFIRMED - Ween
============================================

Order ID: ${order.orderId}
Date: ${new Date().toLocaleDateString('en-IN')}

--------------------------------------------
ITEMS:
${items.map(i => `  ${i.productName} × ${i.quantity} = ₹${i.total.toLocaleString()}`).join('\n')}
--------------------------------------------
TOTAL: ₹${total.toLocaleString()}

--------------------------------------------
DELIVERY ADDRESS:
${order.deliveryAddress?.street || ''}
${order.deliveryAddress?.city || ''} ${order.deliveryAddress?.pincode || ''}
Phone: ${order.deliveryAddress?.phone || 'N/A'}

--------------------------------------------
PAYMENT: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'UPI / QR Code'}
${order.transactionId ? `UTR: ${order.transactionId}` : ''}

Thank you for shopping with Ween!
============================================
  `;
};

const buildAdminEmailText = (order, items, total) => {
  return `
============================================
🛒 NEW ORDER - Admin Alert
============================================

Order ID: ${order.orderId}
Date: ${new Date().toLocaleDateString('en-IN')}
Time: ${new Date().toLocaleTimeString('en-IN')}

--------------------------------------------
CUSTOMER:
Name: ${order.userName || 'N/A'}
Email: ${order.userEmail || 'N/A'}
Phone: ${order.deliveryAddress?.phone || 'N/A'}

--------------------------------------------
ADDRESS:
${order.deliveryAddress?.street || ''}
${order.deliveryAddress?.city || ''} ${order.deliveryAddress?.pincode || ''}

--------------------------------------------
ITEMS:
${items.map(i => `  ${i.productName} × ${i.quantity} = ₹${i.total.toLocaleString()}`).join('\n')}
--------------------------------------------
TOTAL: ₹${total.toLocaleString()}

--------------------------------------------
PAYMENT: ${order.paymentMethod === 'cod' ? 'COD' : 'UPI/QR'}
${order.transactionId ? `UTR: ${order.transactionId}` : ''}

ACTION REQUIRED: Process this order.
============================================
  `;
};

// ─── Helpers ─────────────────────────────────────────────────
const convertTimestamps = (data) => {
  if (!data) return data;
  const c = { ...data };
  for (const k in c) { if (c[k]?.toDate) c[k] = c[k].toDate(); }
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
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
};
const saveCart = (cart) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
};
const setUserEmailFromOneTap = (email) => {
  if (typeof window !== "undefined") localStorage.setItem("ween_user_email", email);
};

// ─── Icons ───────────────────────────────────────────────────
const Icon = {
  Cart: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>),
  Search: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>),
  Star: ({ filled }) => (<svg className={`w-4 h-4 ${filled ? "text-[#E4BF1A] fill-[#E4BF1A]" : "text-gray-300 fill-gray-300"}`} viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>),
  Grid: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>),
  List: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>),
  Share: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path strokeLinecap="round" strokeWidth={2} d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" /></svg>),
  Back: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>),
  Location: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><circle cx="12" cy="11" r="3" /></svg>),
  Check: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>),
  Close: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>),
  Package: () => (<svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>),
  QR: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 13h2v2h-2zM17 13h4M17 17v4M21 17h-4v4" /></svg>),
  COD: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>),
  Phone: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>),
  Mail: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>),
  Instagram: () => (<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>),
  Logout: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>),
  ChevronLeft: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>),
  ChevronRight: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>),
  MapPin: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>),
  Shield: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>),
  Truck: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l3 4v4h-3m-3 0H5m7 0a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /></svg>),
  Home: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>),
  Info: () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>),
  Tag: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>),
  Edit: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>),
  Delete: () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>),
};

const Stars = ({ rating, size = 4 }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => <Icon.Star key={i} filled={i <= Math.round(rating)} />)}
  </div>
);

// ─── QR Payment Modal ────────────────────────────────────────
const QRPaymentModal = ({ amount, onSuccess, onClose }) => {
  const [txnId, setTxnId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const handleSubmit = async () => {
    if (!txnId.trim()) { alert("Please enter the transaction ID"); return; }
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
                <div key={i} className={`w-4 h-4 rounded-sm ${[0,1,2,7,8,9,14,3,10,4,11,5,12,6,13,15,16,17,18,19,20,21,42,43,44,45,46,47,48,28,35].includes(i) ? "bg-gray-900" : "bg-white"}`} />
              ))}
            </div>
            <p className="text-xs text-gray-500 font-mono">ween@upi</p>
            <p className="text-xs text-gray-400">Scan & Pay with any UPI app</p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">Transaction ID / UTR</label>
            <input type="text" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="Enter 12-digit UTR number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] focus:outline-none" />
            <button onClick={handleSubmit} disabled={submitted} className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:shadow-lg transition">
              {submitted ? "Submitting..." : "Submit for Verification"}
            </button>
            <button onClick={onClose} className="w-full text-gray-400 text-sm py-2">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Map Picker Modal ────────────────────────────────────────
const MapPickerModal = ({ onSelect, onClose }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [mapLoading, setMapLoading] = useState(true);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initMap = (lat = 22.3511148, lng = 78.6677428, zoom = 5) => {
      if (!isMounted || !mapRef.current) return;
      const L = window.L;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([lat, lng], zoom);
      mapInstance.current = map;
      setMapLoading(false);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const makeIcon = () => L.divIcon({
        html: `<div style="background:#0E3F7A;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.4)"></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });

      const placeMarker = async (mlat, mlng) => {
        if (!isMounted) return;
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.marker([mlat, mlng], { icon: makeIcon() }).addTo(map);
        setSelectedLocation({ lat: mlat, lng: mlng });
        setAddress("Fetching address...");
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${mlat}&lon=${mlng}&format=json&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          if (isMounted) setAddress(data.display_name || `${mlat.toFixed(5)}, ${mlng.toFixed(5)}`);
        } catch {
          if (isMounted) setAddress(`${mlat.toFixed(5)}, ${mlng.toFixed(5)}`);
        }
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!isMounted) return;
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 16);
            placeMarker(latitude, longitude);
            setLocating(false);
          },
          () => { if (isMounted) setLocating(false); },
          { timeout: 8000, enableHighAccuracy: true }
        );
      } else {
        setLocating(false);
      }

      map.on("click", (e) => {
        const { lat: clat, lng: clng } = e.latlng;
        placeMarker(clat, clng);
      });

      setTimeout(() => { if (isMounted && map) map.invalidateSize(); }, 300);
    };

    const loadLeaflet = () => {
      if (window.L) { initMap(); return; }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => { if (isMounted) initMap(); };
      document.head.appendChild(script);
    };

    loadLeaflet();
    return () => {
      isMounted = false;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "88vh" }}>
        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white rounded-t-3xl">
          <div>
            <h3 className="font-bold">📍 Select Delivery Location</h3>
            <p className="text-xs text-white/70 mt-0.5">
              {locating ? "Detecting your location..." : "Tap anywhere on map to adjust pin"}
            </p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1"><Icon.Close /></button>
        </div>

        <div className="relative" style={{ height: "380px", flexShrink: 0 }}>
          {mapLoading && (
            <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center z-10 gap-3">
              <div className="w-10 h-10 border-4 border-[#0E3F7A] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Loading map…</p>
            </div>
          )}
          {!mapLoading && locating && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm text-[#0E3F7A] font-semibold">
              <div className="w-4 h-4 border-2 border-[#0E3F7A] border-t-transparent rounded-full animate-spin" />
              Detecting your location…
            </div>
          )}
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>

        <div className="p-4 border-t">
          {address && address !== "Fetching address..." ? (
            <div className="flex items-start gap-3 bg-[#E3ECF3] rounded-xl p-3 mb-3">
              <div className="text-[#0E3F7A] mt-0.5 flex-shrink-0"><Icon.Location /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#0E3F7A] font-semibold mb-0.5">Pinned Location</p>
                <p className="text-sm text-gray-700 leading-snug line-clamp-2">{address}</p>
              </div>
            </div>
          ) : address === "Fetching address..." ? (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 mb-3 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1975B1] rounded-full animate-spin" />
              Fetching address…
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center mb-3">Tap on the map to pin your delivery location</p>
          )}
          <button
            onClick={() => selectedLocation && onSelect({ address, ...selectedLocation })}
            disabled={!selectedLocation || address === "Fetching address..."}
            className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1975B1] transition"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Ad Banner Slider ────────────────────────────────────────
const AdBannerSlider = ({ slides }) => {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);
  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-md" style={{ aspectRatio: "3/1", minHeight: 100 }}>
      {slides.map((slide, idx) => (
        <div key={idx} className={`absolute inset-0 transition-opacity duration-700 ${current === idx ? "opacity-100" : "opacity-0"}`}>
          {slide.imageBase64 ? (
            <img src={`data:image/jpeg;base64,${slide.imageBase64}`} alt={slide.title || "Ad"} className="w-full h-full object-cover" />
          ) : slide.imageUrl ? (
            <img src={slide.imageUrl} alt={slide.title || "Ad"} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${slide.bg || "from-[#0E3F7A] to-[#1975B1]"} flex items-center justify-center`}>
              <div className="text-white text-center px-6">
                {slide.emoji && <p className="text-4xl mb-2">{slide.emoji}</p>}
                <p className="text-xl font-black">{slide.title}</p>
                {slide.sub && <p className="text-white/70 text-sm mt-1">{slide.sub}</p>}
              </div>
            </div>
          )}
        </div>
      ))}
      {slides.length > 1 && (
        <>
          <button onClick={() => setCurrent((c) => (c - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition z-10"><Icon.ChevronLeft /></button>
          <button onClick={() => setCurrent((c) => (c + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition z-10"><Icon.ChevronRight /></button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${current === i ? "bg-white w-5" : "bg-white/50 w-1.5"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Product Detail Page ─────────────────────────────────────
const ProductDetailPage = ({ product, user, onBack, onAddToCart, onBuyNow, feedbacks, onSignIn, onAddFeedback, onEditFeedback, onDeleteFeedback }) => {
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState(null);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");
  
  const productFeedbacks = feedbacks.filter((f) => f.productId === product.id);
  const avgRating = productFeedbacks.length > 0
    ? (productFeedbacks.reduce((s, f) => s + f.rating, 0) / productFeedbacks.length).toFixed(1)
    : product.rating || 4.5;

  const handleShare = () => {
    const url = `${window.location.origin}?product=${product.id}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  
  const handleAddToCartLocal = () => {
    onAddToCart(product, qty);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleSubmitFeedback = async () => {
    if (!user) { onSignIn(); return; }
    if (!newComment.trim()) { alert("Please write your feedback"); return; }
    await onAddFeedback(product.id, newRating, newComment);
    setNewComment("");
    setNewRating(5);
  };

  const handleEditFeedback = (fb) => {
    setEditingFeedback(fb);
    setNewRating(fb.rating);
    setNewComment(fb.comment);
  };

  const handleUpdateFeedback = async () => {
    if (!newComment.trim()) { alert("Please write your feedback"); return; }
    await onEditFeedback(editingFeedback.id, newRating, newComment);
    setEditingFeedback(null);
    setNewComment("");
    setNewRating(5);
  };

  const handleDeleteFeedback = async (feedbackId) => {
    if (confirm("Delete this review?")) {
      await onDeleteFeedback(feedbackId);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 py-3">
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md flex items-center justify-center bg-white border border-gray-100">
                <img src="/logo.png" alt="Ween Logo" className="w-full h-full object-contain scale-110" />
              </div>
              <div className="hidden sm:block">
                <p className="font-black text-[#E11D2E] text-xl leading-none tracking-wide">विन</p>
                <p className="text-gray-400 text-xs leading-none mt-1">Samruddhi Group of Industries</p>
              </div>
            </div>
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#0E3F7A] transition font-medium ml-2">
              <Icon.Back /> Back
            </button>
            <nav className="hidden md:flex text-xs text-gray-400 items-center gap-1 ml-1">
              <span>Home</span><span>/</span>
              <span className="text-[#0E3F7A]">{product.category}</span><span>/</span>
              <span className="text-gray-700 font-medium truncate max-w-[160px]">{product.name}</span>
            </nav>
            <div className="ml-auto">
              <button onClick={handleShare} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${copied ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-600 hover:bg-[#E3ECF3] hover:text-[#0E3F7A]"}`}>
                {copied ? <><Icon.Check /> Copied!</> : <><Icon.Share /> Share</>}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-2 gap-0 bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="relative bg-gradient-to-br from-[#E3ECF3] to-[#d0dce8] flex items-center justify-center p-6 min-h-[320px]">
            {product.imageBase64 ? (
              <img src={`data:image/jpeg;base64,${product.imageBase64}`} alt={product.name} className="max-h-80 w-full object-contain rounded-2xl transition-all duration-300" onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")} />
            ) : (
              <div className="text-gray-300 flex flex-col items-center gap-3">
                <Icon.Package /><p className="text-sm text-gray-400">No image</p>
              </div>
            )}
            <span className="absolute top-4 left-4 inline-flex px-3 py-1 bg-white/90 backdrop-blur text-[#0E3F7A] text-xs font-semibold rounded-full shadow">
              {product.category}
            </span>
            {product.stock > 0 && product.stock <= 5 && (
              <span className="absolute top-4 right-4 inline-flex px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full shadow animate-pulse">
                Only {product.stock} left!
              </span>
            )}
          </div>

          <div className="p-6 lg:p-8 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl lg:text-3xl font-black text-[#151B20] leading-tight">{product.name}</h1>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Stars rating={parseFloat(avgRating)} />
              <span className="text-sm text-gray-500">{avgRating} ({productFeedbacks.length} reviews)</span>
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-4xl font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
            </div>
            <p className="text-gray-500 text-sm mt-3 leading-relaxed flex-1">{product.description || "Premium quality product for everyday use."}</p>
            <div className="mt-4 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${product.stock > 0 ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
              <span className={`text-sm font-medium ${product.stock > 0 ? "text-green-700" : "text-red-600"}`}>
                {product.stock > 5 ? "In Stock" : product.stock > 0 ? `Only ${product.stock} left!` : "Out of Stock"}
              </span>
            </div>

            {product.stock > 0 && (
              <>
                <div className="flex items-center gap-4 mt-5">
                  <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg">−</button>
                    <span className="px-5 py-2.5 font-semibold text-gray-800 min-w-[3rem] text-center">{qty}</span>
                    <button onClick={() => setQty(Math.min(product.stock, qty + 1))} className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg">+</button>
                  </div>
                  <span className="text-sm text-gray-400">Max: {product.stock}</span>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleAddToCartLocal}
                    className={`flex-1 py-4 rounded-2xl font-bold text-base shadow-lg transition-all ${addedToCart ? "bg-green-500 text-white scale-95" : "bg-[#0E3F7A] text-white hover:bg-[#1975B1] hover:shadow-xl"}`}
                  >
                    {addedToCart ? "✓ Added!" : `Add to Cart — ₹${(product.price * qty).toLocaleString()}`}
                  </button>
                  <button
                    onClick={() => onBuyNow(product, qty)}
                    className="flex-1 bg-[#E4BF1A] text-[#151B20] py-4 rounded-2xl font-bold text-base shadow-lg hover:bg-[#d4af10] transition hover:shadow-xl"
                  >
                    Buy Now
                  </button>
                </div>
              </>
            )}

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[["🚚", "Free Delivery", "Above ₹499"], ["↩️", "Easy Returns", "7 day policy"], ["🔒", "Secure Pay", "UPI & COD"]].map(([icon, title, sub]) => (
                <div key={title} className="bg-[#E3ECF3] rounded-xl p-2.5 text-center hover:bg-[#d0dce8] transition">
                  <div className="text-lg mb-0.5">{icon}</div>
                  <p className="text-xs font-semibold text-[#151B20]">{title}</p>
                  <p className="text-xs text-gray-500">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── REVIEWS SECTION ─── */}
        <div className="mt-6 bg-white rounded-3xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-[#151B20]">Customer Reviews</h2>
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{productFeedbacks.length} review{productFeedbacks.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Add/Edit Feedback Form */}
          {user && (
            <div className="bg-[#F0F4F8] rounded-2xl p-4 mb-5">
              <p className="font-semibold text-sm text-gray-700 mb-2">
                {editingFeedback ? "Edit your review" : "Write a review"}
              </p>
              <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button key={r} onClick={() => setNewRating(r)} className="text-2xl transition hover:scale-110">
                    <span className={r <= newRating ? "text-[#E4BF1A]" : "text-gray-300"}>★</span>
                  </button>
                ))}
                <span className="ml-2 text-sm text-gray-500">{newRating}/5</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your experience with this product..."
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-[#1975B1] outline-none transition"
                />
                <button
                  onClick={editingFeedback ? handleUpdateFeedback : handleSubmitFeedback}
                  className="bg-[#0E3F7A] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#1975B1] transition whitespace-nowrap"
                >
                  {editingFeedback ? "Update" : "Post"}
                </button>
                {editingFeedback && (
                  <button
                    onClick={() => { setEditingFeedback(null); setNewComment(""); setNewRating(5); }}
                    className="bg-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {productFeedbacks.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-2">💬</p>
              <p className="text-gray-400 text-sm">No reviews yet. Be the first to review!</p>
              {!user && (
                <button onClick={onSignIn} className="mt-3 text-[#0E3F7A] font-semibold text-sm hover:underline">
                  Sign in to leave a review →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {productFeedbacks.map((fb) => {
                const isOwn = user && fb.userId === user.uid;
                return (
                  <div key={fb.id} className="flex gap-4 pb-4 border-b border-gray-50 last:border-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] flex items-center justify-center text-white font-bold flex-shrink-0">
                      {fb.userName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-gray-800">{fb.userName}</span>
                        <Stars rating={fb.rating} size={3} />
                        {isOwn && (
                          <div className="flex gap-1 ml-auto">
                            <button onClick={() => handleEditFeedback(fb)} className="text-gray-400 hover:text-[#0E3F7A] transition">
                              <Icon.Edit />
                            </button>
                            <button onClick={() => handleDeleteFeedback(fb.id)} className="text-gray-400 hover:text-red-500 transition">
                              <Icon.Delete />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{fb.comment}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Product Card ──────────────────────────────────────────────
const ProductCard = ({ product, onView, onAddToCart, view }) => {
  const [adding, setAdding] = useState(false);
  const handleAdd = (e) => {
    e.stopPropagation();
    onAddToCart(product, 1);
    setAdding(true);
    setTimeout(() => setAdding(false), 1500);
  };
  const isGrid = view === "grid";
  if (isGrid) return (
    <div
      onClick={() => onView(product)}
      className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer group hover:-translate-y-1 border border-gray-100/80 relative"
    >
      <div className="relative bg-gradient-to-br from-[#EFF4F8] to-[#e3ecf3] overflow-hidden" style={{ paddingBottom: "100%" }}>
        <img
          src={product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : "https://placehold.co/400x400?text=Product"}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
        />
        <span className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur-sm text-[#0E3F7A] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
          {product.category}
        </span>
        {product.stock <= 5 && product.stock > 0 && (
          <span className="absolute top-2.5 right-2.5 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
            {product.stock} left
          </span>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-sm flex items-center justify-center">
            <span className="bg-gray-800/90 text-white text-xs px-4 py-1.5 rounded-full font-semibold tracking-wide">Out of Stock</span>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="font-bold text-gray-800 text-sm leading-snug line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        <div className="flex items-center gap-1 mt-1.5">
          <Stars rating={product.rating || 4.5} size={3} />
          <span className="text-[11px] text-gray-400 font-medium">({product.rating || "4.5"})</span>
        </div>
        <div className="flex items-center justify-between mt-2.5 gap-2">
          <div>
            <span className="text-lg font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={product.stock === 0}
            className={`text-xs px-3 py-2 rounded-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0 ${
              adding ? "bg-green-500 text-white scale-95" : "bg-[#0E3F7A] hover:bg-[#1975B1] text-white hover:shadow-md"
            }`}
          >
            {adding ? "✓" : "+ Add"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div onClick={() => onView(product)} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer group flex gap-0 border border-gray-100">
      <div className="w-28 h-28 bg-[#EFF4F8] flex-shrink-0 overflow-hidden relative">
        <img
          src={product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : "https://placehold.co/400x400?text=Product"}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
        />
      </div>
      <div className="flex-1 p-4 min-w-0 flex flex-col justify-between">
        <div>
          <span className="text-xs text-[#0E3F7A] font-semibold">{product.category}</span>
          <h3 className="font-bold text-gray-800 mt-0.5 line-clamp-1 text-sm">{product.name}</h3>
          <div className="flex items-center gap-1 mt-0.5"><Stars rating={product.rating || 4.5} size={3} /></div>
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{product.description}</p>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xl font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onAddToCart(product, 1); }}
            disabled={product.stock === 0}
            className="bg-[#0E3F7A] text-white text-xs px-4 py-2 rounded-xl font-bold disabled:opacity-40 transition hover:bg-[#1975B1]"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Cart Sidebar ─────────────────────────────────────────────
const CartSidebar = ({ cart, user, onClose, onRemove, onUpdateQty, onCheckout }) => {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white flex flex-col shadow-2xl animate-slideIn">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white">
          <div>
            <h2 className="text-lg font-bold">Your Cart</h2>
            <p className="text-xs text-white/70">{cart.reduce((s, i) => s + i.quantity, 0)} items</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1"><Icon.Close /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-200 flex justify-center mb-3"><Icon.Package /></div>
              <p className="text-gray-400 font-medium">Your cart is empty</p>
              <p className="text-gray-300 text-sm mt-1">Add some products to get started</p>
            </div>
          ) : cart.map((item) => (
            <div key={item.productId} className="flex gap-3 bg-[#F0F4F8] rounded-2xl p-3 hover:bg-[#E3ECF3] transition">
              <div className="w-16 h-16 bg-white rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                <img src={item.imageBase64 ? `data:image/jpeg;base64,${item.imageBase64}` : "https://placehold.co/400x400?text=Product"} className="w-full h-full object-cover" alt={item.name} onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-gray-800 line-clamp-1">{item.name}</h4>
                <p className="text-[#0E3F7A] font-bold text-sm mt-0.5">₹{item.price.toLocaleString()}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button onClick={() => onUpdateQty(item.productId, item.quantity - 1)} className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-gray-600 font-bold hover:bg-red-50 hover:text-red-500 transition">−</button>
                  <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                  <button onClick={() => onUpdateQty(item.productId, item.quantity + 1)} className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-gray-600 font-bold hover:bg-green-50 hover:text-green-600 transition">+</button>
                  <button onClick={() => onRemove(item.productId)} className="text-xs text-red-400 hover:text-red-600 ml-1 transition">Remove</button>
                </div>
              </div>
              <div className="font-bold text-sm text-gray-800 flex-shrink-0">₹{(item.price * item.quantity).toLocaleString()}</div>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="border-t px-5 py-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-500 font-medium">Total Amount</span>
              <span className="text-2xl font-extrabold text-[#0E3F7A]">₹{total.toLocaleString()}</span>
            </div>
            {total < 499 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3 text-center">
                Add ₹{(499 - total).toLocaleString()} more for free delivery 🚚
              </p>
            )}
            <button onClick={onCheckout} className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-4 rounded-2xl font-bold shadow-lg hover:shadow-xl transition">
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Checkout Modal ──────────────────────────────────────────
const CheckoutModal = ({ cart, user, onClose, onOrderPlaced }) => {
  const [step, setStep] = useState(1);
  const [deliveryAddress, setDeliveryAddress] = useState({ street: "", city: "", state: "", pincode: "", phone: "" });
  const [mapLocation, setMapLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [isPlacing, setIsPlacing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const handlePlaceOrder = async (txnId = null) => {
    if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) {
      alert("Please fill in complete address"); return;
    }
    setIsPlacing(true);
    try {
      const items = cart.map((item) => ({
        productId: item.productId, productName: item.name,
        quantity: item.quantity, price: item.price, total: item.price * item.quantity,
      }));
      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const orderData = {
        userId: user.uid, userEmail: user.email, userName: user.displayName,
        orderId, items, totalAmount: total,
        status: paymentMethod === "qr" && txnId ? "payment_verification" : "pending",
        paymentMethod,
        paymentStatus: paymentMethod === "cod" ? "pending" : "verification_pending",
        transactionId: txnId || null,
        deliveryAddress: {
          ...deliveryAddress,
          mapLocation: mapLocation ? {
            address: mapLocation.address,
            latitude: mapLocation.lat,
            longitude: mapLocation.lng,
          } : null,
        },
        orderDate: Timestamp.now(), createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, "orders"), orderData);

      const batch = writeBatch(db);
      for (const item of cart) {
        const ref = doc(db, "products", item.productId);
        const snap = await getDoc(ref);
        if (snap.exists()) batch.update(ref, { stock: Math.max(0, (snap.data().stock || 0) - item.quantity) });
      }
      await batch.commit();

      // ── Send customer email ──
      await sendMail({
        to: user.email,
        subject: `✅ Order Confirmed — ${orderId}`,
        body: buildOrderEmailText(orderData, items, total),
        isHtml: false,
      });

      // ── Send admin emails ──
      const adminsSnap = await getDocs(query(collection(db, "users"), where("isAdmin", "==", true)));
      await Promise.all(adminsSnap.docs.map((d) =>
        d.data().email ? sendMail({
          to: d.data().email,
          subject: `🛒 New Order — ${orderId} from ${user.displayName}`,
          body: buildAdminEmailText(orderData, items, total),
          isHtml: false,
        }) : Promise.resolve()
      ));

      // ── Send FCM to admins ──
      await sendFCMToAdmins(
        "🛒 New Order Received!",
        `${user.displayName} placed an order of ₹${total.toLocaleString()}`,
        { orderId, userId: user.uid }
      );

      onOrderPlaced();
    } catch (err) {
      console.error(err);
      alert("Failed to place order. Please try again.");
    }
    setIsPlacing(false);
  };

  return (
    <>
      {showMap && (
        <MapPickerModal
          onSelect={(loc) => { setMapLocation(loc); setDeliveryAddress((a) => ({ ...a, street: loc.address })); setShowMap(false); }}
          onClose={() => setShowMap(false)}
        />
      )}
      {showQR && (
        <QRPaymentModal
          amount={total}
          onSuccess={async (txnId) => { setShowQR(false); await handlePlaceOrder(txnId); }}
          onClose={() => setShowQR(false)}
        />
      )}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
        <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white">
            <div>
              <h2 className="font-bold">Checkout</h2>
              <p className="text-xs text-white/70">Step {step} of 2</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-white text-[#0E3F7A]" : "bg-white/20 text-white"}`}>1</div>
              <div className={`w-6 h-0.5 ${step >= 2 ? "bg-[#E4BF1A]" : "bg-white/30"}`} />
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-white text-[#0E3F7A]" : "bg-white/20 text-white"}`}>2</div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white"><Icon.Close /></button>
          </div>

          <div className="p-5 overflow-y-auto flex-1">
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700 text-base mb-1">📍 Delivery Address</h3>
                <button onClick={() => setShowMap(true)} className="w-full flex items-center gap-2 border-2 border-dashed border-[#1975B1] rounded-xl px-4 py-3 text-[#0E3F7A] hover:bg-[#E3ECF3] transition text-sm font-medium">
                  <Icon.Location />{mapLocation ? "✅ Location pinned — tap to change" : "Pin my location on Map"}
                </button>
                {mapLocation && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                    <Icon.Check /><span className="line-clamp-2">{mapLocation.address}</span>
                  </p>
                )}
                <input type="text" placeholder="Street / House No *" value={deliveryAddress.street} onChange={(e) => setDeliveryAddress((a) => ({ ...a, street: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none transition" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="City *" value={deliveryAddress.city} onChange={(e) => setDeliveryAddress((a) => ({ ...a, city: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none transition" />
                  <input type="text" placeholder="State" value={deliveryAddress.state} onChange={(e) => setDeliveryAddress((a) => ({ ...a, state: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none transition" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Pincode *" value={deliveryAddress.pincode} onChange={(e) => setDeliveryAddress((a) => ({ ...a, pincode: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none transition" />
                  <input type="text" placeholder="Phone" value={deliveryAddress.phone} onChange={(e) => setDeliveryAddress((a) => ({ ...a, phone: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none transition" />
                </div>
                <button onClick={() => { if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) { alert("Fill required fields"); return; } setStep(2); }} className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold mt-2 hover:bg-[#1975B1] transition">
                  Continue to Payment →
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700 text-base">💳 Payment Method</h3>
                <div className="space-y-3">
                  {[
                    { id: "cod", label: "Cash on Delivery", sub: "Pay when your order arrives", Icon: Icon.COD },
                    { id: "qr", label: "UPI / QR Code", sub: "Pay now via any UPI app", Icon: Icon.QR },
                  ].map((opt) => (
                    <button key={opt.id} onClick={() => setPaymentMethod(opt.id)} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition ${paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#E3ECF3]" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paymentMethod === opt.id ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"}`}><opt.Icon /></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-gray-800">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.sub}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#0E3F7A]" : "border-gray-300"}`}>
                        {paymentMethod === opt.id && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="bg-[#F0F4F8] rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Order Summary</p>
                  {cart.map((i) => (
                    <div key={i.productId} className="flex justify-between text-xs text-gray-500 py-1 border-b border-gray-200/50 last:border-0">
                      <span className="truncate flex-1">{i.name} × {i.quantity}</span>
                      <span className="font-medium text-gray-700 ml-2">₹{(i.price * i.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold pt-2 mt-1">
                    <span>Total</span><span className="text-[#0E3F7A] text-lg">₹{total.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition">← Back</button>
                  <button
                    onClick={() => paymentMethod === "qr" ? setShowQR(true) : handlePlaceOrder()}
                    disabled={isPlacing}
                    className="flex-1 bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 hover:shadow-xl transition"
                  >
                    {isPlacing ? "Placing..." : paymentMethod === "cod" ? "Place Order 🎉" : "Pay Now"}
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

// ─── About Page ───────────────────────────────────────────────
const AboutPage = () => (
  <div className="animate-fadeIn">
    <div className="relative rounded-3xl overflow-hidden mb-8 bg-gradient-to-br from-[#0E3F7A] via-[#1975B1] to-[#0E3F7A] p-8 md:p-12 text-white text-center">
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }} />
      <div className="relative z-10">
        <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-2xl mx-auto mb-5 bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain scale-110" onError={(e) => { e.target.style.display="none"; e.target.parentElement.innerHTML="<span class='text-3xl font-black text-white'>W</span>"; }} />
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-3">Samruddhi Group of Industries</h1>
        <p className="text-white/80 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
          Bringing premium quality household products to every Indian home — at honest, fair prices.
        </p>
      </div>
    </div>

    <div className="grid md:grid-cols-2 gap-5 mb-8">
      {[
        { icon: "🎯", title: "Our Mission", text: "To make high-quality household products accessible to every family across India, delivering trust, value, and satisfaction with every order." },
        { icon: "🌟", title: "Our Vision", text: "To become India's most loved local household brand — built on transparency, quality, and genuine care for our customers." },
      ].map(({ icon, title, text }) => (
        <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition">
          <div className="text-3xl mb-3">{icon}</div>
          <h3 className="text-lg font-bold text-[#0E3F7A] mb-2">{title}</h3>
          <p className="text-gray-500 text-sm leading-relaxed">{text}</p>
        </div>
      ))}
    </div>

    <div className="bg-white rounded-3xl shadow-sm p-6 md:p-8 mb-8 border border-gray-100">
      <h2 className="text-xl font-black text-gray-900 mb-6 text-center">Why Choose <span className="text-[#E11D2E]">विन</span>?</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: "🏆", title: "Premium Quality", sub: "Hand-picked products" },
          { icon: "💰", title: "Fair Prices", sub: "No hidden markups" },
          { icon: "🚚", title: "Fast Delivery", sub: "Pan-India shipping" },
          { icon: "🤝", title: "Trust First", sub: "Verified products" },
        ].map(({ icon, title, sub }) => (
          <div key={title} className="text-center p-4 bg-[#F0F4F8] rounded-2xl hover:bg-[#E3ECF3] transition">
            <div className="text-3xl mb-2">{icon}</div>
            <p className="font-bold text-sm text-gray-800">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] rounded-3xl p-6 md:p-8 mb-8 text-white">
      <h2 className="text-xl font-black mb-6 text-center opacity-90">Our Journey So Far</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {[["500+", "Happy Customers"], ["50+", "Products"], ["7", "Day Returns"], ["100%", "Secure Payments"]].map(([num, label]) => (
          <div key={label} className="bg-white/10 backdrop-blur rounded-2xl p-4">
            <p className="text-3xl font-black text-[#E4BF1A]">{num}</p>
            <p className="text-sm text-white/80 mt-1">{label}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="bg-white rounded-3xl shadow-sm p-6 border border-gray-100">
      <h2 className="text-xl font-black text-gray-900 mb-2">Built with ❤️ in India</h2>
      <p className="text-gray-500 text-sm leading-relaxed mb-4">
        We are a passionate team from Shajapur, Madhya Pradesh, dedicated to bringing the best household products to your doorstep.
        Our team handpicks every product, ensuring it meets our quality standards before it reaches you.
      </p>
      <div className="flex items-center gap-3 bg-[#F0F4F8] rounded-2xl p-4">
        <span className="text-2xl">📍</span>
        <div>
          <p className="font-semibold text-sm text-gray-800">Headquarters</p>
          <p className="text-xs text-gray-500">AB Road, Shajapur, Madhya Pradesh, India</p>
        </div>
      </div>
    </div>
  </div>
);

// ─── Contact Page ─────────────────────────────────────────────
const ContactPage = () => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!form.name || !form.email || !form.message) { alert("Please fill in all required fields."); return; }
    setSending(true);
    try {
      await sendMail({
        to: "samruddhigroupofindustries@gmail.com",
        subject: `📩 Contact Form — ${form.name}`,
        body: `
Name: ${form.name}
Email: ${form.email}
Phone: ${form.phone || "N/A"}

Message:
${form.message}
        `.trim(),
        isHtml: false,
      });
      setSent(true);
      setForm({ name: "", email: "", phone: "", message: "" });
    } catch (e) {
      alert("Failed to send. Please try emailing us directly.");
    }
    setSending(false);
  };

  return (
    <div className="animate-fadeIn">
      <div className="bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-3xl p-8 text-white text-center mb-8">
        <div className="text-4xl mb-3">💬</div>
        <h1 className="text-2xl md:text-3xl font-black mb-2">Get in Touch</h1>
        <p className="text-white/75 text-sm max-w-md mx-auto">We'd love to hear from you. Send us a message and we'll respond as soon as possible.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Contact Information</h3>
            <div className="space-y-4">
              {[
                { Icon: Icon.Phone, label: "Phone", value: "+91 94259 40136", href: "tel:+919425940136" },
                { Icon: Icon.Mail, label: "Email", value: "samruddhigroupofindustries@gmail.com", href: "mailto:samruddhigroupofindustries@gmail.com" },
                { Icon: Icon.Location, label: "Address", value: "AB Road, Shajapur, Madhya Pradesh, India", href: null },
              ].map(({ Icon: I, label, value, href }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-[#E3ECF3] rounded-xl flex items-center justify-center text-[#0E3F7A] flex-shrink-0">
                    <I />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                    {href ? (
                      <a href={href} className="text-sm text-gray-700 hover:text-[#0E3F7A] transition break-all font-medium">{value}</a>
                    ) : (
                      <p className="text-sm text-gray-700 font-medium">{value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-3">Business Hours</h3>
            {[["Monday – Saturday", "9:00 AM – 7:00 PM"], ["Sunday", "10:00 AM – 4:00 PM"]].map(([day, time]) => (
              <div key={day} className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                <span className="text-gray-600">{day}</span>
                <span className="font-semibold text-[#0E3F7A]">{time}</span>
              </div>
            ))}
          </div>

          <a
            href="https://wa.me/919425940136"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-[#25D366] text-white p-4 rounded-2xl shadow-sm hover:shadow-md transition hover:-translate-y-0.5 group"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="22" height="22" fill="white">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.2-17.1-41.3-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.1 13.9 10.9-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-sm">Chat on WhatsApp</p>
              <p className="text-white/80 text-xs">Get instant replies</p>
            </div>
            <div className="ml-auto text-white/60 group-hover:translate-x-1 transition">→</div>
          </a>

          <a
            href="https://instagram.com/samruddhi_group_of_industries"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white p-4 rounded-2xl shadow-sm hover:shadow-md transition hover:-translate-y-0.5 group"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon.Instagram />
            </div>
            <div>
              <p className="font-bold text-sm">Follow on Instagram</p>
              <p className="text-white/80 text-xs">@samruddhi_group_of_industries</p>
            </div>
            <div className="ml-auto text-white/60 group-hover:translate-x-1 transition">→</div>
          </a>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4">Send us a Message</h3>
          {sent ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-3xl">✓</div>
              <p className="font-bold text-gray-800 text-lg">Message Sent!</p>
              <p className="text-gray-500 text-sm">We'll get back to you within 24 hours.</p>
              <button onClick={() => setSent(false)} className="mt-2 text-[#0E3F7A] text-sm font-semibold hover:underline">Send another message</button>
            </div>
          ) : (
            <div className="space-y-3">
              <input type="text" placeholder="Your Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] outline-none transition" />
              <input type="email" placeholder="Email Address *" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] outline-none transition" />
              <input type="tel" placeholder="Phone Number" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] outline-none transition" />
              <textarea
                placeholder="Your message... *"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={5}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] outline-none resize-none transition"
              />
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3.5 rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 transition"
              >
                {sending ? "Sending..." : "Send Message →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Login Modal ──────────────────────────────────────────────
const LoginModal = ({ onSignIn, onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
    <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-lg flex items-center justify-center mx-auto mb-5 bg-white border border-gray-100">
          <img src="/logo.png" alt="Ween Logo" className="w-full h-full object-contain scale-110" onError={(e) => { e.target.parentElement.innerHTML = "<span class='text-3xl font-black text-[#E11D2E]'>W</span>"; }} />
        </div>
        <h2 className="text-2xl font-extrabold text-[#E11D2E]">Welcome to विन</h2>
        <p className="text-gray-500 mt-2 text-sm">Sign in to shop & track orders</p>
        <button onClick={onSignIn} className="mt-6 w-full flex items-center justify-center gap-3 border-2 border-gray-200 py-3.5 rounded-2xl hover:bg-gray-50 font-semibold text-gray-700 transition duration-200 hover:shadow-md">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>
        <p className="text-xs text-gray-400 mt-4">By signing in, you agree to our Terms & Privacy Policy</p>
      </div>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────
export default function HomePage() {
  const [user, setUser] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [adSlides, setAdSlides] = useState([]);
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
  const [viewMode, setViewMode] = useState("grid");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [toast, setToast] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const heroSlides = [
    { bg: "from-[#0E3F7A] to-[#1975B1]", title: "Shop Smarter", sub: "Premium products at honest prices", emoji: "🛒" },
    { bg: "from-[#1975B1] to-[#0E3F7A]", title: "New Arrivals", sub: "Fresh picks every week", emoji: "✨" },
    { bg: "from-[#E4BF1A] to-[#d4af10]", title: "Fast Delivery", sub: "Right to your doorstep", emoji: "🚀" },
  ];

  const navTabs = [
    { id: "shop", label: "Shop", icon: "🛍️" },
    { id: "orders", label: "My Orders", icon: "📦" },
    { id: "about", label: "About", icon: "ℹ️" },
    { id: "contact", label: "Contact", icon: "📞" },
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
        if (firebaseUser.email) setUserEmailFromOneTap(firebaseUser.email);
      }
      setAppReady(true);
    });
    loadProducts();
    loadFeedbacks();
    loadAdSlides();
    refreshCart();
    window.addEventListener("cartUpdated", refreshCart);
    const interval = setInterval(() => setCurrentSlide((s) => (s + 1) % heroSlides.length), 5000);

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
              if (result.user.email) setUserEmailFromOneTap(result.user.email);
              setShowLoginPopup(false);
            } catch (e) { console.error(e); }
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
    return () => { unsub(); window.removeEventListener("cartUpdated", refreshCart); clearInterval(interval); };
  }, []);

  const loadAdSlides = async () => {
    try {
      const snap = await getDocs(query(collection(db, "adSlides"), orderBy("order", "asc")));
      if (!snap.empty) setAdSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { /* no ad slides yet */ }
  };

  const loadProducts = async () => {
    try {
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) }));
      if (list.length === 0) {
        const samples = [
          { name: "Tide Plus Detergent Powder", price: 399, stock: 50, category: "Detergent", description: "Premium detergent for tough stains.", rating: 4.5 },
          { name: "Surf Excel Easy Wash", price: 449, stock: 40, category: "Detergent", description: "Quick stain removal formula.", rating: 4.3 },
          { name: "Comfort Fabric Softener", price: 299, stock: 60, category: "Softener", description: "Long-lasting freshness.", rating: 4.2 },
          { name: "Harpic Power Cleaner", price: 249, stock: 45, category: "Cleaner", description: "Kills 99.9% germs.", rating: 4.4 },
          { name: "Lizol Floor Cleaner", price: 299, stock: 35, category: "Cleaner", description: "Kills 99.9% germs on floor surfaces.", rating: 4.5 },
          { name: "Vim Dishwash Gel", price: 149, stock: 80, category: "Dishwash", description: "Removes grease effectively.", rating: 4.1 },
          { name: "Dettol Hand Wash", price: 199, stock: 70, category: "Personal Care", description: "Gentle antibacterial hand wash.", rating: 4.6 },
          { name: "Colin Glass Cleaner", price: 179, stock: 55, category: "Cleaner", description: "Crystal clear shine.", rating: 4.0 },
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
    } catch (e) { console.error(e); }
  };

  const loadUserOrders = async (uid) => {
    try {
      const snap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid), orderBy("orderDate", "desc")));
      setOrders(snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) })));
    } catch (e) { console.error(e); }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserInFirestore(result.user);
      setUser(result.user);
      if (result.user.email) setUserEmailFromOneTap(result.user.email);
      setShowLoginPopup(false);
      loadUserOrders(result.user.uid);
      
      // ─── 📱 SEND FCM TO ADMINS ON SIGN-IN ───
      await sendFCMToAdmins(
        "👤 New User Signed In!",
        `${result.user.displayName || 'Someone'} just signed in to Ween`,
        { 
          userId: result.user.uid, 
          userEmail: result.user.email,
          userName: result.user.displayName || 'Unknown',
          type: "user_signin"
        }
      );
      
      showToast("Welcome! 🎉", "success");
    } catch (e) {
      console.error(e);
      alert("Sign in failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setOrders([]);
    saveCart([]);
    refreshCart();
    setShowUserMenu(false);
    showToast("Signed out successfully", "info");
  };

  const handleAddToCart = (product, qty = 1) => {
    if (!user) { setShowLoginPopup(true); return; }
    const c = getCart();
    const existing = c.find((i) => i.productId === product.id);
    if (existing) existing.quantity += qty;
    else c.push({ productId: product.id, name: product.name, price: product.price, imageBase64: product.imageBase64, quantity: qty, stock: product.stock });
    saveCart(c);
    showToast(`${product.name} added to cart!`);
  };

  const handleBuyNow = (product, qty = 1) => {
    if (!user) { setShowLoginPopup(true); return; }
    saveCart([{ productId: product.id, name: product.name, price: product.price, imageBase64: product.imageBase64, quantity: qty, stock: product.stock }]);
    refreshCart();
    setShowCheckout(true);
    showToast("Proceeding to checkout!");
  };

  const handleRemoveFromCart = (pid) => { saveCart(getCart().filter((i) => i.productId !== pid)); };

  const handleUpdateQty = (pid, qty) => {
    const c = getCart();
    const idx = c.findIndex((i) => i.productId === pid);
    if (idx >= 0) { if (qty <= 0) c.splice(idx, 1); else c[idx].quantity = qty; }
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

  const handleAddFeedback = async (productId, rating, comment) => {
    try {
      await addDoc(collection(db, "feedbacks"), {
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        rating: rating,
        comment: comment,
        productId: productId,
        createdAt: Timestamp.now(),
      });
      await loadFeedbacks();
      showToast("✅ Review added!");
    } catch (e) {
      console.error(e);
      alert("Failed to add review.");
    }
  };

  const handleEditFeedback = async (feedbackId, rating, comment) => {
    try {
      const ref = doc(db, "feedbacks", feedbackId);
      await updateDoc(ref, {
        rating: rating,
        comment: comment,
        updatedAt: Timestamp.now(),
      });
      await loadFeedbacks();
      showToast("✅ Review updated!");
    } catch (e) {
      console.error(e);
      alert("Failed to update review.");
    }
  };

  const handleDeleteFeedback = async (feedbackId) => {
    try {
      await deleteDoc(doc(db, "feedbacks", feedbackId));
      await loadFeedbacks();
      showToast("🗑️ Review deleted!");
    } catch (e) {
      console.error(e);
      alert("Failed to delete review.");
    }
  };

  const filtered = products.filter((p) => {
    const matchCat = selectedCategory === "all" || p.category === selectedCategory;
    const s = searchTerm.toLowerCase();
    const matchSearch = !s || p.name?.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s);
    return matchCat && matchSearch;
  });

  const statusColors = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    payment_verification: "bg-violet-100 text-violet-700",
    cancelled: "bg-red-100 text-red-700",
  };

  // ── Product detail page ──
  if (selectedProduct) return (
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
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] animate-toastIn px-5 py-3 rounded-full shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type === "info" ? "bg-gray-700" : "bg-gradient-to-r from-[#0E3F7A] to-[#1975B1]"}`}>
          {toast.type !== "info" && <Icon.Check />} {toast.msg}
        </div>
      )}
      <ProductDetailPage
        product={selectedProduct}
        user={user}
        feedbacks={feedbacks}
        onBack={() => { setSelectedProduct(null); window.history.pushState({}, "", window.location.pathname); }}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onSignIn={() => setShowLoginPopup(true)}
        onAddFeedback={handleAddFeedback}
        onEditFeedback={handleEditFeedback}
        onDeleteFeedback={handleDeleteFeedback}
      />
      {showCheckout && user && <CheckoutModal cart={cart} user={user} onClose={() => setShowCheckout(false)} onOrderPlaced={handleOrderPlaced} />}
      {showLoginPopup && <LoginModal onSignIn={handleGoogleSignIn} onClose={() => setShowLoginPopup(false)} />}
    </>
  );

  // ── Main layout ──
  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.4,0,0.2,1); }
        .animate-toastIn { animation: toastIn 0.3s ease-out; }
        .animate-spin { animation: spin 1s linear infinite; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
        .line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
        .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
        .category-scroll::-webkit-scrollbar { display: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] animate-toastIn px-5 py-3 rounded-full shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type === "info" ? "bg-gray-700" : "bg-gradient-to-r from-[#0E3F7A] to-[#1975B1]"}`}>
          {toast.type !== "info" && <Icon.Check />} {toast.msg}
        </div>
      )}

      {orderSuccess && (
        <div className="fixed inset-x-0 top-0 z-[250] bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
          <span className="text-xl">🎉</span>
          <span className="font-semibold">Order placed! We'll deliver it soon.</span>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 py-3">
            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0 cursor-pointer" onClick={() => { setActiveTab("shop"); setSelectedCategory("all"); setSearchTerm(""); }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-white border border-gray-100">
                <img src="/logo.png" alt="Ween Logo" className="w-full h-full object-contain scale-110" onError={(e) => { e.target.parentElement.innerHTML = "<span class='text-lg font-black text-[#E11D2E]'>W</span>"; }} />
              </div>
              <div className="hidden sm:block">
                <p className="font-black text-[#E11D2E] text-xl leading-none tracking-wide">विन</p>
                <p className="text-gray-400 text-[10px] leading-none mt-1">Samruddhi Group of Industries</p>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1 ml-3">
              {navTabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition whitespace-nowrap ${activeTab === tab.id ? "bg-[#E3ECF3] text-[#0E3F7A]" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}>
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Search */}
            {activeTab === "shop" && (
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400"><Icon.Search /></div>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-[#1975B1] focus:bg-white outline-none text-sm transition"
                />
              </div>
            )}
            {activeTab !== "shop" && <div className="flex-1" />}

            {/* User area */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {user ? (
                <div className="relative">
                  <button onClick={() => setShowUserMenu((v) => !v)} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-xl px-2 py-1.5 transition">
                    <img src={user.photoURL} className="w-7 h-7 rounded-full" alt="" />
                    <span className="text-sm font-medium hidden md:block max-w-[80px] truncate">{user.displayName?.split(" ")[0]}</span>
                    <svg className="w-3 h-3 text-gray-400 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 min-w-[180px] z-50">
                      <div className="px-4 py-2 border-b border-gray-50">
                        <p className="text-sm font-semibold text-gray-800 truncate">{user.displayName}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      {navTabs.filter(t => t.id !== "shop").map((tab) => (
                        <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowUserMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          {tab.icon} {tab.label}
                        </button>
                      ))}
                      <div className="border-t border-gray-50 mt-1 pt-1">
                        <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2">
                          <Icon.Logout /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowLoginPopup(true)} className="flex items-center gap-2 bg-[#0E3F7A] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1975B1] transition shadow-sm">
                  Sign In
                </button>
              )}
              <button
                onClick={() => user ? setShowCart(true) : setShowLoginPopup(true)}
                className="relative bg-gray-50 hover:bg-gray-100 p-2.5 rounded-xl transition"
              >
                <Icon.Cart />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#E11D2E] text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Category pills */}
          {activeTab === "shop" && (
            <div className="flex gap-1 pb-2 overflow-x-auto category-scroll">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${selectedCategory === cat ? "bg-[#0E3F7A] text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}>
                  {cat === "all" ? "All Products" : cat}
                </button>
              ))}
            </div>
          )}

          {/* Mobile tab bar */}
          <div className="flex lg:hidden gap-0 pb-1 overflow-x-auto no-scrollbar">
            {navTabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full transition whitespace-nowrap mr-1 ${activeTab === tab.id ? "bg-[#0E3F7A] text-white" : "text-gray-400 hover:text-gray-600"}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-16">
        <div className="mt-4">

          {/* ── SHOP ── */}
          {activeTab === "shop" && (
            <div className="animate-fadeIn">
              {!searchTerm && selectedCategory === "all" && (
                <div className="relative rounded-3xl overflow-hidden mb-6 h-52 md:h-72 shadow-xl">
                  {heroSlides.map((slide, idx) => (
                    <div key={idx} className={`absolute inset-0 bg-gradient-to-br ${slide.bg} flex items-center transition-opacity duration-700 ${currentSlide === idx ? "opacity-100" : "opacity-0"}`}>
                      <div className="px-10 text-white">
                        <p className="text-5xl mb-4">{slide.emoji}</p>
                        <h2 className="text-3xl md:text-5xl font-black leading-none mb-2">{slide.title}</h2>
                        <p className="text-white/70 text-base md:text-lg">{slide.sub}</p>
                      </div>
                    </div>
                  ))}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {heroSlides.map((_, i) => (
                      <button key={i} onClick={() => setCurrentSlide(i)} className={`h-1.5 rounded-full transition-all ${currentSlide === i ? "bg-white w-6" : "bg-white/40 w-1.5"}`} />
                    ))}
                  </div>
                </div>
              )}

              {adSlides.length > 0 && !searchTerm && (
                <div className="mb-6"><AdBannerSlider slides={adSlides} /></div>
              )}

              <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6">
                <aside className="hidden lg:block">
                  <div className="bg-white rounded-2xl shadow-sm p-5 sticky top-28 border border-gray-100">
                    <h3 className="font-bold text-gray-700 mb-4 text-xs uppercase tracking-widest">Categories</h3>
                    <div className="space-y-1">
                      {categories.map((cat) => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-between ${selectedCategory === cat ? "bg-[#E3ECF3] text-[#0E3F7A] font-bold" : "text-gray-600 hover:bg-gray-50"}`}>
                          <span>{cat === "all" ? "All Products" : cat}</span>
                          <span className={`text-xs rounded-full px-1.5 py-0.5 ${selectedCategory === cat ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"}`}>
                            {cat === "all" ? products.length : products.filter((p) => p.category === cat).length}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-6 pt-5 border-t border-gray-100 space-y-2">
                      {[["🚚", "Free delivery above ₹499"], ["↩️", "7-day easy returns"], ["🔒", "100% secure payments"], ["📍", "All India delivery"]].map(([icon, text]) => (
                        <div key={text} className="flex items-start gap-2 py-1.5 text-xs text-gray-500">
                          <span>{icon}</span><span>{text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900">
                      {selectedCategory === "all" ? "All Products" : selectedCategory}
                      <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length})</span>
                    </h2>
                    <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
                      <button onClick={() => setViewMode("grid")} className={`p-2 rounded-lg transition ${viewMode === "grid" ? "bg-white shadow-sm text-[#0E3F7A]" : "text-gray-400"}`}><Icon.Grid /></button>
                      <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg transition ${viewMode === "list" ? "bg-white shadow-sm text-[#0E3F7A]" : "text-gray-400"}`}><Icon.List /></button>
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
                      <p className="text-5xl mb-4">🔍</p>
                      <p className="font-semibold text-gray-700 text-lg">No products found</p>
                      <p className="text-gray-400 text-sm mt-1">Try a different search or category</p>
                      <button onClick={() => { setSearchTerm(""); setSelectedCategory("all"); }} className="mt-4 text-[#0E3F7A] text-sm font-semibold hover:underline">Clear filters</button>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                      {filtered.map((p) => <ProductCard key={p.id} product={p} onView={setSelectedProduct} onAddToCart={handleAddToCart} view="grid" />)}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((p) => <ProductCard key={p.id} product={p} onView={setSelectedProduct} onAddToCart={handleAddToCart} view="list" />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── ORDERS ── */}
          {activeTab === "orders" && (
            <div className="animate-fadeIn">
              {!user ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
                  <p className="text-6xl mb-4">🔐</p>
                  <p className="font-semibold text-gray-700 text-lg">Sign in to view orders</p>
                  <p className="text-gray-400 text-sm mt-1">Track all your purchases in one place</p>
                  <button onClick={handleGoogleSignIn} className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition shadow-lg">Sign In with Google</button>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
                  <p className="text-6xl mb-4">📦</p>
                  <p className="font-semibold text-gray-700 text-lg">No orders yet</p>
                  <p className="text-gray-400 text-sm mt-1">Start shopping to see your orders here</p>
                  <button onClick={() => setActiveTab("shop")} className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition shadow-lg">Shop Now</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition">
                      <div className="p-4 border-b border-gray-50 flex justify-between items-start gap-3">
                        <div>
                          <span className="font-mono text-xs bg-gray-100 px-2.5 py-1 rounded-lg text-gray-600">#{order.orderId}</span>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                              {order.status?.replace("_", " ")}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium uppercase">{order.paymentMethod}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xl font-extrabold text-gray-900">₹{order.totalAmount?.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">{order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</p>
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.productName} <span className="text-gray-400">× {item.quantity}</span></span>
                            <span className="font-semibold text-gray-800">₹{item.total?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      {order.deliveryAddress && (
                        <div className="px-4 pb-4 flex items-start gap-2 text-xs text-gray-400">
                          <Icon.Location />
                          <span>{order.deliveryAddress.street}, {order.deliveryAddress.city} {order.deliveryAddress.pincode}</span>
                        </div>
                      )}
                      {order.transactionId && (
                        <div className="px-4 pb-4 text-xs text-[#0E3F7A] font-semibold bg-violet-50 mx-4 mb-4 rounded-lg px-3 py-1.5">
                          UTR: {order.transactionId}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ABOUT ── */}
          {activeTab === "about" && <AboutPage />}

          {/* ── CONTACT ── */}
          {activeTab === "contact" && <ContactPage />}

        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0D1B2A] text-gray-400 mt-8">
        <div className="max-w-7xl mx-auto px-4 pt-10 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex items-center justify-center bg-white/10 border border-white/10">
                  <img src="/logo.png" alt="Ween Logo" className="w-full h-full object-contain scale-110" onError={(e) => { e.target.parentElement.innerHTML = "<span class='text-lg font-black text-[#E11D2E]'>W</span>"; }} />
                </div>
                <div>
                  <p className="text-[#E11D2E] font-black text-2xl leading-none tracking-wide">विन</p>
                  <p className="text-gray-500 text-xs mt-1">Samruddhi Group of Industries</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">Premium quality household products delivered to your doorstep across India.</p>
              <div className="flex items-center gap-3 mt-4">
                <a href="https://instagram.com/samruddhi_group_of_industries" target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 bg-white/10 hover:bg-gradient-to-br hover:from-[#833ab4] hover:to-[#fcb045] rounded-xl flex items-center justify-center transition text-gray-400 hover:text-white">
                  <Icon.Instagram />
                </a>
                <a href="https://wa.me/919425940136" target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 bg-white/10 hover:bg-[#25D366] rounded-xl flex items-center justify-center transition text-gray-400 hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="16" height="16" fill="currentColor">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.2-17.1-41.3-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.1 13.9 10.9-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Contact</h4>
              <div className="space-y-3 text-sm">
                <a href="tel:+919425940136" className="flex items-center gap-2 hover:text-[#E4BF1A] transition"><Icon.Phone /> +91 94259 40136</a>
                <a href="mailto:samruddhigroupofindustries@gmail.com" className="flex items-start gap-2 hover:text-[#E4BF1A] transition break-all"><Icon.Mail /> samruddhigroupofindustries@gmail.com</a>
                <div className="flex items-start gap-2"><Icon.Location /> <span>AB Road, Shajapur, Madhya Pradesh, India</span></div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
              <ul className="space-y-2.5 text-sm">
                {navTabs.map(({ id, label, icon }) => (
                  <li key={id}>
                    <button onClick={() => setActiveTab(id)} className="hover:text-[#E4BF1A] transition flex items-center gap-2">
                      {icon} {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Policies</h4>
              <ul className="space-y-2.5 text-sm">
                {["Privacy Policy", "Terms & Conditions", "Return Policy", "Shipping Info"].map((p) => (
                  <li key={p}><button className="hover:text-[#E4BF1A] transition">{p}</button></li>
                ))}
              </ul>
              <div className="mt-4 bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-500 font-semibold mb-1">Payment Methods</p>
                <div className="flex gap-2 text-lg">🏦 💳 📱</div>
                <p className="text-xs text-gray-600 mt-1">UPI, COD accepted</p>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-600">
            <p>© 2026 विन by Samruddhi Group of Industries · All rights reserved</p>
            <p>Designed by <span className="text-[#E4BF1A]">Softmax.in</span></p>
          </div>
        </div>
      </footer>

      {/* Login Popup */}
      {showLoginPopup && <LoginModal onSignIn={handleGoogleSignIn} onClose={() => setShowLoginPopup(false)} />}

      {showCart && (
        <CartSidebar cart={cart} user={user} onClose={() => setShowCart(false)} onRemove={handleRemoveFromCart} onUpdateQty={handleUpdateQty}
          onCheckout={() => { setShowCart(false); setShowCheckout(true); }} />
      )}

      {showCheckout && user && (
        <CheckoutModal cart={cart} user={user} onClose={() => setShowCheckout(false)} onOrderPlaced={handleOrderPlaced} />
      )}

      {showUserMenu && <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />}

      {/* WhatsApp Floating Button */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 999999 }}>
        <a href="https://wa.me/919425940136" target="_blank" rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "58px", height: "58px", backgroundColor: "#25D366",
            borderRadius: "50%", boxShadow: "0 4px 20px rgba(37,211,102,0.5)",
            cursor: "pointer", transition: "transform 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="28" height="28" fill="white">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.2-17.1-41.3-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.1 13.9 10.9-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
          </svg>
        </a>
      </div>
    </>
  );
}



// "use client";

// import { useState, useEffect, useRef, useCallback } from "react";
// import { initializeApp, getApps } from "firebase/app";
// import {
//   getAuth,
//   onAuthStateChanged,
//   signInWithPopup,
//   signInWithCredential,
//   GoogleAuthProvider,
//   signOut,
// } from "firebase/auth";
// import {
//   getFirestore,
//   collection,
//   doc,
//   getDocs,
//   getDoc,
//   addDoc,
//   updateDoc,
//   setDoc,
//   query,
//   where,
//   orderBy,
//   Timestamp,
//   writeBatch,
// } from "firebase/firestore";

// const firebaseConfig = {
//   apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
//   authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
//   projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
//   storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
//   appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
// };

// const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
// const auth = getAuth(app);
// const db = getFirestore(app);
// const googleProvider = new GoogleAuthProvider();

// const convertTimestamps = (data) => {
//   if (!data) return data;
//   const c = { ...data };
//   for (const k in c) {
//     if (c[k]?.toDate) c[k] = c[k].toDate();
//   }
//   return c;
// };

// const ensureUserInFirestore = async (user) => {
//   if (!user) return;
//   const ref = doc(db, "users", user.uid);
//   const snap = await getDoc(ref);
//   if (!snap.exists()) {
//     await setDoc(ref, {
//       name: user.displayName || "User",
//       email: user.email || "",
//       photoUrl: user.photoURL || "",
//       isAdmin: false,
//       userType: "customer",
//       createdAt: Timestamp.now(),
//       lastLogin: Timestamp.now(),
//     });
//   } else {
//     await updateDoc(ref, { lastLogin: Timestamp.now() });
//   }
// };

// const CART_KEY = "ween_cart_v2";
// const getCart = () => {
//   if (typeof window === "undefined") return [];
//   try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
// };
// const saveCart = (cart) => {
//   if (typeof window === "undefined") return;
//   localStorage.setItem(CART_KEY, JSON.stringify(cart));
//   window.dispatchEvent(new Event("cartUpdated"));
// };
// const setUserEmailFromOneTap = (email) => {
//   if (typeof window !== "undefined") localStorage.setItem("ween_user_email", email);
// };

// // ---------- Icons ----------
// const Icon = {
//   Cart: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
//     </svg>
//   ),
//   Search: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" />
//     </svg>
//   ),
//   Star: ({ filled }) => (
//     <svg className={`w-4 h-4 ${filled ? "text-[#E4BF1A] fill-[#E4BF1A]" : "text-gray-300 fill-gray-300"}`} viewBox="0 0 24 24">
//       <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
//     </svg>
//   ),
//   Grid: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
//       <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
//     </svg>
//   ),
//   List: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
//     </svg>
//   ),
//   Share: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
//       <path strokeLinecap="round" strokeWidth={2} d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
//     </svg>
//   ),
//   Back: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" />
//     </svg>
//   ),
//   Location: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
//       <circle cx="12" cy="11" r="3" />
//     </svg>
//   ),
//   Check: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
//     </svg>
//   ),
//   Close: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
//     </svg>
//   ),
//   Package: () => (
//     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
//     </svg>
//   ),
//   QR: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" />
//       <rect x="3" y="13" width="8" height="8" rx="1" />
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 13h2v2h-2zM17 13h4M17 17v4M21 17h-4v4" />
//     </svg>
//   ),
//   COD: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
//     </svg>
//   ),
//   Phone: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
//     </svg>
//   ),
//   Mail: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
//     </svg>
//   ),
//   Instagram: () => (
//     <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
//       <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
//     </svg>
//   ),
//   Logout: () => (
//     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
//     </svg>
//   ),
//   ChevronLeft: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
//     </svg>
//   ),
//   ChevronRight: () => (
//     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
//     </svg>
//   ),
// };

// const Stars = ({ rating, size = 4 }) => (
//   <div className="flex gap-0.5">
//     {[1, 2, 3, 4, 5].map((i) => <Icon.Star key={i} filled={i <= Math.round(rating)} />)}
//   </div>
// );

// // ---------- QR Payment Modal ----------
// const QRPaymentModal = ({ amount, onSuccess, onClose }) => {
//   const [txnId, setTxnId] = useState("");
//   const [submitted, setSubmitted] = useState(false);

//   const handleSubmit = async () => {
//     if (!txnId.trim()) { alert("Please enter the transaction ID"); return; }
//     setSubmitted(true);
//     await onSuccess(txnId);
//   };

//   return (
//     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
//       <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
//         <div className="bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] p-6 text-white text-center">
//           <p className="text-sm opacity-80 mb-1">Pay via UPI</p>
//           <p className="text-3xl font-bold">₹{amount.toLocaleString()}</p>
//         </div>
//         <div className="p-6">
//           <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-3 mb-5">
//             <div className="grid grid-cols-7 gap-1">
//               {Array.from({ length: 49 }).map((_, i) => (
//                 <div key={i} className={`w-4 h-4 rounded-sm ${[0,1,2,7,8,9,14,3,10,4,11,5,12,6,13,15,16,17,18,19,20,21,42,43,44,45,46,47,48,28,35].includes(i) ? "bg-gray-900" : "bg-white"}`} />
//               ))}
//             </div>
//             <p className="text-xs text-gray-500 font-mono">ween@upi</p>
//             <p className="text-xs text-gray-400">Scan & Pay with any UPI app</p>
//           </div>
//           <div className="space-y-3">
//             <label className="block text-sm font-semibold text-gray-700">Transaction ID / UTR</label>
//             <input type="text" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="Enter 12-digit UTR number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] focus:outline-none" />
//             <button onClick={handleSubmit} disabled={submitted} className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:shadow-lg transition">
//               {submitted ? "Submitting..." : "Submit for Verification"}
//             </button>
//             <button onClick={onClose} className="w-full text-gray-400 text-sm py-2">Cancel</button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// // ---------- Map Picker Modal ----------
// const MapPickerModal = ({ onSelect, onClose }) => {
//   const mapRef = useRef(null);
//   const mapInstance = useRef(null);
//   const markerRef = useRef(null);
//   const [selectedLocation, setSelectedLocation] = useState(null);
//   const [address, setAddress] = useState("");

//   useEffect(() => {
//     const script = document.createElement("script");
//     script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
//     script.onload = () => {
//       const L = window.L;
//       const map = L.map(mapRef.current).setView([22.3511148, 78.6677428], 5);
//       mapInstance.current = map;
//       L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
//       const icon = L.divIcon({
//         html: '<div style="background:#0E3F7A;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
//         iconSize: [24, 24], iconAnchor: [12, 24],
//       });
//       if (navigator.geolocation) {
//         navigator.geolocation.getCurrentPosition((pos) => {
//           map.setView([pos.coords.latitude, pos.coords.longitude], 15);
//         });
//       }
//       map.on("click", async (e) => {
//         const { lat, lng } = e.latlng;
//         if (markerRef.current) markerRef.current.remove();
//         markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
//         setSelectedLocation({ lat, lng });
//         try {
//           const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
//           const data = await res.json();
//           setAddress(data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
//         } catch {
//           setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
//         }
//       });
//     };
//     document.head.appendChild(script);
//     const link = document.createElement("link");
//     link.rel = "stylesheet";
//     link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
//     document.head.appendChild(link);
//     return () => { if (mapInstance.current) mapInstance.current.remove(); };
//   }, []);

//   return (
//     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
//       <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "85vh" }}>
//         <div className="p-4 border-b flex justify-between items-center">
//           <div>
//             <h3 className="font-bold text-gray-800">Select Delivery Location</h3>
//             <p className="text-xs text-gray-500 mt-0.5">Tap on map to pin your location</p>
//           </div>
//           <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icon.Close /></button>
//         </div>
//         <div ref={mapRef} style={{ height: "380px", flex: "0 0 380px" }} className="w-full" />
//         <div className="p-4 border-t">
//           {address ? (
//             <div className="flex items-start gap-3 bg-[#E3ECF3] rounded-xl p-3 mb-3">
//               <div className="text-[#0E3F7A] mt-0.5"><Icon.Location /></div>
//               <div>
//                 <p className="text-xs text-[#0E3F7A] font-semibold mb-0.5">Selected Location</p>
//                 <p className="text-sm text-gray-700 leading-snug">{address}</p>
//               </div>
//             </div>
//           ) : (
//             <p className="text-sm text-gray-400 text-center mb-3">Click anywhere on the map to set delivery location</p>
//           )}
//           <button
//             onClick={() => selectedLocation && onSelect({ address, ...selectedLocation })}
//             disabled={!selectedLocation}
//             className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1975B1] transition"
//           >
//             Confirm Location
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// // ---------- Ad Banner Slider ----------
// const AdBannerSlider = ({ slides }) => {
//   const [current, setCurrent] = useState(0);
//   useEffect(() => {
//     const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 4000);
//     return () => clearInterval(t);
//   }, [slides.length]);

//   return (
//     <div className="relative w-full rounded-2xl overflow-hidden shadow-md" style={{ aspectRatio: "3/1", minHeight: 100 }}>
//       {slides.map((slide, idx) => (
//         <div
//           key={idx}
//           className={`absolute inset-0 transition-opacity duration-700 ${current === idx ? "opacity-100" : "opacity-0"}`}
//         >
//           {slide.imageBase64 ? (
//             <img src={`data:image/jpeg;base64,${slide.imageBase64}`} alt={slide.title || "Ad"} className="w-full h-full object-cover" />
//           ) : slide.imageUrl ? (
//             <img src={slide.imageUrl} alt={slide.title || "Ad"} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
//           ) : (
//             <div className={`w-full h-full bg-gradient-to-br ${slide.bg || "from-[#0E3F7A] to-[#1975B1]"} flex items-center justify-center`}>
//               <div className="text-white text-center px-6">
//                 {slide.emoji && <p className="text-4xl mb-2">{slide.emoji}</p>}
//                 <p className="text-xl font-black">{slide.title}</p>
//                 {slide.sub && <p className="text-white/70 text-sm mt-1">{slide.sub}</p>}
//               </div>
//             </div>
//           )}
//         </div>
//       ))}
//       {slides.length > 1 && (
//         <>
//           <button onClick={() => setCurrent((c) => (c - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition z-10">
//             <Icon.ChevronLeft />
//           </button>
//           <button onClick={() => setCurrent((c) => (c + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition z-10">
//             <Icon.ChevronRight />
//           </button>
//           <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
//             {slides.map((_, i) => (
//               <button key={i} onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${current === i ? "bg-white w-5" : "bg-white/50 w-1.5"}`} />
//             ))}
//           </div>
//         </>
//       )}
//     </div>
//   );
// };

// // ---------- Product Detail Page ----------
// const ProductDetailPage = ({ product, user, onBack, onAddToCart, onBuyNow, feedbacks, onSignIn }) => {
//   const [qty, setQty] = useState(1);
//   const [copied, setCopied] = useState(false);
//   const [addedToCart, setAddedToCart] = useState(false);
//   const productFeedbacks = feedbacks.filter((f) => f.productId === product.id);
//   const avgRating = productFeedbacks.length > 0
//     ? (productFeedbacks.reduce((s, f) => s + f.rating, 0) / productFeedbacks.length).toFixed(1)
//     : product.rating || 4.5;

//   const handleShare = () => {
//     const url = `${window.location.origin}?product=${product.id}`;
//     navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
//   };

//   const handleAddToCartLocal = () => {
//     onAddToCart(product, qty);
//     setAddedToCart(true);
//     setTimeout(() => setAddedToCart(false), 2000);
//   };

//   return (
//     <div className="min-h-screen bg-[#F0F4F8]">
//       {/* Header - always visible */}
//       {/* <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4">
//           <div className="flex items-center gap-3 py-3">
//             <div className="flex items-center gap-2.5 flex-shrink-0">
//               <div className="w-9 h-9 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-xl flex items-center justify-center shadow-md">
//                 <span className="text-white font-black text-base">W</span>
//               </div>
//               <div className="hidden sm:block">
//                 <p className="font-black text-gray-900 text-lg leading-none">विन</p>
//                 <p className="text-gray-400 text-xs leading-none">Samruddhi Group of Industries</p>
//               </div>
//             </div>
//             <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#0E3F7A] transition font-medium ml-2">
//               <Icon.Back /> Back
//             </button>
//             <nav className="hidden md:flex text-xs text-gray-400 items-center gap-1 ml-1">
//               <span>Home</span><span>/</span>
//               <span className="text-[#0E3F7A]">{product.category}</span><span>/</span>
//               <span className="text-gray-700 font-medium truncate max-w-[160px]">{product.name}</span>
//             </nav>
//             <div className="ml-auto flex items-center gap-2">
//               <button
//                 onClick={handleShare}
//                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${copied ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-600 hover:bg-[#E3ECF3] hover:text-[#0E3F7A]"}`}
//               >
//                 {copied ? <><Icon.Check /> Copied!</> : <><Icon.Share /> Share</>}
//               </button>
//             </div>
//           </div>
//         </div>
//       </header> */}
//       <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
//   <div className="max-w-7xl mx-auto px-4">
//     <div className="flex items-center gap-3 py-3">
      
//       {/* Logo + Brand */}
//       <div className="flex items-center gap-3 flex-shrink-0">
//         <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md flex items-center justify-center bg-white border border-gray-100">
//           <img
//             src="/logo.png"
//             alt="Ween Logo"
//             className="w-full h-full object-contain scale-110"
//           />
//         </div>

//         <div className="hidden sm:block">
//           <p className="font-black text-[#E11D2E] text-xl leading-none tracking-wide">
//             विन
//           </p>
//           <p className="text-gray-400 text-xs leading-none mt-1">
//             Samruddhi Group of Industries
//           </p>
//         </div>
//       </div>

//       {/* Back Button */}
//       <button
//         onClick={onBack}
//         className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#0E3F7A] transition font-medium ml-2"
//       >
//         <Icon.Back /> Back
//       </button>

//       {/* Breadcrumb */}
//       <nav className="hidden md:flex text-xs text-gray-400 items-center gap-1 ml-1">
//         <span>Home</span>
//         <span>/</span>
//         <span className="text-[#0E3F7A]">
//           {product.category}
//         </span>
//         <span>/</span>
//         <span className="text-gray-700 font-medium truncate max-w-[160px]">
//           {product.name}
//         </span>
//       </nav>

//       {/* Share Button */}
//       <div className="ml-auto flex items-center gap-2">
//         <button
//           onClick={handleShare}
//           className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
//             copied
//               ? "bg-green-50 text-green-600"
//               : "bg-gray-100 text-gray-600 hover:bg-[#E3ECF3] hover:text-[#0E3F7A]"
//           }`}
//         >
//           {copied ? (
//             <>
//               <Icon.Check /> Copied!
//             </>
//           ) : (
//             <>
//               <Icon.Share /> Share
//             </>
//           )}
//         </button>
//       </div>
//     </div>
//   </div>
// </header>

//       <div className="max-w-6xl mx-auto px-4 py-6">
//         {/* Main product card - two columns on desktop */}
//         <div className="grid lg:grid-cols-2 gap-0 bg-white rounded-3xl shadow-xl overflow-hidden">
//           {/* Left: Image */}
//           <div className="relative bg-gradient-to-br from-[#E3ECF3] to-[#d0dce8] flex items-center justify-center p-6 min-h-[320px]">
//             {product.imageBase64 ? (
//               <img src={`data:image/jpeg;base64,${product.imageBase64}`} alt={product.name} className="max-h-80 w-full object-contain rounded-2xl" onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")} />
//             ) : (
//               <div className="text-gray-300 flex flex-col items-center gap-3">
//                 <Icon.Package />
//                 <p className="text-sm text-gray-400">No image</p>
//               </div>
//             )}
//             <span className="absolute top-4 left-4 inline-flex px-3 py-1 bg-white/80 backdrop-blur text-[#0E3F7A] text-xs font-semibold rounded-full shadow">
//               {product.category}
//             </span>
//           </div>

//           {/* Right: Details */}
//           <div className="p-6 lg:p-8 flex flex-col">
//             <h1 className="text-2xl lg:text-3xl font-black text-[#151B20] leading-tight">{product.name}</h1>
//             <div className="flex items-center gap-3 mt-2">
//               <Stars rating={parseFloat(avgRating)} />
//               <span className="text-sm text-gray-500">{avgRating} ({productFeedbacks.length} reviews)</span>
//             </div>
//             <div className="mt-4 flex items-end gap-3">
//               <span className="text-4xl font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
//             </div>
//             <p className="text-gray-500 text-sm mt-3 leading-relaxed flex-1">{product.description || "Premium quality product for everyday use."}</p>
//             <div className="mt-4 flex items-center gap-2">
//               <div className={`w-2 h-2 rounded-full ${product.stock > 0 ? "bg-green-500" : "bg-red-500"}`} />
//               <span className={`text-sm font-medium ${product.stock > 0 ? "text-green-700" : "text-red-600"}`}>
//                 {product.stock > 5 ? "In Stock" : product.stock > 0 ? `Only ${product.stock} left!` : "Out of Stock"}
//               </span>
//             </div>

//             {product.stock > 0 && (
//               <>
//                 <div className="flex items-center gap-4 mt-5">
//                   <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden">
//                     <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg">−</button>
//                     <span className="px-5 py-2.5 font-semibold text-gray-800 min-w-[3rem] text-center">{qty}</span>
//                     <button onClick={() => setQty(Math.min(product.stock, qty + 1))} className="px-4 py-2.5 text-gray-600 hover:bg-gray-50 font-bold text-lg">+</button>
//                   </div>
//                   <span className="text-sm text-gray-400">Max: {product.stock}</span>
//                 </div>
//                 <div className="flex gap-3 mt-4">
//                   <button
//                     onClick={handleAddToCartLocal}
//                     className={`flex-1 py-4 rounded-2xl font-bold text-base shadow-lg transition ${addedToCart ? "bg-green-500 text-white" : "bg-[#0E3F7A] text-white hover:bg-[#1975B1]"}`}
//                   >
//                     {addedToCart ? "✓ Added!" : `Add to Cart — ₹${(product.price * qty).toLocaleString()}`}
//                   </button>
//                   <button
//                     onClick={() => onBuyNow(product, qty)}
//                     className="flex-1 bg-[#E4BF1A] text-[#151B20] py-4 rounded-2xl font-bold text-base shadow-lg hover:bg-[#d4af10] transition"
//                   >
//                     Buy Now
//                   </button>
//                 </div>
//               </>
//             )}

//             <div className="mt-5 grid grid-cols-3 gap-2">
//               {[["🚚", "Free Delivery", "Above ₹499"], ["↩️", "Easy Returns", "7 day policy"], ["🔒", "Secure Pay", "UPI & COD"]].map(([icon, title, sub]) => (
//                 <div key={title} className="bg-[#E3ECF3] rounded-xl p-2.5 text-center">
//                   <div className="text-lg mb-0.5">{icon}</div>
//                   <p className="text-xs font-semibold text-[#151B20]">{title}</p>
//                   <p className="text-xs text-gray-500">{sub}</p>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Product Reviews */}
//         <div className="mt-6 bg-white rounded-3xl shadow-lg p-6">
//           <div className="flex items-center justify-between mb-4">
//             <h2 className="text-xl font-bold text-[#151B20]">Customer Reviews</h2>
//             <span className="text-sm text-gray-400">{productFeedbacks.length} review{productFeedbacks.length !== 1 ? "s" : ""}</span>
//           </div>
//           {productFeedbacks.length === 0 ? (
//             <p className="text-gray-400 text-sm text-center py-8">No reviews for this product yet.</p>
//           ) : (
//             <div className="space-y-4">
//               {productFeedbacks.map((fb) => (
//                 <div key={fb.id} className="flex gap-4 pb-4 border-b border-gray-50 last:border-0">
//                   <div className="w-10 h-10 rounded-full bg-[#E3ECF3] flex items-center justify-center text-[#0E3F7A] font-bold flex-shrink-0">
//                     {fb.userName?.charAt(0)?.toUpperCase()}
//                   </div>
//                   <div className="flex-1">
//                     <div className="flex items-center gap-2 mb-1">
//                       <span className="font-semibold text-sm text-gray-800">{fb.userName}</span>
//                       <Stars rating={fb.rating} size={3} />
//                     </div>
//                     <p className="text-sm text-gray-600 leading-relaxed">{fb.comment}</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// // ---------- Product Card ----------
// const ProductCard = ({ product, onView, onAddToCart, view }) => {
//   const isGrid = view === "grid";
//   return isGrid ? (
//     <div onClick={() => onView(product)} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer group hover:-translate-y-0.5 border border-gray-100">
//       <div className="relative bg-[#EFF4F8] aspect-square overflow-hidden">
//         <img
//           src={product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : "https://placehold.co/400x400?text=Product"}
//           alt={product.name}
//           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
//           onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
//         />
//         {product.stock <= 5 && product.stock > 0 && (
//           <span className="absolute top-2 left-2 bg-[#E4BF1A] text-[#151B20] text-xs px-2 py-0.5 rounded-full font-semibold">Only {product.stock} left</span>
//         )}
//         {product.stock === 0 && (
//           <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
//             <span className="bg-gray-800 text-white text-xs px-3 py-1 rounded-full font-semibold">Out of Stock</span>
//           </div>
//         )}
//       </div>
//       <div className="p-3">
//         <span className="text-xs text-[#0E3F7A] font-semibold bg-[#E3ECF3] px-2 py-0.5 rounded-full">{product.category}</span>
//         <h3 className="font-semibold text-gray-800 text-sm mt-1.5 line-clamp-2 leading-snug">{product.name}</h3>
//         <div className="flex items-center gap-1 mt-1">
//           <Stars rating={product.rating || 4.5} size={3} />
//           <span className="text-xs text-gray-400">({product.rating || 4.5})</span>
//         </div>
//         <div className="flex items-center justify-between mt-2">
//           <span className="text-lg font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
//           <button
//             onClick={(e) => { e.stopPropagation(); onAddToCart(product, 1); }}
//             disabled={product.stock === 0}
//             className="bg-[#0E3F7A] hover:bg-[#1975B1] text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
//           >
//             Add
//           </button>
//         </div>
//       </div>
//     </div>
//   ) : (
//     <div onClick={() => onView(product)} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden cursor-pointer group flex gap-4 p-4 border border-gray-100">
//       <div className="w-24 h-24 bg-[#EFF4F8] rounded-xl flex-shrink-0 overflow-hidden">
//         <img
//           src={product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : "https://placehold.co/400x400?text=Product"}
//           alt={product.name}
//           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
//           onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
//         />
//       </div>
//       <div className="flex-1 min-w-0">
//         <span className="text-xs text-[#0E3F7A] font-semibold">{product.category}</span>
//         <h3 className="font-semibold text-gray-800 mt-0.5 line-clamp-1">{product.name}</h3>
//         <Stars rating={product.rating || 4.5} size={3} />
//         <p className="text-xs text-gray-400 mt-1 line-clamp-1">{product.description}</p>
//       </div>
//       <div className="flex flex-col items-end justify-between flex-shrink-0">
//         <span className="text-xl font-extrabold text-[#0E3F7A]">₹{product.price.toLocaleString()}</span>
//         <button
//           onClick={(e) => { e.stopPropagation(); onAddToCart(product, 1); }}
//           disabled={product.stock === 0}
//           className="bg-[#0E3F7A] text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 transition hover:bg-[#1975B1]"
//         >
//           Add to Cart
//         </button>
//       </div>
//     </div>
//   );
// };

// // ---------- Cart Sidebar ----------
// const CartSidebar = ({ cart, user, onClose, onRemove, onUpdateQty, onCheckout }) => {
//   const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
//   return (
//     <div className="fixed inset-0 z-[100]">
//       <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
//       <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white flex flex-col shadow-2xl animate-slideIn">
//         <div className="flex items-center justify-between px-5 py-4 border-b">
//           <div>
//             <h2 className="text-lg font-bold text-gray-800">Your Cart</h2>
//             <p className="text-xs text-gray-400">{cart.reduce((s, i) => s + i.quantity, 0)} items</p>
//           </div>
//           <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icon.Close /></button>
//         </div>
//         <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
//           {cart.length === 0 ? (
//             <div className="text-center py-16">
//               <div className="text-gray-200 flex justify-center mb-3"><Icon.Package /></div>
//               <p className="text-gray-400 font-medium">Your cart is empty</p>
//               <p className="text-gray-300 text-sm mt-1">Add some products to get started</p>
//             </div>
//           ) : cart.map((item) => (
//             <div key={item.productId} className="flex gap-3 bg-[#E3ECF3] rounded-2xl p-3">
//               <div className="w-16 h-16 bg-white rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
//                 <img
//                   src={item.imageBase64 ? `data:image/jpeg;base64,${item.imageBase64}` : "https://placehold.co/400x400?text=Product"}
//                   className="w-full h-full object-cover" alt={item.name}
//                   onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
//                 />
//               </div>
//               <div className="flex-1 min-w-0">
//                 <h4 className="font-semibold text-sm text-gray-800 line-clamp-1">{item.name}</h4>
//                 <p className="text-[#0E3F7A] font-bold text-sm mt-0.5">₹{item.price.toLocaleString()}</p>
//                 <div className="flex items-center gap-2 mt-1.5">
//                   <button onClick={() => onUpdateQty(item.productId, item.quantity - 1)} className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-gray-600 font-bold hover:bg-[#E3ECF3]">−</button>
//                   <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
//                   <button onClick={() => onUpdateQty(item.productId, item.quantity + 1)} className="w-6 h-6 bg-white rounded-lg shadow-sm flex items-center justify-center text-gray-600 font-bold hover:bg-[#E3ECF3]">+</button>
//                   <button onClick={() => onRemove(item.productId)} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>
//                 </div>
//               </div>
//               <div className="font-bold text-sm text-gray-800 flex-shrink-0">₹{(item.price * item.quantity).toLocaleString()}</div>
//             </div>
//           ))}
//         </div>
//         {cart.length > 0 && (
//           <div className="border-t px-5 py-4">
//             <div className="flex justify-between items-center mb-4">
//               <span className="text-gray-500 font-medium">Total Amount</span>
//               <span className="text-2xl font-extrabold text-[#0E3F7A]">₹{total.toLocaleString()}</span>
//             </div>
//             <button onClick={onCheckout} className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-4 rounded-2xl font-bold shadow-lg hover:shadow-xl transition">
//               Proceed to Checkout
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// // ---------- Checkout Modal ----------
// const CheckoutModal = ({ cart, user, onClose, onOrderPlaced }) => {
//   const [step, setStep] = useState(1);
//   const [deliveryAddress, setDeliveryAddress] = useState({ street: "", city: "", state: "", pincode: "", phone: "" });
//   const [mapLocation, setMapLocation] = useState(null);
//   const [showMap, setShowMap] = useState(false);
//   const [paymentMethod, setPaymentMethod] = useState("cod");
//   const [isPlacing, setIsPlacing] = useState(false);
//   const [showQR, setShowQR] = useState(false);
//   const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

//   const handlePlaceOrder = async (txnId = null) => {
//     if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) {
//       alert("Please fill in complete address"); return;
//     }
//     setIsPlacing(true);
//     try {
//       const items = cart.map((item) => ({
//         productId: item.productId, productName: item.name,
//         quantity: item.quantity, price: item.price, total: item.price * item.quantity,
//       }));
//       const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
//       const orderData = {
//         userId: user.uid, userEmail: user.email, userName: user.displayName,
//         orderId, items, totalAmount: total,
//         status: paymentMethod === "qr" && txnId ? "payment_verification" : "pending",
//         paymentMethod,
//         paymentStatus: paymentMethod === "cod" ? "pending" : "verification_pending",
//         transactionId: txnId || null,
//         deliveryAddress: {
//           ...deliveryAddress,
//           mapLocation: mapLocation ? {
//             address: mapLocation.address,
//             latitude: mapLocation.lat,
//             longitude: mapLocation.lng,
//           } : null,
//         },
//         orderDate: Timestamp.now(), createdAt: Timestamp.now(),
//       };
//       await addDoc(collection(db, "orders"), orderData);
//       const batch = writeBatch(db);
//       for (const item of cart) {
//         const ref = doc(db, "products", item.productId);
//         const snap = await getDoc(ref);
//         if (snap.exists()) batch.update(ref, { stock: (snap.data().stock || 0) - item.quantity });
//       }
//       await batch.commit();
//       onOrderPlaced();
//     } catch (err) {
//       console.error(err);
//       alert("Failed to place order. Try again.");
//     }
//     setIsPlacing(false);
//   };

//   return (
//     <>
//       {showMap && (
//         <MapPickerModal
//           onSelect={(loc) => { setMapLocation(loc); setDeliveryAddress((a) => ({ ...a, street: loc.address })); setShowMap(false); }}
//           onClose={() => setShowMap(false)}
//         />
//       )}
//       {showQR && (
//         <QRPaymentModal
//           amount={total}
//           onSuccess={async (txnId) => { setShowQR(false); await handlePlaceOrder(txnId); }}
//           onClose={() => setShowQR(false)}
//         />
//       )}
//       <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
//         <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
//           <div className="flex items-center justify-between px-6 py-4 border-b">
//             <div>
//               <h2 className="font-bold text-gray-800">Checkout</h2>
//               <p className="text-xs text-gray-400">Step {step} of 2</p>
//             </div>
//             <div className="flex items-center gap-2">
//               <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"}`}>1</div>
//               <div className={`w-6 h-0.5 ${step >= 2 ? "bg-[#E4BF1A]" : "bg-gray-200"}`} />
//               <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"}`}>2</div>
//             </div>
//             <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon.Close /></button>
//           </div>
//           <div className="p-6">
//             {step === 1 && (
//               <div className="space-y-3">
//                 <h3 className="font-semibold text-gray-700 mb-3">Delivery Address</h3>
//                 <button onClick={() => setShowMap(true)} className="w-full flex items-center gap-2 border-2 border-dashed border-[#1975B1] rounded-xl px-4 py-3 text-[#0E3F7A] hover:bg-[#E3ECF3] transition text-sm font-medium">
//                   <Icon.Location />{mapLocation ? "Location set — tap to change" : "Pin location on Map"}
//                 </button>
//                 {mapLocation && (
//                   <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
//                     <Icon.Check /><span className="line-clamp-2">{mapLocation.address}</span>
//                   </p>
//                 )}
//                 <input type="text" placeholder="Street / House No *" value={deliveryAddress.street} onChange={(e) => setDeliveryAddress((a) => ({ ...a, street: e.target.value }))} className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
//                 <div className="grid grid-cols-2 gap-2">
//                   <input type="text" placeholder="City *" value={deliveryAddress.city} onChange={(e) => setDeliveryAddress((a) => ({ ...a, city: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
//                   <input type="text" placeholder="State" value={deliveryAddress.state} onChange={(e) => setDeliveryAddress((a) => ({ ...a, state: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
//                 </div>
//                 <div className="grid grid-cols-2 gap-2">
//                   <input type="text" placeholder="Pincode *" value={deliveryAddress.pincode} onChange={(e) => setDeliveryAddress((a) => ({ ...a, pincode: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
//                   <input type="text" placeholder="Phone" value={deliveryAddress.phone} onChange={(e) => setDeliveryAddress((a) => ({ ...a, phone: e.target.value }))} className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
//                 </div>
//                 <button onClick={() => { if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) { alert("Fill required fields"); return; } setStep(2); }} className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold mt-2 hover:bg-[#1975B1] transition">
//                   Continue to Payment
//                 </button>
//               </div>
//             )}
//             {step === 2 && (
//               <div className="space-y-4">
//                 <h3 className="font-semibold text-gray-700">Payment Method</h3>
//                 <div className="space-y-3">
//                   {[
//                     { id: "cod", label: "Cash on Delivery", sub: "Pay when your order arrives", Icon: Icon.COD },
//                     { id: "qr", label: "UPI / QR Code", sub: "Pay now via any UPI app", Icon: Icon.QR },
//                   ].map((opt) => (
//                     <button key={opt.id} onClick={() => setPaymentMethod(opt.id)} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition ${paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#E3ECF3]" : "border-gray-200 hover:border-gray-300"}`}>
//                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paymentMethod === opt.id ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"}`}><opt.Icon /></div>
//                       <div className="text-left flex-1">
//                         <p className="font-semibold text-sm text-gray-800">{opt.label}</p>
//                         <p className="text-xs text-gray-400">{opt.sub}</p>
//                       </div>
//                       <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#0E3F7A]" : "border-gray-300"}`}>
//                         {paymentMethod === opt.id && <div className="w-2 h-2 bg-white rounded-full" />}
//                       </div>
//                     </button>
//                   ))}
//                 </div>
//                 <div className="bg-[#E3ECF3] rounded-2xl p-4">
//                   <p className="text-sm font-semibold text-gray-700 mb-2">Order Summary</p>
//                   {cart.map((i) => (
//                     <div key={i.productId} className="flex justify-between text-xs text-gray-500 py-1">
//                       <span className="truncate flex-1">{i.name} × {i.quantity}</span>
//                       <span className="font-medium text-gray-700 ml-2">₹{(i.price * i.quantity).toLocaleString()}</span>
//                     </div>
//                   ))}
//                   <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-bold">
//                     <span>Total</span><span className="text-[#0E3F7A]">₹{total.toLocaleString()}</span>
//                   </div>
//                 </div>
//                 <div className="flex gap-2">
//                   <button onClick={() => setStep(1)} className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl font-semibold">Back</button>
//                   <button
//                     onClick={() => paymentMethod === "qr" ? setShowQR(true) : handlePlaceOrder()}
//                     disabled={isPlacing}
//                     className="flex-1 bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 hover:shadow-xl transition"
//                   >
//                     {isPlacing ? "Placing..." : paymentMethod === "cod" ? "Place Order" : "Pay Now"}
//                   </button>
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>
//     </>
//   );
// };

// // ---------- Main Page ----------
// export default function HomePage() {
//   const [user, setUser] = useState(null);
//   const [appReady, setAppReady] = useState(false);
//   const [products, setProducts] = useState([]);
//   const [adSlides, setAdSlides] = useState([]);
//   const [categories, setCategories] = useState(["all"]);
//   const [selectedCategory, setSelectedCategory] = useState("all");
//   const [searchTerm, setSearchTerm] = useState("");
//   const [cart, setCart] = useState([]);
//   const [cartCount, setCartCount] = useState(0);
//   const [showCart, setShowCart] = useState(false);
//   const [showCheckout, setShowCheckout] = useState(false);
//   const [showLoginPopup, setShowLoginPopup] = useState(false);
//   const [activeTab, setActiveTab] = useState("shop");
//   const [orders, setOrders] = useState([]);
//   const [feedbacks, setFeedbacks] = useState([]);
//   const [newFeedback, setNewFeedback] = useState({ rating: 5, comment: "", productId: "" });
//   const [viewMode, setViewMode] = useState("grid");
//   const [currentSlide, setCurrentSlide] = useState(0);
//   const [selectedProduct, setSelectedProduct] = useState(null);
//   const [orderSuccess, setOrderSuccess] = useState(false);
//   const [toast, setToast] = useState(null);
//   const [showUserMenu, setShowUserMenu] = useState(false);

//   const heroSlides = [
//     { bg: "from-[#0E3F7A] to-[#1975B1]", title: "Shop Smarter", sub: "Premium products at honest prices", emoji: "🛒" },
//     { bg: "from-[#1975B1] to-[#0E3F7A]", title: "New Arrivals", sub: "Fresh picks every week", emoji: "✨" },
//     { bg: "from-[#E4BF1A] to-[#d4af10]", title: "Fast Delivery", sub: "Right to your doorstep", emoji: "🚀" },
//   ];

//   const showToast = (msg, type = "success") => {
//     setToast({ msg, type });
//     setTimeout(() => setToast(null), 3000);
//   };

//   const refreshCart = useCallback(() => {
//     const c = getCart();
//     setCart(c);
//     setCartCount(c.reduce((s, i) => s + i.quantity, 0));
//   }, []);

//   useEffect(() => {
//     if (typeof window === "undefined") return;
//     const params = new URLSearchParams(window.location.search);
//     const pid = params.get("product");
//     if (pid && products.length > 0) {
//       const p = products.find((pr) => pr.id === pid);
//       if (p) setSelectedProduct(p);
//     }
//   }, [products]);

//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (firebaseUser) {
//         await ensureUserInFirestore(firebaseUser);
//         setUser(firebaseUser);
//         loadUserOrders(firebaseUser.uid);
//         if (firebaseUser.email) setUserEmailFromOneTap(firebaseUser.email);
//       }
//       setAppReady(true);
//     });
//     loadProducts();
//     loadFeedbacks();
//     loadAdSlides();
//     refreshCart();
//     window.addEventListener("cartUpdated", refreshCart);
//     const interval = setInterval(() => setCurrentSlide((s) => (s + 1) % heroSlides.length), 5000);

//     const loadOneTap = () => {
//       if (typeof window !== "undefined" && window.google?.accounts?.id) {
//         window.google.accounts.id.initialize({
//           client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
//           callback: async (response) => {
//             try {
//               const cred = GoogleAuthProvider.credential(response.credential);
//               const result = await signInWithCredential(auth, cred);
//               await ensureUserInFirestore(result.user);
//               setUser(result.user);
//               if (result.user.email) setUserEmailFromOneTap(result.user.email);
//               setShowLoginPopup(false);
//             } catch (e) { console.error(e); }
//           },
//         });
//         window.google.accounts.id.prompt();
//       }
//     };
//     if (window.google?.accounts?.id) loadOneTap();
//     else {
//       const s = document.createElement("script");
//       s.src = "https://accounts.google.com/gsi/client";
//       s.async = true;
//       s.onload = loadOneTap;
//       document.head.appendChild(s);
//     }
//     return () => { unsub(); window.removeEventListener("cartUpdated", refreshCart); clearInterval(interval); };
//   }, []);

//   const loadAdSlides = async () => {
//     try {
//       const snap = await getDocs(query(collection(db, "adSlides"), orderBy("order", "asc")));
//       if (!snap.empty) {
//         setAdSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
//       }
//     } catch (e) {
//       // No ad slides collection yet — that's fine
//     }
//   };

//   const loadProducts = async () => {
//     try {
//       const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
//       const snap = await getDocs(q);
//       let list = snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) }));
//       if (list.length === 0) {
//         const samples = [
//           { name: "Tide Plus Detergent Powder", price: 399, stock: 50, category: "Detergent", description: "Premium detergent for tough stains.", imageUrl: "", rating: 4.5 },
//           { name: "Surf Excel Easy Wash", price: 449, stock: 40, category: "Detergent", description: "Quick stain removal formula.", imageUrl: "", rating: 4.3 },
//           { name: "Comfort Fabric Softener", price: 299, stock: 60, category: "Softener", description: "Long-lasting freshness.", imageUrl: "", rating: 4.2 },
//           { name: "Harpic Power Cleaner", price: 249, stock: 45, category: "Cleaner", description: "Kills 99.9% germs.", imageUrl: "", rating: 4.4 },
//           { name: "Lizol Floor Cleaner", price: 299, stock: 35, category: "Cleaner", description: "Kills 99.9% germs on floor surfaces.", imageUrl: "", rating: 4.5 },
//           { name: "Vim Dishwash Gel", price: 149, stock: 80, category: "Dishwash", description: "Removes grease effectively.", imageUrl: "", rating: 4.1 },
//           { name: "Dettol Hand Wash", price: 199, stock: 70, category: "Personal Care", description: "Gentle antibacterial hand wash.", imageUrl: "", rating: 4.6 },
//           { name: "Colin Glass Cleaner", price: 179, stock: 55, category: "Cleaner", description: "Crystal clear shine.", imageUrl: "", rating: 4.0 },
//         ];
//         for (const p of samples) await addDoc(collection(db, "products"), { ...p, createdAt: Timestamp.now() });
//         const snap2 = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
//         list = snap2.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) }));
//       }
//       setProducts(list);
//       setCategories(["all", ...new Set(list.map((p) => p.category).filter(Boolean))]);
//     } catch (err) {
//       console.error(err);
//       setProducts([]);
//     }
//   };

//   const loadFeedbacks = async () => {
//     try {
//       const snap = await getDocs(query(collection(db, "feedbacks"), orderBy("createdAt", "desc")));
//       setFeedbacks(snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) })));
//     } catch (e) { console.error(e); }
//   };

//   const loadUserOrders = async (uid) => {
//     try {
//       const snap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid), orderBy("orderDate", "desc")));
//       setOrders(snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) })));
//     } catch (e) { console.error(e); }
//   };

//   const handleGoogleSignIn = async () => {
//     try {
//       const result = await signInWithPopup(auth, googleProvider);
//       await ensureUserInFirestore(result.user);
//       setUser(result.user);
//       if (result.user.email) setUserEmailFromOneTap(result.user.email);
//       setShowLoginPopup(false);
//       loadUserOrders(result.user.uid);
//     } catch (e) {
//       console.error(e);
//       alert("Sign in failed. Try again.");
//     }
//   };

//   const handleLogout = async () => {
//     await signOut(auth);
//     setUser(null);
//     setOrders([]);
//     saveCart([]);
//     refreshCart();
//     setShowUserMenu(false);
//     showToast("Signed out successfully", "info");
//   };

//   const handleAddToCart = (product, qty = 1) => {
//     if (!user) { setShowLoginPopup(true); return; }
//     const c = getCart();
//     const existing = c.find((i) => i.productId === product.id);
//     if (existing) existing.quantity += qty;
//     else c.push({ productId: product.id, name: product.name, price: product.price, imageBase64: product.imageBase64, quantity: qty, stock: product.stock });
//     saveCart(c);
//     showToast(`${product.name} added to cart!`);
//   };

//   const handleBuyNow = (product, qty = 1) => {
//     if (!user) { setShowLoginPopup(true); return; }
//     saveCart([{ productId: product.id, name: product.name, price: product.price, imageBase64: product.imageBase64, quantity: qty, stock: product.stock }]);
//     refreshCart();
//     // Open checkout immediately without closing any product page
//     setShowCheckout(true);
//     showToast("Proceeding to checkout!");
//   };

//   const handleRemoveFromCart = (pid) => { saveCart(getCart().filter((i) => i.productId !== pid)); };

//   const handleUpdateQty = (pid, qty) => {
//     const c = getCart();
//     const idx = c.findIndex((i) => i.productId === pid);
//     if (idx >= 0) { if (qty <= 0) c.splice(idx, 1); else c[idx].quantity = qty; }
//     saveCart(c);
//   };

//   const handleOrderPlaced = async () => {
//     saveCart([]);
//     refreshCart();
//     setShowCheckout(false);
//     setShowCart(false);
//     setOrderSuccess(true);
//     setTimeout(() => setOrderSuccess(false), 5000);
//     if (user) loadUserOrders(user.uid);
//     showToast("🎉 Order placed successfully!");
//   };

//   const handleSubmitFeedback = async () => {
//     if (!user) { setShowLoginPopup(true); return; }
//     if (!newFeedback.comment.trim()) { alert("Please write your feedback"); return; }
//     if (!newFeedback.productId) { alert("Please select a product to review"); return; }
//     try {
//       await addDoc(collection(db, "feedbacks"), {
//         userId: user.uid, userName: user.displayName, userEmail: user.email,
//         rating: newFeedback.rating, comment: newFeedback.comment,
//         productId: newFeedback.productId,
//         createdAt: Timestamp.now(),
//       });
//       setNewFeedback({ rating: 5, comment: "", productId: "" });
//       await loadFeedbacks();
//       showToast("Thanks for your review!");
//     } catch (e) { console.error(e); }
//   };

//   const filtered = products.filter((p) => {
//     const matchCat = selectedCategory === "all" || p.category === selectedCategory;
//     const s = searchTerm.toLowerCase();
//     const matchSearch = !s || p.name?.toLowerCase().includes(s) || p.category?.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s);
//     return matchCat && matchSearch;
//   });

//   const statusColors = {
//     pending: "bg-amber-100 text-amber-700",
//     confirmed: "bg-blue-100 text-blue-700",
//     delivered: "bg-green-100 text-green-700",
//     payment_verification: "bg-violet-100 text-violet-700",
//     cancelled: "bg-red-100 text-red-700",
//   };

//   if (selectedProduct)
//     return (
//       <>
//         <style jsx global>{`
//           @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
//           * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
//           @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
//           @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
//           @keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
//           .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
//           .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.4,0,0.2,1); }
//           .animate-toastIn { animation: toastIn 0.3s ease-out; }
//           .line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
//           .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
//           ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
//           .category-scroll::-webkit-scrollbar { display: none; }
//         `}</style>
//         {toast && (
//           <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] animate-toastIn px-5 py-3 rounded-full shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type === "info" ? "bg-gray-700" : "bg-gradient-to-r from-[#0E3F7A] to-[#1975B1]"}`}>
//             {toast.type !== "info" && <Icon.Check />} {toast.msg}
//           </div>
//         )}
//         <ProductDetailPage
//           product={selectedProduct}
//           user={user}
//           feedbacks={feedbacks}
//           onBack={() => { setSelectedProduct(null); window.history.pushState({}, "", window.location.pathname); }}
//           onAddToCart={handleAddToCart}
//           onBuyNow={handleBuyNow}
//           onSignIn={() => setShowLoginPopup(true)}
//         />
//         {showCheckout && user && (
//           <CheckoutModal cart={cart} user={user} onClose={() => setShowCheckout(false)} onOrderPlaced={handleOrderPlaced} />
//         )}
//         {showLoginPopup && (
//           // <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowLoginPopup(false)}>
//           //   <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
//           //     <div className="text-center">
//           //       <div className="w-16 h-16 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
//           //         <span className="text-3xl text-white font-black">W</span>
//           //       </div>
//           //       <h2 className="text-2xl font-extrabold text-gray-900">Welcome to Ween</h2>
//           //       <p className="text-gray-500 mt-1 text-sm">Sign in to shop & track orders</p>
//           //       <button onClick={handleGoogleSignIn} className="mt-6 w-full flex items-center justify-center gap-3 border-2 border-gray-200 py-3.5 rounded-2xl hover:bg-gray-50 font-semibold text-gray-700 transition">
//           //         <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
//           //         Continue with Google
//           //       </button>
//           //     </div>
//           //   </div>
//           // </div>
//           <div
//   className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
//   onClick={() => setShowLoginPopup(false)}
// >
//   <div
//     className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fadeIn"
//     onClick={(e) => e.stopPropagation()}
//   >
//     <div className="text-center">
      
//       {/* Logo */}
//       <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-lg flex items-center justify-center mx-auto mb-5 bg-white border border-gray-100">
//         <img
//           src="/logo.png"
//           alt="Ween Logo"
//           className="w-full h-full object-contain scale-110"
//         />
//       </div>

//       {/* Heading */}
//       <h2 className="text-2xl font-extrabold text-[#E11D2E]">
//         Welcome to Ween
//       </h2>

//       <p className="text-gray-500 mt-2 text-sm">
//         Sign in to shop & track orders
//       </p>

//       {/* Google Sign In */}
//       <button
//         onClick={handleGoogleSignIn}
//         className="mt-6 w-full flex items-center justify-center gap-3 border-2 border-gray-200 py-3.5 rounded-2xl hover:bg-gray-50 font-semibold text-gray-700 transition duration-200 hover:shadow-md"
//       >
//         <svg className="w-5 h-5" viewBox="0 0 24 24">
//           <path
//             fill="#4285F4"
//             d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
//           />
//           <path
//             fill="#34A853"
//             d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
//           />
//           <path
//             fill="#FBBC05"
//             d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
//           />
//           <path
//             fill="#EA4335"
//             d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
//           />
//         </svg>

//         Continue with Google
//       </button>
//     </div>
//   </div>
// </div>
//         )}
//       </>
//     );

//   return (
//     <>
//       <style jsx global>{`
//         @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
//         * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
//         @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
//         @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
//         @keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
//         .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
//         .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.4,0,0.2,1); }
//         .animate-toastIn { animation: toastIn 0.3s ease-out; }
//         .line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
//         .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
//         ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
//         .category-scroll::-webkit-scrollbar { display: none; }
//       `}</style>

//       {toast && (
//         <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] animate-toastIn px-5 py-3 rounded-full shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type === "info" ? "bg-gray-700" : "bg-gradient-to-r from-[#0E3F7A] to-[#1975B1]"}`}>
//           {toast.type !== "info" && <Icon.Check />} {toast.msg}
//         </div>
//       )}

//       {orderSuccess && (
//         <div className="fixed inset-x-0 top-0 z-[250] bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
//           <span className="text-xl">🎉</span>
//           <span className="font-semibold">Order placed! We'll deliver it soon.</span>
//         </div>
//       )}

//       {/* ---- HEADER ---- */}
//       <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4">
//           <div className="flex items-center gap-3 py-3">
//             {/* Logo */}
//             {/* <div className="flex items-center gap-2.5 flex-shrink-0">
//               <div className="w-9 h-9 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-xl flex items-center justify-center shadow-md">
//                 <span className="text-white font-black text-base">W</span>
//               </div>
//               <div className="hidden sm:block">
//                 <p className="font-black text-gray-900 text-lg leading-none">Ween</p>
//                 <p className="text-gray-400 text-xs leading-none">Sam Riddhi Group</p>
//               </div>
//             </div> */}
//             <div className="flex items-center gap-3 flex-shrink-0">
//   {/* Logo */}
//   <div className="w-12 h-12 rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-white">
//     <img
//       src="/logo.png"
//       alt="Ween Logo"
//       className="w-full h-full object-contain scale-110"
//     />
//   </div>

//   {/* Text */}
//   <div className="hidden sm:block">
//     <p className="font-black text-[#E11D2E] text-xl leading-none tracking-wide">
//      विन
//     </p>
//     <p className="text-gray-400 text-xs leading-none mt-1">
//       Samruddhi Group of Industries
//     </p>
//   </div>
// </div>

//             {/* Search */}
//             <div className="flex-1 relative">
//               <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400"><Icon.Search /></div>
//               <input
//                 type="text"
//                 placeholder="Search products..."
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//                 className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl border-2 border-transparent focus:border-[#1975B1] focus:bg-white outline-none text-sm transition"
//               />
//             </div>

//             {/* User area */}
//             <div className="flex items-center gap-2 flex-shrink-0">
//               {user ? (
//                 <div className="relative">
//                   <button
//                     onClick={() => setShowUserMenu((v) => !v)}
//                     className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-xl px-2 py-1.5 transition"
//                   >
//                     <img src={user.photoURL} className="w-7 h-7 rounded-full" alt="" />
//                     <span className="text-sm font-medium hidden md:block max-w-[80px] truncate">{user.displayName?.split(" ")[0]}</span>
//                     <svg className="w-3 h-3 text-gray-400 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
//                   </button>
//                   {showUserMenu && (
//                     <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 min-w-[160px] z-50">
//                       <div className="px-4 py-2 border-b border-gray-50">
//                         <p className="text-sm font-semibold text-gray-800 truncate">{user.displayName}</p>
//                         <p className="text-xs text-gray-400 truncate">{user.email}</p>
//                       </div>
//                       <button onClick={() => { setActiveTab("orders"); setShowUserMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
//                         📦 My Orders
//                       </button>
//                       <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2">
//                         <Icon.Logout /> Sign Out
//                       </button>
//                     </div>
//                   )}
//                 </div>
//               ) : (
//                 <button onClick={() => setShowLoginPopup(true)} className="flex items-center gap-2 bg-[#0E3F7A] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1975B1] transition">
//                   Sign In
//                 </button>
//               )}
//               <button
//                 onClick={() => user ? setShowCart(true) : setShowLoginPopup(true)}
//                 className="relative bg-gray-50 hover:bg-gray-100 p-2.5 rounded-xl transition"
//               >
//                 <Icon.Cart />
//                 {cartCount > 0 && (
//                   <span className="absolute -top-1 -right-1 bg-[#0E3F7A] text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
//                     {cartCount > 99 ? "99+" : cartCount}
//                   </span>
//                 )}
//               </button>
//             </div>
//           </div>

//           {/* Category bar */}
//           <div className="flex gap-1 pb-2 overflow-x-auto category-scroll">
//             {categories.map((cat) => (
//               <button key={cat} onClick={() => setSelectedCategory(cat)} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${selectedCategory === cat ? "bg-[#0E3F7A] text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}>
//                 {cat === "all" ? "All Products" : cat}
//               </button>
//             ))}
//           </div>
//         </div>
//       </header>

//       <main className="max-w-7xl mx-auto px-4 pb-12">
//         {/* Tabs */}
//         <div className="flex gap-0 border-b border-gray-100 mt-4 mb-6">
//           {[["shop", "🛍️ Shop"], ["orders", "📦 My Orders"], ["reviews", "💬 Reviews"]].map(([tab, label]) => (
//             <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${activeTab === tab ? "border-[#0E3F7A] text-[#0E3F7A]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
//               {label}
//             </button>
//           ))}
//         </div>

//         {/* ---- SHOP TAB ---- */}
//         {activeTab === "shop" && (
//           <div className="animate-fadeIn">
//             {/* Hero Carousel — only when no search/filter */}
//             {!searchTerm && selectedCategory === "all" && (
//               <div className="relative rounded-3xl overflow-hidden mb-6 h-52 md:h-72">
//                 {heroSlides.map((slide, idx) => (
//                   <div key={idx} className={`absolute inset-0 bg-gradient-to-br ${slide.bg} flex items-center transition-opacity duration-700 ${currentSlide === idx ? "opacity-100" : "opacity-0"}`}>
//                     <div className="px-10 text-white">
//                       <p className="text-5xl mb-4">{slide.emoji}</p>
//                       <h2 className="text-3xl md:text-5xl font-black leading-none mb-2">{slide.title}</h2>
//                       <p className="text-white/70 text-base md:text-lg">{slide.sub}</p>
//                     </div>
//                   </div>
//                 ))}
//                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
//                   {heroSlides.map((_, i) => (
//                     <button key={i} onClick={() => setCurrentSlide(i)} className={`h-1.5 rounded-full transition-all ${currentSlide === i ? "bg-white w-6" : "bg-white/40 w-1.5"}`} />
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Ad Banner Slider — shown when adSlides exist */}
//             {adSlides.length > 0 && !searchTerm && (
//               <div className="mb-6">
//                 <AdBannerSlider slides={adSlides} />
//               </div>
//             )}

//             {/* Desktop two-column layout */}
//             <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-6">
//               {/* Left sidebar: filters (desktop only) */}
//               <aside className="hidden lg:block">
//                 <div className="bg-white rounded-2xl shadow-sm p-5 sticky top-28">
//                   <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide">Categories</h3>
//                   <div className="space-y-1">
//                     {categories.map((cat) => (
//                       <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-between ${selectedCategory === cat ? "bg-[#E3ECF3] text-[#0E3F7A] font-semibold" : "text-gray-600 hover:bg-gray-50"}`}>
//                         <span>{cat === "all" ? "All Products" : cat}</span>
//                         <span className={`text-xs rounded-full px-1.5 py-0.5 ${selectedCategory === cat ? "bg-[#0E3F7A] text-white" : "bg-gray-100 text-gray-400"}`}>
//                           {cat === "all" ? products.length : products.filter((p) => p.category === cat).length}
//                         </span>
//                       </button>
//                     ))}
//                   </div>

//                   <div className="mt-6 pt-5 border-t border-gray-100">
//                     <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">Quick Info</h3>
//                     {[["🚚", "Free delivery above ₹499"], ["↩️", "7-day easy returns"], ["🔒", "100% secure payments"], ["📍", "All India delivery"]].map(([icon, text]) => (
//                       <div key={text} className="flex items-start gap-2 py-2 text-xs text-gray-500">
//                         <span>{icon}</span><span>{text}</span>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               </aside>

//               {/* Right: products grid/list */}
//               <div>
//                 <div className="flex items-center justify-between mb-4">
//                   <div>
//                     <h2 className="text-xl font-bold text-gray-900">
//                       {selectedCategory === "all" ? "All Products" : selectedCategory}
//                       <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length})</span>
//                     </h2>
//                   </div>
//                   <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1">
//                     <button onClick={() => setViewMode("grid")} className={`p-2 rounded-lg transition ${viewMode === "grid" ? "bg-white shadow-sm text-[#0E3F7A]" : "text-gray-400"}`}><Icon.Grid /></button>
//                     <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg transition ${viewMode === "list" ? "bg-white shadow-sm text-[#0E3F7A]" : "text-gray-400"}`}><Icon.List /></button>
//                   </div>
//                 </div>

//                 {filtered.length === 0 ? (
//                   <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
//                     <p className="text-4xl mb-4">🔍</p>
//                     <p className="font-semibold text-gray-700">No products found</p>
//                     <p className="text-gray-400 text-sm mt-1">Try searching for something else</p>
//                     <button onClick={() => { setSearchTerm(""); setSelectedCategory("all"); }} className="mt-4 text-[#0E3F7A] text-sm font-medium">Clear filters</button>
//                   </div>
//                 ) : viewMode === "grid" ? (
//                   <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
//                     {filtered.map((p) => <ProductCard key={p.id} product={p} onView={setSelectedProduct} onAddToCart={handleAddToCart} view="grid" />)}
//                   </div>
//                 ) : (
//                   <div className="space-y-3">
//                     {filtered.map((p) => <ProductCard key={p.id} product={p} onView={setSelectedProduct} onAddToCart={handleAddToCart} view="list" />)}
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//         )}

//         {/* ---- ORDERS TAB ---- */}
//         {activeTab === "orders" && (
//           <div className="animate-fadeIn">
//             {!user ? (
//               <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
//                 <p className="text-6xl mb-4">🔐</p>
//                 <p className="font-semibold text-gray-700 text-lg">Sign in to view orders</p>
//                 <p className="text-gray-400 text-sm mt-1">Track all your purchases in one place</p>
//                 <button onClick={handleGoogleSignIn} className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition">Sign In with Google</button>
//               </div>
//             ) : orders.length === 0 ? (
//               <div className="text-center py-20 bg-white rounded-3xl shadow-sm">
//                 <p className="text-6xl mb-4">📦</p>
//                 <p className="font-semibold text-gray-700 text-lg">No orders yet</p>
//                 <p className="text-gray-400 text-sm mt-1">Start shopping to see your orders here</p>
//                 <button onClick={() => setActiveTab("shop")} className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition">Shop Now</button>
//               </div>
//             ) : (
//               <div className="space-y-4">
//                 {orders.map((order) => (
//                   <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
//                     <div className="p-4 border-b border-gray-50 flex justify-between items-start">
//                       <div>
//                         <span className="font-mono text-xs bg-gray-100 px-2.5 py-1 rounded-lg text-gray-600">#{order.orderId}</span>
//                         <div className="flex items-center gap-2 mt-1.5 flex-wrap">
//                           <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
//                             {order.status?.replace("_", " ")}
//                           </span>
//                           <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium uppercase">{order.paymentMethod}</span>
//                         </div>
//                       </div>
//                       <div className="text-right">
//                         <p className="text-xl font-extrabold text-gray-900">₹{order.totalAmount?.toLocaleString()}</p>
//                         <p className="text-xs text-gray-400">{order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</p>
//                       </div>
//                     </div>
//                     <div className="p-4 space-y-2">
//                       {order.items?.map((item, idx) => (
//                         <div key={idx} className="flex justify-between text-sm">
//                           <span className="text-gray-600">{item.productName} <span className="text-gray-400">× {item.quantity}</span></span>
//                           <span className="font-semibold text-gray-800">₹{item.total?.toLocaleString()}</span>
//                         </div>
//                       ))}
//                     </div>
//                     {order.deliveryAddress && (
//                       <div className="px-4 pb-4 flex items-start gap-2 text-xs text-gray-400">
//                         <Icon.Location />
//                         <span>{order.deliveryAddress.street}, {order.deliveryAddress.city} {order.deliveryAddress.pincode}</span>
//                       </div>
//                     )}
//                     {order.transactionId && (
//                       <div className="px-4 pb-4 text-xs text-[#0E3F7A] font-medium">UTR: {order.transactionId}</div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         )}

//         {/* ---- REVIEWS TAB ---- */}
//         {activeTab === "reviews" && (
//           <div className="animate-fadeIn space-y-4">
//             <div className="bg-white rounded-2xl shadow-sm p-5">
//               <h3 className="font-bold text-gray-800 mb-1">Review a Product</h3>
//               <p className="text-xs text-gray-400 mb-4">Select a product and share your experience</p>
//               {user ? (
//                 <div>
//                   {/* Product selector */}
//                   <select
//                     value={newFeedback.productId}
//                     onChange={(e) => setNewFeedback((f) => ({ ...f, productId: e.target.value }))}
//                     className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none mb-3 bg-white"
//                   >
//                     <option value="">— Select a product —</option>
//                     {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
//                   </select>
//                   <div className="flex items-center gap-1 mb-3">
//                     {[1, 2, 3, 4, 5].map((r) => (
//                       <button key={r} onClick={() => setNewFeedback((f) => ({ ...f, rating: r }))} className="text-2xl transition">
//                         <span className={r <= newFeedback.rating ? "text-[#E4BF1A]" : "text-gray-200"}>★</span>
//                       </button>
//                     ))}
//                     <span className="ml-2 text-sm text-gray-500">{newFeedback.rating}/5</span>
//                   </div>
//                   <textarea
//                     value={newFeedback.comment}
//                     onChange={(e) => setNewFeedback((f) => ({ ...f, comment: e.target.value }))}
//                     placeholder="How was this product? Share details about quality, delivery, etc."
//                     className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:border-[#1975B1] outline-none"
//                     rows="3"
//                   />
//                   <button onClick={handleSubmitFeedback} className="mt-2 bg-[#0E3F7A] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#1975B1] transition">
//                     Post Review
//                   </button>
//                 </div>
//               ) : (
//                 <button onClick={() => setShowLoginPopup(true)} className="text-[#0E3F7A] font-semibold text-sm hover:underline">Sign in to leave a review →</button>
//               )}
//             </div>

//             {feedbacks.length === 0 ? (
//               <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
//                 <p className="text-4xl mb-2">💬</p>
//                 <p className="text-gray-500">No reviews yet. Be the first!</p>
//               </div>
//             ) : (
//               feedbacks.map((fb) => {
//                 const reviewedProduct = products.find((p) => p.id === fb.productId);
//                 return (
//                   <div key={fb.id} className="bg-white rounded-2xl shadow-sm p-4">
//                     <div className="flex items-center gap-3 mb-2">
//                       <div className="w-9 h-9 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
//                         {fb.userName?.charAt(0)?.toUpperCase()}
//                       </div>
//                       <div>
//                         <p className="font-semibold text-sm text-gray-800">{fb.userName}</p>
//                         <Stars rating={fb.rating} size={3} />
//                       </div>
//                       <span className="ml-auto text-xs text-gray-400">
//                         {fb.createdAt ? new Date(fb.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
//                       </span>
//                     </div>
//                     {reviewedProduct && (
//                       <div className="flex items-center gap-2 mb-2 bg-[#E3ECF3] rounded-lg px-3 py-1.5">
//                         <span className="text-xs text-[#0E3F7A] font-semibold">Product:</span>
//                         <span className="text-xs text-gray-700 truncate">{reviewedProduct.name}</span>
//                       </div>
//                     )}
//                     <p className="text-sm text-gray-600 leading-relaxed">{fb.comment}</p>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         )}
//       </main>

//       {/* ---- FOOTER ---- */}
//       <footer className="bg-[#0D1B2A] text-gray-400 mt-8">
//         {/* Top wave */}
//         <div className="bg-[#F0F4F8] h-6 rounded-b-none" style={{ clipPath: "ellipse(60% 100% at 50% 0%)", background: "linear-gradient(to bottom, #F0F4F8, transparent)" }} />

//         <div className="max-w-7xl mx-auto px-4 pt-10 pb-6">
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
//             {/* Brand
//             <div>
//               <div className="flex items-center gap-2 mb-3">
//                 <div className="w-10 h-10 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-xl flex items-center justify-center shadow-lg">
//                   <span className="text-white font-black text-lg">W</span>
//                 </div>
//                 <div>
//                   <p className="text-white font-black text-xl leading-none">Ween</p>
//                   <p className="text-gray-500 text-xs"> Riddhi GrouSamp</p>
//                 </div>
//               </div>
//               <p className="text-sm text-gray-500 leading-relaxed">Premium quality household products delivered to your doorstep across India.</p>
//               <div className="flex items-center gap-3 mt-4">
//                 <a href="https://instagram.com/samruddhi_group_of_industries" target="_blank" rel="noopener noreferrer" className="w-9 h-9 bg-white/10 hover:bg-[#E4BF1A] hover:text-[#151B20] rounded-xl flex items-center justify-center transition text-gray-400">
//                   <Icon.Instagram />
//                 </a>
//               </div>
//             </div> */}
//             {/* Brand */}
// <div>
//   <div className="flex items-center gap-3 mb-3">
//     {/* Logo */}
//     <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex items-center justify-center bg-white border border-white/10">
//       <img
//         src="/logo.png"
//         alt="Ween Logo"
//         className="w-full h-full object-contain scale-110"
//       />
//     </div>

//     {/* Text */}
//     <div>
//       <p className="text-[#E11D2E] font-black text-2xl leading-none tracking-wide">
//         विन
//       </p>
//       <p className="text-gray-400 text-xs mt-1">
//         Samruddhi Group of Industries
//       </p>
//     </div>
//   </div>

//   <p className="text-sm text-gray-500 leading-relaxed">
//     Premium quality household products delivered to your doorstep across India.
//   </p>

//   <div className="flex items-center gap-3 mt-4">
//     <a
//       href="https://instagram.com/samruddhi_group_of_industries"
//       target="_blank"
//       rel="noopener noreferrer"
//       className="w-9 h-9 bg-white/10 hover:bg-[#E4BF1A] hover:text-[#151B20] rounded-xl flex items-center justify-center transition text-gray-400"
//     >
//       <Icon.Instagram />
//     </a>
//   </div>
// </div>

//             {/* Contact */}
//             <div>
//               <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Contact</h4>
//               <div className="space-y-3 text-sm">
//                 <a href="tel:+919425940136" className="flex items-center gap-2 hover:text-[#E4BF1A] transition">
//                   <Icon.Phone /> +91 94259 40136
//                 </a>
//                 <a href="mailto:samruddhigroupofindustries@gmail.com" className="flex items-start gap-2 hover:text-[#E4BF1A] transition break-all">
//                   <Icon.Mail className="flex-shrink-0 mt-0.5" /> samruddhigroupofindustries@gmail.com
//                 </a>
//                 <div className="flex items-start gap-2">
//                   <Icon.Location /> <span>AB Road, Shajapur, Madhya Pradesh, India</span>
//                 </div>
//               </div>
//             </div>

//             {/* Quick Links */}
//             <div>
//               <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
//               <ul className="space-y-2.5 text-sm">
//                 {[["🛍️ Shop", "shop"], ["📦 My Orders", "orders"], ["💬 Reviews", "reviews"]].map(([label, tab]) => (
//                   <li key={tab}>
//                     <button onClick={() => setActiveTab(tab)} className="hover:text-[#E4BF1A] transition flex items-center gap-1">{label}</button>
//                   </li>
//                 ))}
//               </ul>
//             </div>

//             {/* Policies */}
//             <div>
//               <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Policies</h4>
//               <ul className="space-y-2.5 text-sm">
//                 {["Privacy Policy", "Terms & Conditions", "Return Policy", "Shipping Info"].map((p) => (
//                   <li key={p}><button className="hover:text-[#E4BF1A] transition">{p}</button></li>
//                 ))}
//               </ul>
//               <div className="mt-4 bg-white/5 rounded-xl p-3">
//                 <p className="text-xs text-gray-500 font-semibold mb-1">Payment Methods</p>
//                 <div className="flex gap-2 text-lg">🏦 💳 📱</div>
//                 <p className="text-xs text-gray-600 mt-1">UPI, COD accepted</p>
//               </div>
//             </div>
//           </div>

//           <div className="border-t border-white/10 pt-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-600">
//             <p>© 2026 Ween by Samruddhi Group of Industries · All rights reserved</p>
//             <p>Designed by <span className="text-[#E4BF1A]">Softmax.in</span></p>
//           </div>
//         </div>
//       </footer>

//       {/* Login Popup */}
//       {showLoginPopup && (
//         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowLoginPopup(false)}>
//           <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
//             <div className="text-center">
//               <div className="w-16 h-16 bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
//                 <span className="text-3xl text-white font-black">W</span>
//               </div>
//               <h2 className="text-2xl font-extrabold text-gray-900">Welcome to Ween</h2>
//               <p className="text-gray-500 mt-1 text-sm">Sign in to shop, track orders and more</p>
//               <button onClick={handleGoogleSignIn} className="mt-6 w-full flex items-center justify-center gap-3 border-2 border-gray-200 py-3.5 rounded-2xl hover:bg-gray-50 font-semibold text-gray-700 transition">
//                 <svg className="w-5 h-5" viewBox="0 0 24 24">
//                   <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
//                   <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
//                   <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
//                   <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
//                 </svg>
//                 Continue with Google
//               </button>
//               <p className="text-xs text-gray-400 mt-4">By signing in, you agree to our Terms & Privacy Policy</p>
//             </div>
//           </div>
//         </div>
//       )}

//       {showCart && (
//         <CartSidebar cart={cart} user={user} onClose={() => setShowCart(false)} onRemove={handleRemoveFromCart} onUpdateQty={handleUpdateQty}
//           onCheckout={() => { setShowCart(false); setShowCheckout(true); }}
//         />
//       )}

//       {showCheckout && user && (
//         <CheckoutModal cart={cart} user={user} onClose={() => setShowCheckout(false)} onOrderPlaced={handleOrderPlaced} />
//       )}

//       {/* Close user menu on outside click */}
//       {showUserMenu && <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />}
    
    
//           {/* WHATSAPP BUTTON */}
//       <div style={{
//         position: 'fixed',
//         bottom: '20px',
//         right: '20px',
//         zIndex: 999999
//       }}>
//         <a
//           href="https://wa.me/919425940136"
//           target="_blank"
//           rel="noopener noreferrer"
//           style={{
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//             width: '60px',
//             height: '60px',
//             backgroundColor: '#25D366',
//             borderRadius: '50%',
//             boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
//             cursor: 'pointer'
//           }}
//         >
//           <svg
//             xmlns="http://www.w3.org/2000/svg"
//             viewBox="0 0 448 512"
//             width="30"
//             height="30"
//             fill="white"
//           >
//             <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.2-17.1-41.3-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.1 13.9 10.9-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
//           </svg>
//         </a>
//       </div>
    
//     </>
//   );
// }


