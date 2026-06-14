import os
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load env: try local .env first, then fall back to frontend .env (dev mode)
load_dotenv()  # loads backend/.env if it exists
load_dotenv('../frontend/.env')  # fallback for local dev

# Railway/production sets these as env vars directly
# Local dev reads from .env files
url: str = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key: str = os.environ.get("VITE_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = None
if url and key:
    supabase = create_client(url, key)
else:
    logger.warning("Supabase URL or Key not found in environment variables.")
