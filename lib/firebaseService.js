import { 
  db, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, convertTimestamps, getDocumentWithId
} from './firebase';

// ============================================
// PRODUCT SERVICES
// ============================================

export const getAllProducts = async (category = null, search = null) => {
  let constraints = [orderBy('createdAt', 'desc')];
  if (category && category !== 'all') {
    constraints.unshift(where('category', '==', category));
  }
  const q = query(collection(db, 'products'), ...constraints);
  const querySnapshot = await getDocs(q);
  let products = querySnapshot.docs.map(doc => ({ 
    id: doc.id, 
    ...convertTimestamps(doc.data()) 
  }));
  
  if (search) {
    const s = search.toLowerCase();
    products = products.filter(p => 
      p.name?.toLowerCase().includes(s) || 
      p.category?.toLowerCase().includes(s) ||
      p.description?.toLowerCase().includes(s)
    );
  }
  return products;
};

export const getProductById = async (id) => {
  return getDocumentWithId(doc(db, 'products', id));
};

export const getCategories = async () => {
  const products = await getAllProducts();
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  return categories;
};

export const getFeaturedProducts = async (limitCount = 6) => {
  const products = await getAllProducts();
  return products.slice(0, limitCount);
};

// ============================================
// CART SERVICES (Local Storage)
// ============================================

export const getCart = () => {
  if (typeof window === 'undefined') return [];
  return JSON.parse(localStorage.getItem('cart') || '[]');
};

export const addToCart = (product, quantity = 1) => {
  let cart = getCart();
  const existingIndex = cart.findIndex(i => i.id === product.id);
  
  if (existingIndex >= 0) {
    cart[existingIndex].quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      imageBase64: product.imageBase64,
      quantity: quantity,
      stock: product.stock
    });
  }
  
  localStorage.setItem('cart', JSON.stringify(cart));
  window.dispatchEvent(new Event('cartUpdated'));
  return cart;
};

export const removeFromCart = (productId) => {
  let cart = getCart().filter(i => i.id !== productId);
  localStorage.setItem('cart', JSON.stringify(cart));
  window.dispatchEvent(new Event('cartUpdated'));
  return cart;
};

export const updateCartQuantity = (productId, quantity) => {
  let cart = getCart();
  const index = cart.findIndex(i => i.id === productId);
  
  if (index >= 0) {
    if (quantity <= 0) {
      cart.splice(index, 1);
    } else {
      cart[index].quantity = quantity;
    }
  }
  
  localStorage.setItem('cart', JSON.stringify(cart));
  window.dispatchEvent(new Event('cartUpdated'));
  return cart;
};

export const clearCart = () => {
  localStorage.removeItem('cart');
  window.dispatchEvent(new Event('cartUpdated'));
};

export const getCartCount = () => {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
};

export const getCartTotal = () => {
  return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

// ============================================
// ORDER SERVICES
// ============================================

export const createOrder = async (userId, userEmail, userName, cart, deliveryAddress, paymentMethod) => {
  const items = cart.map(item => ({
    productId: item.id,
    productName: item.name,
    quantity: item.quantity,
    price: item.price,
    total: item.price * item.quantity
  }));
  
  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
  const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
  
  const orderData = {
    userId,
    userEmail,
    userName,
    orderId,
    items,
    totalAmount,
    status: 'pending',
    paymentMethod,
    paymentStatus: 'pending',
    deliveryAddress,
    orderDate: new Date(),
    createdAt: new Date()
  };
  
  const docRef = await addDoc(collection(db, 'orders'), orderData);
  
  // Update product stocks
  for (const item of items) {
    const productRef = doc(db, 'products', item.productId);
    const product = await getDocumentWithId(productRef);
    if (product) {
      await updateDoc(productRef, { stock: product.stock - item.quantity });
    }
  }
  
  return { id: docRef.id, ...orderData };
};

export const getOrdersByUser = async (userId) => {
  const q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('orderDate', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
};

export const getOrderById = async (orderId) => {
  return getDocumentWithId(doc(db, 'orders', orderId));
};

// ============================================
// FEEDBACK SERVICES
// ============================================

export const createFeedback = async (userId, userName, userEmail, rating, comment, productId = null, productName = null) => {
  const feedbackData = {
    userId,
    userName,
    userEmail,
    rating,
    comment,
    productId,
    productName,
    createdAt: new Date(),
    isPublished: true
  };
  
  const docRef = await addDoc(collection(db, 'feedbacks'), feedbackData);
  return { id: docRef.id, ...feedbackData };
};

export const getFeedbacks = async (productId = null) => {
  let constraints = [orderBy('createdAt', 'desc')];
  if (productId) {
    constraints.unshift(where('productId', '==', productId));
  }
  const q = query(collection(db, 'feedbacks'), ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
};

export const getUserFeedbacks = async (userId) => {
  const q = query(collection(db, 'feedbacks'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamps(doc.data()) }));
};

export const getAverageRating = async (productId = null) => {
  const feedbacks = await getFeedbacks(productId);
  if (feedbacks.length === 0) return 0;
  const total = feedbacks.reduce((sum, f) => sum + f.rating, 0);
  return (total / feedbacks.length).toFixed(1);
};