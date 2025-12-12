import { Suspense } from "react";
import Layout from "@/components/Layout";
import DashboardContent from "@/components/DashboardContent";

function getTodayDateString() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const initialDate = getTodayDateString();
  const initialViewMode: "day" | "month" | "year" = "day";

  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        }
      >
        <DashboardContent initialDate={initialDate} initialViewMode={initialViewMode} />
      </Suspense>
    </Layout>
  );
}
