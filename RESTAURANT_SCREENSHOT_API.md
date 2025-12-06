# Restaurant Screenshot API Documentation

## Endpoint
`POST /api/delivery-orders/restaurant-screenshot`

## Description
Uploads a restaurant screenshot to extract restaurant name and address. The API will:
- Extract restaurant name and address from the screenshot using Moondream OCR
- Pre-search the address using Google Places API (with caching)
- Update the active order (active = true, matching appName) with restaurant information
- If it's the first restaurant: updates main restaurant fields
- If it's an additional restaurant: adds to `additionalRestaurants` array

## Request Headers
```
Content-Type: application/json
```

## Request Body
```json
{
  "userId": "string (required)",
  "screenshot": "string (required, base64 encoded image)",
  "appName": "string (required)",
  "ocrText": "string (optional, pre-extracted text from image)",
  "lat": "number (optional, user's latitude)",
  "lon": "number (optional, user's longitude)",
  "alt": "number (optional, user's altitude)",
  "address": "string (optional, user's address)"
}
```

### Field Descriptions
- **userId**: The user's unique identifier
- **screenshot**: Base64 encoded image string (can be just base64 or data URL format `data:image/png;base64,<base64>`)
- **appName**: The delivery app name (e.g., "Uber Driver", "Dasher", "GH Drivers", "Shopper")
- **ocrText**: Optional pre-extracted text from the image (helps with OCR accuracy)
- **lat**: Optional user's current latitude (helps with address search)
- **lon**: Optional user's current longitude (helps with address search)
- **alt**: Optional user's current altitude
- **address**: Optional user's current address

## Response

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Restaurant information updated successfully" | "Additional restaurant added successfully",
  "restaurantName": "string",
  "address": "string",
  "placeId": "string | undefined",
  "lat": "number | undefined",
  "lon": "number | undefined",
  "isFirstRestaurant": boolean,
  "addressFound": boolean
}
```

### Error Responses

#### 400 Bad Request - Missing Required Fields
```json
{
  "error": "Missing userId" | "Missing screenshot" | "Missing appName"
}
```

#### 404 Not Found - No Active Order
```json
{
  "error": "No active order found for this app"
}
```

#### 500 Internal Server Error - Processing Failed
```json
{
  "error": "Failed to process screenshot",
  "details": "Error message details"
}
```

## Important Notes

1. **Active Order Matching**: The API only updates orders where:
   - `active = true`
   - `appName` matches exactly (case-sensitive, trimmed)
   - `userId` matches
   - Most recent order is selected if multiple match

2. **First vs Additional Restaurant**:
   - **First restaurant**: If the order has no `restaurantAddress`, it updates the main restaurant fields (`restaurantName`, `restaurantAddress`, `restaurantPlaceId`, `restaurantLat`, `restaurantLon`)
   - **Additional restaurants**: If the order already has a `restaurantAddress`, it adds to the `additionalRestaurants` array

3. **Address Pre-search**: The API automatically searches for the address using Google Places API:
   - Uses restaurant name + extracted address as search query
   - Filters by restaurant type
   - Uses user location (lat/lon) if provided for better results
   - Results are cached for 30 days
   - If found, stores `placeId`, `lat`, `lon`, and formatted address

4. **OCR Processing**: Uses Moondream API with prompt:
   ```
   Extract the restaurant information from this image. In YAML, with keys "Restaurant Name" and "Address".
   ```

## Example Request

```bash
curl -X POST https://your-domain.com/api/delivery-orders/restaurant-screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "appName": "Uber Driver",
    "ocrText": "McDonald's\n123 Main St, City, State 12345",
    "lat": 40.7128,
    "lon": -74.0060,
    "alt": 10.5,
    "address": "123 User St, City, State"
  }'
```

## Example Response

```json
{
  "success": true,
  "message": "Restaurant information updated successfully",
  "restaurantName": "McDonald's",
  "address": "123 Main St, City, State 12345",
  "placeId": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "lat": 40.7128,
  "lon": -74.0060,
  "isFirstRestaurant": true,
  "addressFound": true
}
```

## Example Response (Additional Restaurant)

```json
{
  "success": true,
  "message": "Additional restaurant added successfully",
  "restaurantName": "Burger King",
  "address": "456 Oak Ave, City, State 12345",
  "placeId": "ChIJN1t_tDeuEmsRUsoyG83frY5",
  "lat": 40.7130,
  "lon": -74.0062,
  "isFirstRestaurant": false,
  "addressFound": true
}
```
