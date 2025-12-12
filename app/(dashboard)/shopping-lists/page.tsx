import { Suspense } from "react";
import Layout from "@/components/Layout";
import ShoppingListsContent from "@/components/ShoppingListsContent";

export default function ShoppingListsPage() {
  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }
      >
        <ShoppingListsContent />
      </Suspense>
    </Layout>
  );
}
