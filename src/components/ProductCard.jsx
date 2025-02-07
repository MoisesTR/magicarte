import React from "react";
import { useApp } from "../context/AppContext";
import { getImageUrl } from "../utils/getImageUrl";
import LazyImage from "./LazyImage";
import cartIcon from "../assets/cart.svg";

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
        <p className="mt-2 text-xl font-bold text-danger">
          C$ {product.price}
        </p>
        <button
          onClick={() => addItem(product)}
          className="absolute top-0 right-4 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full 
  bg-white shadow-lg border-2 border-[#E63946] text-[#E63946] 
  transition-all duration-300 hover:scale-110 hover:shadow-md"
          aria-label="Agregar al carrito"
        >
          <img
            src={cartIcon}
            alt="Carrito"
            className="w-6 h-6 transition-all duration-300"
          />
        </button>
      </div>
    </article>
  );
}
