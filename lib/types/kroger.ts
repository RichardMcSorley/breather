// Kroger API Types

export interface KrogerLocation {
  locationId: string;
  chain: string;
  name?: string;
  storeNumber?: string;
  divisionNumber?: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zipCode: string;
    county?: string;
  };
  geolocation: {
    latitude: number;
    longitude: number;
    latLng?: string;
  };
  phone?: string;
  hours?: Record<string, any>;
  departments?: Array<{
    departmentId: string;
    name: string;
    phone?: string;
    hours?: Record<string, any>;
  }>;
}

export interface KrogerProduct {
  productId: string;
  productPageURI?: string;
  upc?: string;
  brand?: string;
  description: string;
  categories?: string[];
  images?: Array<{
    id: string;
    perspective: string;
    default: boolean;
    sizes: Array<{
      id: string;
      size: string;
      url: string;
    }>;
  }>;
  items?: Array<{
    itemId: string;
    size?: string;
    price?: {
      regular: number;
      promo?: number;
      regularPerUnitEstimate?: number;
      promoPerUnitEstimate?: number;
    };
    nationalPrice?: {
      regular: number;
      promo?: number;
    };
    inventory?: {
      stockLevel?: "HIGH" | "LOW" | "TEMPORARILY_OUT_OF_STOCK";
    };
    fulfillment?: {
      curbside?: boolean;
      delivery?: boolean;
      instore?: boolean;
      shiptohome?: boolean;
    };
  }>;
  aisleLocations?: Array<{
    bayNumber?: string;
    description?: string;
    number?: string;
    numberOfFacings?: string;
    sequenceNumber?: string;
    side?: string;
    shelfNumber?: string;
    shelfPositionInBay?: string;
  }>;
  ratingsAndReviews?: {
    averageOverallRating?: number;
    totalReviewCount?: number;
  };
}

export interface KrogerProductSearchResponse {
  data: KrogerProduct[];
  meta?: {
    pagination?: {
      start: number;
      limit: number;
      total?: number;
    };
  };
}

export interface KrogerProductDetailsResponse {
  data: KrogerProduct;
  meta?: Record<string, unknown>;
}

export interface KrogerLocationSearchResponse {
  data: KrogerLocation[];
  meta?: Record<string, unknown>;
}

export interface KrogerAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface KrogerSearchParams {
  term?: string;
  brand?: string;
  productId?: string;
  locationId?: string;
  fulfillment?: string;
  start?: number;
  limit?: number;
}
