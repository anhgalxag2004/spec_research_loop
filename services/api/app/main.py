from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.spec import router as spec_router
from app.storage import initialize_database

app = FastAPI(title="SpecResearch Loop API", version="0.1.0")


@app.on_event("startup")
def initialize_storage() -> None:
    initialize_database()

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(spec_router)
