import React from "react";
import { useEffect } from "react";
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
            className="h-[100vh] w-full max-w-md p-6 pt-6 flex flex-col bg-white rounded-lg shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
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

            {/* 🔹 Título del carrito con mejor espaciado */}
            <h2 className="text-2xl text-black font-bold text-center mb-4">
              ¡Tu Carrito!
            </h2>

            {/* 🔹 Lista de productos */}
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
                <div className="flex flex-col items-center justify-center h-full">
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

            {products.length > 0 && (
              <div className="flex-shrink-0 mt-4 space-y-3">
                <button
                  onClick={handleWhatsAppClick}
                  className="w-full flex items-center justify-center space-x-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded shadow transition duration-200 focus:outline-none"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.967-.94 1.164-.173.198-.347.223-.644.074-.297-.148-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.074-.148-.67-1.617-.918-2.21-.242-.579-.487-.5-.67-.51-.173-.009-.371-.011-.57-.011-.198 0-.52.074-.793.371-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.006-1.413.248-.696.248-1.291.173-1.414-.074-.124-.272-.198-.57-.347z" />
                    <path d="M20.52 3.48A11.94 11.94 0 0012 0C5.372 0 0 5.373 0 12c0 2.12.556 4.15 1.61 5.98L0 24l6.32-1.66A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12 0-3.203-1.254-6.21-3.48-8.52zM12 21.54c-1.83 0-3.63-.49-5.22-1.42l-.373-.222-3.75.987.997-3.65-.242-.38A9.46 9.46 0 012.46 12c0-5.245 4.255-9.5 9.5-9.5S21.46 6.755 21.46 12 17.205 21.54 12 21.54z" />
                  </svg>
                  <span>Enviar por WhatsApp</span>
                </button>

                <button
                  onClick={onClose}
                  className="w-full flex items-center justify-center space-x-2 bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded shadow transition duration-200 focus:outline-none"
                >
                  <span>Cerrar</span>
                </button>
              </div>
            )}
          </div>
        </TransitionChild>
      </div>
    </Transition>
  );
}
