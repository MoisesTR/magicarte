import ProductCard from "../components/ProductCard";
import { useSupabaseQuery } from "../hooks/useSupabaseQuery";
import { TABLE } from "../utils/constants";

export default function Products({ selectedCategory }) {
  const { data: products = [] } = useSupabaseQuery(TABLE.PRODUCT);
  const productFilter = (product) =>
    !selectedCategory ||
    selectedCategory.name === "Todos" ||
    product.category_id === selectedCategory.id;
  const productsToShow = products.filter(productFilter);

  return (
    <section className="py-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {productsToShow.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
