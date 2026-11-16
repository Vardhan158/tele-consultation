from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=320)
    mobile_number: str = Field(min_length=7, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    terms_version: str = Field(min_length=1, max_length=32)
    terms_accepted: bool


class LoginRequest(BaseModel):
    email: str
    password: str
    mfa_code: str | None = Field(default=None, min_length=6, max_length=6, pattern=r"^\d{6}$")
    recovery_code: str | None = Field(default=None, min_length=8, max_length=64)


class VerifyEmailRequest(BaseModel):
    email: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class RecoveryRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
