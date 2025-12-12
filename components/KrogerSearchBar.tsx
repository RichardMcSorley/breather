"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import Input from "./ui/Input";

interface KrogerSearchBarProps {
  onSearch: (term: string, searchType: "term" | "brand" | "productId") => void;
  loading?: boolean;
}

export default function KrogerSearchBar({
  onSearch,
  loading = false,
}: KrogerSearchBarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<"term" | "brand" | "productId">("term");

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      return;
    }

    // Validate productId format if that's the selected type
    if (searchType === "productId" && !/^\d{13}$/.test(searchTerm.trim())) {
      return;
    }

    onSearch(searchTerm.trim(), searchType);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-400 dark:text-gray-400 uppercase tracking-wide">
        PRODUCT
      </label>
      
      {/* Search Type Tabs */}
      <div className="flex gap-1 bg-[#0f1115] dark:bg-[#0f1115] p-1 rounded-lg">
        <button
          onClick={() => setSearchType("term")}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
            searchType === "term"
              ? "bg-[#1a1d2e] dark:bg-[#1a1d2e] text-white border border-gray-600"
              : "bg-transparent text-gray-400 dark:text-gray-400 hover:text-gray-300"
          }`}
        >
          Name
        </button>
        <button
          onClick={() => setSearchType("brand")}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
            searchType === "brand"
              ? "bg-[#1a1d2e] dark:bg-[#1a1d2e] text-white border border-gray-600"
              : "bg-transparent text-gray-400 dark:text-gray-400 hover:text-gray-300"
          }`}
        >
          Brand
        </button>
        <button
          onClick={() => setSearchType("productId")}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
            searchType === "productId"
              ? "bg-[#1a1d2e] dark:bg-[#1a1d2e] text-white border border-gray-600"
              : "bg-transparent text-gray-400 dark:text-gray-400 hover:text-gray-300"
          }`}
        >
          ID
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={handleKeyPress}
          maxLength={searchType === "productId" ? 13 : undefined}
          className="w-full pr-11 bg-black dark:bg-black border-gray-600 dark:border-gray-600 text-white placeholder:text-gray-400 rounded-lg"
          disabled={loading}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-400">
          <Search className="w-5 h-5" />
        </div>
      </div>

      {searchType === "term" && searchTerm.length > 0 && searchTerm.length < 3 && (
        <p className="text-sm text-gray-400 dark:text-gray-400">
          Search term must be at least 3 characters
        </p>
      )}

      {searchType === "productId" && searchTerm.length > 0 && !/^\d{13}$/.test(searchTerm) && (
        <p className="text-sm text-red-400 dark:text-red-400">
          Product ID must be exactly 13 digits
        </p>
      )}
    </div>
  );
}

