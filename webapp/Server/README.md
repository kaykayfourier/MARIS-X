# MarineEye demo API

This FastAPI service imports the repository CSV fixtures into a local SQLite database on first startup, then serves the normalized data used by the React map.

## Run

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r Server\requirements.txt
uvicorn Server.main:app --reload --port 3001
```

The API is available at `http://localhost:3001`. Interactive docs are at `/docs`.

Endpoints:

- `GET /api/health`
- `GET /api/data`
- `GET /api/data?slick_id=SLK-0049`
- `GET /api/slicks`
- `GET /api/ais-tracks`

The generated `Server/marineeye.db` is a local demo artifact. Delete it to re-import the CSV fixtures.
