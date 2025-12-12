"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import Input from "./ui/Input";
import Card from "./ui/Card";

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
    <Card className="p-4 mb-4">
      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setSearchType("term")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              searchType === "term"
                ? "bg-green-600 dark:bg-green-700 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Product Name
          </button>
          <button
            onClick={() => setSearchType("brand")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              searchType === "brand"
                ? "bg-green-600 dark:bg-green-700 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Brand
          </button>
          <button
            onClick={() => setSearchType("productId")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              searchType === "productId"
                ? "bg-green-600 dark:bg-green-700 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Product ID
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              type="text"
              placeholder={
                searchType === "term"
                  ? "Search by product name (e.g., milk, bread)"
                  : searchType === "brand"
                  ? "Search by brand name (e.g., Kroger)"
                  : "Enter 13-digit product ID"
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleKeyPress}
              maxLength={searchType === "productId" ? 13 : undefined}
              className="w-full pr-10"
              disabled={loading}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchTerm.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-2 flex-shrink-0"
          >
            <Search className="w-4 h-4" />
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {searchType === "term" && searchTerm.length > 0 && searchTerm.length < 3 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Search term must be at least 3 characters
          </p>
        )}

        {searchType === "productId" && searchTerm.length > 0 && !/^\d{13}$/.test(searchTerm) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Product ID must be exactly 13 digits
          </p>
        )}
      </div>
    </Card>
  );
}

