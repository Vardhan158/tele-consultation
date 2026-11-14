"""Optional, consented discovery location; never changes clinical or booking data."""
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, get_principal, require
from teleconsult.kernel.mongodb.client import mongo_database

router = APIRouter(prefix="/profile/location", tags=["profile-location"])


class DiscoveryLocation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    version: Literal[1]
    address: str = Field(min_length=1, max_length=1000)
    city: str = Field(max_length=200)
    state: str = Field(max_length=200)
    country: str = Field(max_length=200)
    postal_code: str = Field(max_length=40)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class LocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: DiscoveryLocation
    consent: Literal[True]


async def location_principal(request: Request, principal: Principal = Depends(get_principal)) -> Principal:
    # This feature must not persist data through the local fixture identity.
    if not request.cookies.get("teleconsult_session"):
        raise HTTPException(status_code=401, detail="Authentication required")
    permission = "clinic:admin" if "clinic_admin" in principal.roles else (
        "doctor:profile:write" if "doctor" in principal.roles else "patient:profile:write"
    )
    return await require(permission)(principal)


location_principal._is_authz = True


def users_collection():
    if not get_settings().mongodb_enabled:
        raise HTTPException(status_code=503, detail="Profile location storage requires MongoDB")
    return mongo_database.database()["users"]


@router.get("")
async def get_location(principal: Principal = Depends(location_principal)):
    user = await users_collection().find_one(
        {"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)},
        {"discovery_location": 1, "_id": 0},
    )
    if user is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"location": user.get("discovery_location")}


@router.put("")
async def save_location(payload: LocationUpdate, principal: Principal = Depends(location_principal)):
    location = payload.location.model_dump()
    result = await users_collection().update_one(
        {"tenant_id": str(principal.tenant_id), "id": str(principal.user_id)},
        {"$set": {"discovery_location": location, "discovery_location_consent": {
            "granted": True, "purpose": "location_based_doctor_discovery", "recorded_at": datetime.now(UTC),
        }}},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"location": location}
