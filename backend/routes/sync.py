# routes/sync.py
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from auth.dependencies import get_user_main_db

router = APIRouter()

# ============================================================
# 🔹 1. GET — Retrieve SyncCreds from the active schema
# ============================================================
@router.get("/sync-config")
def get_sync_config(schema: str, db: Session = Depends(get_user_main_db)):
    """
    Retrieve host, port, and username from SyncCreds table
    inside the current municipal schema (e.g. PH0403406_Calauan).
    """
    try:
        current_db = db.execute(text("SELECT current_database()")).scalar()
        print(f"📡 Connected to DB={current_db}, schema={schema} (GET /sync-config)")

        query = text(f"""
            SELECT host, port, username
            FROM "{schema}"."SyncCreds"
            ORDER BY id DESC
            LIMIT 1
        """)
        row = db.execute(query).mappings().first()

        if not row:
            return {
                "status": "empty",
                "message": f"No SyncCreds found in schema {schema}"
            }

        print(f"✅ Loaded SyncCreds from {schema}: {row}")
        return {
            "status": "success",
            "host": row["host"],
            "port": row["port"],
            "username": row["username"]
        }

    except Exception as e:
        print(f"❌ Error retrieving SyncCreds from {schema}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 🔹 2. POST — Save or update SyncCreds inside the schema
# ============================================================
@router.post("/sync-config")
async def save_sync_config(request: Request, db: Session = Depends(get_user_main_db)):
    """
    Save or update sync credentials (host, port, username)
    into the SyncCreds table within the selected schema.
    """
    data = await request.json()
    schema = data.get("schema")
    host = data.get("host")
    port = data.get("port")
    username = data.get("username")

    if not schema or not host or not port or not username:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: schema, host, port, username"
        )

    try:
        current_db = db.execute(text("SELECT current_database()")).scalar()
        print(f"📡 Connected to DB={current_db}, schema={schema} (POST /sync-config)")

        # Ensure SyncCreds table exists
        db.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}"."SyncCreds" (
                id SERIAL PRIMARY KEY,
                host TEXT,
                port TEXT,
                username TEXT
            )
        """))

        # Insert new record (simple overwrite behavior)
        db.execute(text(f"""
            INSERT INTO "{schema}"."SyncCreds" (host, port, username)
            VALUES (:host, :port, :username)
        """), {"host": host, "port": port, "username": username})

        db.commit()
        print(f"✅ SyncCreds saved for {schema}: host={host}, port={port}, username={username}")

        return {"status": "success", "message": "Credentials saved successfully."}

    except Exception as e:
        db.rollback()
        print(f"❌ Error saving SyncCreds for {schema}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
