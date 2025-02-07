import { useState } from "react";
import { getImageUrl } from "../utils/getImageUrl";
import { useApp } from "../context/AppContext";
import cartIcon from "../assets/cart.svg";

export default function ProductCard({ product }) {
  const { addItem } = useApp();
  const [selectedImage, setSelectedImage] = useState(product.image_url);

  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl relative">
      <div className="relative">
        <img
          src={getImageUrl(selectedImage)}
          alt={product.name}
          className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-110"
        />
      </div>

      {product.secondary_images?.length > 0 && (
        <div className="flex justify-center gap-2 mt-2">
          <img
            src={getImageUrl(product.image_url)}
            alt="Main"
            className={`w-12 h-12 object-cover rounded-md cursor-pointer border-2 transition-all duration-200 ${
              selectedImage === product.image_url ? "border-primary scale-105" : "border-transparent hover:opacity-75"
            }`}
            onClick={() => setSelectedImage(product.image_url)}
          />

          {product.secondary_images.map((image, index) => (
            <img
              key={index}
              src={getImageUrl(image)}
              alt={`Thumbnail ${index + 1}`}
              className={`w-12 h-12 object-cover rounded-md cursor-pointer border-2 transition-all duration-200 ${
                selectedImage === image ? "border-primary scale-105" : "border-transparent hover:opacity-75"
              }`}
              onClick={() => setSelectedImage(image)}
            />
          ))}
        </div>
      )}

      <div className="p-6 text-center relative flex flex-col h-64">
        <h3 className="text-lg font-semibold text-gray-900 mt-2 leading-tight">
          {product.name}
        </h3>
        <p className="mt-2 text-sm text-gray-600 h-16 overflow-hidden">
          {product.description}
        </p>
        <p className="mt-2 text-xl font-bold text-danger">C$ {product.price}</p>

        <button
          onClick={() => addItem(product)}
          className="absolute top-0 right-4 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-lg border-2 border-[#E63946] text-[#E63946] transition-all duration-300 hover:scale-110 hover:shadow-md"
          aria-label="Agregar al carrito"
        >
          <img src={cartIcon} alt="Carrito" className="w-6 h-6 transition-all duration-300" />
        </button>
      </div>
    </article>
  );
}
