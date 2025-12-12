import { Suspense } from "react";
import Layout from "@/components/Layout";
import BillsContent from "@/components/BillsContent";

export default function BillsPage() {
  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        }
      >
        <BillsContent />
      </Suspense>
    </Layout>
  );
}
