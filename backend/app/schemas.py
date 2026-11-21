from typing import Annotated, Literal
from datetime import datetime, timezone

from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints, Field, field_validator, field_serializer


class RegisterRequest(BaseModel):
    device_id: Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{3,64}$")]
    device_name: Annotated[str, StringConstraints(max_length=64)] | None = None


class RegisterResponse(BaseModel):
    device_id: str
    device_token: str
    created_at: AwareDatetime


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: str
    device_name: str | None
    created_at: AwareDatetime
    last_seen: AwareDatetime | None


DeviceId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{3,64}$")]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class Axes(BaseModel):
    x: Number
    y: Number
    z: Number


class EventRequest(BaseModel):
    device_id: DeviceId
    event_type: Literal["accelerometer"]
    value: Annotated[Number, Field(ge=0)]
    unit: Literal["g"]
    timestamp: AwareDatetime
    axes: Axes

    @field_validator("timestamp", mode="before")
    @classmethod
    def require_iso_timestamp(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("timestamp must be an ISO 8601 string with timezone")
        return value

    @field_validator("timestamp")
    @classmethod
    def normalize_timestamp(cls, value):
        return value.astimezone(timezone.utc)


class EventCreated(BaseModel):
    id: int
    device_id: str
    received_at: datetime

    @field_serializer("received_at")
    def serialize_received_at(self, value):
        return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class EventResponse(EventRequest):
    id: int
    received_at: datetime

    @field_serializer("timestamp", "received_at")
    def serialize_time(self, value):
        return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class EventsResponse(BaseModel):
    events: list[EventResponse]
