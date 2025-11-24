"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ReactNode } from "react";
import OfflineIndicator from "./OfflineIndicator";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/history", label: "History", icon: "🕐" },
    { href: "/bills", label: "Bills", icon: "📄" },
    { href: "/mileage", label: "Mileage", icon: "🚗" },
    { href: "/configuration", label: "Config", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <OfflineIndicator />
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">BREATHER</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/history")}
              className="p-2 text-gray-600 hover:text-gray-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              🕐
            </button>
            <button
              onClick={() => router.push("/configuration")}
              className="p-2 text-gray-600 hover:text-gray-900 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              ⚙️
            </button>
            {session?.user && (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 min-h-[44px]"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-6">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom">
        <div className="flex justify-around items-center px-2 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg min-h-[44px] min-w-[44px] transition-colors ${
                  isActive
                    ? "text-green-600 bg-green-50"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <span className="text-xl mb-1">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

