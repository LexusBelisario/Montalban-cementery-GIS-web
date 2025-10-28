# routes/sync.py
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import psycopg
from auth.dependencies import get_user_main_db

router = APIRouter()

# ============================================================
# 🔹 1. GET — Retrieve SyncCreds
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
# 🔹 2. POST — Save SyncCreds
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
        db.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}"."SyncCreds" (
                id SERIAL PRIMARY KEY,
                host TEXT,
                port TEXT,
                username TEXT,
                password TEXT
            )
        """))
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
    """Push only 'pin', 'bounds', and 'computed_area' columns from GIS → RPIS."""
    data = await request.json()
    schema = data.get("schema")
    if not schema:
        raise HTTPException(status_code=400, detail="Schema is required.")

    try:
        current_db = db.execute(text("SELECT current_database()")).scalar()
        print(f"🚀 PUSH triggered from {current_db}.{schema}")

        creds = db.execute(text(f"""
            SELECT host, port, username, password
            FROM "{schema}"."SyncCreds"
            ORDER BY id DESC LIMIT 1
        """)).mappings().first()
        if not creds:
            raise HTTPException(status_code=400, detail=f"No SyncCreds found for {schema}")

        target_host, target_port = creds["host"], creds["port"]
        target_user, target_pass = creds["username"], creds["password"] or ""
        target_dbname = current_db

        rows = db.execute(text(f"""
            SELECT pin, bounds, computed_area
            FROM "{schema}"."JoinedTable"
            WHERE pin IS NOT NULL
        """)).mappings().all()
        if not rows:
            return {"status": "empty", "message": "No data found in JoinedTable"}

        print(f"📦 Pushing {len(rows)} rows to RPIS {schema}.JoinedTable")
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
                        INSERT INTO "{schema}"."JoinedTable" (pin, bounds, computed_area)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (pin)
                        DO UPDATE SET
                            bounds = EXCLUDED.bounds,
                            computed_area = EXCLUDED.computed_area;
                    """, (row["pin"], row["bounds"], row["computed_area"]))
            conn.commit()

        print(f"✅ Push complete for {len(rows)} records.")
        return {"status": "success", "message": f"Pushed {len(rows)} records to RPIS successfully."}
    except Exception as e:
        print(f"❌ Error in /sync-push: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 🔹 4. PULL — Use staging table for fast, safe update
# ============================================================
@router.post("/sync-pull")
async def sync_pull(request: Request, db: Session = Depends(get_user_main_db)):
    """
    Pull data from RPIS JoinedTable and update GIS JoinedTable.
    Uses a permanent staging table "_rpis_staging" inside the schema.
    Excludes: id, pin, bounds, computed_area, geom.
    """
    data = await request.json()
    schema = data.get("schema")
    if not schema:
        raise HTTPException(status_code=400, detail="Schema is required.")

    try:
        current_db = db.execute(text("SELECT current_database()")).scalar()
        print(f"⬇️ PULL with staging triggered for {current_db}.{schema}")

        creds = db.execute(text(f"""
            SELECT host, port, username, password
            FROM "{schema}"."SyncCreds"
            ORDER BY id DESC LIMIT 1
        """)).mappings().first()
        if not creds:
            raise HTTPException(status_code=400, detail=f"No SyncCreds found for {schema}")

        rpis_host, rpis_port = creds["host"], creds["port"]
        rpis_user, rpis_pass = creds["username"], creds["password"] or ""
        rpis_db = current_db

        # === 1️⃣ Fetch data from RPIS
        print(f"🔗 Connecting to RPIS {rpis_user}@{rpis_host}:{rpis_port}/{rpis_db}")
        with psycopg.connect(
            dbname=rpis_db,
            user=rpis_user,
            password=rpis_pass,
            host=rpis_host,
            port=rpis_port
        ) as conn_remote:
            with conn_remote.cursor() as cur:
                cur.execute(f"""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = 'JoinedTable'
                """, (schema,))
                all_cols = [r[0] for r in cur.fetchall()]
                excluded = {"id", "pin", "bounds", "computed_area", "geom"}
                cols_to_update = [c for c in all_cols if c not in excluded]
                col_list = ", ".join(f'"{c}"' for c in all_cols)

                cur.execute(f'SELECT {col_list} FROM "{schema}"."JoinedTable" WHERE pin IS NOT NULL')
                rows = cur.fetchall()
                colnames = [desc[0] for desc in cur.description]

        if not rows:
            return {"status": "empty", "message": "No rows found in RPIS JoinedTable"}

        print(f"📦 Retrieved {len(rows)} rows from RPIS.{schema}.JoinedTable")

        # === 2️⃣ Create or clear staging table
        db.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{schema}"."_rpis_staging"
            (LIKE "{schema}"."JoinedTable" INCLUDING ALL);
        """))
        db.execute(text(f'TRUNCATE TABLE "{schema}"."_rpis_staging";'))
        db.commit()

        # === 3️⃣ Bulk insert RPIS rows into staging table
        conn = db.connection().connection
        with conn.cursor() as cur:
            col_list_str = ", ".join(f'"{c}"' for c in colnames)
            value_chunks = [
                cur.mogrify("(" + ",".join(["%s"] * len(colnames)) + ")", tuple(r)).decode("utf-8")
                for r in rows
            ]
            args_str = ",".join(value_chunks)
            cur.execute(f'INSERT INTO "{schema}"."_rpis_staging" ({col_list_str}) VALUES {args_str}')
            conn.commit()

        # === 4️⃣ Bulk update GIS from staging
        set_clause = ", ".join([f'"{c}" = staging."{c}"' for c in cols_to_update])
        db.execute(text(f"""
            UPDATE "{schema}"."JoinedTable" AS gis
            SET {set_clause}
            FROM "{schema}"."_rpis_staging" AS staging
            WHERE gis.pin = staging.pin;
        """))
        db.commit()

        print(f"✅ Pull complete — updated {len(rows)} records in GIS {schema}.JoinedTable")

        # === 5️⃣ Optional: empty staging table for next use
        db.execute(text(f'TRUNCATE TABLE "{schema}"."_rpis_staging";'))
        db.commit()

        return {
            "status": "success",
            "message": f"Pulled {len(rows)} records into GIS using staging table.",
            "updated": len(rows)
        }

    except Exception as e:
        db.rollback()
        print(f"❌ Error in /sync-pull: {e}")
        raise HTTPException(status_code=500, detail=str(e))
