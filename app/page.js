"use client";

import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import { getCart, saveCart, setUserEmailFromOneTap, SITE_NAME, SITE_SHORT } from "@/lib/utils";
import {
  ensureUserInFirestore,
  sendMail,
  notifyAdminsSignIn,
  notifyAdminsOrder,
  sendWelcomeMail,
  getAdmins,
} from "@/lib/notifications";
import { Icon } from "@/components/Icons";
import { ThemeToggle } from "@/components/ThemeProvider";
import { ProductCard, ShimmerCard } from "@/components/ProductCard";
import { BrandHeroSlider, ProductHeroSlider, AdBannerSlider } from "@/components/HeroSlider";
import { CartSidebar, CheckoutModal, LoginPopup } from "@/components/Modals";

export default function HomePage() {
  const [user, setUser] = useState(null);
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
  const [viewMode, setViewMode] = useState("grid");
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [toast, setToast] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sendingContact, setSendingContact] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshCart = useCallback(() => {
    const c = getCart();
    setCart(c);
    setCartCount(c.reduce((s, i) => s + i.quantity, 0));
  }, []);

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      alert("Please fill in all required fields");
      return;
    }
    setSendingContact(true);
    try {
      const admins = await getAdmins();
      for (const admin of admins) {
        if (admin.email) {
          await sendMail(
            admin.email,
            `📩 New Contact Message – ${SITE_NAME}`,
            `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                  <img src="https://samruddhiindustries.netlify.app/logo.png" alt="${SITE_NAME}" style="height: 60px;"/>
                  <h2 style="color: #0E3F7A; margin-top: 10px;">📩 New Contact Message</h2>
                </div>
                <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                  <div style="background: #e3ecf3; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p style="margin: 3px 0;"><strong>Name:</strong> ${contactForm.name}</p>
                    <p style="margin: 3px 0;"><strong>Email:</strong> ${contactForm.email}</p>
                    ${contactForm.phone ? `<p style="margin: 3px 0;"><strong>Phone:</strong> ${contactForm.phone}</p>` : ""}
                  </div>
                  <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <p style="font-weight: bold; margin-bottom: 8px;">Message:</p>
                    <p style="color: #555; white-space: pre-wrap;">${contactForm.message}</p>
                  </div>
                </div>
                <div style="text-align: center; padding: 15px; color: #888; font-size: 12px;">
                  <p>${SITE_NAME}</p>
                  <p>AB Road, Shajapur, MP</p>
                </div>
              </div>
            `,
            true
          );
        }
      }
      setContactForm({ name: "", email: "", phone: "", message: "" });
      showToast("Message sent successfully! We'll get back to you soon.");
    } catch (err) {
      console.error(err);
      alert("Failed to send message. Please try again.");
    }
    setSendingContact(false);
  };

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (list.length === 0) {
        const samples = [
          { name: "Tide Plus Detergent Powder", price: 399, stock: 50, category: "Detergent", description: "Premium detergent for tough stains.", imageUrl: "", rating: 4.5 },
          { name: "Surf Excel Easy Wash", price: 449, stock: 40, category: "Detergent", description: "Quick stain removal formula.", imageUrl: "", rating: 4.3 },
          { name: "Comfort Fabric Softener", price: 299, stock: 60, category: "Softener", description: "Long-lasting freshness.", imageUrl: "", rating: 4.2 },
          { name: "Harpic Power Cleaner", price: 249, stock: 45, category: "Cleaner", description: "Kills 99.9% germs.", imageUrl: "", rating: 4.4 },
          { name: "Lizol Floor Cleaner", price: 299, stock: 35, category: "Cleaner", description: "Kills 99.9% germs on floor surfaces.", imageUrl: "", rating: 4.5 },
          { name: "Vim Dishwash Gel", price: 149, stock: 80, category: "Dishwash", description: "Removes grease effectively.", imageUrl: "", rating: 4.1 },
          { name: "Dettol Hand Wash", price: 199, stock: 70, category: "Personal Care", description: "Gentle antibacterial hand wash.", imageUrl: "", rating: 4.6 },
          { name: "Colin Glass Cleaner", price: 179, stock: 55, category: "Cleaner", description: "Crystal clear shine.", imageUrl: "", rating: 4.0 },
        ];
        for (const p of samples) await addDoc(collection(db, "products"), { ...p, createdAt: Timestamp.now() });
        const snap2 = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
        list = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      setProducts(list);
      setCategories(["all", ...new Set(list.map((p) => p.category).filter(Boolean))]);
    } catch (err) {
      console.error(err);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadUserOrders = async (uid) => {
    try {
      const { where } = await import("firebase/firestore");
      const snap = await getDocs(query(collection(db, "orders"), where("userId", "==", uid), orderBy("orderDate", "desc")));
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const loadAdSlides = async () => {
    try {
      const snap = await getDocs(query(collection(db, "adSlides"), orderBy("order", "asc")));
      if (!snap.empty) setAdSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      // No ad slides collection yet
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserInFirestore(result.user);
      setUser(result.user);
      if (result.user.email) setUserEmailFromOneTap(result.user.email);
      setShowLoginPopup(false);
      loadUserOrders(result.user.uid);
      await notifyAdminsSignIn(result.user);
      await sendWelcomeMail(result.user);
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

  const handleRemoveFromCart = (pid) => saveCart(getCart().filter((i) => i.productId !== pid));

  const handleUpdateQty = (pid, qty) => {
    const c = getCart();
    const idx = c.findIndex((i) => i.productId === pid);
    if (idx >= 0) { if (qty <= 0) c.splice(idx, 1); else c[idx].quantity = qty; }
    saveCart(c);
  };

  const handleOrderPlaced = async (orderData) => {
    saveCart([]);
    refreshCart();
    setShowCheckout(false);
    setShowCart(false);
    setOrderSuccess(true);
    setTimeout(() => setOrderSuccess(false), 5000);
    if (user) loadUserOrders(user.uid);
    showToast("🎉 Order placed successfully!");
    if (user) await notifyAdminsOrder(orderData, user.email, user.displayName || "Customer");
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserInFirestore(firebaseUser);
        setUser(firebaseUser);
        loadUserOrders(firebaseUser.uid);
        if (firebaseUser.email) setUserEmailFromOneTap(firebaseUser.email);
      }
    });
    loadProducts();
    loadAdSlides();
    refreshCart();
    window.addEventListener("cartUpdated", refreshCart);

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
              loadUserOrders(result.user.uid);
              await notifyAdminsSignIn(result.user);
              await sendWelcomeMail(result.user);
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
    return () => { unsub(); window.removeEventListener("cartUpdated", refreshCart); };
  }, []);

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

  return (
    <>
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

      {/* ---- HEADER ---- */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-40 shadow-sm transition-colors">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 py-3">
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-white">
                <img src="/logo.png" alt={`${SITE_NAME} Logo`} className="w-full h-full object-contain scale-110" />
              </div>
              <div className="hidden sm:block">
                <p className="font-black text-[#E11D2E] text-xl leading-none tracking-wide">विन</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs leading-none mt-1">Samruddhi Group of Industries</p>
              </div>
            </div>

            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400"><Icon.Search /></div>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 dark:text-white rounded-xl border-2 border-transparent focus:border-[#1975B1] focus:bg-white dark:focus:bg-slate-800 outline-none text-sm transition"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <ThemeToggle />
              {user ? (
                <div className="relative">
                  <button onClick={() => setShowUserMenu((v) => !v)} className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl px-2 py-1.5 transition">
                    <img src={user.photoURL} className="w-7 h-7 rounded-full" alt="" />
                    <span className="text-sm font-medium hidden md:block max-w-[80px] truncate dark:text-white">{user.displayName?.split(" ")[0]}</span>
                    <svg className="w-3 h-3 text-gray-400 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 py-2 min-w-[160px] z-50">
                      <div className="px-4 py-2 border-b border-gray-50 dark:border-slate-800">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{user.displayName}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <button onClick={() => { setActiveTab("orders"); setShowUserMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-2">📦 My Orders</button>
                      <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"><Icon.Logout /> Sign Out</button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowLoginPopup(true)} className="flex items-center gap-2 bg-[#0E3F7A] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#1975B1] transition">Sign In</button>
              )}
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

          <div className="flex gap-1 pb-2 overflow-x-auto category-scroll">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${selectedCategory === cat ? "bg-[#0E3F7A] text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"}`}>
                {cat === "all" ? "All Products" : cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-12">
        <div className="flex gap-0 border-b border-gray-100 dark:border-slate-800 mt-4 mb-6 overflow-x-auto">
          {[["shop", "🛍️ Shop"], ["orders", "📦 My Orders"], ["about", "ℹ️ About"], ["contact", "📞 Contact"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${activeTab === tab ? "border-[#0E3F7A] text-[#0E3F7A] dark:text-[#7fb3e0]" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ---- SHOP TAB ---- */}
        {activeTab === "shop" && (
          <div className="animate-fadeIn">
            {!searchTerm && selectedCategory === "all" && <BrandHeroSlider />}

            {!searchTerm && selectedCategory === "all" && products.length > 0 && (
              <ProductHeroSlider products={products} />
            )}

            {adSlides.length > 0 && !searchTerm && (
              <div className="mb-6">
                <AdBannerSlider slides={adSlides} />
              </div>
            )}

            <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-6">
              <aside className="hidden lg:block">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5 sticky top-28">
                  <h3 className="font-bold text-gray-800 dark:text-white mb-4 text-sm uppercase tracking-wide">Categories</h3>
                  <div className="space-y-1">
                    {categories.map((cat) => (
                      <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-between ${selectedCategory === cat ? "bg-[#E3ECF3] dark:bg-slate-800 text-[#0E3F7A] dark:text-[#7fb3e0] font-semibold" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>
                        <span>{cat === "all" ? "All Products" : cat}</span>
                        <span className={`text-xs rounded-full px-1.5 py-0.5 ${selectedCategory === cat ? "bg-[#0E3F7A] text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-400"}`}>
                          {cat === "all" ? products.length : products.filter((p) => p.category === cat).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 pt-5 border-t border-gray-100 dark:border-slate-800">
                    <h3 className="font-bold text-gray-800 dark:text-white mb-3 text-sm uppercase tracking-wide">Quick Info</h3>
                    {[["🚚", "Free delivery above ₹499"], ["↩️", "7-day easy returns"], ["🔒", "100% secure payments"], ["📍", "All India delivery"]].map(([icon, text]) => (
                      <div key={text} className="flex items-start gap-2 py-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{icon}</span><span>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedCategory === "all" ? "All Products" : selectedCategory}
                      <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length})</span>
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
                    <button onClick={() => setViewMode("grid")} className={`p-2 rounded-lg transition ${viewMode === "grid" ? "bg-white dark:bg-slate-700 shadow-sm text-[#0E3F7A] dark:text-[#7fb3e0]" : "text-gray-400"}`}><Icon.Grid /></button>
                    <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg transition ${viewMode === "list" ? "bg-white dark:bg-slate-700 shadow-sm text-[#0E3F7A] dark:text-[#7fb3e0]" : "text-gray-400"}`}><Icon.List /></button>
                  </div>
                </div>

                {loadingProducts ? (
                  viewMode === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                      {Array.from({ length: 8 }).map((_, i) => <ShimmerCard key={i} view="grid" />)}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => <ShimmerCard key={i} view="list" />)}
                    </div>
                  )
                ) : filtered.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl shadow-sm">
                    <p className="text-4xl mb-4">🔍</p>
                    <p className="font-semibold text-gray-700 dark:text-gray-300">No products found</p>
                    <p className="text-gray-400 text-sm mt-1">Try searching for something else</p>
                    <button onClick={() => { setSearchTerm(""); setSelectedCategory("all"); }} className="mt-4 text-[#0E3F7A] dark:text-[#7fb3e0] text-sm font-medium">Clear filters</button>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map((p) => <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} view="grid" />)}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((p) => <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} view="list" />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---- ORDERS TAB ---- */}
        {activeTab === "orders" && (
          <div className="animate-fadeIn">
            {!user ? (
              <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl shadow-sm">
                <p className="text-6xl mb-4">🔐</p>
                <p className="font-semibold text-gray-700 dark:text-gray-300 text-lg">Sign in to view orders</p>
                <p className="text-gray-400 text-sm mt-1">Track all your purchases in one place</p>
                <button onClick={handleGoogleSignIn} className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition">Sign In with Google</button>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl shadow-sm">
                <p className="text-6xl mb-4">📦</p>
                <p className="font-semibold text-gray-700 dark:text-gray-300 text-lg">No orders yet</p>
                <p className="text-gray-400 text-sm mt-1">Start shopping to see your orders here</p>
                <button onClick={() => setActiveTab("shop")} className="mt-6 bg-[#0E3F7A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition">Shop Now</button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div key={order.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-slate-800">
                    <div className="p-4 border-b border-gray-50 dark:border-slate-800 flex justify-between items-start">
                      <div>
                        <span className="font-mono text-xs bg-gray-100 dark:bg-slate-800 dark:text-gray-300 px-2.5 py-1 rounded-lg text-gray-600">#{order.orderId}</span>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                            {order.status?.replace("_", " ")}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 dark:text-gray-300 text-gray-600 font-medium uppercase">{order.paymentMethod}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-extrabold text-gray-900 dark:text-white">₹{order.totalAmount?.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{order.orderDate ? new Date(order.orderDate.toDate ? order.orderDate.toDate() : order.orderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</p>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{item.productName} <span className="text-gray-400">× {item.quantity}</span></span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">₹{item.total?.toLocaleString()}</span>
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
                      <div className="px-4 pb-4 text-xs text-[#0E3F7A] dark:text-[#7fb3e0] font-medium">UTR: {order.transactionId}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- ABOUT TAB ---- */}
        {activeTab === "about" && (
          <div className="animate-fadeIn space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6 mb-6">
                <div className="w-28 h-28 rounded-2xl overflow-hidden shadow-lg flex-shrink-0 bg-white border border-gray-100">
                  <img src="/logo.png" alt={`${SITE_NAME} Logo`} className="w-full h-full object-contain scale-110" />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-[#151B20] dark:text-white">Samruddhi Group of Industries</h2>
                  <p className="text-[#0E3F7A] dark:text-[#7fb3e0] font-medium text-sm mt-1">Bringing premium quality household products to every Indian home — at honest, fair prices.</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mt-4">
                <div className="bg-[#E3ECF3] dark:bg-slate-800 rounded-2xl p-5">
                  <h3 className="text-lg font-bold text-[#0E3F7A] dark:text-[#7fb3e0] flex items-center gap-2">🎯 Our Mission</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">To make high-quality household products accessible to every family across India, delivering trust, value, and satisfaction with every order.</p>
                </div>
                <div className="bg-[#E3ECF3] dark:bg-slate-800 rounded-2xl p-5">
                  <h3 className="text-lg font-bold text-[#0E3F7A] dark:text-[#7fb3e0] flex items-center gap-2">🌟 Our Vision</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">To become India's most loved local household brand — built on transparency, quality, and genuine care for our customers.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                {[
                  ["🏆", "Premium Quality", "Hand-picked products"],
                  ["💰", "Fair Prices", "No hidden markups"],
                  ["🚚", "Fast Delivery", "Pan-India shipping"],
                  ["🤝", "Trust First", "Verified products"]
                ].map(([icon, title, sub]) => (
                  <div key={title} className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl p-4 text-center shadow-sm">
                    <p className="text-3xl">{icon}</p>
                    <p className="font-bold text-sm text-gray-800 dark:text-white mt-1">{title}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                <h3 className="font-bold text-gray-800 dark:text-white mb-2">Our Journey So Far</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  {[
                    ["500+", "Happy Customers"],
                    ["50+", "Products"],
                    ["7", "Day Returns"],
                    ["100%", "Secure Payments"]
                  ].map(([num, label]) => (
                    <div key={label}>
                      <p className="text-2xl font-extrabold text-[#0E3F7A] dark:text-[#7fb3e0]">{num}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 text-center">Built with ❤️ in India – passionate team from Shajapur, Madhya Pradesh.</p>
              </div>
            </div>
          </div>
        )}

        {/* ---- CONTACT TAB ---- */}
        {activeTab === "contact" && (
          <div className="animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm overflow-hidden">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="p-6 md:p-8 bg-[#E3ECF3] dark:bg-slate-800">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-md flex items-center justify-center bg-white">
                      <img src="/logo.png" alt={`${SITE_NAME} Logo`} className="w-full h-full object-contain scale-110" />
                    </div>
                    <div>
                      <p className="font-black text-[#E11D2E] text-xl leading-none">विन</p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">Samruddhi Group of Industries</p>
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-[#151B20] dark:text-white">Get in Touch</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-6">We'd love to hear from you. Send us a message and we'll respond as soon as possible.</p>
                  <div className="space-y-4 text-sm">
                    <div className="flex items-start gap-3">
                      <Icon.Phone className="text-[#0E3F7A] flex-shrink-0 mt-0.5" />
                      <div><p className="font-semibold dark:text-white">Phone</p><p className="text-gray-600 dark:text-gray-400">+91 94259 40136</p></div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Icon.Mail className="text-[#0E3F7A] flex-shrink-0 mt-0.5" />
                      <div><p className="font-semibold dark:text-white">Email</p><p className="text-gray-600 dark:text-gray-400 break-all">samruddhigroupofindustries@gmail.com</p></div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Icon.Location className="text-[#0E3F7A] flex-shrink-0 mt-0.5" />
                      <div><p className="font-semibold dark:text-white">Address</p><p className="text-gray-600 dark:text-gray-400">AB Road, Shajapur, Madhya Pradesh, India</p></div>
                    </div>
                  </div>
                  <div className="mt-6 bg-white/60 dark:bg-slate-900/40 rounded-2xl p-4">
                    <p className="font-semibold text-sm dark:text-white">Business Hours</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Monday – Saturday: 9:00 AM – 7:00 PM</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Sunday: 10:00 AM – 4:00 PM</p>
                  </div>
                  <div className="flex flex-col gap-2 mt-4">
                    <a href="https://wa.me/919425940136" target="_blank" className="flex items-center gap-2 text-sm text-green-600 font-medium hover:underline">💬 Chat on WhatsApp</a>
                    <a href="https://instagram.com/samruddhi_group_of_industries" target="_blank" className="flex items-center gap-2 text-sm text-[#E11D2E] font-medium hover:underline">📸 Follow on Instagram</a>
                  </div>
                </div>
                <div className="p-6 md:p-8 bg-white dark:bg-slate-900">
                  <h3 className="text-xl font-bold text-[#151B20] dark:text-white mb-4">Send us a Message</h3>
                  <form className="space-y-4" onSubmit={handleContactSubmit}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your Name *</label>
                      <input type="text" required value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address *</label>
                      <input type="email" required value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                      <input type="tel" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your message... *</label>
                      <textarea rows="4" required value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} className="w-full border-2 border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:border-[#1975B1] outline-none resize-none" />
                    </div>
                    <button type="submit" disabled={sendingContact} className="w-full bg-[#0E3F7A] text-white py-3 rounded-xl font-semibold hover:bg-[#1975B1] transition disabled:opacity-50 flex items-center justify-center gap-2">
                      {sendingContact ? "Sending..." : "Send Message →"}
                      {!sendingContact && <Icon.Send />}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ---- FOOTER ---- */}
      <footer className="bg-[#0D1B2A] text-gray-400 mt-8">
        <div className="max-w-7xl mx-auto px-4 pt-10 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex items-center justify-center bg-white border border-white/10">
                  <img src="/logo.png" alt={`${SITE_NAME} Logo`} className="w-full h-full object-contain scale-110" />
                </div>
                <div>
                  <p className="text-[#E11D2E] font-black text-2xl leading-none tracking-wide">विन</p>
                  <p className="text-gray-400 text-xs mt-1">Samruddhi Group of Industries</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">Premium quality household products delivered to your doorstep across India.</p>
              <div className="flex items-center gap-3 mt-4">
                <a href="https://instagram.com/samruddhi_group_of_industries" target="_blank" className="w-9 h-9 bg-white/10 hover:bg-[#E4BF1A] hover:text-[#151B20] rounded-xl flex items-center justify-center transition text-gray-400">
                  <Icon.Instagram />
                </a>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Contact</h4>
              <div className="space-y-3 text-sm">
                <a href="tel:+919425940136" className="flex items-center gap-2 hover:text-[#E4BF1A] transition"><Icon.Phone /> +91 94259 40136</a>
                <a href="mailto:samruddhigroupofindustries@gmail.com" className="flex items-start gap-2 hover:text-[#E4BF1A] transition break-all"><Icon.Mail className="flex-shrink-0 mt-0.5" /> samruddhigroupofindustries@gmail.com</a>
                <div className="flex items-start gap-2"><Icon.Location /> <span>AB Road, Shajapur, MP</span></div>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
              <ul className="space-y-2.5 text-sm">
                {[["🛍️ Shop", "shop"], ["📦 My Orders", "orders"], ["ℹ️ About", "about"], ["📞 Contact", "contact"]].map(([label, tab]) => (
                  <li key={tab}>
                    <button onClick={() => setActiveTab(tab)} className="hover:text-[#E4BF1A] transition flex items-center gap-1">{label}</button>
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
            <p>© 2026 Ween by Samruddhi Group of Industries · All rights reserved</p>
            <p>Designed by <span className="text-[#E4BF1A]">Softmax.in</span></p>
          </div>
        </div>
      </footer>

      {showLoginPopup && <LoginPopup onClose={() => setShowLoginPopup(false)} onSignIn={handleGoogleSignIn} />}

      {showCart && (
        <CartSidebar cart={cart} onClose={() => setShowCart(false)} onRemove={handleRemoveFromCart} onUpdateQty={handleUpdateQty}
          onCheckout={() => { setShowCart(false); setShowCheckout(true); }}
        />
      )}

      {showCheckout && user && (
        <CheckoutModal cart={cart} user={user} onClose={() => setShowCheckout(false)} onOrderPlaced={handleOrderPlaced} />
      )}

      {showUserMenu && <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />}

      {/* WhatsApp button */}
      <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 999999 }}>
        <a href="https://wa.me/919425940136" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "60px", height: "60px", backgroundColor: "#25D366", borderRadius: "50%", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", cursor: "pointer" }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="30" height="30" fill="white">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.2-17.1-41.3-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.1 13.9 10.9-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
          </svg>
        </a>
      </div>
    </>
  );
}
