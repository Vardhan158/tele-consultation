from enum import StrEnum
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TenancyMode(StrEnum):
    POOLED = "pooled"   # shared schema + row-level security (implemented)
    SCHEMA = "schema"   # schema per tenant (reserved)
    SILO = "silo"       # dedicated deployment per client (reserved)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TELECONSULT_",
        env_file=(".env", "backend/.env", "../backend/.env"),
        extra="ignore",
    )

    environment: str = "dev"
    tenancy_mode: TenancyMode = TenancyMode.POOLED
    default_tenant_id: str = "1"
    auth_method: str = "password"
    payment_mode: str = "clinic_specific"
    intake_policy: str = "clinic_configured"
    prescriptions_enabled: bool = False
    video_join_window_minutes: int = 30
    audio_only_allowed: bool = False
    cancellation_deadline_hours: int = 24
    payment_deadline_minutes: int = 15
    max_reschedules: int = 1
    mobile_launch_mode: str = "responsive_web"
    clinical_record_retention_days: int = 2555
    clinic_model: str = "clinic_network"
    frontend_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,https://localhost:5173,https://127.0.0.1:5173",
        validation_alias="FRONTEND_ORIGINS",
    )

    # Email delivery
    email_host: str = Field(default="", validation_alias="EMAIL_HOST")
    email_port: int = Field(default=587, validation_alias="EMAIL_PORT")
    email_host_user: str = Field(default="", validation_alias="EMAIL_HOST_USER")
    email_host_password: str = Field(default="", validation_alias="EMAIL_HOST_PASSWORD")
    email_from: str = Field(default="", validation_alias="EMAIL_FROM")

    # Brevo transactional email delivery
    brevo_api_key: str = Field(default="", validation_alias="BREVO_API_KEY")
    brevo_sender_email: str = Field(default="", validation_alias="BREVO_SENDER_EMAIL")
    brevo_sender_name: str = Field(default="Kaizentrix Care", validation_alias="BREVO_SENDER_NAME")
    newsletter_website_url: str = Field(default="", validation_alias="NEWSLETTER_WEBSITE_URL")
    newsletter_api_base_url: str = Field(default="", validation_alias="NEWSLETTER_API_BASE_URL")
    newsletter_poster_url: str = Field(default="", validation_alias="NEWSLETTER_POSTER_URL")
    newsletter_token_ttl_minutes: int = Field(default=60, validation_alias="NEWSLETTER_TOKEN_TTL_MINUTES")
    newsletter_rate_limit_per_hour: int = Field(default=5, validation_alias="NEWSLETTER_RATE_LIMIT_PER_HOUR")

    # Payment Gateway (Razorpay)
    razorpay_key_id: str = Field(default="", validation_alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(default="", validation_alias="RAZORPAY_KEY_SECRET")
    razorpay_webhook_secret: str = Field(default="", validation_alias="RAZORPAY_WEBHOOK_SECRET")

    # Video Consultation (WebRTC)
    video_provider: str = "webrtc"
    webrtc_stun_urls: str = "stun:stun.l.google.com:19302"
    webrtc_turn_url: str = ""
    webrtc_turn_username: str = ""
    webrtc_turn_credential: str = ""

    # MongoDB foundation (Primary & Exclusive Data Store)
    mongodb_enabled: bool = Field(default=True, validation_alias="MONGODB_ENABLED")
    mongodb_uri: str = Field(default="", validation_alias="MONGODB_URI")
    mongodb_database: str = Field(default="kaizentrix_care", validation_alias="MONGODB_DATABASE")
    mongodb_server_selection_timeout_ms: int = Field(default=15000, validation_alias="MONGODB_SERVER_SELECTION_TIMEOUT_MS")
    mongodb_connect_timeout_ms: int = Field(default=15000, validation_alias="MONGODB_CONNECT_TIMEOUT_MS")
    mongodb_max_pool_size: int = Field(default=50, validation_alias="MONGODB_MAX_POOL_SIZE")
    mongodb_min_pool_size: int = Field(default=0, validation_alias="MONGODB_MIN_POOL_SIZE")
    mongodb_repositories_enabled: bool = Field(default=True, validation_alias="MONGODB_REPOSITORIES_ENABLED")

    # API Security & Rate Limiting (BE-07, SEC-04, GAP-04)
    rate_limiting_enabled: bool = Field(default=True, validation_alias="RATE_LIMITING_ENABLED")

    # Sensitive Health Data Encryption (DB-07, SEC-08, GAP-11)
    clinical_encryption_key: str = Field(default="", validation_alias="CLINICAL_ENCRYPTION_KEY")

    # Cloudinary Image Storage (Profile Avatars)
    cloudinary_cloud_name: str = Field(default="", validation_alias="CLOUDINARY_CLOUD_NAME")
    cloudinary_api_key: str = Field(default="", validation_alias="CLOUDINARY_API_KEY")
    cloudinary_api_secret: str = Field(default="", validation_alias="CLOUDINARY_API_SECRET")
    cloudinary_url: str = Field(default="", validation_alias="CLOUDINARY_URL")

    def get_cloudinary_credentials(self) -> tuple[str, str, str]:
        """Return (cloud_name, api_key, api_secret) parsed from settings, environment, or .env."""
        import os
        from pathlib import Path
        import urllib.parse

        cloud_name = self.cloudinary_cloud_name or os.environ.get("CLOUDINARY_CLOUD_NAME") or os.environ.get("TELECONSULT_CLOUDINARY_CLOUD_NAME") or ""
        api_key = self.cloudinary_api_key or os.environ.get("CLOUDINARY_API_KEY") or os.environ.get("TELECONSULT_CLOUDINARY_API_KEY") or ""
        api_secret = self.cloudinary_api_secret or os.environ.get("CLOUDINARY_API_SECRET") or os.environ.get("TELECONSULT_CLOUDINARY_API_SECRET") or ""
        c_url = self.cloudinary_url or os.environ.get("CLOUDINARY_URL") or os.environ.get("TELECONSULT_CLOUDINARY_URL") or ""

        if not cloud_name or not api_key:
            # Check .env files directly on disk in case settings was cached before .env was updated
            cur_file = Path(__file__).resolve()
            search_paths = [
                Path(".env"),
                Path("backend/.env"),
                Path("../backend/.env"),
                cur_file.parents[4] / ".env",
                cur_file.parents[3] / ".env",
                cur_file.parents[2] / ".env",
            ]
            for env_path in search_paths:
                if env_path.is_file():
                    try:
                        with open(env_path, "r", encoding="utf-8") as f:
                            for line in f:
                                line = line.strip()
                                if not line or line.startswith("#") or "=" not in line:
                                    continue
                                k, v = line.split("=", 1)
                                k, v = k.strip(), v.strip().strip("'\"")
                                if k in ("CLOUDINARY_CLOUD_NAME", "TELECONSULT_CLOUDINARY_CLOUD_NAME") and not cloud_name:
                                    cloud_name = v
                                elif k in ("CLOUDINARY_API_KEY", "TELECONSULT_CLOUDINARY_API_KEY") and not api_key:
                                    api_key = v
                                elif k in ("CLOUDINARY_API_SECRET", "TELECONSULT_CLOUDINARY_API_SECRET") and not api_secret:
                                    api_secret = v
                                elif k in ("CLOUDINARY_URL", "TELECONSULT_CLOUDINARY_URL") and not c_url:
                                    c_url = v
                    except Exception:
                        pass
                if cloud_name and api_key and (api_secret or c_url):
                    break

        if c_url and (not cloud_name or not api_key or not api_secret):
            parsed = urllib.parse.urlparse(c_url)
            if parsed.scheme == "cloudinary":
                api_key = api_key or (parsed.username or "")
                api_secret = api_secret or (parsed.password or "")
                cloud_name = cloud_name or (parsed.hostname or "")

        return cloud_name, api_key, api_secret

    def validate_production_configuration(self) -> None:
        """Enforce fail-fast configuration validation when running in production/staging (AUD-09, GAP-02).

        Hardcoded secrets have been purged. Production environments MUST supply valid secrets via environment variables.
        """
        if self.environment.lower() in ("prod", "production", "staging"):
            missing: list[str] = []
            if not self.mongodb_enabled or not self.mongodb_uri.strip():
                missing.append("MONGODB_URI")
            if not self.razorpay_key_id.strip() or not self.razorpay_key_secret.strip():
                missing.append("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET")
            if missing:
                raise RuntimeError(
                    f"Production startup failed: Required production environment credentials missing: {', '.join(missing)}. "
                    "Hardcoded fallback secrets have been purged per security compliance (AUD-09, GAP-02, GL-03)."
                )

    @property
    def allowed_frontend_origins(self) -> list[str]:
        """Return the configured browser origins with whitespace removed."""
        configured = [
            origin.strip().strip('"[]').rstrip("/")
            for origin in self.frontend_origins.split(",")
            if origin.strip().strip('"[]')
        ]

        # Always allow local development origins to prevent CORS errors during hybrid testing
        # (e.g., local frontend -> deployed backend)
        always_allow = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]

        return list(dict.fromkeys(configured + always_allow))


@lru_cache
def _cached_settings() -> Settings:
    return Settings()


def get_settings(fresh: bool = False) -> Settings:
    if fresh:
        _cached_settings.cache_clear()
    return _cached_settings()
