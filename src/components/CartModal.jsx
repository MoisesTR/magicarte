import React, { useEffect } from "react";
import { Transition, TransitionChild } from "@headlessui/react";
import { getImageUrl } from "../utils/getImageUrl";
import { generateWhatsAppLinkForProducts } from "../utils/generateWhatsappLink";
import { useApp } from "../context/AppContext";
import trashIcon from "../assets/trash.svg";
import emptyBox from "../assets/empty-box.png";

export default function CartModal({ isOpen, onClose }) {
  const { cart: products, removeItem } = useApp();

  const handleWhatsAppClick = () => {
    const url = generateWhatsAppLinkForProducts(products);
    window.open(url, "_blank");
  };

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [isOpen]);

  return (
    <Transition show={isOpen} appear>
      <div
        className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <TransitionChild
          as={React.Fragment}
          enter="transition transform duration-300 ease-out"
          enterFrom="opacity-0 translate-x-full"
          enterTo="opacity-100 translate-x-0"
          leave="transition transform duration-200 ease-in"
          leaveFrom="opacity-100 translate-x-0"
          leaveTo="opacity-0 translate-x-full"
        >
          <div
            className="h-[100dvh] w-full max-w-md p-6 pt-6 flex flex-col bg-white rounded-lg shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 🔹 Botón de cerrar */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 focus:outline-none cursor-pointer"
              aria-label="Cerrar carrito"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <h2 className="text-2xl text-black font-bold text-center mb-4">
              ¡Tu Carrito!
            </h2>

            <div className="flex-grow overflow-y-auto overflow-x-hidden pr-2 space-y-4">
              {products.length > 0 ? (
                products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 border-b pb-4 last:border-0"
                  >
                    <img
                      src={getImageUrl(product.image_url)}
                      alt={product.name}
                      className="w-20 h-20 object-cover rounded-md"
                    />

                    <div className="flex-1 flex flex-col justify-center">
                      <h3 className="text-base font-medium text-black">
                        {product.name}
                      </h3>
                      <p className="text-base font-semibold text-danger">
                        C$ {product.price}
                      </p>
                    </div>

                    {/* 🔹 Botón para eliminar producto */}
                    <div className="relative group">
                      <button
                        onClick={() => removeItem(product.id)}
                        className="cursor-pointer p-1 text-danger hover:text-red-800 focus:outline-none hover:scale-110 transition-transform duration-150"
                        aria-label="Eliminar producto"
                      >
                        <img
                          src={trashIcon}
                          alt="Eliminar"
                          className="w-6 h-6"
                        />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center flex-grow">
                  <img
                    src={emptyBox}
                    alt="Carrito vacío"
                    className="max-w-xs h-auto mb-4 object-contain"
                  />
                  <p className="text-gray-500 text-lg font-bold text-center">
                    ¡Vaya! Tu carrito está vacío...
                    <br /> ¡Hora de llenarlo de sorpresas!
                  </p>
                </div>
              )}
            </div>


            <div className="flex-shrink-0 mt-4 space-y-3 pb-[env(safe-area-inset-bottom)]">
              {products.length > 0 && (
                <button
                  onClick={handleWhatsAppClick}
                  className="w-full flex items-center justify-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded shadow transition duration-200 focus:outline-none"
                >
                  <span>Enviar por WhatsApp</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="w-full flex items-center justify-center space-x-2 bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded shadow transition duration-200 focus:outline-none"
              >
                <span>Cerrar</span>
              </button>
            </div>
          </div>
        </TransitionChild>
      </div>
    </Transition>
  );
}
