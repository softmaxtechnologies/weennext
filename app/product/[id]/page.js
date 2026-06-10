"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  doc, 
  getDoc, 
  addDoc, 
  getDocs,
  query, 
  where, 
  orderBy, 
  Timestamp 
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

const getCart = () => {
  if (typeof window === 'undefined') return [];
  const cart = localStorage.getItem('ween_cart');
  return cart ? JSON.parse(cart) : [];
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
      imageUrl: product.imageUrl,
      quantity: quantity,
      stock: product.stock
    });
  }
  localStorage.setItem('ween_cart', JSON.stringify(cart));
  window.dispatchEvent(new Event('cartUpdated'));
  return cart;
};

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id;
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [user, setUser] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [showLocationPopup, setShowLocationPopup] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    
    if (productId) {
      loadProduct();
      loadReviews();
    }
    
    return () => unsubscribe();
  }, [productId]);

  const loadProduct = async () => {
    try {
      const productRef = doc(db, 'products', productId);
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        setProduct({ id: productSnap.id, ...convertTimestamps(productSnap.data()) });
      } else {
        setProduct({
          id: productId,
          name: 'Premium Detergent Powder',
          price: 399,
          category: 'Detergent',
          stock: 50,
          imageUrl: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=600',
          rating: 4.5,
          description: 'Premium quality detergent powder that removes tough stains and keeps clothes fresh.'
        });
      }
    } catch (error) {
      console.error("Error loading product:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    try {
      const q = query(collection(db, 'feedbacks'), where('productId', '==', productId), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const reviewsList = snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
      setReviews(reviewsList);
    } catch (error) {
      console.error("Error loading reviews:", error);
    }
  };

  const handleAddToCart = () => {
    if (product) {
      addToCart(product, quantity);
      alert(`Added ${quantity} item(s) to cart!`);
    }
  };

  const handleBuyNow = () => {
    if (product) {
      addToCart(product, quantity);
      router.push('/order');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const submitReview = async () => {
    if (!user) {
      alert("Please sign in to leave a review");
      await handleGoogleSignIn();
      return;
    }
    if (!reviewComment.trim()) {
      alert("Please write a review");
      return;
    }
    try {
      await addDoc(collection(db, 'feedbacks'), {
        userId: user.uid,
        userName: user.displayName,
        userEmail: user.email,
        rating: reviewRating,
        comment: reviewComment,
        productId: productId,
        productName: product?.name,
        createdAt: Timestamp.now()
      });
      setReviewComment('');
      setReviewRating(5);
      loadReviews();
      alert("Thank you for your review!");
    } catch (error) {
      console.error("Error submitting review:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <span className="text-6xl">🔍</span>
          <p className="text-gray-500 mt-4">Product not found</p>
          <Link href="/" className="mt-4 inline-block text-blue-600">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{product.name} - Ween</title>
        <meta name="description" content={product.description} />
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
              <Link href="/cart" className="relative">
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden animate-fadeIn">
          <div className="grid md:grid-cols-2 gap-8 p-6 md:p-8">
            {/* Product Image */}
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl h-80 md:h-96 flex items-center justify-center overflow-hidden">
              {product.imageUrl ? (
                <img src={product.imageUrl} className="h-full w-full object-cover" />
              ) : (
                <span className="text-8xl">📦</span>
              )}
            </div>

            {/* Product Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{product.category}</span>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-500">★</span>
                  <span className="text-sm text-gray-600">{product.rating || 4.5}</span>
                  <span className="text-gray-400 text-sm">({reviews.length} reviews)</span>
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-800">{product.name}</h1>
              <p className="text-4xl font-bold text-blue-600 mt-4">₹{product.price}</p>
              <p className="text-gray-500 mt-2">Stock: {product.stock > 0 ? `${product.stock} items left` : 'Out of stock'}</p>
              <p className="text-gray-600 mt-4 leading-relaxed">{product.description}</p>
              
              {/* Quantity Selector */}
              <div className="flex items-center gap-4 mt-6">
                <span className="text-gray-700">Quantity:</span>
                <div className="flex items-center border rounded-lg">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-4 py-2 border-r hover:bg-gray-100">-</button>
                  <span className="px-6 py-2">{quantity}</span>
                  <button onClick={() => setQuantity(Math.min(product.stock, quantity + 1))} className="px-4 py-2 border-l hover:bg-gray-100">+</button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock <= 0}
                  className="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-semibold hover:bg-yellow-600 transition disabled:bg-gray-300"
                >
                  🛒 Add to Cart
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={product.stock <= 0}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:bg-gray-300"
                >
                  Buy Now
                </button>
              </div>

              {/* Location Selector */}
              <button
                onClick={() => setShowLocationPopup(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-xl hover:bg-gray-50 transition text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {selectedLocation ? selectedLocation.address : 'Select delivery location'}
              </button>

              {/* Delivery Info */}
              <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <p className="font-semibold text-gray-800">Free Delivery</p>
                    <p className="text-sm text-gray-500">on orders above ₹999</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-gray-800">Cash on Delivery</p>
                    <p className="text-sm text-gray-500">Pay when you receive</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mt-10 bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Customer Reviews</h2>
          
          {/* Write Review */}
          <div className="border-b pb-6 mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">Write a Review</h3>
            <div className="flex gap-1 mb-3">
              {[1, 2, 3, 4, 5].map(r => (
                <button key={r} onClick={() => setReviewRating(r)} className={`text-2xl ${r <= reviewRating ? 'text-yellow-500' : 'text-gray-300'}`}>★</button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Share your experience with this product..."
              className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows="3"
            />
            <button onClick={submitReview} className="mt-3 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 transition">
              Submit Review
            </button>
          </div>

          {/* Reviews List */}
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No reviews yet. Be the first to review!</p>
            ) : (
              reviews.map(review => (
                <div key={review.id} className="border-b pb-4 last:border-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                        {review.userName?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{review.userName}</p>
                        <div className="flex text-yellow-500 text-sm">
                          {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{review.createdAt?.toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-700 mt-2 ml-12">{review.comment}</p>
                </div>
              ))
            )}
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
              {/* OpenStreetMap Embed */}
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