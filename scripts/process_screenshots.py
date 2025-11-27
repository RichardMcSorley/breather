#!/usr/bin/env python3
"""
Script to process OCR screenshots using Moondream Station.
Reads screenshots from MongoDB and processes them with Moondream to extract information.
"""

import os
import sys
import base64
import io
import csv
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence, List, Dict, Tuple
from urllib.parse import urlparse
from pymongo import MongoClient
from PIL import Image
from dotenv import load_dotenv
import moondream as md

# Load environment variables from .env.local file
env_path = Path(__file__).parent.parent / ".env.local"
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded environment variables from {env_path}")
else:
    # Fallback to .env if .env.local doesn't exist
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✅ Loaded environment variables from {env_path}")
    else:
        print("⚠️  No .env.local or .env file found, using system environment variables")

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    print("Error: MONGODB_URI environment variable is not set")
    sys.exit(1)

# Extract database name from MONGODB_URI connection string or use environment variable
# Format: mongodb://host:port/database_name or mongodb+srv://host/database_name
# If not in connection string, you can set MONGODB_DB environment variable
MONGODB_DB = os.getenv("MONGODB_DB")
if not MONGODB_DB:
    # Try to extract from connection string
    try:
        # Handle both mongodb:// and mongodb+srv:// formats
        if "mongodb+srv://" in MONGODB_URI:
            # For mongodb+srv, database is after the host and before query params
            parts = MONGODB_URI.split("mongodb+srv://")[1]
            if "/" in parts and not parts.split("/")[1].startswith("?"):
                db_part = parts.split("/")[1]
                MONGODB_DB = db_part.split("?")[0] if "?" in db_part else db_part
            else:
                # No database name in connection string, use default
                MONGODB_DB = None
        else:
            # For standard mongodb:// format
            parsed = urlparse(MONGODB_URI)
            if parsed.path and len(parsed.path) > 1:
                MONGODB_DB = parsed.path[1:].split("?")[0]  # Remove leading '/' and query params
            else:
                MONGODB_DB = None
        
        # If still no database name, use default
        if not MONGODB_DB:
            MONGODB_DB = "breather"
            print(f"⚠️  No database name found in MONGODB_URI, using default: {MONGODB_DB}")
            print(f"   You can set MONGODB_DB environment variable to override this")
    except Exception as e:
        print(f"⚠️  Could not extract database name from MONGODB_URI: {e}")
        MONGODB_DB = "breather"
        print(f"   Using default database: {MONGODB_DB}")

# Moondream Station endpoint (default: http://localhost:2020/v1)
MOONDREAM_ENDPOINT = os.getenv("MOONDREAM_ENDPOINT", "http://localhost:2020/v1")


def base64_to_image(base64_string: str) -> Optional[Image.Image]:
    """Convert base64 string to PIL Image."""
    try:
        # Remove data URL prefix if present
        if base64_string.startswith("data:image"):
            base64_string = base64_string.split(",")[1]
        
        # Remove any whitespace
        base64_string = base64_string.strip().replace(" ", "").replace("\n", "")
        
        # Decode base64
        image_data = base64.b64decode(base64_string)
        
        # Create PIL Image from bytes
        image = Image.open(io.BytesIO(image_data))
        return image
    except Exception as e:
        print(f"Error converting base64 to image: {e}")
        return None


CSV_HEADERS = [
    "Customer Name",
    "Customer Address",
]

CSV_PROMPT = f"""
Output one tab-separated row with these columns: {", ".join(CSV_HEADERS)}.
""".strip()

def normalize_raw_text(raw_text: str) -> str:
    """Normalize raw model response into a single line TSV/CSV string."""
    raw_text = raw_text.strip()
    if not raw_text:
        return ""

    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    if not lines:
        return ""

    # If tabs already present anywhere, collapse multiple whitespace-only lines
    if any("\t" in line for line in lines):
        return "\t".join(line for line in lines if line)

    # Special case: two-column output without delimiters (name on first line, address on rest)
    if len(lines) >= 2 and "," not in lines[0]:
        name = lines[0]
        address = " ".join(lines[1:])
        return f"{name}\t{address}"

    # Otherwise treat commas/quoted CSV, even if broken across lines.
    stripped_lines = [line.rstrip(",") for line in lines]

    return ",".join(stripped_lines)


def parse_csv_row(raw_text: str) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    """Parse a TSV/CSV-formatted row into a dictionary keyed by CSV_HEADERS."""
    normalized_text = normalize_raw_text(raw_text)
    if not normalized_text:
        return None, "empty response"

    delimiter = "\t" if "\t" in normalized_text else ","

    try:
        reader = csv.reader(io.StringIO(normalized_text), delimiter=delimiter)
        rows: List[List[str]] = [row for row in reader if row]
    except csv.Error as exc:
        return None, f"parse error: {exc}"

    if not rows:
        return None, "no data rows"

    candidate: Optional[List[str]] = None
    for row in rows:
        normalized = [col.strip() for col in row]
        if not normalized:
            continue

        lowered = [col.lower() for col in normalized]
        if lowered == [header.lower() for header in CSV_HEADERS]:
            continue

        if len(normalized) >= len(CSV_HEADERS):
            candidate = normalized[-len(CSV_HEADERS):]

    if candidate is None:
        return None, "no row with expected column count"

    if len(candidate) != len(CSV_HEADERS):
        return None, f"expected {len(CSV_HEADERS)} columns, got {len(candidate)}"

    result: Dict[str, str] = {}
    for idx, header in enumerate(CSV_HEADERS):
        result[header] = candidate[idx].strip()
    return result, None


def validate_csv_row(row: Dict[str, str]) -> Optional[str]:
    """Validate row contents and return error message if invalid."""
    for header in CSV_HEADERS:
        value = row.get(header, "").strip()
        if value and value.lower().startswith(header.lower()):
            return f"{header} still contains placeholder text"
    return None


def request_csv_row(image: Image.Image, model, max_attempts: int = 3) -> Tuple[Dict[str, str], str]:
    """Request TSV-formatted data from Moondream with retries."""
    last_error: Optional[str] = None
    current_prompt = CSV_PROMPT

    for attempt in range(max_attempts):
        if attempt > 0:
            current_prompt = (
                f"{CSV_PROMPT}\n\n"
                f"The previous response was invalid because {last_error or 'it could not be parsed'}. "
                f"Respond again with only one line containing exactly {len(CSV_HEADERS)} tab-separated fields in the specified order."
            )

        csv_query_result = model.query(image, current_prompt)
        raw_csv = csv_query_result.get("answer", "").strip()
        print(f"   Raw CSV response: {raw_csv}")

        parsed_row, parse_error = parse_csv_row(raw_csv)
        if parsed_row:
            validation_error = validate_csv_row(parsed_row)
            if not validation_error:
                return parsed_row, raw_csv
            last_error = validation_error
        else:
            last_error = parse_error or "unknown parsing error"

    raise ValueError(f"Failed to obtain valid CSV row after {max_attempts} attempts: {last_error}")


def process_screenshot(image: Image.Image, model) -> dict:
    """Process a screenshot with Moondream and extract relevant information."""
    results = {}

    try:
        print("  💬 Requesting CSV data from Moondream...")
        parsed_row, csv_answer = request_csv_row(image, model)
        results["csv_row"] = parsed_row
        results["csv_raw"] = csv_answer
        print(f"     Raw CSV response: {csv_answer}")
    except Exception as e:
        print(f"  ❌ Error processing screenshot: {e}")
        results["error"] = str(e)

    return results


def process_once(model, exports_collection, ocr_collection, collection_name):
    """Process all available screenshots once."""
    print(f"\n🔍 Fetching OCR entries with screenshots from '{collection_name}'...")
    
    # First, check total entries
    total_entries = ocr_collection.count_documents({})
    print(f"   Total entries in collection: {total_entries}")
    
    entries_with_screenshots = ocr_collection.count_documents({"screenshot": {"$exists": True, "$ne": None}})
    print(f"   Entries with screenshots: {entries_with_screenshots}")
    
    entries = list(ocr_collection.find({"screenshot": {"$exists": True, "$ne": None}}).sort("createdAt", -1))
    
    if not entries:
        print("   ⚠️  No entries with screenshots found.")
        if total_entries > 0:
            print(f"   💡 Found {total_entries} total entries, but none have screenshots.")
            # Show a sample entry to help debug
            sample = ocr_collection.find_one({})
            if sample:
                print(f"   Sample entry keys: {list(sample.keys())}")
        return
    
    print(f"   Found {len(entries)} entries with screenshots\n")

    for i, entry in enumerate(entries, 1):
        entry_id = str(entry["_id"])
        user_id = entry.get("userId", "unknown")
        created_at = entry.get("createdAt", "unknown")
        screenshot = entry.get("screenshot")

        print(f"\n{'='*80}")
        print(f"Entry {i}/{len(entries)}")
        print(f"ID: {entry_id}")
        print(f"User ID: {user_id}")
        print(f"Created At: {created_at}")
        print(f"{'='*80}")

        if not screenshot:
            print("  ⚠️  No screenshot found, skipping...")
            continue

        print("  🖼️  Converting base64 to image...")
        image = base64_to_image(screenshot)

        if not image:
            print("  ❌ Failed to convert base64 to image, skipping...")
            continue

        print(f"  ✅ Image loaded: {image.size[0]}x{image.size[1]} pixels")

        results = process_screenshot(image, model)

        print(f"\n  📊 Summary:")

        if "error" in results:
            print(f"     ⚠️  Error: {results['error']}")
            continue

        csv_row = results.get("csv_row")
        if not csv_row:
            print("     ⚠️  No CSV row parsed.")
            continue

        print(f"     TSV Row: {csv_row}")

        now = datetime.utcnow()
        export_doc = {
            "entryId": entry_id,
            "userId": user_id,
            "customerName": csv_row.get("Customer Name", ""),
            "customerAddress": csv_row.get("Customer Address", ""),
            "rawResponse": results.get("csv_raw", ""),
            "processedAt": now,
            "updatedAt": now,
        }

        exports_collection.update_one(
            {"entryId": entry_id},
            {
                "$set": export_doc,
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )

        print("     💾 Saved export to ocr_exports collection")

        delete_result = ocr_collection.delete_one({"_id": entry["_id"]})
        if delete_result.deleted_count:
            print("     🗑️  Original OCR entry deleted from source collection")

    print(f"\n{'='*80}")
    print(f"✅ Processing complete! Processed {len(entries)} entries.")
    print(f"{'='*80}\n")
    print("💾 CSV export skipped — data stored directly in MongoDB (ocr_exports).")


def prepare_collections(client: MongoClient):
    """Prepare database and collection handles using the same logic as the original script."""
    # Debug: List available databases
    print(f"\n🔍 Debugging database connection...")
    available_dbs = client.list_database_names()
    print(f"   Available databases: {available_dbs}")
    
    # Try to find the database with OCR collection
    db = None
    ocr_collection = None
    collection_name = None
    found_db_name = None
    
    # First, try the specified/default database
    if MONGODB_DB in available_dbs:
        db = client[MONGODB_DB]
        found_db_name = MONGODB_DB
        print(f"   ✅ Database '{MONGODB_DB}' exists")
    else:
        print(f"   ⚠️  Database '{MONGODB_DB}' not found")
        # Search through all databases for OCR collection
        print(f"   🔍 Searching for OCR collection in all databases...")
        possible_collections = ["ocrtexts", "ocrtext", "ocr_texts", "ocr_text"]
        
        for db_name in available_dbs:
            if db_name in ["admin", "local", "config"]:
                continue  # Skip system databases
            test_db = client[db_name]
            collections = test_db.list_collection_names()
            print(f"      Checking '{db_name}': {collections}")
            
            for coll_name in possible_collections:
                if coll_name in collections:
                    db = test_db
                    ocr_collection = db[coll_name]
                    collection_name = coll_name
                    found_db_name = db_name
                    print(f"   ✅ Found collection '{coll_name}' in database '{db_name}'")
                    break
            
            if ocr_collection is not None:
                break
    
    if db is None:
        print(f"   ❌ Could not find database with OCR collection")
        print(f"   Please set MONGODB_DB environment variable to the correct database name")
        raise RuntimeError("No database with OCR collection found")
    
    if ocr_collection is None:
        # Collection not found yet, try to find it in the selected database
        print(f"   Collections in '{found_db_name}': {db.list_collection_names()}")
        possible_collections = ["ocrtexts", "ocrtext", "ocr_texts", "ocr_text"]
        
        for coll_name in possible_collections:
            if coll_name in db.list_collection_names():
                ocr_collection = db[coll_name]
                collection_name = coll_name
                print(f"   ✅ Found collection: {coll_name}")
                break
        
        if ocr_collection is None:
            print(f"   ⚠️  No OCR collection found. Available collections: {db.list_collection_names()}")
            print(f"   Trying 'ocrtexts' as default...")
            ocr_collection = db.ocrtexts
            collection_name = "ocrtexts"
    
    print(f"   Using database: '{found_db_name}', collection: '{collection_name}'")
    EXPORT_COLLECTION_NAME = "ocrexports"
    exports_collection = db[EXPORT_COLLECTION_NAME]
    
    return db, ocr_collection, exports_collection, collection_name


def main():
    """Continuously process OCR screenshots."""
    print("🚀 Starting screenshot processing with Moondream Station")
    print(f"📡 Connecting to Moondream Station at {MOONDREAM_ENDPOINT}")

    try:
        model = md.vl(endpoint=MOONDREAM_ENDPOINT)
        print("✅ Connected to Moondream Station")
    except Exception as e:
        print(f"❌ Failed to connect to Moondream Station: {e}")
        print("   Make sure Moondream Station is running: moondream-station")
        sys.exit(1)

    print(f"📦 Connecting to MongoDB...")
    try:
        client = MongoClient(MONGODB_URI)
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        sys.exit(1)

    polling_interval = int(os.getenv("OCR_POLL_INTERVAL", "2"))
    print(f"⏱️  Polling every {polling_interval} seconds. Press Ctrl+C to stop.")

    try:
        db, ocr_collection, exports_collection, collection_name = prepare_collections(client)
    except Exception as prep_error:
        print(f"❌ Failed to prepare collections: {prep_error}")
        client.close()
        sys.exit(1)

    try:
        while True:
            try:
                process_once(model, exports_collection, ocr_collection, collection_name)
            except Exception as loop_error:
                print(f"❌ Error during processing loop: {loop_error}")
            print(f"⏳ Sleeping for {polling_interval} seconds...\n")
            time.sleep(polling_interval)
    except KeyboardInterrupt:
        print("\n🛑 Stopping processing loop (Ctrl+C received).")
    finally:
        client.close()
        print("👋 MongoDB connection closed. Goodbye!")


if __name__ == "__main__":
    main()

