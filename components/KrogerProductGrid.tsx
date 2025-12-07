"use client";

import { KrogerProduct } from "@/lib/types/kroger";
import KrogerProductCard from "./KrogerProductCard";

interface KrogerProductGridProps {
  products: KrogerProduct[];
  locationId?: string;
  loading?: boolean;
}

export default function KrogerProductGrid({
  products,
  locationId,
  loading = false,
}: KrogerProductGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 dark:border-green-400"></div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">
          No products found. Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {products.map((product) => (
        <KrogerProductCard
          key={product.productId}
          product={product}
          locationId={locationId}
        />
      ))}
    </div>
  );
}
