"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, orderBy, Timestamp,
} from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase1";
import { getCart, saveCart, setUserEmailFromOneTap, SITE_NAME } from "@/lib/utils";
import { ensureUserInFirestore, notifyAdminsSignIn, notifyAdminsOrder, sendWelcomeMail } from "@/lib/notifications";
import { Icon, Stars } from "./Icons";
import { ThemeToggle } from "./ThemeProvider";
import { CartSidebar, CheckoutModal, LoginPopup } from "./Modals";

export default function ProductClient({ initialProduct }) {
  const router = useRouter();
  const product = initialProduct;

  const [user, setUser] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [editingFeedbackId, setEditingFeedbackId] = useState(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");

  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [toast, setToast] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshCart = () => {
    const c = getCart();
    setCart(c);
    setCartCount(c.reduce((s, i) => s + i.quantity, 0));
  };

  const loadFeedbacks = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "feedbacks"), where("productId", "==", product.id), orderBy("createdAt", "desc"))
      );
      setFeedbacks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserInFirestore(firebaseUser);
        setUser(firebaseUser);
        if (firebaseUser.email) setUserEmailFromOneTap(firebaseUser.email);
      } else {
        setUser(null);
      }
    });
    refreshCart();
    loadFeedbacks();
    window.addEventListener("cartUpdated", refreshCart);
    return () => { unsub(); window.removeEventListener("cartUpdated", refreshCart); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserInFirestore(result.user);
      setUser(result.user);
      if (result.user.email) setUserEmailFromOneTap(result.user.email);
      setShowLoginPopup(false);
      await notifyAdminsSignIn(result.user);
      await sendWelcomeMail(result.user);
    } catch (e) {
      console.error(e);
      alert("Sign in failed. Try again.");
    }
  };

  const productFeedbacks = feedbacks;
  const avgRating = productFeedbacks.length > 0
    ? (productFeedbacks.reduce((s, f) => s + f.rating, 0) / productFeedbacks.length).toFixed(1)
    : product.rating || 4.5;

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleAddToCart = (qtyToAdd = qty) => {
    if (!user) { setShowLoginPopup(true); return; }
    const c = getCart();
    const existing = c.find((i) => i.productId === product.id);
    if (existing) existing.quantity += qtyToAdd;
    else c.push({ productId: product.id, name: product.name, price: product.price, imageBase64: product.imageBase64, quantity: qtyToAdd, stock: product.stock });
    saveCart(c);
    refreshCart();
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
    showToast(`${product.name} added to cart!`);
  };

  const handleBuyNow = () => {
    if (!user) { setShowLoginPopup(true); return; }
    saveCart([{ productId: product.id, name: product.name, price: product.price, imageBase64: product.imageBase64, quantity: qty, stock: product.stock }]);
    refreshCart();
    setShowCheckout(true);
  };

  const handleRemoveFromCart = (pid) => { saveCart(getCart().filter((i) => i.productId !== pid)); refreshCart(); };
  const handleUpdateQty = (pid, newQty) => {
    const c = getCart();
    const idx = c.findIndex((i) => i.productId === pid);
    if (idx >= 0) { if (newQty <= 0) c.splice(idx, 1); else c[idx].quantity = newQty; }
    saveCart(c);
    refreshCart();
  };

  const handleOrderPlaced = async (orderData) => {
    saveCart([]);
    refreshCart();
    setShowCheckout(false);
    setShowCart(false);
    setOrderSuccess(true);
    setTimeout(() => setOrderSuccess(false), 5000);
    showToast("🎉 Order placed successfully!");
    if (user) await notifyAdminsOrder(orderData, user.email, user.displayName || "Customer");
  };

  // ---- Feedback CRUD ----
  const startEdit = (fb) => { setEditingFeedbackId(fb.id); setEditRating(fb.rating); setEditComment(fb.comment); };
  const cancelEdit = () => { setEditingFeedbackId(null); setEditRating(5); setEditComment(""); };

  const saveEdit = async (fbId) => {
    try {
      await updateDoc(doc(db, "feedbacks", fbId), { rating: editRating, comment: editComment });
      await loadFeedbacks();
      showToast("Feedback updated!");
    } catch (e) {
      console.error(e);
      alert("Failed to update feedback.");
    }
    cancelEdit();
  };

  const handleDeleteFeedback = async (fbId) => {
    if (!confirm("Delete this review?")) return;
    try {
      await deleteDoc(doc(db, "feedbacks", fbId));
      await loadFeedbacks();
      showToast("Feedback deleted.");
    } catch (e) {
      console.error(e);
      alert("Failed to delete feedback.");
    }
  };

  const handleNewFeedback = async () => {
    if (!user) { setShowLoginPopup(true); return; }
    if (!newComment.trim()) { alert("Please write your feedback"); return; }
    try {
      await addDoc(collection(db, "feedbacks"), {
        userId: user.uid, userName: user.displayName, userEmail: user.email,
        rating: newRating, comment: newComment, productId: product.id,
        createdAt: Timestamp.now(),
      });
      await loadFeedbacks();
      showToast("Thanks for your review!");
    } catch (e) {
      console.error(e);
      alert("Failed to submit feedback.");
    }
    setNewRating(5);
    setNewComment("");
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] dark:bg-slate-950 transition-colors">
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

      <header className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 py-3">
            <Link href="/" className="flex items-center gap-3 flex-shrink-0">
              <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md flex items-center justify-center bg-white border border-gray-100">
                <img src="/logo.png" alt={`${SITE_NAME} Logo`} className="w-full h-full object-contain scale-110" />
              </div>
              <div className="hidden sm:block">
                <p className="font-black text-[#E11D2E] text-xl leading-none tracking-wide">विन</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs leading-none mt-1">Samruddhi Group of Industries</p>
              </div>
            </Link>
            <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-[#0E3F7A] transition font-medium ml-2">
              <Icon.Back /> Back
            </button>
            <nav className="hidden md:flex text-xs text-gray-400 items-center gap-1 ml-1">
              <Link href="/">Home</Link><span>/</span>
              <span className="text-[#0E3F7A] dark:text-[#7fb3e0]">{product.category}</span><span>/</span>
              <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[160px]">{product.name}</span>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <button onClick={handleShare} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${copied ? "bg-green-50 text-green-600" : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-[#E3ECF3] hover:text-[#0E3F7A]"}`}>
                {copied ? <><Icon.Check /> Copied!</> : <><Icon.Share /> Share</>}
              </button>
              <button onClick={() => (user ? setShowCart(true) : setShowLoginPopup(true))} className="relative bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 p-2.5 rounded-xl transition">
                <Icon.Cart />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#0E3F7A] text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Main product card */}
        <div className="grid lg:grid-cols-2 gap-0 bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden">
          <div className="relative bg-gradient-to-br from-[#E3ECF3] to-[#d0dce8] dark:from-slate-800 dark:to-slate-900 flex items-center justify-center p-6 min-h-[320px]">
            {product.imageBase64 ? (
              <img src={`data:image/jpeg;base64,${product.imageBase64}`} alt={product.name} className="max-h-80 w-full object-contain rounded-2xl" onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")} />
            ) : (
              <div className="text-gray-300 flex flex-col items-center gap-3">
                <Icon.Package />
                <p className="text-sm text-gray-400">No image</p>
              </div>
            )}
            <span className="absolute top-4 left-4 inline-flex px-3 py-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur text-[#0E3F7A] dark:text-[#7fb3e0] text-xs font-semibold rounded-full shadow">{product.category}</span>
          </div>
          <div className="p-6 lg:p-8 flex flex-col">
            <h1 className="text-2xl lg:text-3xl font-black text-[#151B20] dark:text-white leading-tight">{product.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Stars rating={parseFloat(avgRating)} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{avgRating} ({productFeedbacks.length} reviews)</span>
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-4xl font-extrabold text-[#0E3F7A] dark:text-[#7fb3e0]">₹{product.price.toLocaleString()}</span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 leading-relaxed flex-1">{product.description || "Premium quality product for everyday use."}</p>
            <div className="mt-4 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${product.stock > 0 ? "bg-green-500" : "bg-red-500"}`} />
              <span className={`text-sm font-medium ${product.stock > 0 ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
                {product.stock > 5 ? "In Stock" : product.stock > 0 ? `Only ${product.stock} left!` : "Out of Stock"}
              </span>
            </div>
            {product.stock > 0 && (
              <>
                <div className="flex items-center gap-4 mt-5">
                  <div className="flex items-center border-2 border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-bold text-lg">−</button>
                    <span className="px-5 py-2.5 font-semibold text-gray-800 dark:text-white min-w-[3rem] text-center">{qty}</span>
                    <button onClick={() => setQty(Math.min(product.stock, qty + 1))} className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-bold text-lg">+</button>
                  </div>
                  <span className="text-sm text-gray-400">Max: {product.stock}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <button onClick={() => handleAddToCart()} className={`flex-1 py-4 rounded-2xl font-bold text-base shadow-lg transition ${addedToCart ? "bg-green-500 text-white" : "bg-[#0E3F7A] text-white hover:bg-[#1975B1]"}`}>
                    {addedToCart ? "✓ Added!" : `Add to Cart — ₹${(product.price * qty).toLocaleString()}`}
                  </button>
                  <button onClick={handleBuyNow} className="flex-1 bg-[#E4BF1A] text-[#151B20] py-4 rounded-2xl font-bold text-base shadow-lg hover:bg-[#d4af10] transition">
                    Buy Now
                  </button>
                </div>
              </>
            )}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[["🚚", "Free Delivery", "Above ₹499"], ["↩️", "Easy Returns", "7 day policy"], ["🔒", "Secure Pay", "UPI & COD"]].map(([icon, title, sub]) => (
                <div key={title} className="bg-[#E3ECF3] dark:bg-slate-800 rounded-xl p-2.5 text-center">
                  <div className="text-lg mb-0.5">{icon}</div>
                  <p className="text-xs font-semibold text-[#151B20] dark:text-white">{title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mt-6 bg-white dark:bg-slate-900 rounded-3xl shadow-lg p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
            <h2 className="text-xl font-bold text-[#151B20] dark:text-white">Customer Reviews</h2>
            <span className="text-sm text-gray-400">{productFeedbacks.length} review{productFeedbacks.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="mb-6 bg-[#E3ECF3] dark:bg-slate-800 rounded-2xl p-4">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Write a Review</h3>
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => setNewRating(r)} className="text-2xl transition">
                  <span className={r <= newRating ? "text-[#E4BF1A]" : "text-gray-300"}>★</span>
                </button>
              ))}
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{newRating}/5</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your experience with this product..."
                className="flex-1 border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-xl px-4 py-2 text-sm focus:border-[#1975B1] outline-none"
              />
              <button onClick={handleNewFeedback} className="bg-[#0E3F7A] text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-[#1975B1] transition whitespace-nowrap">
                Post Review
              </button>
            </div>
          </div>

          {productFeedbacks.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No reviews yet. Be the first to review!</p>
          ) : (
            <div className="space-y-4">
              {productFeedbacks.map((fb) => {
                const isOwner = user && fb.userId === user.uid;
                const isEditing = editingFeedbackId === fb.id;
                return (
                  <div key={fb.id} className="flex flex-col sm:flex-row gap-3 sm:gap-4 pb-4 border-b border-gray-50 dark:border-slate-800 last:border-0">
                    <div className="w-10 h-10 rounded-full bg-[#E3ECF3] dark:bg-slate-800 flex items-center justify-center text-[#0E3F7A] dark:text-[#7fb3e0] font-bold flex-shrink-0">
                      {fb.userName?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {[1, 2, 3, 4, 5].map((r) => (
                              <button key={r} onClick={() => setEditRating(r)} className="text-2xl">
                                <span className={r <= editRating ? "text-[#E4BF1A]" : "text-gray-200"}>★</span>
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-xl p-2 text-sm focus:border-[#1975B1] outline-none"
                            rows="2"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => saveEdit(fb.id)} className="bg-[#0E3F7A] text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-[#1975B1]">Save</button>
                            <button onClick={cancelEdit} className="border border-gray-300 dark:border-slate-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-800">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-gray-800 dark:text-white">{fb.userName}</span>
                            <Stars rating={fb.rating} />
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed break-words">{fb.comment}</p>
                          {isOwner && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              <button onClick={() => startEdit(fb)} className="text-[#0E3F7A] dark:text-[#7fb3e0] text-xs hover:underline flex items-center gap-1">
                                <Icon.Edit /> Edit
                              </button>
                              <button onClick={() => handleDeleteFeedback(fb.id)} className="text-red-500 text-xs hover:underline flex items-center gap-1">
                                <Icon.Trash /> Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showLoginPopup && <LoginPopup onClose={() => setShowLoginPopup(false)} onSignIn={handleGoogleSignIn} />}

      {showCart && (
        <CartSidebar cart={cart} onClose={() => setShowCart(false)} onRemove={handleRemoveFromCart} onUpdateQty={handleUpdateQty}
          onCheckout={() => { setShowCart(false); setShowCheckout(true); }}
        />
      )}

      {showCheckout && user && (
        <CheckoutModal cart={cart} user={user} onClose={() => setShowCheckout(false)} onOrderPlaced={handleOrderPlaced} />
      )}
    </div>
  );
}
