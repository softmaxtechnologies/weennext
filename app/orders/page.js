"use client";

import { useState, useEffect } from 'react';
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
  query, 
  where, 
  orderBy, 
  getDocs 
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

const convertTimestamps = (data) => {
  if (!data) return data;
  const converted = { ...data };
  for (const key in converted) {
    if (converted[key] && typeof converted[key]?.toDate === 'function') {
      converted[key] = converted[key].toDate();
    }
  }
  return converted;
};

export default function OrdersPage() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await loadOrders(firebaseUser.uid);
      } else {
        setUser(null);
        setOrders([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadOrders = async (userId) => {
    try {
      const q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('orderDate', 'desc'));
      const snapshot = await getDocs(q);
      const ordersList = snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
      setOrders(ordersList);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      await loadOrders(result.user.uid);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-700', label: '⏳ Pending' },
      confirmed: { color: 'bg-blue-100 text-blue-700', label: '✓ Confirmed' },
      processing: { color: 'bg-purple-100 text-purple-700', label: '⚙️ Processing' },
      shipped: { color: 'bg-indigo-100 text-indigo-700', label: '🚚 Shipped' },
      delivered: { color: 'bg-green-100 text-green-700', label: '✅ Delivered' },
      cancelled: { color: 'bg-red-100 text-red-700', label: '❌ Cancelled' }
    };
    return statusConfig[status] || statusConfig.pending;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Head><title>My Orders - Ween</title></Head>
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
            <span className="text-6xl">🔐</span>
            <p className="text-gray-500 mt-4">Please sign in to view your orders</p>
            <button onClick={handleGoogleSignIn} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full">Sign In</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>My Orders - Ween</title>
        <meta name="description" content="View your order history" />
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
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
              <img src={user.photoURL} className="w-8 h-8 rounded-full" />
              <span className="text-sm text-gray-700">{user.displayName?.split(' ')[0]}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">My Orders</h1>
        
        {orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow">
            <span className="text-6xl">📦</span>
            <p className="text-gray-500 mt-4">No orders yet</p>
            <Link href="/" className="mt-4 inline-block text-blue-600">Start Shopping →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => {
              const statusBadge = getStatusBadge(order.status);
              return (
                <div key={order.id} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition">
                  <div className="p-5 border-b bg-gray-50">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <span className="font-mono text-sm bg-gray-200 px-3 py-1 rounded-full">#{order.orderId}</span>
                        <span className={`ml-3 inline-block px-3 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-xl text-blue-600">₹{order.totalAmount}</span>
                        <p className="text-xs text-gray-500">{order.orderDate?.toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-5">
                    <div className="space-y-3">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-gray-800">{item.productName}</p>
                            <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          </div>
                          <p className="font-semibold">₹{item.total}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-3 border-t">
                      <div className="flex items-start gap-2 text-sm text-gray-500">
                        <svg className="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>
                          {order.deliveryAddress?.street}, {order.deliveryAddress?.city} - {order.deliveryAddress?.pincode}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-2 border-t">
                        <span className="text-xs text-gray-400">Payment: {order.paymentMethod?.toUpperCase()}</span>
                        <span className={`text-xs font-medium ${order.paymentStatus === 'verified' ? 'text-green-600' : 'text-orange-600'}`}>
                          {order.paymentStatus === 'verified' ? '✓ Payment Verified' : '⏳ Payment Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}