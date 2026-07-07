"use client";

import { useState, useRef, useEffect } from "react";
import { doc, getDoc, addDoc, collection, writeBatch, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase1";
import { Icon } from "./Icons";

// ---------- QR Payment Modal ----------
export const QRPaymentModal = ({ amount, onSuccess, onClose }) => {
  const [txnId, setTxnId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!txnId.trim()) { alert("Please enter the transaction ID"); return; }
    setSubmitted(true);
    await onSuccess(txnId);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-[#0E3F7A] to-[#1975B1] p-6 text-white text-center">
          <p className="text-sm opacity-80 mb-1">Pay via UPI</p>
          <p className="text-3xl font-bold">₹{amount.toLocaleString()}</p>
        </div>
        <div className="p-6">
          <div className="bg-gray-50 dark:bg-slate-800 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center gap-3 mb-5">
            <img src="/qr.jpeg" alt="UPI QR Code" className="w-48 h-48 object-contain rounded-xl" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">ween@upi</p>
            <p className="text-xs text-gray-400">Scan & Pay with any UPI app</p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Transaction ID / UTR</label>
            <input type="text" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="Enter 12-digit UTR number" className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-3 text-sm focus:border-[#1975B1] focus:outline-none" />
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

// ---------- Map Picker Modal ----------
export const MapPickerModal = ({ onSelect, onClose }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      const defaultLat = 22.3511148;
      const defaultLng = 78.6677428;
      const map = L.map(mapRef.current).setView([defaultLat, defaultLng], 5);
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);

      const icon = L.divIcon({
        html: '<div style="background:#0E3F7A;width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      });

      const getLocation = () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              map.setView([latitude, longitude], 15);
              setIsLocating(false);
              setLocationError(null);
              if (markerRef.current) markerRef.current.remove();
              markerRef.current = L.marker([latitude, longitude], { icon }).addTo(map);
              setSelectedLocation({ lat: latitude, lng: longitude });
              fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
                .then((res) => res.json())
                .then((data) => setAddress(data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`))
                .catch(() => setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`));
            },
            (err) => {
              console.warn("Location error:", err);
              setIsLocating(false);
              setLocationError("Could not get location. Tap on map to select.");
              fetch("https://ipapi.co/json/")
                .then((res) => res.json())
                .then((data) => {
                  if (data.latitude && data.longitude) {
                    const { latitude, longitude } = data;
                    map.setView([latitude, longitude], 13);
                    if (markerRef.current) markerRef.current.remove();
                    markerRef.current = L.marker([latitude, longitude], { icon }).addTo(map);
                    setSelectedLocation({ lat: latitude, lng: longitude });
                    setAddress(`${data.city || ""}, ${data.region || ""}, ${data.country_name || ""}`);
                  }
                })
                .catch(() => {});
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        } else {
          setIsLocating(false);
          setLocationError("Geolocation not supported. Please tap on map.");
        }
      };

      getLocation();

      map.on("click", async (e) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        setSelectedLocation({ lat, lng });
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          setAddress(data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-gray-800 dark:text-white">Select Delivery Location</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isLocating ? "📍 Detecting your location..." : "Tap on map to pin your location"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icon.Close /></button>
        </div>
        <div ref={mapRef} style={{ height: "380px", flex: "0 0 380px" }} className="w-full" />
        <div className="p-4 border-t dark:border-slate-800">
          {isLocating ? (
            <div className="flex items-center justify-center gap-2 bg-[#E3ECF3] dark:bg-slate-800 rounded-xl p-3 mb-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#0E3F7A] border-t-transparent"></div>
              <p className="text-sm text-[#0E3F7A] dark:text-[#7fb3e0] font-medium">Getting your location...</p>
            </div>
          ) : locationError ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-xl p-3 mb-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">{locationError}</p>
            </div>
          ) : address ? (
            <div className="flex items-start gap-3 bg-[#E3ECF3] dark:bg-slate-800 rounded-xl p-3 mb-3">
              <div className="text-[#0E3F7A] dark:text-[#7fb3e0] mt-0.5"><Icon.Location /></div>
              <div>
                <p className="text-xs text-[#0E3F7A] dark:text-[#7fb3e0] font-semibold mb-0.5">📍 Selected Location</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{address}</p>
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

// ---------- Checkout Modal ----------
export const CheckoutModal = ({ cart, user, onClose, onOrderPlaced }) => {
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
      alert("Please fill in complete address");
      return;
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
          mapLocation: mapLocation ? { address: mapLocation.address, latitude: mapLocation.lat, longitude: mapLocation.lng } : null,
        },
        orderDate: Timestamp.now(), createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, "orders"), orderData);
      const batch = writeBatch(db);
      for (const item of cart) {
        const ref = doc(db, "products", item.productId);
        const snap = await getDoc(ref);
        if (snap.exists()) batch.update(ref, { stock: (snap.data().stock || 0) - item.quantity });
      }
      await batch.commit();
      onOrderPlaced(orderData);
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
        <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-800">
            <div>
              <h2 className="font-bold text-gray-800 dark:text-white">Checkout</h2>
              <p className="text-xs text-gray-400">Step {step} of 2</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? "bg-[#0E3F7A] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-400"}`}>1</div>
              <div className={`w-6 h-0.5 ${step >= 2 ? "bg-[#E4BF1A]" : "bg-gray-200 dark:bg-slate-700"}`} />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? "bg-[#0E3F7A] text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-400"}`}>2</div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Icon.Close /></button>
          </div>
          <div className="p-6">
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">Delivery Address</h3>
                <button onClick={() => setShowMap(true)} className="w-full flex items-center gap-2 border-2 border-dashed border-[#1975B1] rounded-xl px-4 py-3 text-[#0E3F7A] dark:text-[#7fb3e0] hover:bg-[#E3ECF3] dark:hover:bg-slate-800 transition text-sm font-medium">
                  <Icon.Location />{mapLocation ? "Location set — tap to change" : "Pin location on Map"}
                </button>
                {mapLocation && (
                  <p className="text-xs text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg px-3 py-2 flex items-start gap-1.5">
                    <Icon.Check /><span className="line-clamp-2">{mapLocation.address}</span>
                  </p>
                )}
                <input type="text" placeholder="Street / House No *" value={deliveryAddress.street} onChange={(e) => setDeliveryAddress((a) => ({ ...a, street: e.target.value }))} className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="City *" value={deliveryAddress.city} onChange={(e) => setDeliveryAddress((a) => ({ ...a, city: e.target.value }))} className="border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                  <input type="text" placeholder="State" value={deliveryAddress.state} onChange={(e) => setDeliveryAddress((a) => ({ ...a, state: e.target.value }))} className="border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Pincode *" value={deliveryAddress.pincode} onChange={(e) => setDeliveryAddress((a) => ({ ...a, pincode: e.target.value }))} className="border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                  <input type="text" placeholder="Phone" value={deliveryAddress.phone} onChange={(e) => setDeliveryAddress((a) => ({ ...a, phone: e.target.value }))} className="border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                </div>
                <button onClick={() => { if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.pincode) { alert("Fill required fields"); return; } setStep(2); }} className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold mt-2 hover:bg-[#1975B1] transition">
                  Continue to Payment
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Payment Method</h3>
                <div className="space-y-3">
                  {[
                    { id: "cod", label: "Cash on Delivery", sub: "Pay when your order arrives", Icon: Icon.COD },
                    { id: "qr", label: "UPI / QR Code", sub: "Pay now via any UPI app", Icon: Icon.QR },
                  ].map((opt) => (
                    <button key={opt.id} onClick={() => setPaymentMethod(opt.id)} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition ${paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#E3ECF3] dark:bg-slate-800" : "border-gray-200 dark:border-slate-700 hover:border-gray-300"}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paymentMethod === opt.id ? "bg-[#0E3F7A] text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-400"}`}><opt.Icon /></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-gray-800 dark:text-white">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.sub}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === opt.id ? "border-[#0E3F7A] bg-[#0E3F7A]" : "border-gray-300"}`}>
                        {paymentMethod === opt.id && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="bg-[#E3ECF3] dark:bg-slate-800 rounded-2xl p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Order Summary</p>
                  {cart.map((i) => (
                    <div key={i.productId} className="flex justify-between text-xs text-gray-500 dark:text-gray-400 py-1">
                      <span className="truncate flex-1">{i.name} × {i.quantity}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300 ml-2">₹{(i.price * i.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 dark:border-slate-700 pt-2 mt-2 flex justify-between font-bold text-gray-800 dark:text-white">
                    <span>Total</span><span className="text-[#0E3F7A] dark:text-[#7fb3e0]">₹{total.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="flex-1 border-2 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 py-3 rounded-xl font-semibold">Back</button>
                  <button
                    onClick={() => (paymentMethod === "qr" ? setShowQR(true) : handlePlaceOrder())}
                    disabled={isPlacing}
                    className="flex-1 bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 hover:shadow-xl transition"
                  >
                    {isPlacing ? "Placing..." : paymentMethod === "cod" ? "Place Order" : "Pay Now"}
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

// ---------- Login Popup ----------
export const LoginPopup = ({ onClose, onSignIn }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
      <div className="text-center">
        <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-lg flex items-center justify-center mx-auto mb-5 bg-white border border-gray-100">
          <img src="/logo.png" alt="Samruddhi Group of Industries - Ween Logo" className="w-full h-full object-contain scale-110" />
        </div>
        <h2 className="text-2xl font-extrabold text-[#E11D2E]">Welcome to Ween</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Sign in to shop, track orders and more</p>
        <button onClick={onSignIn} className="mt-6 w-full flex items-center justify-center gap-3 border-2 border-gray-200 dark:border-slate-700 py-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold text-gray-700 dark:text-gray-200 transition">
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

// ---------- Cart Sidebar ----------
export const CartSidebar = ({ cart, onClose, onRemove, onUpdateQty, onCheckout }) => {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 flex flex-col shadow-2xl animate-slideIn">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Your Cart</h2>
            <p className="text-xs text-gray-400">{cart.reduce((s, i) => s + i.quantity, 0)} items</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><Icon.Close /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-200 dark:text-slate-700 flex justify-center mb-3"><Icon.Package /></div>
              <p className="text-gray-400 font-medium">Your cart is empty</p>
              <p className="text-gray-300 dark:text-slate-600 text-sm mt-1">Add some products to get started</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="flex gap-3 bg-[#E3ECF3] dark:bg-slate-800 rounded-2xl p-3">
                <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                  <img
                    src={item.imageBase64 ? `data:image/jpeg;base64,${item.imageBase64}` : "https://placehold.co/400x400?text=Product"}
                    className="w-full h-full object-cover" alt={item.name}
                    onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm text-gray-800 dark:text-white line-clamp-1">{item.name}</h4>
                  <p className="text-[#0E3F7A] dark:text-[#7fb3e0] font-bold text-sm mt-0.5">₹{item.price.toLocaleString()}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => onUpdateQty(item.productId, item.quantity - 1)} className="w-6 h-6 bg-white dark:bg-slate-900 rounded-lg shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold hover:bg-[#E3ECF3] dark:hover:bg-slate-700">−</button>
                    <span className="text-sm font-semibold w-6 text-center dark:text-white">{item.quantity}</span>
                    <button onClick={() => onUpdateQty(item.productId, item.quantity + 1)} className="w-6 h-6 bg-white dark:bg-slate-900 rounded-lg shadow-sm flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold hover:bg-[#E3ECF3] dark:hover:bg-slate-700">+</button>
                    <button onClick={() => onRemove(item.productId)} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>
                  </div>
                </div>
                <div className="font-bold text-sm text-gray-800 dark:text-white flex-shrink-0">₹{(item.price * item.quantity).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 && (
          <div className="border-t dark:border-slate-800 px-5 py-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-500 dark:text-gray-400 font-medium">Total Amount</span>
              <span className="text-2xl font-extrabold text-[#0E3F7A] dark:text-[#7fb3e0]">₹{total.toLocaleString()}</span>
            </div>
            <button onClick={onCheckout} className="w-full bg-gradient-to-r from-[#0E3F7A] to-[#1975B1] text-white py-4 rounded-2xl font-bold shadow-lg hover:shadow-xl transition">
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
