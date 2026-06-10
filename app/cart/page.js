"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';

const getCart = () => {
  if (typeof window === 'undefined') return [];
  const cart = localStorage.getItem('ween_cart');
  return cart ? JSON.parse(cart) : [];
};

const saveCart = (cart) => {
  localStorage.setItem('ween_cart', JSON.stringify(cart));
  window.dispatchEvent(new Event('cartUpdated'));
};

export default function CartPage() {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    setCart(getCart());
    const handleCartUpdate = () => setCart(getCart());
    window.addEventListener('cartUpdated', handleCartUpdate);
    return () => window.removeEventListener('cartUpdated', handleCartUpdate);
  }, []);

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      const updatedCart = cart.filter(item => item.productId !== productId);
      setCart(updatedCart);
      saveCart(updatedCart);
    } else {
      const updatedCart = cart.map(item =>
        item.productId === productId ? { ...item, quantity: newQuantity } : item
      );
      setCart(updatedCart);
      saveCart(updatedCart);
    }
  };

  const removeItem = (productId) => {
    const updatedCart = cart.filter(item => item.productId !== productId);
    setCart(updatedCart);
    saveCart(updatedCart);
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryCharge = totalAmount > 999 ? 0 : 50;
  const grandTotal = totalAmount + deliveryCharge;

  if (cart.length === 0) {
    return (
      <>
        <Head><title>Cart - Ween</title></Head>
        <div className="min-h-screen bg-gray-50">
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
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Cart - Ween</title>
        <meta name="description" content="View your cart items" />
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
            <Link href="/" className="text-sm text-blue-600">Continue Shopping</Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Your Cart</h1>
        
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="divide-y">
                {cart.map(item => (
                  <div key={item.productId} className="flex gap-4 p-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center">
                      {item.imageUrl ? <img src={item.imageUrl} className="h-16 object-cover" /> : <span className="text-3xl">📦</span>}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{item.name}</h3>
                      <p className="text-blue-600 font-bold">₹{item.price}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="w-7 h-7 bg-gray-100 rounded-full hover:bg-gray-200">-</button>
                        <span className="font-medium">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="w-7 h-7 bg-gray-100 rounded-full hover:bg-gray-200">+</button>
                        <button onClick={() => removeItem(item.productId)} className="text-red-500 text-sm ml-4">Remove</button>
                      </div>
                    </div>
                    <div className="font-bold text-lg">₹{item.price * item.quantity}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-24">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Order Summary</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>₹{totalAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery Charge</span>
                  <span>{deliveryCharge === 0 ? 'Free' : `₹${deliveryCharge}`}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-blue-600">₹{grandTotal}</span>
                  </div>
                </div>
              </div>
              <Link href="/order">
                <button className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition mt-4">
                  Proceed to Checkout
                </button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}