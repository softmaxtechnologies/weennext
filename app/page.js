"use client";

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// ============================================
// Firebase Configuration
// ============================================
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
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
  writeBatch
} from 'firebase/firestore';

// IMPORTANT: Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Set persistence
setPersistence(auth, browserLocalPersistence);

// Helper: Convert Firestore timestamps
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

// Helper: Create/Update user in Firestore with customer type
const ensureUserInFirestore = async (user) => {
  if (!user) return null;
  
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    // Create new user with customer type (not admin)
    const userData = {
      name: user.displayName || 'User',
      email: user.email || '',
      phone: user.phoneNumber || '',
      photoUrl: user.photoURL || '',
      isAdmin: false,
      userType: 'customer',
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now()
    };
    await setDoc(userRef, userData);
    return { id: user.uid, ...userData };
  } else {
    // Update last login
    await updateDoc(userRef, { lastLogin: Timestamp.now() });
    return { id: user.uid, ...convertTimestamps(userSnap.data()) };
  }
};

// Load Google One Tap script
const loadGoogleOneTap = (callback) => {
  if (typeof window === 'undefined') return;
  
  // Check if Google One Tap is already loaded
  if (window.google?.accounts?.id) {
    callback();
    return;
  }
  
  // Load the script
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = callback;
  document.body.appendChild(script);
};

// ============================================
// Cart Functions (Local Storage)
// ============================================
const getCart = () => {
  if (typeof window === 'undefined') return [];
  const cart = localStorage.getItem('ween_cart');
  return cart ? JSON.parse(cart) : [];
};

const saveCart = (cart) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ween_cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));
  }
};

const addToCart = (product, quantity = 1) => {
  const cart = getCart();
  const existing = cart.find(item => item.productId === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl || product.imageBase64,
      quantity: quantity,
      stock: product.stock
    });
  }
  saveCart(cart);
  return cart;
};

const removeFromCart = (productId) => {
  const cart = getCart().filter(item => item.productId !== productId);
  saveCart(cart);
  return cart;
};

const updateQuantity = (productId, quantity) => {
  const cart = getCart();
  const item = cart.find(i => i.productId === productId);
  if (item) {
    if (quantity <= 0) {
      return removeFromCart(productId);
    }
    item.quantity = quantity;
    saveCart(cart);
  }
  return cart;
};

const clearCart = () => {
  saveCart([]);
};

// ============================================
// Main Component
// ============================================
export default function Home() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [orders, setOrders] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [newFeedback, setNewFeedback] = useState({ rating: 5, comment: '' });
  const [activeTab, setActiveTab] = useState(0);
  const [checkoutDetails, setCheckoutDetails] = useState({
    street: '', city: '', state: '', pincode: '', phone: ''
  });
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Hero carousel images
  const carouselImages = [
    "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=1200&h=400&fit=crop",
    "https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?w=1200&h=400&fit=crop",
    "https://images.unsplash.com/photo-1611242142951-7fc8b2eaf0a8?w=1200&h=400&fit=crop",
    "https://images.unsplash.com/photo-1610557886111-d88d6fe4fb07?w=1200&h=400&fit=crop"
  ];

  // Initialize Google One Tap
  const initializeGoogleOneTap = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!window.google?.accounts?.id) return;
    if (user) return; // Don't show if already logged in

    window.google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const credential = response.credential;
          const credentialResult = await signInWithCredential(
            auth,
            GoogleAuthProvider.credential(credential)
          );
          const firebaseUser = credentialResult.user;
          await ensureUserInFirestore(firebaseUser);
          setUser(firebaseUser);
          await loadUserOrders(firebaseUser.uid);
        } catch (error) {
          console.error("One Tap sign-in error:", error);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    });
    
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.log("One Tap not displayed:", notification.getNotDisplayedReason());
      }
      if (notification.isSkippedMoment()) {
        console.log("One Tap skipped:", notification.getSkippedReason());
      }
    });
  }, [user]);

  // Load user on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await ensureUserInFirestore(firebaseUser);
        setUserData(userDoc);
        setUser(firebaseUser);
        await loadUserOrders(firebaseUser.uid);
      } else {
        setUser(null);
        setUserData(null);
        setOrders([]);
        // Load Google One Tap
        loadGoogleOneTap(() => {
          initializeGoogleOneTap();
        });
      }
      setLoading(false);
    });
    
    loadProducts();
    loadFeedbacks();
    setCart(getCart());

    const handleCartUpdate = () => setCart(getCart());
    window.addEventListener('cartUpdated', handleCartUpdate);
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselImages.length);
    }, 5000);
    
    return () => {
      unsubscribe();
      window.removeEventListener('cartUpdated', handleCartUpdate);
      clearInterval(interval);
    };
  }, [initializeGoogleOneTap]);

  // Google Sign In Popup (fallback)
  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserInFirestore(result.user);
      setUser(result.user);
      await loadUserOrders(result.user.uid);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setUserData(null);
    setOrders([]);
    clearCart();
    setCart([]);
    // Reload One Tap after logout
    setTimeout(() => {
      if (window.google?.accounts?.id) {
        initializeGoogleOneTap();
      }
    }, 1000);
  };

  // Load Products from Firestore
  const loadProducts = async () => {
    try {
      const productsRef = collection(db, 'products');
      const q = query(productsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...convertTimestamps(doc.data())
      }));
      
      setProducts(productsList);
      
      const uniqueCats = ['all', ...new Set(productsList.map(p => p.category).filter(Boolean))];
      setCategories(uniqueCats);
    } catch (error) {
      console.error("Error loading products:", error);
    }
  };

  // Load User Orders
  const loadUserOrders = async (userId) => {
    try {
      const q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('orderDate', 'desc'));
      const snapshot = await getDocs(q);
      const userOrders = snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
      setOrders(userOrders);
    } catch (error) {
      console.error("Error loading orders:", error);
    }
  };

  // Load Feedbacks
  const loadFeedbacks = async () => {
    try {
      const q = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const allFeedbacks = snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
      setFeedbacks(allFeedbacks);
    } catch (error) {
      console.error("Error loading feedbacks:", error);
    }
  };

  // Submit Feedback
  const submitFeedback = async () => {
    if (!user) {
      alert("Please sign in to leave feedback");
      handleGoogleSignIn();
      return;
    }
    if (!newFeedback.comment.trim()) {
      alert("Please write your feedback");
      return;
    }
    try {
      const feedbackData = {
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        rating: newFeedback.rating,
        comment: newFeedback.comment,
        productId: selectedProduct?.id || null,
        productName: selectedProduct?.name || null,
        createdAt: Timestamp.now(),
        isPublished: true
      };
      await addDoc(collection(db, 'feedbacks'), feedbackData);
      setNewFeedback({ rating: 5, comment: '' });
      await loadFeedbacks();
      alert("Thank you for your feedback!");
    } catch (error) {
      console.error("Feedback error:", error);
      alert("Failed to submit feedback");
    }
  };

  // Place Order
  const handlePlaceOrder = async () => {
    if (!user) {
      alert("Please sign in to place order");
      handleGoogleSignIn();
      return;
    }
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }
    if (!checkoutDetails.street || !checkoutDetails.city || !checkoutDetails.pincode) {
      alert("Please fill complete address");
      return;
    }

    setIsPlacingOrder(true);
    try {
      const items = cart.map(item => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      }));
      const totalAmount = items.reduce((sum, i) => sum + i.total, 0);
      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const orderData = {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName,
        orderId,
        items,
        totalAmount,
        status: 'pending',
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        deliveryAddress: checkoutDetails,
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
      setOrderPlaced(true);
      setTimeout(() => setOrderPlaced(false), 3000);
      await loadUserOrders(user.uid);
      await loadProducts();
      setShowCart(false);
      setCheckoutDetails({ street: '', city: '', state: '', pincode: '', phone: '' });
    } catch (error) {
      console.error("Order error:", error);
      alert("Failed to place order. Please try again.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Get filtered products
  const getFilteredProducts = () => {
    let filtered = [...products];
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.category?.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s)
      );
    }
    return filtered;
  };

  // Product Modal Component
  const ProductModal = ({ product, onClose }) => {
    const [productFeedbacks, setProductFeedbacks] = useState([]);
    const [fbComment, setFbComment] = useState('');
    const [fbRating, setFbRating] = useState(5);
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
      const fetchProductFeedbacks = async () => {
        try {
          const q = query(collection(db, 'feedbacks'), where('productId', '==', product.id), orderBy('createdAt', 'desc'));
          const snapshot = await getDocs(q);
          const fb = snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
          setProductFeedbacks(fb);
        } catch (e) {
          setProductFeedbacks([]);
        }
      };
      fetchProductFeedbacks();
    }, [product.id]);

    const submitProductFeedback = async () => {
      if (!user) {
        alert("Please sign in");
        handleGoogleSignIn();
        return;
      }
      if (!fbComment.trim()) return;
      try {
        const feedbackData = {
          userId: user.uid,
          userName: user.displayName,
          userEmail: user.email,
          rating: fbRating,
          comment: fbComment,
          productId: product.id,
          productName: product.name,
          createdAt: Timestamp.now(),
          isPublished: true
        };
        await addDoc(collection(db, 'feedbacks'), feedbackData);
        setFbComment('');
        setFbRating(5);
        const q = query(collection(db, 'feedbacks'), where('productId', '==', product.id), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const fb = snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
        setProductFeedbacks(fb);
        alert("Review added!");
      } catch (error) {
        console.error("Error:", error);
      }
    };

    const handleAddToCart = () => {
      addToCart(product, quantity);
      alert(`Added ${quantity} item(s) to cart!`);
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={onClose}>
        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">{product.name}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
          </div>
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl h-80 flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-6xl">📦</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{product.category}</span>
                  <span className="flex text-yellow-400">{"★".repeat(Math.floor(product.rating || 4))}{"☆".repeat(5-Math.floor(product.rating || 4))}</span>
                </div>
                <p className="text-4xl font-bold text-blue-600">₹{product.price}</p>
                <p className="text-gray-500 mt-2">Stock: {product.stock > 0 ? `${product.stock} items left` : 'Out of stock'}</p>
                <p className="text-gray-700 mt-4 leading-relaxed">{product.description}</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex items-center border rounded-lg">
                    <button onClick={() => setQuantity(Math.max(1, quantity-1))} className="px-3 py-1 border-r">-</button>
                    <span className="px-4 py-1">{quantity}</span>
                    <button onClick={() => setQuantity(Math.min(product.stock, quantity+1))} className="px-3 py-1 border-l">+</button>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    disabled={product.stock <= 0}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition disabled:bg-gray-300"
                  >
                    🛒 Add to Cart
                  </button>
                </div>
              </div>
            </div>

            {/* Reviews Section */}
            <div className="mt-10 border-t pt-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">📝 Customer Reviews <span className="text-sm text-gray-500">({productFeedbacks.length})</span></h3>
              
              {user && (
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <textarea
                    value={fbComment}
                    onChange={(e) => setFbComment(e.target.value)}
                    placeholder="Write your review about this product..."
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows="2"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(r => (
                        <button key={r} onClick={() => setFbRating(r)} className={`text-2xl ${r <= fbRating ? 'text-yellow-500' : 'text-gray-300'}`}>★</button>
                      ))}
                    </div>
                    <button onClick={submitProductFeedback} className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700">Submit Review</button>
                  </div>
                </div>
              )}
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {productFeedbacks.length === 0 && <p className="text-gray-500 text-center py-4">No reviews yet. Be the first to review!</p>}
                {productFeedbacks.map(fb => (
                  <div key={fb.id} className="border-b pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{fb.userName}</span>
                        <span className="text-yellow-500 text-sm">{"★".repeat(fb.rating)}</span>
                      </div>
                      <span className="text-xs text-gray-400">{fb.createdAt?.toLocaleDateString()}</span>
                    </div>
                    <p className="text-gray-600 mt-1">{fb.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Cart Sidebar
  const CartSidebar = () => (
    <div className="fixed inset-y-0 right-0 w-full md:w-96 bg-white shadow-2xl z-50 flex flex-col animate-slideIn">
      <div className="p-5 bg-gradient-to-r from-blue-800 to-blue-600 text-white flex justify-between items-center">
        <h2 className="text-xl font-bold">Your Cart 🛒</h2>
        <button onClick={() => setShowCart(false)} className="text-2xl hover:text-gray-200">&times;</button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {cart.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-6xl">🛍️</span>
            <p className="text-gray-500 mt-3">Your cart is empty</p>
            <button onClick={() => setShowCart(false)} className="mt-4 text-blue-600">Continue Shopping →</button>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.productId} className="flex gap-3 border-b py-4">
              <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                {item.imageUrl ? <img src={item.imageUrl} className="h-16 object-cover" /> : <span className="text-2xl">📦</span>}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-800">{item.name}</h4>
                <p className="text-blue-600 font-medium">₹{item.price}</p>
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => updateQuantity(item.productId, item.quantity-1)} className="w-7 h-7 bg-gray-200 rounded-full hover:bg-gray-300">-</button>
                  <span className="font-medium">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.productId, item.quantity+1)} className="w-7 h-7 bg-gray-200 rounded-full hover:bg-gray-300">+</button>
                  <button onClick={() => removeFromCart(item.productId)} className="text-red-500 text-sm ml-2">Remove</button>
                </div>
              </div>
              <div className="font-bold">₹{item.price * item.quantity}</div>
            </div>
          ))
        )}
      </div>
      {cart.length > 0 && (
        <div className="border-t p-5 bg-gray-50">
          <div className="mb-4">
            <h3 className="font-semibold text-gray-800 mb-2">Delivery Address</h3>
            <input type="text" placeholder="Street / House No." value={checkoutDetails.street} onChange={e => setCheckoutDetails({...checkoutDetails, street: e.target.value})} className="w-full border p-2 rounded-lg mb-2" />
            <div className="flex gap-2">
              <input type="text" placeholder="City" value={checkoutDetails.city} onChange={e => setCheckoutDetails({...checkoutDetails, city: e.target.value})} className="flex-1 border p-2 rounded-lg" />
              <input type="text" placeholder="State" value={checkoutDetails.state} onChange={e => setCheckoutDetails({...checkoutDetails, state: e.target.value})} className="flex-1 border p-2 rounded-lg" />
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" placeholder="Pincode" value={checkoutDetails.pincode} onChange={e => setCheckoutDetails({...checkoutDetails, pincode: e.target.value})} className="flex-1 border p-2 rounded-lg" />
              <input type="text" placeholder="Phone" value={checkoutDetails.phone} onChange={e => setCheckoutDetails({...checkoutDetails, phone: e.target.value})} className="flex-1 border p-2 rounded-lg" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-800 mb-3">Total: ₹{cart.reduce((sum, i) => sum + (i.price * i.quantity), 0)}</div>
          <button 
            onClick={handlePlaceOrder} 
            disabled={isPlacingOrder}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition disabled:bg-gray-400"
          >
            {isPlacingOrder ? 'Placing Order...' : 'Place Order (Cash on Delivery)'}
          </button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-r from-blue-900 to-blue-700">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white mt-4">Loading Ween...</p>
        </div>
      </div>
    );
  }

  const filteredProducts = getFilteredProducts();

  return (
    <>
      <Head>
        <title>Ween - Sam Riddhi Group | Quality Products</title>
        <meta name="description" content="Shop quality products at Ween by Sam Riddhi Group. Best prices, fast delivery." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-slideInLeft { animation: slideInLeft 0.5s ease-out; }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .carousel-slide {
          transition: opacity 0.5s ease-in-out;
        }
      `}</style>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white sticky top-0 z-40 shadow-xl">
          <div className="container mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-yellow-500 w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold animate-pulse">W</div>
                <div>
                  <span className="text-2xl font-bold tracking-tight">Ween</span>
                  <span className="text-xs bg-yellow-600 ml-2 px-2 py-0.5 rounded-full">Sam Riddhi Group</span>
                </div>
              </div>
              
              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-1 bg-white/10 rounded-full p-1">
                <button 
                  onClick={() => setActiveTab(0)} 
                  className={`px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${activeTab === 0 ? 'bg-yellow-500 text-blue-900' : 'hover:bg-white/20'}`}
                >
                  <span>🛍️</span> Shop
                </button>
                <button 
                  onClick={() => setActiveTab(1)} 
                  className={`px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${activeTab === 1 ? 'bg-yellow-500 text-blue-900' : 'hover:bg-white/20'}`}
                >
                  <span>📦</span> Orders
                </button>
                <button 
                  onClick={() => setActiveTab(2)} 
                  className={`px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 ${activeTab === 2 ? 'bg-yellow-500 text-blue-900' : 'hover:bg-white/20'}`}
                >
                  <span>💬</span> Reviews
                </button>
              </div>

              <div className="flex items-center gap-3">
                {user ? (
                  <div className="flex items-center gap-3 bg-white/15 rounded-full pl-2 pr-3 py-1">
                    <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=E4BF1A&color=fff`} className="w-8 h-8 rounded-full border-2 border-yellow-500" />
                    <span className="hidden md:inline text-sm font-medium">{user.displayName?.split(' ')[0]}</span>
                    <button onClick={handleLogout} className="text-xs bg-red-600 px-3 py-1 rounded-full hover:bg-red-700">Logout</button>
                  </div>
                ) : (
                  <button onClick={handleGoogleSignIn} className="bg-white text-blue-800 px-4 py-1.5 rounded-full text-sm font-semibold hover:shadow-lg transition flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign In
                  </button>
                )}
                <button onClick={() => setShowCart(true)} className="relative bg-white/10 p-2 rounded-full hover:bg-white/20 transition">
                  🛒
                  {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-yellow-500 text-xs rounded-full w-5 h-5 flex items-center justify-center text-blue-900 font-bold">{cart.reduce((s,i)=>s+i.quantity,0)}</span>}
                </button>
              </div>
            </div>

            {/* Mobile Bottom Navigation Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-2xl border-t z-50">
              <div className="flex justify-around py-2">
                <button onClick={() => setActiveTab(0)} className={`flex flex-col items-center py-2 px-4 rounded-xl transition ${activeTab === 0 ? 'text-yellow-600' : 'text-gray-500'}`}>
                  <span className="text-2xl">🛍️</span>
                  <span className="text-xs mt-1">Shop</span>
                </button>
                <button onClick={() => setActiveTab(1)} className={`flex flex-col items-center py-2 px-4 rounded-xl transition ${activeTab === 1 ? 'text-yellow-600' : 'text-gray-500'}`}>
                  <span className="text-2xl">📦</span>
                  <span className="text-xs mt-1">Orders</span>
                </button>
                <button onClick={() => setActiveTab(2)} className={`flex flex-col items-center py-2 px-4 rounded-xl transition ${activeTab === 2 ? 'text-yellow-600' : 'text-gray-500'}`}>
                  <span className="text-2xl">💬</span>
                  <span className="text-xs mt-1">Reviews</span>
                </button>
              </div>
            </div>

            {/* Search Bar - only on shop tab */}
            {activeTab === 0 && (
              <div className="mt-4 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 rounded-full px-5 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <select 
                  value={selectedCategory} 
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="rounded-full px-4 py-2.5 bg-white text-gray-700 focus:outline-none"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>)}
                </select>
              </div>
            )}
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
          {orderPlaced && (
            <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-full shadow-lg animate-fadeIn">
              ✅ Order placed successfully! Track in My Orders
            </div>
          )}

          {/* Shop Tab */}
          {activeTab === 0 && (
            <>
              {/* Hero Carousel */}
              <div className="relative rounded-2xl overflow-hidden mb-8 h-48 md:h-64 shadow-lg">
                {carouselImages.map((img, idx) => (
                  <div 
                    key={idx} 
                    className={`absolute inset-0 transition-opacity duration-500 ${currentSlide === idx ? 'opacity-100' : 'opacity-0'}`}
                  >
                    <img src={img} alt={`Slide ${idx+1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent flex items-center">
                      <div className="text-white px-6 md:px-12 animate-slideInLeft">
                        <h2 className="text-2xl md:text-4xl font-bold">Welcome to Ween</h2>
                        <p className="text-sm md:text-lg mt-2 opacity-90">Quality products at best prices</p>
                        <button onClick={() => document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' })} className="mt-4 bg-yellow-500 text-blue-900 px-4 md:px-6 py-1.5 md:py-2 rounded-full text-sm md:text-base font-semibold hover:bg-yellow-400 transition">
                          Shop Now →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                  {carouselImages.map((_, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => setCurrentSlide(idx)} 
                      className={`h-2 rounded-full transition-all duration-300 ${currentSlide === idx ? 'bg-yellow-500 w-6' : 'bg-white/50 w-2'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Products Section */}
              <div id="products-section">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">All Products</h2>
                  <p className="text-sm text-gray-500">{filteredProducts.length} items found</p>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl shadow">
                    <span className="text-6xl">🔍</span>
                    <p className="text-gray-500 mt-3">No products found</p>
                    <button onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }} className="mt-3 text-blue-600">Clear filters</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                    {filteredProducts.map((product, idx) => (
                      <div 
                        key={product.id} 
                        className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden animate-fadeIn"
                        style={{ animationDelay: `${idx * 50}ms` }}
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="h-36 md:h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden group-hover:scale-105 transition duration-300">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-4xl">📦</span>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="font-semibold text-gray-800 line-clamp-1 text-sm md:text-base">{product.name}</h3>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-yellow-500 text-xs">{"★".repeat(Math.floor(product.rating || 4))}</span>
                            <span className="text-gray-400 text-xs">({product.rating || 4})</span>
                          </div>
                          <p className="text-blue-600 font-bold text-lg mt-1">₹{product.price}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{product.category}</span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); addToCart(product, 1); alert("Added to cart!"); }} 
                              className="bg-yellow-500 text-white px-3 py-1 rounded-lg text-xs hover:bg-yellow-600 transition"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Orders Tab */}
          {activeTab === 1 && (
            <div className="animate-fadeIn">
              {!user ? (
                <div className="text-center py-16 bg-white rounded-2xl shadow">
                  <span className="text-6xl">🔐</span>
                  <p className="text-gray-600 mt-3">Sign in to view your orders</p>
                  <button onClick={handleGoogleSignIn} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 transition">Sign In</button>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl shadow">
                  <span className="text-6xl">📦</span>
                  <p className="text-gray-600 mt-3">No orders yet</p>
                  <button onClick={() => setActiveTab(0)} className="mt-4 text-blue-600 hover:underline">Start Shopping →</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl shadow-md p-4 md:p-5 hover:shadow-lg transition">
                      <div className="flex flex-wrap justify-between items-start">
                        <div>
                          <span className="font-mono text-xs md:text-sm bg-gray-100 px-3 py-1 rounded-full">#{order.orderId}</span>
                          <span className={`ml-2 md:ml-3 inline-block px-2 md:px-3 py-1 rounded-full text-xs font-medium ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-700' : 
                            order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {order.status === 'pending' ? '⏳ Pending' : order.status === 'delivered' ? '✅ Delivered' : '🚚 ' + order.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-lg md:text-xl text-blue-600">₹{order.totalAmount}</span>
                          <p className="text-xs text-gray-500">{order.orderDate?.toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="border-t mt-3 pt-3">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="text-xs md:text-sm flex justify-between py-1">
                            <span>{item.productName} <span className="text-gray-400">x{item.quantity}</span></span>
                            <span>₹{item.total}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                        <span>📍</span> {order.deliveryAddress?.street}, {order.deliveryAddress?.city} - {order.deliveryAddress?.pincode}
                      </div>
                      <div className="mt-3 pt-2 border-t flex justify-between items-center">
                        <span className="text-xs text-gray-400">Payment: {order.paymentMethod?.toUpperCase()}</span>
                        <span className={`text-xs font-medium ${order.paymentStatus === 'verified' ? 'text-green-600' : 'text-orange-600'}`}>
                          {order.paymentStatus === 'verified' ? 'Paid ✓' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedbacks Tab */}
          {activeTab === 2 && (
            <div className="animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-md p-5 md:p-6 mb-8">
                <h3 className="font-bold text-xl text-gray-800">Share Your Experience 💬</h3>
                <p className="text-gray-500 text-sm mt-1">Help others by sharing your honest feedback</p>
                {user ? (
                  <div className="mt-4">
                    <div className="flex gap-1 mb-3">
                      {[1,2,3,4,5].map(r => (
                        <button key={r} onClick={() => setNewFeedback({...newFeedback, rating: r})} className={`text-2xl md:text-3xl transition ${r <= newFeedback.rating ? 'text-yellow-500 scale-110' : 'text-gray-300'}`}>★</button>
                      ))}
                    </div>
                    <textarea 
                      value={newFeedback.comment} 
                      onChange={e => setNewFeedback({...newFeedback, comment: e.target.value})} 
                      placeholder="Write your review about Ween..." 
                      className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                      rows="3" 
                    />
                    <button onClick={submitFeedback} className="mt-3 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 transition">Post Feedback</button>
                  </div>
                ) : (
                  <button onClick={handleGoogleSignIn} className="mt-3 text-blue-600 hover:underline">Sign in to leave feedback</button>
                )}
              </div>
              
              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Customer Reviews</h4>
                {feedbacks.length === 0 ? (
                  <p className="text-gray-500 text-center py-8 bg-white rounded-2xl shadow">No feedback yet. Be the first to review!</p>
                ) : (
                  feedbacks.map(fb => (
                    <div key={fb.id} className="bg-white rounded-xl shadow p-4 hover:shadow-md transition">
                      <div className="flex items-center justify-between flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                            {fb.userName?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-800">{fb.userName}</span>
                            <div className="flex text-yellow-500 text-sm">
                              {"★".repeat(fb.rating)}{"☆".repeat(5-fb.rating)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">{fb.createdAt?.toLocaleDateString()}</span>
                      </div>
                      <p className="text-gray-700 mt-3">{fb.comment}</p>
                      {fb.productName && (
                        <div className="mt-2 text-xs text-blue-500 bg-blue-50 inline-block px-2 py-1 rounded-full">
                          Product: {fb.productName}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>

        <footer className="bg-gray-800 text-white mt-8 py-6 hidden md:block">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm">© 2025 Ween by Sam Riddhi Group | Designed with ❤️ by Softmax.in</p>
            <p className="text-xs text-gray-400 mt-2">Quality Products | COD Available | Free Shipping on ₹999+</p>
          </div>
        </footer>
      </div>

      {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
      {showCart && <CartSidebar />}
    </>
  );
}