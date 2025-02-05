import React from "react";
import { useApp } from "../context/AppContext";
import { getImageUrl } from "../utils/getImageUrl";
import LazyImage from "./LazyImage";

export default function ProductCard({ product }) {
  const { addItem } = useApp();
  const imageUrl = getImageUrl(product.image_url);

  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl relative">
      <div className="relative">
        <LazyImage
          src={imageUrl}
          alt={product.name}
          className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
        />
      </div>

      <div className="p-6 text-center relative flex flex-col h-64">
        <h3 className="text-lg font-semibold text-gray-900 mt-2 leading-tight">
          {product.name}
        </h3>
        <p className="mt-2 text-sm text-gray-600 h-16 overflow-hidden">
          {product.description}
        </p>
        <p className="mt-2 text-xl font-bold text-indigo-600">
          C$ {product.price}
        </p>
        <button
          onClick={() => addItem(product)}
          className="absolute top-0 right-4 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 shadow-sm text-gray-600 transition-all duration-300 hover:bg-indigo-600 hover:text-white hover:scale-110"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M2 2h2l3.6 7.59-1.35 2.44A2 2 0 008 14h12v-2H8.42a.25.25 0 01-.22-.13l.03-.06L10.1 10h9.45a1 1 0 00.95-.69L22 4H5.21l-.94-2H2zm5 16a2 2 0 112 2 2 2 0 01-2-2zm10 0a2 2 0 112 2 2 2 0 01-2-2z" />
          </svg>
        </button>
      </div>
    </article>
  );
}
