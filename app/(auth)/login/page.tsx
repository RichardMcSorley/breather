import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/config";
import { Suspense } from "react";
import LoginPageContent from "./LoginPageContent";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }> | { callbackUrl?: string };
}) {
  const session = await getServerSession(authOptions);
  
  // Server-side redirect if already authenticated
  if (session) {
    const params = await (searchParams instanceof Promise ? searchParams : Promise.resolve(searchParams));
    redirect(params?.callbackUrl || "/dashboard");
  }

  const params = await (searchParams instanceof Promise ? searchParams : Promise.resolve(searchParams));

  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </main>
      }
    >
      <LoginPageContent callbackUrl={params?.callbackUrl} />
    </Suspense>
  );
}
