from typing import Annotated, Literal
from datetime import datetime, timezone

from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints, Field, PlainSerializer, field_validator, field_serializer


def utc_string(value: datetime) -> str:
    # SQLite test storage drops timezone metadata; Postgres returns aware values.
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UtcTimestamp = Annotated[datetime, PlainSerializer(utc_string, return_type=str, when_used="json")]


class RegisterRequest(BaseModel):
    device_id: Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{3,64}$")]
    device_name: Annotated[str, StringConstraints(max_length=64)] | None = None


class RegisterResponse(BaseModel):
    device_id: str
    device_token: str
    created_at: UtcTimestamp


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: str
    device_name: str | None
    created_at: UtcTimestamp
    last_seen: UtcTimestamp | None


class DeviceUpdateRequest(BaseModel):
    device_name: Annotated[str, StringConstraints(max_length=64)] | None = None


class PairingCodeResponse(BaseModel):
    code: str
    expires_at: UtcTimestamp


class PairRequest(BaseModel):
    code: str


class PairResponse(BaseModel):
    device_id: str
    viewer_token: str


DeviceId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{3,64}$")]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class Axes(BaseModel):
    x: Number
    y: Number
    z: Number


class Location(BaseModel):
    lat: Annotated[Number, Field(ge=-90, le=90)]
    lon: Annotated[Number, Field(ge=-180, le=180)]
    accuracy_m: Annotated[Number, Field(ge=0)] | None = None


class ArmRequest(BaseModel):
    timestamp: AwareDatetime
    axes: Axes
    location: Location | None = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def require_iso_timestamp(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("timestamp must be an ISO 8601 string with timezone")
        if isinstance(value, str):
            
            try:
                datetime.fromisoformat(value)
            except ValueError:
                raise ValueError("timestamp must be an ISO 8601 string with timezone") from None
        return value

    @field_validator("timestamp")
    @classmethod
    def normalize_timestamp(cls, value):
        return value.astimezone(timezone.utc)


class EventRequest(ArmRequest):
    device_id: DeviceId
    event_type: Literal["accelerometer"]
    value: Annotated[Number, Field(ge=0)]
    unit: Literal["g"]


class EventCreated(BaseModel):
    id: int
    device_id: str
    received_at: datetime
    
    stored: bool

    @field_serializer("received_at")
    def serialize_received_at(self, value):
        return utc_string(value)


class EventResponse(EventRequest):
    id: int
    received_at: datetime
    snapshot_reason: Literal["armed", "disarmed", "picked_up", "gps_update"] | None = None

    @field_serializer("timestamp", "received_at")
    def serialize_time(self, value):
        return utc_string(value)


class EventsResponse(BaseModel):
    events: list[EventResponse]


class AlertResponse(BaseModel):
    id: int
    device_id: str
    type: Literal["picked_up"]
    timestamp: UtcTimestamp
    angle_deg: float
    value: float
    unit: Literal["g"] = "g"
    axes: Axes


class GuardStatus(BaseModel):
    device_id: str
    state: Literal["DISARMED", "GUARDING", "ALERT"]
    armed_at: UtcTimestamp | None
    last_seen: UtcTimestamp | None
    online: bool
    last_alert: AlertResponse | None
    location: Location | None = None
    last_location: Location | None = None


class AlertsResponse(BaseModel):
    device_id: str
    alerts: list[AlertResponse]
