import { useApp } from "../context/AppContext";
import { MAGIC_ARTE } from "../utils/constants";
import instagramIcon from "../assets/instagram.svg";
import cartIcon from "../assets/cart.svg";
import facebookIcon from "../assets/facebook.svg";

export default function Header({ onCartClick }) {
  const { cart } = useApp();

  return (
    <header className="bg-primary text-white p-4 shadow-lg text-xl font-bold fixed top-0 left-0 w-full z-50">
      <div className="container mx-auto flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">{MAGIC_ARTE}</h1>

        <div className="flex items-center space-x-4">
          <a
            href="https://www.instagram.com/magicarte.ni/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="hover:opacity-75 transition-opacity"
          >
            <img src={instagramIcon} alt="Instagram" className="w-6 h-6" />
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61556667861230"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            className="hover:opacity-75 transition-opacity"
          >
            <img src={facebookIcon} alt="Facebook" className="w-6 h-6" />
          </a>
          <div className="relative">
            <button
              aria-label="Cart"
              className="hover:opacity-75 transition-opacity"
              onClick={onCartClick}
            >
              <img src={cartIcon} alt="Cart" className="w-6 h-6" />
            </button>
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-danger text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white shadow-md">
                {cart.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

