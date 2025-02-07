import Products from "./Products";
import { useEffect, useState } from "react";
import { useSupabaseQuery } from "../hooks/useSupabaseQuery";
import Footer from "../components/Footer";
import Header from "../components/Header";
import AppProvider from "../context/AppContext";
import { TABLE } from "../utils/constants";

export default function Home() {
  const order = { column: "order" };
  const { data: categories = [] } = useSupabaseQuery(TABLE.CATEGORIES, { order });

  const modifiedCategories =
    categories.length > 0 && categories[0].name !== "Todos"
      ? [{ id: 0, name: "Todos" }, ...categories]
      : categories;

  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    if (!selectedCategory && modifiedCategories.length > 0) {
      setSelectedCategory(modifiedCategories[0]);
    }
  }, [modifiedCategories, selectedCategory]);

  return (
    <AppProvider>
      <div className="bg-gray-50 min-h-screen">
        <Header />
        <main className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <section className="mb-8 text-center">
            {/* <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Explora por Categoría
            </h2> */}
            <div className="flex flex-wrap justify-center gap-3">
              {modifiedCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-in-out cursor-pointer
           ${
             selectedCategory?.id === category.id
               ? "bg-primary text-white shadow-xl scale-110"
               : "bg-gray-200 text-gray-700 hover:bg-[#FFC8D0] hover:text-white hover:shadow"
           }
         `}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>

          <Products selectedCategory={selectedCategory} />
        </main>

        <Footer></Footer>
      </div>
    </AppProvider>
  );
}
