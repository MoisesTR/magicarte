import { MAGIC_ARTE } from "../utils/constants";

export default function Header() {
    return (
      <header className="bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 p-4 text-white text-center shadow-lg">
        <h1 className="text-3xl font-bold">{MAGIC_ARTE}</h1>
      </header>
    );
  }
  