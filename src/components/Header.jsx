import { useApp } from "../context/AppContext";
import { MAGIC_ARTE } from "../utils/constants";
import instagramIcon from "../assets/icons/instagram.svg";
import facebookIcon from "../assets/icons/facebook.svg";
import cartIcon from "../assets/icons/shopping-cart.svg";

export default function Header() {
  const { cart } = useApp();
  return (
    <header className="bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 p-4 shadow-lg">
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
            <a
              href="#"
              aria-label="Cart"
              className="hover:opacity-75 transition-opacity"
            >
              <img src={cartIcon} alt="Cart" className="w-6 h-6" />
            </a>
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
