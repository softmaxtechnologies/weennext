"use client";

import Link from "next/link";
import { Stars } from "./Icons";
import { slugify } from "@/lib/utils";

export const ProductCard = ({ product, onAddToCart, view }) => {
  const href = `/products/${slugify(product.name)}`;
  const isGrid = view === "grid";

  return isGrid ? (
    <Link
      href={href}
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer group hover:-translate-y-0.5 border border-gray-100 dark:border-slate-800 block"
    >
      <div className="relative bg-[#EFF4F8] dark:bg-slate-800 aspect-square overflow-hidden">
        <img
          src={product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : "https://placehold.co/400x400?text=Product"}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
        />
        {product.stock <= 5 && product.stock > 0 && (
          <span className="absolute top-2 left-2 bg-[#E4BF1A] text-[#151B20] text-xs px-2 py-0.5 rounded-full font-semibold">Only {product.stock} left</span>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-white/70 dark:bg-black/60 flex items-center justify-center">
            <span className="bg-gray-800 text-white text-xs px-3 py-1 rounded-full font-semibold">Out of Stock</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <span className="text-xs text-[#0E3F7A] dark:text-[#7fb3e0] font-semibold bg-[#E3ECF3] dark:bg-slate-800 px-2 py-0.5 rounded-full">{product.category}</span>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm mt-1.5 line-clamp-2 leading-snug">{product.name}</h3>
        <div className="flex items-center gap-1 mt-1">
          <Stars rating={product.rating || 4.5} />
          <span className="text-xs text-gray-400">({product.rating || 4.5})</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-lg font-extrabold text-[#0E3F7A] dark:text-[#7fb3e0]">₹{product.price.toLocaleString()}</span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToCart(product, 1); }}
            disabled={product.stock === 0}
            className="bg-[#0E3F7A] hover:bg-[#1975B1] text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Add
          </button>
        </div>
      </div>
    </Link>
  ) : (
    <Link href={href} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden cursor-pointer group flex gap-4 p-4 border border-gray-100 dark:border-slate-800">
      <div className="w-24 h-24 bg-[#EFF4F8] dark:bg-slate-800 rounded-xl flex-shrink-0 overflow-hidden">
        <img
          src={product.imageBase64 ? `data:image/jpeg;base64,${product.imageBase64}` : "https://placehold.co/400x400?text=Product"}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => (e.target.src = "https://placehold.co/400x400?text=Product")}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-[#0E3F7A] dark:text-[#7fb3e0] font-semibold">{product.category}</span>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mt-0.5 line-clamp-1">{product.name}</h3>
        <Stars rating={product.rating || 4.5} />
        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{product.description}</p>
      </div>
      <div className="flex flex-col items-end justify-between flex-shrink-0">
        <span className="text-xl font-extrabold text-[#0E3F7A] dark:text-[#7fb3e0]">₹{product.price.toLocaleString()}</span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToCart(product, 1); }}
          disabled={product.stock === 0}
          className="bg-[#0E3F7A] text-white text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 transition hover:bg-[#1975B1]"
        >
          Add to Cart
        </button>
      </div>
    </Link>
  );
};

export const ShimmerCard = ({ view }) => {
  if (view === "grid") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-slate-800 animate-pulse">
        <div className="bg-gray-200 dark:bg-slate-800 aspect-square" />
        <div className="p-3 space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-slate-800 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-3/4" />
          <div className="flex gap-1">
            <div className="h-3 w-3 bg-gray-200 dark:bg-slate-800 rounded-full" />
            <div className="h-3 w-3 bg-gray-200 dark:bg-slate-800 rounded-full" />
            <div className="h-3 w-3 bg-gray-200 dark:bg-slate-800 rounded-full" />
          </div>
          <div className="flex justify-between">
            <div className="h-5 bg-gray-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-8 bg-gray-200 dark:bg-slate-800 rounded w-1/4" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-slate-800 animate-pulse flex gap-4 p-4">
      <div className="w-24 h-24 bg-gray-200 dark:bg-slate-800 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-200 dark:bg-slate-800 rounded w-1/4" />
        <div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-3/4" />
        <div className="flex gap-1">
          <div className="h-3 w-3 bg-gray-200 dark:bg-slate-800 rounded-full" />
          <div className="h-3 w-3 bg-gray-200 dark:bg-slate-800 rounded-full" />
          <div className="h-3 w-3 bg-gray-200 dark:bg-slate-800 rounded-full" />
        </div>
        <div className="h-3 bg-gray-200 dark:bg-slate-800 rounded w-1/2" />
      </div>
      <div className="flex flex-col justify-between items-end">
        <div className="h-5 bg-gray-200 dark:bg-slate-800 rounded w-16" />
        <div className="h-8 bg-gray-200 dark:bg-slate-800 rounded w-20" />
      </div>
    </div>
  );
};
