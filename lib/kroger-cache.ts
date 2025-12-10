// Kroger API Caching Utilities
// Search queries: 4 hours
// Product details: 7 days
// Now uses MongoDB for persistent caching

import KrogerCache from "./models/KrogerCache";
import connectDB from "./mongodb";

class KrogerCacheService {
  // 4 hours in milliseconds
  private readonly SEARCH_TTL = 4 * 60 * 60 * 1000;
  
  // 7 days in milliseconds
  private readonly PRODUCT_DETAILS_TTL = 7 * 24 * 60 * 60 * 1000;

  private getCacheKey(type: "search" | "product", key: string): string {
    return `kroger:${type}:${key}`;
  }

  async getSearch(key: string): Promise<any | null> {
    try {
      await connectDB();
      const cacheKey = this.getCacheKey("search", key);
      
      const entry = await KrogerCache.findOne({
        cacheKey,
        expiresAt: { $gt: new Date() },
      });

      if (!entry) {
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error("Error getting search cache:", error);
      return null;
    }
  }

  async setSearch(key: string, data: any): Promise<void> {
    try {
      await connectDB();
      const cacheKey = this.getCacheKey("search", key);
      const expiresAt = new Date(Date.now() + this.SEARCH_TTL);

      await KrogerCache.findOneAndUpdate(
        { cacheKey },
        {
          cacheKey,
          cacheType: "search",
          data,
          expiresAt,
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error("Error setting search cache:", error);
    }
  }

  async getProductDetails(productId: string, locationId?: string): Promise<any | null> {
    try {
      await connectDB();
      const cacheKey = this.getCacheKey("product", `${productId}:${locationId || "none"}`);
      
      const entry = await KrogerCache.findOne({
        cacheKey,
        expiresAt: { $gt: new Date() },
      });

      if (!entry) {
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error("Error getting product details cache:", error);
      return null;
    }
  }

  async setProductDetails(productId: string, data: any, locationId?: string): Promise<void> {
    try {
      await connectDB();
      const cacheKey = this.getCacheKey("product", `${productId}:${locationId || "none"}`);
      const expiresAt = new Date(Date.now() + this.PRODUCT_DETAILS_TTL);

      await KrogerCache.findOneAndUpdate(
        { cacheKey },
        {
          cacheKey,
          cacheType: "product",
          data,
          expiresAt,
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error("Error setting product details cache:", error);
    }
  }

  // Clean up expired entries (can be called periodically)
  async cleanup(): Promise<number> {
    try {
      await connectDB();
      const result = await KrogerCache.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      return result.deletedCount || 0;
    } catch (error) {
      console.error("Error cleaning up cache:", error);
      return 0;
    }
  }

  // Clear all cache (useful for testing or manual invalidation)
  async clear(): Promise<void> {
    try {
      await connectDB();
      await KrogerCache.deleteMany({});
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }

  // Get cache stats (useful for debugging)
  async getStats(): Promise<{ size: number; searchCount: number; productCount: number }> {
    try {
      await connectDB();
      const total = await KrogerCache.countDocuments();
      const searchCount = await KrogerCache.countDocuments({ cacheType: "search" });
      const productCount = await KrogerCache.countDocuments({ cacheType: "product" });
      
      return {
        size: total,
        searchCount,
        productCount,
      };
    } catch (error) {
      console.error("Error getting cache stats:", error);
      return { size: 0, searchCount: 0, productCount: 0 };
    }
  }

  // Invalidate a specific product cache (useful when product is updated)
  async invalidateProduct(productId: string, locationId?: string): Promise<void> {
    try {
      await connectDB();
      const cacheKey = this.getCacheKey("product", `${productId}:${locationId || "none"}`);
      await KrogerCache.deleteOne({ cacheKey });
    } catch (error) {
      console.error("Error invalidating product cache:", error);
    }
  }
}

// Singleton instance
export const krogerCache = new KrogerCacheService();
