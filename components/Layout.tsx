"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ReactNode } from "react";
import OfflineIndicator from "./OfflineIndicator";
import { useTheme } from "./ThemeProvider";
import ToastContainer from "./ui/Toast";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/history", label: "Logs", icon: "🕐" },
    { href: "/bills", label: "Bills", icon: "📄" },
    { href: "/mileage", label: "Mileage", icon: "🚗" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <ToastContainer />
      <OfflineIndicator />
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 safe-area-inset-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Breather</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              onClick={() => router.push("/configuration")}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Settings"
            >
              ⚙️
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className={`text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 min-h-[44px] ${
                session?.user ? "" : "invisible pointer-events-none"
              }`}
              aria-label="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-inset-bottom">
        <div className="flex justify-around items-center px-2 py-2" style={{ paddingBottom: `max(0.125rem, calc(env(safe-area-inset-bottom) * 0.3))` }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg min-h-[44px] min-w-[44px] transition-colors ${
                  isActive
                    ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
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

