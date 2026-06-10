"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Head from 'next/head';

// ============================================
// Firebase Configuration
// ============================================
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  Timestamp, 
  doc, 
  getDoc,
  writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const getCart = () => {
  if (typeof window === 'undefined') return [];
  const cart = localStorage.getItem('ween_cart');
  return cart ? JSON.parse(cart) : [];
};

const clearCart = () => {
  localStorage.removeItem('ween_cart');
  window.dispatchEvent(new Event('cartUpdated'));
};

const ensureUserInFirestore = async (user) => {
  if (!user) return null;
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      name: user.displayName,
      email: user.email,
      photoUrl: user.photoURL,
      userType: 'customer',
      createdAt: Timestamp.now()
    });
  }
  return user;
};

export default function OrderPage() {
  const router = useRouter();
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [address, setAddress] = useState({
    fullName: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
    landmark: ''
  });
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationPopup, setShowLocationPopup] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserInFirestore(firebaseUser);
        setUser(firebaseUser);
        setAddress(prev => ({
          ...prev,
          fullName: firebaseUser.displayName || '',
          phone: firebaseUser.phoneNumber || ''
        }));
      }
      setLoading(false);
    });
    
    const cartItems = getCart();
    setCart(cartItems);
    
    const handleCartUpdate = () => setCart(getCart());
    window.addEventListener('cartUpdated', handleCartUpdate);
    
    return () => {
      unsubscribe();
      window.removeEventListener('cartUpdated', handleCartUpdate);
    };
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      setAddress(prev => ({
        ...prev,
        fullName: result.user.displayName || '',
        phone: result.user.phoneNumber || ''
      }));
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      const updatedCart = cart.filter(item => item.productId !== productId);
      setCart(updatedCart);
      localStorage.setItem('ween_cart', JSON.stringify(updatedCart));
    } else {
      const updatedCart = cart.map(item =>
        item.productId === productId ? { ...item, quantity: newQuantity } : item
      );
      setCart(updatedCart);
      localStorage.setItem('ween_cart', JSON.stringify(updatedCart));
    }
    window.dispatchEvent(new Event('cartUpdated'));
  };

  const removeItem = (productId) => {
    const updatedCart = cart.filter(item => item.productId !== productId);
    setCart(updatedCart);
    localStorage.setItem('ween_cart', JSON.stringify(updatedCart));
    window.dispatchEvent(new Event('cartUpdated'));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryCharge = totalAmount > 999 ? 0 : 50;
  const grandTotal = totalAmount + deliveryCharge;

  const handlePlaceOrder = async () => {
    if (!user) {
      alert("Please sign in to place order");
      await handleGoogleSignIn();
      return;
    }
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }
    if (!address.street || !address.city || !address.pincode) {
      alert("Please fill complete address");
      return;
    }
    if (!address.phone || address.phone.length < 10) {
      alert("Please enter valid phone number");
      return;
    }

    setPlacingOrder(true);
    try {
      const items = cart.map(item => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      }));
      
      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      const orderData = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        orderId,
        items,
        totalAmount: grandTotal,
        status: 'pending',
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        deliveryAddress: {
          ...address,
          location: selectedLocation
        },
        orderDate: Timestamp.now(),
        createdAt: Timestamp.now()
      };
      
      await addDoc(collection(db, 'orders'), orderData);
      
      // Update product stocks
      const batch = writeBatch(db);
      for (const item of cart) {
        const productRef = doc(db, 'products', item.productId);
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
          const currentStock = productSnap.data().stock || 0;
          batch.update(productRef, { stock: currentStock - item.quantity });
        }
      }
      await batch.commit();
      
      clearCart();
      setCart([]);
      alert("Order placed successfully!");
      router.push('/orders');
    } catch (error) {
      console.error("Order error:", error);
      alert("Failed to place order. Please try again.");
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <>
        <Head><title>Cart - Ween</title></Head>
        <header className="bg-white shadow-sm sticky top-0 z-40">
          <div className="container mx-auto px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-blue-700 to-blue-800 w-8 h-8 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">W</span>
              </div>
              <span className="font-bold text-gray-800">Ween</span>
            </Link>
          </div>
        </header>
        <div className="flex items-center justify-center h-[70vh]">
          <div className="text-center">
            <span className="text-6xl">🛒</span>
            <p className="text-gray-500 mt-4">Your cart is empty</p>
            <Link href="/" className="mt-4 inline-block bg-blue-600 text-white px-6 py-2 rounded-full">Continue Shopping</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Checkout - Ween</title>
        <meta name="description" content="Complete your order" />
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
      `}</style>

      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-gradient-to-r from-blue-700 to-blue-800 w-8 h-8 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">W</span>
              </div>
              <span className="font-bold text-gray-800">Ween</span>
            </Link>
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-2">
                  <img src={user.photoURL} className="w-8 h-8 rounded-full" />
                  <span className="text-sm text-gray-700">{user.displayName?.split(' ')[0]}</span>
                </div>
              ) : (
                <button onClick={handleGoogleSignIn} className="text-sm text-blue-600">Sign In</button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Checkout</h1>
        
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Delivery Address</h2>
              
              <button
                onClick={() => setShowLocationPopup(true)}
                className="w-full mb-4 flex items-center justify-between p-3 border rounded-xl hover:border-blue-500 transition"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{selectedLocation ? selectedLocation.address : 'Select from map'}</span>
                </div>
                <span className="text-blue-600 text-sm">Change</span>
              </button>
              
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={address.fullName}
                  onChange={(e) => setAddress({...address, fullName: e.target.value})}
                  className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={address.phone}
                  onChange={(e) => setAddress({...address, phone: e.target.value})}
                  className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Street Address / House No."
                  value={address.street}
                  onChange={(e) => setAddress({...address, street: e.target.value})}
                  className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Landmark (Optional)"
                  value={address.landmark}
                  onChange={(e) => setAddress({...address, landmark: e.target.value})}
                  className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="City"
                    value={address.city}
                    onChange={(e) => setAddress({...address, city: e.target.value})}
                    className="border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Pincode"
                    value={address.pincode}
                    onChange={(e) => setAddress({...address, pincode: e.target.value})}
                    className="border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="State"
                  value={address.state}
                  onChange={(e) => setAddress({...address, state: e.target.value})}
                  className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Payment Method</h2>
              <div className="border rounded-xl p-4 bg-green-50 border-green-200">
                <div className="flex items-center gap-3">
                  <input type="radio" checked readOnly className="w-5 h-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">Cash on Delivery</p>
                    <p className="text-sm text-gray-500">Pay when you receive the order</p>
                  </div>
                  <span className="text-green-600 text-sm">Recommended</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-24">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Order Summary</h2>
              
              <div className="space-y-3 max-h-80 overflow-auto">
                {cart.map(item => (
                  <div key={item.productId} className="flex gap-3 pb-3 border-b">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      {item.imageUrl ? <img src={item.imageUrl} className="h-12 object-cover" /> : <span>📦</span>}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{item.name}</p>
                      <p className="text-blue-600 font-bold">₹{item.price}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="w-6 h-6 bg-gray-100 rounded-full">-</button>
                        <span className="text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="w-6 h-6 bg-gray-100 rounded-full">+</button>
                        <button onClick={() => removeItem(item.productId)} className="text-red-500 text-xs ml-2">Remove</button>
                      </div>
                    </div>
                    <div className="font-bold">₹{item.price * item.quantity}</div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold">₹{totalAmount}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Delivery Charge</span>
                  <span className="font-semibold">{deliveryCharge === 0 ? 'Free' : `₹${deliveryCharge}`}</span>
                </div>
                <div className="flex justify-between py-3 border-t text-lg">
                  <span className="font-bold text-gray-800">Total</span>
                  <span className="font-bold text-blue-600">₹{grandTotal}</span>
                </div>
              </div>
              
              <button
                onClick={handlePlaceOrder}
                disabled={placingOrder}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition mt-4 disabled:bg-gray-400"
              >
                {placingOrder ? 'Placing Order...' : `Place Order • ₹${grandTotal}`}
              </button>
              
              <p className="text-xs text-gray-400 text-center mt-3">
                By placing order, you agree to our Terms & Conditions
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Location Popup */}
      {showLocationPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={() => setShowLocationPopup(false)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scaleIn" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-800">Select Delivery Location</h2>
              <button onClick={() => setShowLocationPopup(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-6">
              <div className="rounded-xl overflow-hidden border h-80 mb-4">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=72.8777%2C19.0760%2C72.8777%2C19.0760&layer=mapnik&marker=${selectedLocation?.lat || 19.0760}%2C${selectedLocation?.lng || 72.8777}`}
                />
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSelectedLocation({ address: "Mumbai, Maharashtra - 400001", lat: 19.0760, lng: 72.8777 });
                    setAddress(prev => ({ ...prev, city: "Mumbai", state: "Maharashtra", pincode: "400001" }));
                    setShowLocationPopup(false);
                  }}
                  className="w-full text-left p-3 border rounded-xl hover:bg-gray-50 transition"
                >
                  <p className="font-medium">Mumbai, Maharashtra - 400001</p>
                  <p className="text-sm text-gray-500">Delivery in 2-3 days</p>
                </button>
                <button
                  onClick={() => {
                    setSelectedLocation({ address: "Delhi, NCR - 110001", lat: 28.6139, lng: 77.2090 });
                    setAddress(prev => ({ ...prev, city: "Delhi", state: "Delhi", pincode: "110001" }));
                    setShowLocationPopup(false);
                  }}
                  className="w-full text-left p-3 border rounded-xl hover:bg-gray-50 transition"
                >
                  <p className="font-medium">Delhi, NCR - 110001</p>
                  <p className="text-sm text-gray-500">Delivery in 2-3 days</p>
                </button>
                <button
                  onClick={() => {
                    setSelectedLocation({ address: "Bengaluru, Karnataka - 560001", lat: 12.9716, lng: 77.5946 });
                    setAddress(prev => ({ ...prev, city: "Bengaluru", state: "Karnataka", pincode: "560001" }));
                    setShowLocationPopup(false);
                  }}
                  className="w-full text-left p-3 border rounded-xl hover:bg-gray-50 transition"
                >
                  <p className="font-medium">Bengaluru, Karnataka - 560001</p>
                  <p className="text-sm text-gray-500">Delivery in 3-4 days</p>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}