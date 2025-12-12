"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ReactNode, useState } from "react";
import { BarChart3, Clock, FileText, Car, Menu, Settings, Eye, EyeOff, ShoppingCart } from "lucide-react";
import ToastContainer from "./ui/Toast";
import HamburgerMenu from "./HamburgerMenu";
import { usePrivacyMode } from "./PrivacyModeProvider";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isPrivacyModeEnabled, togglePrivacyMode } = usePrivacyMode();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
    { href: "/history", label: "Logs", icon: Clock },
    { href: "/bills", label: "Bills", icon: FileText },
    { href: "/mileage", label: "Mileage", icon: Car },
    { href: "/shopping-lists", label: "Kroger", icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <ToastContainer />
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 safe-area-inset-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMenuOpen(true)}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Breather</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePrivacyMode}
              className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center ${
                isPrivacyModeEnabled
                  ? "text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
              aria-label={isPrivacyModeEnabled ? "Disable privacy mode" : "Enable privacy mode"}
              title={isPrivacyModeEnabled ? "Privacy mode: ON" : "Privacy mode: OFF"}
            >
              {isPrivacyModeEnabled ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => router.push("/configuration")}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
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

      <HamburgerMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <nav 
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-inset-bottom z-50" 
        style={{ 
          transform: 'translateZ(0)', 
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden'
        }}
      >
        <div className="flex justify-around items-center px-2 py-2" style={{ paddingBottom: `max(0.125rem, calc(env(safe-area-inset-bottom) * 0.3))` }}>
          {navItems.map((item) => {
            // For shopping-lists, also match detail pages
            const isActive = pathname === item.href || (item.href === "/shopping-lists" && pathname?.startsWith("/shopping-lists"));
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
                <item.icon className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

