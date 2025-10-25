# routes/sync.py
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import psycopg
from auth.dependencies import get_user_main_db

router = APIRouter()

# ============================================================
# 🔹 1. GET — Retrieve SyncCreds from schema
# ============================================================
@router.get("/sync-config")
def get_sync_config(schema: str, db: Session = Depends(get_user_main_db)):
    """Retrieve host, port, username, password from SyncCreds table."""
    try:
        current_db = db.execute(text("SELECT current_database()")).scalar()
        print(f"📡 GET /sync-config — DB={current_db}, schema={schema}")

        row = db.execute(text(f"""
            SELECT host, port, username, password
            FROM "{schema}"."SyncCreds"
            ORDER BY id DESC LIMIT 1
        """)).mappings().first()

        if not row:
            return {"status": "empty", "message": f"No SyncCreds found in {schema}"}

        return {
            "status": "success",
            "host": row["host"],
            "port": row["port"],
            "username": row["username"],
            "password": row["password"] or ""
        }

    except Exception as e:
        print(f"❌ Error in get_sync_config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 🔹 2. POST — Save SyncCreds (Host, Port, Username, Password)
# ============================================================
@router.post("/sync-config")
async def save_sync_config(request: Request, db: Session = Depends(get_user_main_db)):
    """Save or update SyncCreds with password."""
    data = await request.json()
    schema = data.get("schema")
    host = data.get("host")
    port = data.get("port")
    username = data.get("username")
    password = data.get("password")

    if not schema or not host or not port or not username:
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        # ✅ Ensure SyncCreds table exists
        db.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}"."SyncCreds" (
                id SERIAL PRIMARY KEY,
                host TEXT,
                port TEXT,
                username TEXT,
                password TEXT
            )
        """))

        # ✅ Insert new credentials
        db.execute(text(f"""
            INSERT INTO "{schema}"."SyncCreds" (host, port, username, password)
            VALUES (:host, :port, :username, :password)
        """), {"host": host, "port": port, "username": username, "password": password})

        db.commit()
        print(f"✅ SyncCreds saved for {schema}: {username}@{host}:{port}")
        return {"status": "success", "message": "Credentials saved successfully."}

    except Exception as e:
        db.rollback()
        print(f"❌ Error saving SyncCreds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 🔹 3. PUSH — Send only pin, bounds, computed_area
# ============================================================
@router.post("/sync-push")
async def sync_push(request: Request, db: Session = Depends(get_user_main_db)):
    """
    Push only 'pin', 'bounds', and 'computed_area' columns
    from JoinedTable to the SAME schema in the target DB.
    """
    data = await request.json()
    schema = data.get("schema")

    if not schema:
        raise HTTPException(status_code=400, detail="Schema is required.")

    try:
        # ✅ Get current connected database (e.g. PH04034_Laguna)
        current_db = db.execute(text("SELECT current_database()")).scalar()
        print(f"🚀 PUSH triggered from {current_db}.{schema}")

        # === 1️⃣ Load credentials
        creds = db.execute(text(f"""
            SELECT host, port, username, password
            FROM "{schema}"."SyncCreds"
            ORDER BY id DESC LIMIT 1
        """)).mappings().first()

        if not creds:
            raise HTTPException(status_code=400, detail=f"No SyncCreds found for {schema}")

        target_host = creds["host"]
        target_port = creds["port"]
        target_user = creds["username"]
        target_pass = creds["password"] or ""

        # ✅ Use the same provincial DB as target
        target_dbname = current_db
        target_schema = schema

        print(f"🔗 Target: {target_user}@{target_host}:{target_port}/{target_dbname} → {target_schema}.JoinedTable")
        print(f"🔒 Password length: {len(target_pass)} characters")

        # === 2️⃣ Extract required columns locally
        rows = db.execute(text(f"""
            SELECT pin, bounds, computed_area
            FROM "{schema}"."JoinedTable"
            WHERE pin IS NOT NULL
        """)).mappings().all()

        if not rows:
            return {"status": "empty", "message": "No data found in JoinedTable"}

        print(f"📦 Retrieved {len(rows)} records for push")

        # === 3️⃣ Connect and push to target schema
        with psycopg.connect(
            dbname=target_dbname,
            user=target_user,
            password=target_pass,
            host=target_host,
            port=target_port
        ) as conn:
            with conn.cursor() as cur:
                for row in rows:
                    cur.execute(f"""
                        INSERT INTO "{target_schema}"."JoinedTable" (pin, bounds, computed_area)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (pin)
                        DO UPDATE SET
                            bounds = EXCLUDED.bounds,
                            computed_area = EXCLUDED.computed_area;
                    """, (row["pin"], row["bounds"], row["computed_area"]))
                conn.commit()

        print(f"✅ Push successful for {len(rows)} records to {target_schema}.JoinedTable")
        return {
            "status": "success",
            "message": f"Pushed {len(rows)} records to {target_schema}.JoinedTable successfully."
        }

    except Exception as e:
        print(f"❌ Error in /sync-push: {e}")
        raise HTTPException(status_code=500, detail=str(e))
