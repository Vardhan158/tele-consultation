from enum import StrEnum
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TenancyMode(StrEnum):
    POOLED = "pooled"   # shared schema + row-level security (implemented)
    SCHEMA = "schema"   # schema per tenant (reserved)
    SILO = "silo"       # dedicated deployment per client (reserved)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TELECONSULT_", env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = ""
    migration_database_url: str = ""
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

    # MongoDB foundation. Disabled by default until a validated cutover.
    mongodb_enabled: bool = Field(default=False, validation_alias="MONGODB_ENABLED")
    mongodb_uri: str = Field(default="", validation_alias="MONGODB_URI")
    mongodb_database: str = Field(default="kaizentrix_care", validation_alias="MONGODB_DATABASE")
    mongodb_server_selection_timeout_ms: int = Field(default=15000, validation_alias="MONGODB_SERVER_SELECTION_TIMEOUT_MS")
    mongodb_connect_timeout_ms: int = Field(default=15000, validation_alias="MONGODB_CONNECT_TIMEOUT_MS")
    mongodb_max_pool_size: int = Field(default=50, validation_alias="MONGODB_MAX_POOL_SIZE")
    mongodb_min_pool_size: int = Field(default=0, validation_alias="MONGODB_MIN_POOL_SIZE")
    mongodb_repositories_enabled: bool = Field(default=False, validation_alias="MONGODB_REPOSITORIES_ENABLED")

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
        ]

        return list(dict.fromkeys(configured + always_allow))


@lru_cache
def get_settings() -> Settings:
    return Settings()
