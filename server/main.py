import os
import base64
import logging
import xml.etree.ElementTree as ET
import urllib.request
from datetime import datetime, timedelta
from typing import List, Optional, Dict

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import create_engine, Column, BigInteger, String, Boolean, DateTime, Integer, Numeric, SmallInteger, Date, Text, JSON, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.sql import func

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger("uvicorn.error")

# ---------- Database setup ----------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://user:password@localhost:5432/dbname"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ---------- Naqel / GN Connect config ----------

NAQEL_BASE_URL = os.getenv("NAQEL_BASE_URL", "https://dev.gnteq.app")
NAQEL_USERNAME = os.getenv("NAQEL_USERNAME", "")
NAQEL_PASSWORD = os.getenv("NAQEL_PASSWORD", "")
NAQEL_SUPPLIER_CODE = os.getenv("NAQEL_SUPPLIER_CODE", "NQL")
NAQEL_CUSTOMER_CODE = os.getenv("NAQEL_CUSTOMER_CODE", "")
NAQEL_BRANCH_CODE = os.getenv("NAQEL_BRANCH_CODE", "")

# ---------- SMSA Express config ----------

SMSA_BASE_URL = os.getenv("SMSA_BASE_URL", "https://ecomapis.smsaexpress.com")
SMSA_API_KEY = os.getenv("SMSA_API_KEY", "")

# ---------- DHL Express config ----------

DHL_BASE_URL = os.getenv("DHL_BASE_URL", "https://express.api.dhl.com/mydhlapi")
DHL_API_KEY = os.getenv("DHL_API_KEY", "")
DHL_API_SECRET = os.getenv("DHL_API_SECRET", "")
DHL_ACCOUNT_NUMBER = os.getenv("DHL_ACCOUNT_NUMBER", "")

# ISO2 -> ISO3 country code mapping for shipper (Naqel requires ISO3 for shipper)
COUNTRY_ISO2_TO_ISO3 = {
    "TR": "TUR", "SA": "SAU", "AE": "ARE", "GB": "GBR", "US": "USA",
    "JO": "JOR", "KW": "KWT", "QA": "QAT", "BH": "BHR", "OM": "OMN",
    "EG": "EGY", "IQ": "IRQ", "LB": "LBN", "SY": "SYR", "PS": "PSE",
    "YE": "YEM", "LY": "LBY", "TN": "TUN", "DZ": "DZA", "MA": "MAR",
    "SD": "SDN", "IN": "IND", "PK": "PAK", "BD": "BGD", "DE": "DEU",
    "FR": "FRA", "IT": "ITA", "ES": "ESP", "NL": "NLD", "BE": "BEL",
    "CN": "CHN", "JP": "JPN", "KR": "KOR", "RU": "RUS",
}

# Map Naqel origin city codes to full city names (for DHL/SMSA builders)
ORIGIN_CODE_TO_CITY = {"IST": "Istanbul", "ANK": "Ankara", "IZM": "Izmir"}


# ---------- SQLAlchemy models ----------


class ShipmentItem(Base):
    __tablename__ = "shipment_items"

    id = Column(BigInteger, primary_key=True, index=True)
    shipment_id = Column(BigInteger, ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False)

    woo_order_item_id = Column(BigInteger, nullable=True)
    woo_product_id = Column(BigInteger, nullable=True)
    woo_variation_id = Column(BigInteger, nullable=True)

    quantity = Column(Integer, nullable=False)
    weight_value = Column(Numeric(10, 3), nullable=False)
    weight_unit = Column(SmallInteger, nullable=False)
    customs_value = Column(Numeric(12, 2), nullable=False)
    customs_currency = Column(String(3), nullable=False)
    comments = Column(Text, nullable=True)
    reference = Column(Text, nullable=True)
    commodity_code = Column(Text, nullable=True)
    goods_description = Column(Text, nullable=False)
    country_of_origin = Column(String(2), nullable=True)
    package_type = Column(Text, nullable=True)
    contains_dangerous_goods = Column(Boolean, nullable=False, default=False)
    extra_metadata = Column("metadata", JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(BigInteger, primary_key=True, index=True)

    woo_order_id = Column(BigInteger, nullable=True, index=True)
    woo_order_number = Column(Text, nullable=True)

    carrier_code = Column(Text, nullable=False, default="gn_connect")
    customer_code = Column(Text, nullable=False)
    branch_code = Column(Text, nullable=False)
    airwaybill_number = Column(Text, nullable=True, index=True)
    foreign_hawb = Column(Text, nullable=True)
    product_type = Column(Text, nullable=False)
    duty_handling = Column(Text, nullable=True)
    supplier_code = Column(Text, nullable=True)
    label_format = Column(Text, nullable=True)
    label_size = Column(Text, nullable=True)

    shipping_datetime = Column(DateTime(timezone=True), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    create_collection = Column(Boolean, nullable=False, default=False)
    collection_date = Column(Date, nullable=True)
    collection_time = Column(Text, nullable=True)

    description_of_goods = Column(Text, nullable=False)
    number_of_pieces = Column(Integer, nullable=False)
    cod_amount = Column(Numeric(12, 2), nullable=True)
    cod_currency = Column(String(3), nullable=True)
    customs_declared_value = Column(Numeric(12, 2), nullable=True)
    customs_value_currency = Column(String(3), nullable=True)

    shipment_weight_value = Column(Numeric(10, 3), nullable=False)
    shipment_weight_unit = Column(SmallInteger, nullable=False)
    shipment_length = Column(Numeric(10, 2), nullable=True)
    shipment_width = Column(Numeric(10, 2), nullable=True)
    shipment_height = Column(Numeric(10, 2), nullable=True)
    shipment_dimension_unit = Column(SmallInteger, nullable=True)

    shipper_reference1 = Column(Text, nullable=True)
    shipper_note1 = Column(Text, nullable=True)
    include_label = Column(Boolean, nullable=False, default=True)
    include_office_details = Column(Boolean, nullable=False, default=True)

    status = Column(Text, nullable=False, default="created", index=True)
    status_message = Column(Text, nullable=True)
    tracking_number = Column(Text, nullable=True)
    tracking_url = Column(Text, nullable=True)
    last_status_change_at = Column(DateTime(timezone=True), nullable=True)
    last_tracked_at = Column(DateTime(timezone=True), nullable=True)

    # Consignee contact
    consignee_person_name = Column(Text, nullable=False)
    consignee_company_name = Column(Text, nullable=True)
    consignee_phone1 = Column(Text, nullable=True)
    consignee_phone2 = Column(Text, nullable=True)
    consignee_cell_phone = Column(Text, nullable=True)
    consignee_email = Column(Text, nullable=True)
    consignee_type = Column(Text, nullable=True)
    consignee_civil_id = Column(Text, nullable=True)

    # Consignee address
    consignee_country_code = Column(String(2), nullable=False)
    consignee_city = Column(Text, nullable=False)
    consignee_district = Column(Text, nullable=True)
    consignee_line1 = Column(Text, nullable=False)
    consignee_line2 = Column(Text, nullable=True)
    consignee_line3 = Column(Text, nullable=True)
    consignee_post_code = Column(Text, nullable=True)
    consignee_longitude = Column(Text, nullable=True)
    consignee_latitude = Column(Text, nullable=True)
    consignee_location_code1 = Column(Text, nullable=True)
    consignee_location_code2 = Column(Text, nullable=True)
    consignee_location_code3 = Column(Text, nullable=True)
    consignee_short_address = Column(Text, nullable=True)

    # Shipper address
    shipper_country_code = Column(String(2), nullable=False)
    shipper_city = Column(Text, nullable=False)
    shipper_line1 = Column(Text, nullable=False)
    shipper_line2 = Column(Text, nullable=True)
    shipper_line3 = Column(Text, nullable=True)
    shipper_post_code = Column(Text, nullable=True)
    shipper_longitude = Column(Text, nullable=True)
    shipper_latitude = Column(Text, nullable=True)
    shipper_location_code1 = Column(Text, nullable=True)
    shipper_location_code2 = Column(Text, nullable=True)
    shipper_location_code3 = Column(Text, nullable=True)

    # Shipper contact
    shipper_person_name = Column(Text, nullable=False)
    shipper_company_name = Column(Text, nullable=True)
    shipper_phone1 = Column(Text, nullable=True)
    shipper_phone2 = Column(Text, nullable=True)
    shipper_cell_phone = Column(Text, nullable=True)
    shipper_email = Column(Text, nullable=True)
    shipper_type = Column(Text, nullable=True)

    carrier_request_payload = Column(JSON, nullable=True)
    carrier_response_payload = Column(JSON, nullable=True)
    label_base64 = Column(Text, nullable=True)
    extra_metadata = Column("metadata", JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship("ShipmentItem", back_populates="shipment", cascade="all, delete-orphan")
    tracking_events = relationship("TrackingEvent", back_populates="shipment", cascade="all, delete-orphan", order_by="TrackingEvent.event_date.desc()")


# Link back relationship
ShipmentItem.shipment = relationship("Shipment", back_populates="items")


class TrackingEvent(Base):
    """Tracking timeline events from GN Connect."""
    __tablename__ = "tracking_events"

    id = Column(BigInteger, primary_key=True, index=True)
    shipment_id = Column(BigInteger, ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    airwaybill_number = Column(Text, nullable=False, index=True)
    event_code = Column(Text, nullable=True)
    event_description = Column(Text, nullable=True)
    event_date = Column(DateTime(timezone=True), nullable=True)
    event_location = Column(Text, nullable=True)
    event_detail = Column(Text, nullable=True)
    raw_event_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    shipment = relationship("Shipment", back_populates="tracking_events")


class AwbCounter(Base):
    """Global AWB counter for Naqel production (pre-assigned AWBs)."""
    __tablename__ = "awb_counter"

    id = Column(Integer, primary_key=True, default=1)
    next_awb = Column(BigInteger, nullable=False, default=510047000)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExchangeRate(Base):
    """Cached exchange rates from TCMB. Fallback when API is unavailable."""
    __tablename__ = "exchange_rates"

    id = Column(BigInteger, primary_key=True, index=True)
    currency_code = Column(String(3), nullable=False, unique=True, index=True)
    rate_to_usd = Column(Float, nullable=False)  # 1 USD = X units of this currency
    forex_buying_try = Column(Float, nullable=True)  # TRY buy rate
    forex_selling_try = Column(Float, nullable=True)  # TRY sell rate
    unit = Column(Integer, nullable=False, default=1)
    source_date = Column(String(20), nullable=True)  # TCMB bulletin date
    fetched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# ---------- Exchange Rate Cache (Open Exchange Rates + DB fallback) ----------

OXR_APP_ID = os.getenv("OXR_APP_ID", "")
OXR_URL = "https://openexchangerates.org/api/latest.json"
RATES_CACHE_TTL = 4 * 60 * 60  # 4 hours in seconds

# In-memory cache
_rates_cache: Dict[str, float] = {}  # currency_code -> rate_to_usd
_rates_details: Dict[str, dict] = {}  # currency_code -> full details
_rates_fetched_at: Optional[datetime] = None
_rates_source_date: Optional[str] = None


def _fetch_oxr_rates() -> Dict[str, dict]:
    """Fetch current exchange rates from Open Exchange Rates (all currencies, USD base)."""
    if not OXR_APP_ID:
        raise ValueError("OXR_APP_ID not configured")

    url = f"{OXR_URL}?app_id={OXR_APP_ID}"
    req = urllib.request.Request(url, headers={"User-Agent": "bzrcMaster/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        import json as _json
        data = _json.loads(resp.read())

    oxr_rates = data.get("rates", {})
    timestamp = data.get("timestamp", 0)
    source_date = datetime.utcfromtimestamp(timestamp).strftime("%m/%d/%Y") if timestamp else ""

    if "TRY" not in oxr_rates:
        raise ValueError("TRY rate not found in OXR data")

    try_per_usd = oxr_rates["TRY"]  # 1 USD = X TRY

    rates = {}
    for code, usd_rate in oxr_rates.items():
        # usd_rate = 1 USD = X units of this currency
        forex_buying_try = round(try_per_usd / usd_rate, 4) if usd_rate else None
        rates[code] = {
            "rate_to_usd": round(usd_rate, 6),
            "forex_buying_try": forex_buying_try,
            "forex_selling_try": None,
            "unit": 1,
            "source_date": source_date,
        }

    # Ensure USD entry
    if "USD" not in rates:
        rates["USD"] = {
            "rate_to_usd": 1.0,
            "forex_buying_try": try_per_usd,
            "forex_selling_try": None,
            "unit": 1,
            "source_date": source_date,
        }

    return rates


def _fetch_tcmb_rates() -> Dict[str, dict]:
    """Fetch exchange rates from TCMB XML feed (fallback, ~23 currencies)."""
    req = urllib.request.Request(
        "https://www.tcmb.gov.tr/kurlar/today.xml",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        xml_data = resp.read()

    root = ET.fromstring(xml_data)
    source_date = root.attrib.get("Date", "")

    usd_forex_buying = None
    for currency in root.findall("Currency"):
        if currency.attrib.get("CurrencyCode") == "USD":
            fb = currency.find("ForexBuying")
            if fb is not None and fb.text:
                usd_forex_buying = float(fb.text)
            break

    if not usd_forex_buying:
        raise ValueError("USD rate not found in TCMB data")

    rates = {
        "USD": {
            "rate_to_usd": 1.0,
            "forex_buying_try": usd_forex_buying,
            "forex_selling_try": None,
            "unit": 1,
            "source_date": source_date,
        }
    }

    for currency in root.findall("Currency"):
        code = currency.attrib.get("CurrencyCode", "")
        if not code or code == "USD":
            continue
        unit = int(currency.find("Unit").text) if currency.find("Unit") is not None and currency.find("Unit").text else 1
        fb = currency.find("ForexBuying")
        cross_usd = currency.find("CrossRateUSD")
        forex_buying = float(fb.text) if fb is not None and fb.text else None

        rate_to_usd = None
        if cross_usd is not None and cross_usd.text:
            rate_to_usd = float(cross_usd.text)
        elif forex_buying and usd_forex_buying:
            rate_to_usd = (usd_forex_buying / forex_buying) * unit

        if rate_to_usd is not None:
            rates[code] = {
                "rate_to_usd": round(rate_to_usd, 6),
                "forex_buying_try": forex_buying,
                "forex_selling_try": None,
                "unit": unit,
                "source_date": source_date,
            }

    rates["TRY"] = {
        "rate_to_usd": round(usd_forex_buying, 6),
        "forex_buying_try": 1.0,
        "forex_selling_try": 1.0,
        "unit": 1,
        "source_date": source_date,
    }

    return rates


def _save_rates_to_db(rates: Dict[str, dict], db: Session):
    """Persist exchange rates to DB for restart recovery."""
    for code, info in rates.items():
        existing = db.query(ExchangeRate).filter(ExchangeRate.currency_code == code).first()
        if existing:
            existing.rate_to_usd = info["rate_to_usd"]
            existing.forex_buying_try = info.get("forex_buying_try")
            existing.forex_selling_try = info.get("forex_selling_try")
            existing.unit = info.get("unit", 1)
            existing.source_date = info.get("source_date")
            existing.fetched_at = datetime.utcnow()
        else:
            db.add(ExchangeRate(
                currency_code=code,
                rate_to_usd=info["rate_to_usd"],
                forex_buying_try=info.get("forex_buying_try"),
                forex_selling_try=info.get("forex_selling_try"),
                unit=info.get("unit", 1),
                source_date=info.get("source_date"),
                fetched_at=datetime.utcnow(),
            ))
    db.commit()


def _load_rates_from_db(db: Session) -> Dict[str, dict]:
    """Load exchange rates from DB (fallback after restart)."""
    rows = db.query(ExchangeRate).all()
    rates = {}
    for row in rows:
        rates[row.currency_code] = {
            "rate_to_usd": row.rate_to_usd,
            "forex_buying_try": row.forex_buying_try,
            "forex_selling_try": row.forex_selling_try,
            "unit": row.unit,
            "source_date": row.source_date,
        }
    return rates


def refresh_rates(db: Session, force: bool = False) -> Dict[str, dict]:
    """Refresh exchange rates: memory cache → OXR → TCMB → DB fallback."""
    global _rates_cache, _rates_details, _rates_fetched_at, _rates_source_date

    now = datetime.utcnow()

    # Check memory cache
    if not force and _rates_fetched_at and (now - _rates_fetched_at).total_seconds() < RATES_CACHE_TTL:
        return _rates_details

    # Try OXR first (170+ currencies)
    if OXR_APP_ID:
        try:
            rates = _fetch_oxr_rates()
            _rates_details = rates
            _rates_cache = {k: v["rate_to_usd"] for k, v in rates.items()}
            _rates_fetched_at = now
            _rates_source_date = next(iter(rates.values()), {}).get("source_date")

            try:
                _save_rates_to_db(rates, db)
            except Exception as e:
                logger.warning(f"Failed to save rates to DB: {e}")

            logger.info(f"OXR rates refreshed: {len(rates)} currencies, date={_rates_source_date}")
            return rates
        except Exception as e:
            logger.warning(f"OXR fetch failed: {e}. Trying TCMB fallback...")

    # Fallback: TCMB (~23 currencies)
    try:
        rates = _fetch_tcmb_rates()
        _rates_details = rates
        _rates_cache = {k: v["rate_to_usd"] for k, v in rates.items()}
        _rates_fetched_at = now
        _rates_source_date = next(iter(rates.values()), {}).get("source_date")

        try:
            _save_rates_to_db(rates, db)
        except Exception as e:
            logger.warning(f"Failed to save rates to DB: {e}")

        logger.info(f"TCMB rates refreshed: {len(rates)} currencies, date={_rates_source_date}")
        return rates

    except Exception as e:
        logger.warning(f"TCMB fetch failed: {e}. Trying DB fallback...")

        # Try DB fallback
        if not _rates_details:
            db_rates = _load_rates_from_db(db)
            if db_rates:
                _rates_details = db_rates
                _rates_cache = {k: v["rate_to_usd"] for k, v in db_rates.items()}
                _rates_fetched_at = now
                logger.info(f"Loaded {len(db_rates)} rates from DB fallback")
                return db_rates

        # Return whatever we have in memory (even if stale)
        if _rates_details:
            logger.warning("Using stale in-memory rates")
            return _rates_details

        raise HTTPException(status_code=503, detail=f"No exchange rates available: {e}")


def convert_currency(amount: float, from_currency: str, to_currency: str, db: Session) -> float:
    """Convert amount from one currency to another via USD cross rate."""
    if from_currency.upper() == to_currency.upper():
        return amount

    rates = refresh_rates(db)
    from_code = from_currency.upper()
    to_code = to_currency.upper()

    if from_code not in _rates_cache:
        raise HTTPException(status_code=400, detail=f"Unknown currency: {from_code}")
    if to_code not in _rates_cache:
        raise HTTPException(status_code=400, detail=f"Unknown currency: {to_code}")

    # Convert: amount in FROM → USD → TO
    from_rate = _rates_cache[from_code]  # 1 USD = X FROM
    to_rate = _rates_cache[to_code]      # 1 USD = Y TO

    if from_code == "USD":
        return round(amount * to_rate, 4)
    elif to_code == "USD":
        return round(amount / from_rate, 4)
    else:
        usd_amount = amount / from_rate
        return round(usd_amount * to_rate, 4)


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- AWB Counter ----------


def get_next_awb(db: Session) -> str:
    """Atomically get next AWB number and increment counter.
    Uses SELECT FOR UPDATE to prevent race conditions."""
    counter = db.query(AwbCounter).filter(AwbCounter.id == 1).with_for_update().first()
    if not counter:
        raise HTTPException(status_code=500, detail="AWB counter not initialized")
    awb = str(counter.next_awb)
    counter.next_awb += 1
    counter.updated_at = datetime.utcnow()
    db.flush()
    return awb


# ---------- Naqel API helper ----------


async def get_naqel_token() -> str:
    """Get a fresh bearer token from GN Connect API."""
    url = f"{NAQEL_BASE_URL}/api/identity/Authentication/GetToken"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json={
            "username": NAQEL_USERNAME,
            "password": NAQEL_PASSWORD,
        })
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to get Naqel token: HTTP {resp.status_code} - {resp.text}"
            )
        data = resp.json()
        token = data.get("token", {}).get("access_token")
        if not token:
            raise HTTPException(status_code=502, detail="No access_token in Naqel auth response")
        return token


async def track_shipment_gn(airwaybill: str, customer_code: str, branch_code: str, token: str) -> dict:
    """Call GN Connect Tracking API for a single AWB."""
    url = f"{NAQEL_BASE_URL}/api/gnconnect/Tracking"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json={
            "airwaybill": airwaybill,
            "customerCode": customer_code,
            "branchCode": branch_code,
        }, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })

    import logging
    logger = logging.getLogger("uvicorn.error")
    logger.info(f"GN Connect tracking HTTP {resp.status_code} for AWB {airwaybill}: {resp.text[:2000]}")

    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"GN Connect tracking failed: HTTP {resp.status_code} - {resp.text[:500]}"
        )
    return resp.json()


# GN Connect status → internal status mapping
GN_STATUS_MAP = {
    "Delivered": "delivered",
    "InTransit": "in_transit",
    "In Transit": "in_transit",
    "PickedUp": "in_transit",
    "Picked Up": "in_transit",
    "Out For Delivery": "in_transit",
    "OutForDelivery": "in_transit",
    "Returned": "failed",
    "Exception": "failed",
    "Cancelled": "cancelled",
}


def parse_tracking_response(raw) -> tuple:
    """
    Parse GN Connect tracking response into (new_status, status_message, events_list).
    Flexible: handles response as dict, list, or nested structures.
    Returns: (status_str | None, message_str | None, list_of_event_dicts)
    """
    import logging
    logger = logging.getLogger("uvicorn.error")
    logger.info(f"Tracking raw response type={type(raw).__name__}: {str(raw)[:2000]}")

    events = []
    new_status = None
    status_msg = None

    # If response is a list, each item may be a tracking record
    if isinstance(raw, list):
        raw_events = raw
    elif isinstance(raw, dict):
        # Extract events array from various possible locations
        data = raw.get("data")
        raw_events = (
            raw.get("events") or raw.get("Events") or
            raw.get("trackingDetails") or raw.get("TrackingDetails") or
            raw.get("trackingHistory") or raw.get("TrackingHistory") or
            (data if isinstance(data, list) else None) or
            (data.get("events") if isinstance(data, dict) else None) or
            (data.get("trackingDetails") if isinstance(data, dict) else None) or
            []
        )
    else:
        raw_events = []

    if isinstance(raw_events, list):
        for evt in raw_events:
            if not isinstance(evt, dict):
                continue
            # Build location from eventCity + eventCountry
            loc_parts = [
                p for p in [
                    evt.get("eventCity") or evt.get("eventCityAr"),
                    evt.get("eventCountry")
                ] if p
            ]
            location = (
                evt.get("eventLocation") or evt.get("EventLocation") or
                evt.get("location") or evt.get("Location") or
                evt.get("activityLocation") or evt.get("ActivityLocation") or
                (", ".join(loc_parts) if loc_parts else None)
            )
            events.append({
                "event_code": evt.get("eventCode") or evt.get("EventCode") or evt.get("code") or evt.get("Code") or evt.get("activityCode"),
                "event_description": evt.get("eventName") or evt.get("event") or evt.get("eventDescription") or evt.get("EventDescription") or evt.get("description") or evt.get("Description") or evt.get("activity") or evt.get("activityDescription"),
                "event_date": evt.get("actionDate") or evt.get("eventDate") or evt.get("EventDate") or evt.get("date") or evt.get("Date") or evt.get("activityDate") or evt.get("timestamp"),
                "event_location": location,
                "event_detail": evt.get("notes") or evt.get("eventDetail") or evt.get("EventDetail") or evt.get("detail") or evt.get("Detail") or evt.get("comments") or None,
                "raw": evt,
            })

    # Top-level status (only if raw is dict)
    if isinstance(raw, dict):
        top_status = raw.get("status") or raw.get("Status") or raw.get("currentStatus") or raw.get("CurrentStatus") or raw.get("shipmentStatus") or raw.get("ShipmentStatus")
        if top_status and isinstance(top_status, str):
            new_status = GN_STATUS_MAP.get(top_status)
            status_msg = top_status

    # If no top-level status, derive from latest event
    if not new_status and events:
        latest_desc = events[0].get("event_description") or events[0].get("event_code") or ""
        for key, mapped in GN_STATUS_MAP.items():
            if key.lower() in latest_desc.lower():
                new_status = mapped
                break
        if not new_status:
            new_status = "in_transit"
        status_msg = latest_desc or status_msg

    return (new_status, status_msg, events)


def _normalize_date_key(d) -> str:
    """Normalize a date to UTC ISO string for dedup comparison."""
    if d is None:
        return ""
    try:
        if isinstance(d, datetime):
            dt = d
        else:
            dt = datetime.fromisoformat(str(d).strip())
        # Convert to UTC for consistent comparison
        if dt.tzinfo is not None:
            from datetime import timezone
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    except Exception:
        return str(d)


def _store_tracking_events(db: Session, shipment_id: int, awb: str, parsed_events: list) -> int:
    """Store new tracking events, dedup by (event_code, event_date). Returns count of new events."""
    existing_keys = {
        (e.event_code, _normalize_date_key(e.event_date))
        for e in db.query(TrackingEvent).filter(TrackingEvent.shipment_id == shipment_id).all()
    }
    new_count = 0
    for evt in parsed_events:
        key = (evt["event_code"], _normalize_date_key(evt.get("event_date")))
        if key not in existing_keys:
            db.add(TrackingEvent(
                shipment_id=shipment_id,
                airwaybill_number=awb,
                event_code=evt["event_code"],
                event_description=evt["event_description"],
                event_date=evt.get("event_date"),
                event_location=evt.get("event_location"),
                event_detail=evt.get("event_detail"),
                raw_event_data=evt.get("raw"),
            ))
            existing_keys.add(key)
            new_count += 1
    return new_count


def build_naqel_payload(shipment: Shipment, items: list, awb_number: str = "") -> dict:
    """Build the GN Connect API request payload from our DB shipment."""
    # Shipper country code: convert ISO2 to ISO3
    shipper_cc = shipment.shipper_country_code or "TR"
    shipper_iso3 = COUNTRY_ISO2_TO_ISO3.get(shipper_cc.upper(), shipper_cc)

    payload = {
        "customerCode": shipment.customer_code,
        "branchCode": shipment.branch_code,
        "airwaybillNumber": awb_number,
        "shippingDateTime": shipment.shipping_datetime.isoformat() if shipment.shipping_datetime else datetime.utcnow().isoformat(),
        "descriptionOfGoods": (shipment.description_of_goods or "Goods")[:100],
        "numberOfPieces": str(shipment.number_of_pieces or 1),
        "customsDeclaredValue": float(shipment.customs_declared_value) if shipment.customs_declared_value else 0,
        "customsDeclaredValueCurrency": shipment.customs_value_currency or "USD",
        "productType": shipment.product_type or "DLVI",
        "supplierCode": NAQEL_SUPPLIER_CODE,
        "includeLabel": shipment.include_label,
        "includeOfficeDetails": shipment.include_office_details,
        "consignee": {
            "consigneeContact": {
                "personName": shipment.consignee_person_name or "Customer",
                "companyName": shipment.consignee_company_name or "",
                "phoneNumber1": shipment.consignee_phone1 or "",
                "phoneNumber2": shipment.consignee_phone2 or "",
                "cellPhone": shipment.consignee_cell_phone or shipment.consignee_phone1 or "",
                "emailAddress": shipment.consignee_email or "noreply@bazaarica.com",
            },
            "consigneeAddress": {
                "countryCode": shipment.consignee_country_code or "",
                "city": shipment.consignee_city or "",
                "district": shipment.consignee_district or "",
                "line1": shipment.consignee_line1 or "",
                "line2": shipment.consignee_line2 or "",
                "line3": shipment.consignee_line3 or "",
                "postCode": shipment.consignee_post_code or "",
            },
        },
        "shipper": {
            "shipperContact": {
                "personName": shipment.shipper_person_name or "",
                "companyName": shipment.shipper_company_name or "Bazaarica",
                "phoneNumber1": shipment.shipper_phone1 or "",
                "phoneNumber2": shipment.shipper_phone2 or "",
                "cellPhone": shipment.shipper_cell_phone or shipment.shipper_phone1 or "",
                "emailAddress": shipment.shipper_email or "",
            },
            "shipperAddress": {
                "countryCode": shipper_iso3,
                "city": shipment.shipper_city or "",
                "line1": shipment.shipper_line1 or "",
                "line2": shipment.shipper_line2 or "",
                "line3": shipment.shipper_line3 or "",
                "postCode": shipment.shipper_post_code or "",
            },
        },
        "items": [],
        "shipmentWeight": {
            "value": float(shipment.shipment_weight_value) if shipment.shipment_weight_value else 0.5,
            "weightUnit": shipment.shipment_weight_unit or 1,
        },
        "reference": {
            "shipperReference1": shipment.shipper_reference1 or "",
            "shipperNote1": shipment.shipper_note1 or "",
        },
        "podType": "Nil",
    }

    # COD
    if shipment.cod_amount and float(shipment.cod_amount) > 0:
        payload["cod"] = float(shipment.cod_amount)
        payload["codCurrnecy"] = shipment.cod_currency or "USD"  # Note: Naqel typo

    # Dimensions
    if shipment.shipment_length:
        payload["shipmentWeight"]["length"] = float(shipment.shipment_length)
    if shipment.shipment_width:
        payload["shipmentWeight"]["width"] = float(shipment.shipment_width)
    if shipment.shipment_height:
        payload["shipmentWeight"]["height"] = float(shipment.shipment_height)

    # Items
    for item in items:
        payload["items"].append({
            "quantity": item.quantity,
            "weight": {
                "unit": item.weight_unit or 1,
                "value": float(item.weight_value) if item.weight_value else 0.5,
            },
            "customsValue": {
                "currencyCode": item.customs_currency or "USD",
                "value": float(item.customs_value) if item.customs_value else 0,
            },
            "goodsDescription": (item.goods_description or "Goods")[:100],
            "commodityCode": item.commodity_code or "",
            "packageType": item.package_type or "Box",
            "containsDangerousGoods": item.contains_dangerous_goods or False,
            "countryOfOrigin": item.country_of_origin or "",
        })

    return payload


# ---------- SMSA API helpers ----------


def build_smsa_payload(shipment: Shipment, items: list) -> dict:
    """Build SMSA B2C shipment payload from our Shipment model."""
    cod = float(shipment.cod_amount) if shipment.cod_amount else 0
    declared = float(shipment.customs_declared_value) if shipment.customs_declared_value else 0

    # Determine service code: EDDL = domestic, EIDL = international
    shipper_cc = (shipment.shipper_country_code or "").upper()
    consignee_cc = (shipment.consignee_country_code or "").upper()
    is_domestic = shipper_cc == consignee_cc
    service_code = "EDDL" if is_domestic else "EIDL"

    payload = {
        "ConsigneeAddress": {
            "ContactName": (shipment.consignee_person_name or "Customer")[:150],
            "ContactPhoneNumber": shipment.consignee_phone1 or "",
            "Country": shipment.consignee_country_code,
            "City": (shipment.consignee_city or "")[:50],
            "AddressLine1": (shipment.consignee_line1 or "Address")[:100],
            "AddressLine2": (shipment.consignee_line2 or "")[:100],
            "District": shipment.consignee_district or "",
            "PostalCode": shipment.consignee_post_code or "",
        },
        "ShipperAddress": {
            "ContactName": (shipment.shipper_person_name or "Shipper")[:150],
            "ContactPhoneNumber": shipment.shipper_phone1 or "",
            "Country": shipment.shipper_country_code,
            "City": ORIGIN_CODE_TO_CITY.get(shipment.shipper_city, shipment.shipper_city or "")[:50],
            "AddressLine1": (shipment.shipper_line1 or "Address")[:100],
            "AddressLine2": (shipment.shipper_line2 or "")[:100],
            "PostalCode": shipment.shipper_post_code or "",
        },
        "OrderNumber": str(shipment.woo_order_number or shipment.id)[:50],
        "DeclaredValue": declared,
        "CODAmount": cod,
        "Parcels": shipment.number_of_pieces or 1,
        "ShipDate": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"),
        "ShipmentCurrency": shipment.customs_value_currency or "SAR",
        "SMSARetailID": "0",
        "WaybillType": "PDF",
        "Weight": float(shipment.shipment_weight_value) if shipment.shipment_weight_value else 0.5,
        "WeightUnit": "KG",
        "ContentDescription": (shipment.description_of_goods or "Cosmetic products")[:200],
        "VatPaid": True,
        "DutyPaid": False,
        "ServiceCode": service_code,
    }

    return payload


async def submit_shipment_smsa(shipment: Shipment, items: list, db: Session):
    """Submit shipment to SMSA Express API. Returns updated shipment."""
    smsa_payload = build_smsa_payload(shipment, items)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{SMSA_BASE_URL}/api/shipment/b2c/new",
                json=smsa_payload,
                headers={
                    "apikey": SMSA_API_KEY,
                    "Content-Type": "application/json",
                },
            )

        carrier_response = None
        try:
            carrier_response = resp.json()
        except Exception:
            carrier_response = {"raw": resp.text[:2000]}

        shipment.carrier_request_payload = smsa_payload
        shipment.carrier_response_payload = carrier_response

        if resp.status_code in (200, 201) and isinstance(carrier_response, dict):
            sawb = carrier_response.get("sawb", "")
            waybills = carrier_response.get("waybills") or []

            if waybills:
                awb = waybills[0].get("awb", sawb)
                label_b64 = waybills[0].get("awbFile", "")
            else:
                awb = sawb
                label_b64 = ""

            if awb:
                shipment.airwaybill_number = awb
                shipment.tracking_number = awb
                shipment.status = "submitted"
                shipment.status_message = "Submitted to SMSA successfully"
                shipment.last_status_change_at = datetime.utcnow()

                if label_b64:
                    shipment.label_base64 = label_b64

                logger.info(f"Shipment {shipment.id} SMSA submitted: AWB={awb}")
            else:
                shipment.status = "submit_failed"
                shipment.status_message = f"SMSA returned no AWB: {str(carrier_response)[:500]}"
                shipment.last_status_change_at = datetime.utcnow()
        else:
            error_detail = str(carrier_response)[:500] if carrier_response else resp.text[:500]
            shipment.status = "submit_failed"
            shipment.status_message = f"SMSA HTTP {resp.status_code}: {error_detail}"
            shipment.last_status_change_at = datetime.utcnow()
            logger.error(f"Shipment {shipment.id} SMSA submit failed: HTTP {resp.status_code}")

    except httpx.TimeoutException:
        shipment.status = "submit_failed"
        shipment.status_message = "SMSA API request timed out"
        shipment.last_status_change_at = datetime.utcnow()
    except Exception as e:
        shipment.status = "submit_failed"
        shipment.status_message = f"SMSA error: {str(e)[:500]}"
        shipment.last_status_change_at = datetime.utcnow()


async def track_shipment_smsa(awb: str) -> dict:
    """Query SMSA shipment by AWB."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SMSA_BASE_URL}/api/shipment/b2c/query/{awb}",
            headers={"ApiKey": SMSA_API_KEY},
        )
    if resp.status_code in (200, 201):
        return resp.json()
    raise Exception(f"SMSA tracking HTTP {resp.status_code}: {resp.text[:300]}")


# ---------- DHL Express functions ----------


def build_dhl_payload(shipment: Shipment, items: list) -> dict:
    """Build DHL Express MyDHL API shipment payload from our Shipment model."""
    declared = float(shipment.customs_declared_value) if shipment.customs_declared_value else 0
    currency = shipment.customs_value_currency or "USD"

    # Planned shipping date: now + 1 hour, formatted for DHL
    from datetime import timezone
    ship_dt = datetime.now(timezone(timedelta(hours=3)))  # TR is UTC+3
    planned_date = ship_dt.strftime("%Y-%m-%dT%H:%M:%S GMT+03:00")

    # Weight/dimension units: US uses imperial, everyone else metric
    consignee_cc = (shipment.consignee_country_code or "").upper()
    is_imperial = consignee_cc == "US"
    weight_val = float(shipment.shipment_weight_value) if shipment.shipment_weight_value else 0.5

    # Build export declaration line items
    line_items = []
    for idx, item in enumerate(items, 1):
        item_weight = float(item.weight_value) if item.weight_value else 0.5
        li = {
            "number": idx,
            "description": (item.goods_description or "Goods")[:100],
            "quantity": {"value": item.quantity, "unitOfMeasurement": "PCS"},
            "price": float(item.customs_value) if item.customs_value else 0,
            "weight": {"netValue": item_weight, "grossValue": item_weight},
            "manufacturerCountry": item.country_of_origin or (shipment.shipper_country_code or "TR"),
            "exportReasonType": "permanent",
            "isTaxesPaid": True,
        }
        if item.commodity_code:
            li["commodityCodes"] = [{"typeCode": "outbound", "value": item.commodity_code}]
        line_items.append(li)

    # Shipper address
    shipper_addr = {
        "postalCode": shipment.shipper_post_code or "34771",
        "cityName": ORIGIN_CODE_TO_CITY.get(shipment.shipper_city, shipment.shipper_city or "Istanbul")[:45],
        "countryCode": shipment.shipper_country_code or "TR",
        "addressLine1": (shipment.shipper_line1 or "Istanbul")[:45],
    }
    if shipment.shipper_line2:
        shipper_addr["addressLine2"] = shipment.shipper_line2[:45]

    # Receiver address
    receiver_addr = {
        "postalCode": shipment.consignee_post_code or "00000",
        "cityName": (shipment.consignee_city or "City")[:45],
        "countryCode": consignee_cc,
        "addressLine1": (shipment.consignee_line1 or "Address")[:45],
    }
    if shipment.consignee_line2:
        receiver_addr["addressLine2"] = shipment.consignee_line2[:45]

    # Value-added services (Paperless Trade always enabled)
    value_added_services = [
        {"serviceCode": "WY", "value": 0},  # Paperless Trade
    ]

    payload = {
        "plannedShippingDateAndTime": planned_date,
        "pickup": {"isRequested": False},
        "productCode": "P",  # EXPRESS WORLDWIDE (Non-Doc)
        "accounts": [{"typeCode": "shipper", "number": DHL_ACCOUNT_NUMBER}],
        "customerDetails": {
            "shipperDetails": {
                "postalAddress": shipper_addr,
                "contactInformation": {
                    "phone": shipment.shipper_phone1 or "",
                    "companyName": (shipment.shipper_company_name or shipment.shipper_person_name or "Bazaarica")[:80],
                    "fullName": (shipment.shipper_person_name or "Shipper")[:80],
                    "email": shipment.shipper_email or "",
                },
            },
            "receiverDetails": {
                "postalAddress": receiver_addr,
                "contactInformation": {
                    "phone": shipment.consignee_phone1 or shipment.consignee_cell_phone or "",
                    "companyName": (shipment.consignee_company_name or shipment.consignee_person_name or "Customer")[:80],
                    "fullName": (shipment.consignee_person_name or "Customer")[:80],
                    "email": shipment.consignee_email or "noreply@bazaarica.com",
                },
            },
        },
        "content": {
            "packages": [{
                "weight": weight_val,
                "dimensions": {
                    "length": float(shipment.shipment_length) if shipment.shipment_length else 30,
                    "width": float(shipment.shipment_width) if shipment.shipment_width else 20,
                    "height": float(shipment.shipment_height) if shipment.shipment_height else 10,
                },
                "customerReferences": [{"value": str(shipment.woo_order_number or shipment.woo_order_id or ""), "typeCode": "CU"}],
                "description": (shipment.description_of_goods or "Goods")[:70],
            }],
            "isCustomsDeclarable": True,
            "declaredValue": declared,
            "declaredValueCurrency": currency,
            "unitOfMeasurement": "imperial" if is_imperial else "metric",
            "incoterm": "DAP",
            "description": (shipment.description_of_goods or "Goods")[:70],
            "exportDeclaration": {
                "lineItems": line_items,
                "invoice": {
                    "number": f"INV-{shipment.woo_order_number or shipment.id}",
                    "date": datetime.utcnow().strftime("%Y-%m-%d"),
                },
                "exportReason": "Sale",
            },
        },
        "valueAddedServices": value_added_services,
        "outputImageProperties": {
            "printerDPI": 300,
            "encodingFormat": "pdf",
            "imageOptions": [{"typeCode": "label", "templateName": "ECOM26_84_001"}],
        },
    }

    return payload


async def submit_shipment_dhl(shipment: Shipment, items: list, db: Session):
    """Submit shipment to DHL Express MyDHL API."""
    dhl_payload = build_dhl_payload(shipment, items)

    auth_str = f"{DHL_API_KEY}:{DHL_API_SECRET}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{DHL_BASE_URL}/shipments",
                json=dhl_payload,
                headers={
                    "Authorization": f"Basic {auth_b64}",
                    "Content-Type": "application/json",
                },
            )

        carrier_response = None
        try:
            carrier_response = resp.json()
        except Exception:
            carrier_response = {"raw": resp.text[:2000]}

        shipment.carrier_request_payload = dhl_payload
        shipment.carrier_response_payload = carrier_response

        if resp.status_code in (200, 201) and isinstance(carrier_response, dict):
            awb = carrier_response.get("shipmentTrackingNumber", "")

            # Extract label from documents array
            label_b64 = ""
            documents = carrier_response.get("documents", [])
            for doc in documents:
                if isinstance(doc, dict) and doc.get("typeCode") == "label":
                    label_b64 = doc.get("content", "")
                    break
            # Fallback: check packages for individual labels
            if not label_b64:
                packages = carrier_response.get("packages", [])
                if packages and isinstance(packages[0], dict):
                    pkg_docs = packages[0].get("documents", [])
                    for doc in pkg_docs:
                        if isinstance(doc, dict):
                            label_b64 = doc.get("content", "")
                            if label_b64:
                                break

            if awb:
                shipment.airwaybill_number = awb
                shipment.tracking_number = awb
                shipment.status = "submitted"
                shipment.status_message = "Submitted to DHL Express successfully"
                shipment.last_status_change_at = datetime.utcnow()

                if label_b64:
                    shipment.label_base64 = label_b64

                logger.info(f"Shipment {shipment.id} DHL submitted: AWB={awb}")
            else:
                shipment.status = "submit_failed"
                shipment.status_message = f"DHL returned no AWB: {str(carrier_response)[:500]}"
                shipment.last_status_change_at = datetime.utcnow()
        else:
            error_detail = str(carrier_response)[:500] if carrier_response else resp.text[:500]
            shipment.status = "submit_failed"
            shipment.status_message = f"DHL HTTP {resp.status_code}: {error_detail}"
            shipment.last_status_change_at = datetime.utcnow()
            logger.error(f"Shipment {shipment.id} DHL submit failed: HTTP {resp.status_code}")

    except httpx.TimeoutException:
        shipment.status = "submit_failed"
        shipment.status_message = "DHL API request timed out"
        shipment.last_status_change_at = datetime.utcnow()
    except Exception as e:
        shipment.status = "submit_failed"
        shipment.status_message = f"DHL error: {str(e)[:500]}"
        shipment.last_status_change_at = datetime.utcnow()


# DHL event code -> internal status mapping
DHL_STATUS_MAP = {
    "OK": "delivered",
    "PU": "in_transit",
    "SA": "in_transit",
    "AF": "in_transit",
    "DF": "in_transit",
    "PL": "in_transit",
    "IC": "in_transit",
    "CR": "in_transit",
    "WC": "in_transit",
    "OH": "in_transit",
    "CC": "in_transit",
    "FD": "in_transit",
    "SD": "in_transit",
    "ND": "failed",
    "RD": "failed",
    "RT": "failed",
    "BA": "failed",
    "HP": "in_transit",
    "DD": "delivered",
}


async def track_shipment_dhl(awb: str) -> dict:
    """Query DHL Express tracking by AWB number."""
    auth_str = f"{DHL_API_KEY}:{DHL_API_SECRET}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{DHL_BASE_URL}/tracking",
            params={"shipmentTrackingNumber": awb},
            headers={"Authorization": f"Basic {auth_b64}"},
        )
    if resp.status_code in (200, 201):
        return resp.json()
    raise Exception(f"DHL tracking HTTP {resp.status_code}: {resp.text[:300]}")


def parse_dhl_tracking(raw: dict) -> tuple:
    """Parse DHL tracking response into (new_status, status_message, events_list)."""
    events = []
    new_status = None
    status_msg = None

    shipments = raw.get("shipments", [])
    if not shipments:
        return (None, None, [])

    shipment_data = shipments[0]

    dhl_events = shipment_data.get("events", [])
    for evt in dhl_events:
        if not isinstance(evt, dict):
            continue

        # Location from serviceArea or location.address
        location = None
        svc_area = evt.get("serviceArea", {})
        if isinstance(svc_area, dict):
            location = svc_area.get("description")
        if not location:
            loc = evt.get("location", {})
            if isinstance(loc, dict):
                addr = loc.get("address", {})
                if isinstance(addr, dict):
                    location = addr.get("addressLocality")

        events.append({
            "event_code": evt.get("typeCode") or evt.get("statusCode") or "",
            "event_description": evt.get("description") or evt.get("status") or "",
            "event_date": evt.get("timestamp") or evt.get("date") or "",
            "event_location": location or "",
            "event_detail": evt.get("remark") or "",
        })

    # Derive internal status from latest event
    if events:
        latest_code = events[0].get("event_code", "")
        new_status = DHL_STATUS_MAP.get(latest_code)
        if not new_status:
            latest_desc = (events[0].get("event_description") or "").lower()
            if "delivered" in latest_desc:
                new_status = "delivered"
            elif "returned" in latest_desc:
                new_status = "failed"
            else:
                new_status = "in_transit"
        status_msg = events[0].get("event_description")

    return (new_status, status_msg, events)


# ---------- Pydantic schemas ----------


class ShipmentItemBase(BaseModel):
    quantity: int
    weight_value: float
    weight_unit: int
    customs_value: float
    customs_currency: str = Field(min_length=3, max_length=3)
    comments: Optional[str] = None
    reference: Optional[str] = None
    commodity_code: Optional[str] = None
    goods_description: str
    country_of_origin: Optional[str] = Field(default=None, min_length=2, max_length=2)
    package_type: Optional[str] = None
    contains_dangerous_goods: bool = False


class ShipmentItemCreate(ShipmentItemBase):
    woo_order_item_id: Optional[int] = None
    woo_product_id: Optional[int] = None
    woo_variation_id: Optional[int] = None


class ShipmentItemRead(ShipmentItemBase):
    id: int

    model_config = {"from_attributes": True}


class ConsigneeInfo(BaseModel):
    person_name: str
    company_name: Optional[str] = None
    phone1: Optional[str] = None
    phone2: Optional[str] = None
    cell_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    type: Optional[str] = None
    civil_id: Optional[str] = None

    country_code: str = Field(min_length=2, max_length=2)
    city: str
    district: Optional[str] = None
    line1: str
    line2: Optional[str] = None
    line3: Optional[str] = None
    post_code: Optional[str] = None
    longitude: Optional[str] = None
    latitude: Optional[str] = None
    location_code1: Optional[str] = None
    location_code2: Optional[str] = None
    location_code3: Optional[str] = None
    short_address: Optional[str] = None


class ShipperInfo(BaseModel):
    person_name: str
    company_name: Optional[str] = None
    phone1: Optional[str] = None
    phone2: Optional[str] = None
    cell_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    type: Optional[str] = None

    country_code: str = Field(min_length=2, max_length=2)
    city: str
    line1: str
    line2: Optional[str] = None
    line3: Optional[str] = None
    post_code: Optional[str] = None
    longitude: Optional[str] = None
    latitude: Optional[str] = None
    location_code1: Optional[str] = None
    location_code2: Optional[str] = None
    location_code3: Optional[str] = None


class ShipmentBase(BaseModel):
    woo_order_id: Optional[int] = None
    woo_order_number: Optional[str] = None

    carrier_code: Optional[str] = "naqel"
    customer_code: str
    branch_code: str
    product_type: str
    description_of_goods: str
    number_of_pieces: int

    shipping_datetime: datetime
    due_date: Optional[datetime] = None

    cod_amount: Optional[float] = None
    cod_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    customs_declared_value: Optional[float] = None
    customs_value_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)

    shipment_weight_value: float
    shipment_weight_unit: int
    shipment_length: Optional[float] = None
    shipment_width: Optional[float] = None
    shipment_height: Optional[float] = None
    shipment_dimension_unit: Optional[int] = None

    shipper_reference1: Optional[str] = None
    shipper_note1: Optional[str] = None
    include_label: bool = True
    include_office_details: bool = True

    consignee: ConsigneeInfo
    shipper: ShipperInfo


class ShipmentCreate(ShipmentBase):
    items: List[ShipmentItemCreate]


class ShipmentRead(ShipmentBase):
    id: int
    status: str
    status_message: Optional[str] = None
    airwaybill_number: Optional[str] = None
    tracking_number: Optional[str] = None
    label_base64: Optional[str] = None
    last_tracked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: List[ShipmentItemRead] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def build_consignee_shipper_from_orm(cls, data):
        """Convert ORM Shipment (flat consignee_*/shipper_* columns) to nested consignee/shipper."""
        if not hasattr(data, "consignee_person_name"):
            return data
        return {
            "id": data.id,
            "status": data.status,
            "status_message": data.status_message,
            "airwaybill_number": data.airwaybill_number,
            "tracking_number": data.tracking_number,
            "label_base64": data.label_base64,
            "last_tracked_at": data.last_tracked_at,
            "created_at": data.created_at,
            "updated_at": data.updated_at,
            "items": getattr(data, "items", []),
            "woo_order_id": data.woo_order_id,
            "woo_order_number": data.woo_order_number,
            "carrier_code": data.carrier_code,
            "customer_code": data.customer_code,
            "branch_code": data.branch_code,
            "product_type": data.product_type,
            "description_of_goods": data.description_of_goods,
            "number_of_pieces": data.number_of_pieces,
            "shipping_datetime": data.shipping_datetime,
            "due_date": data.due_date,
            "cod_amount": float(data.cod_amount) if data.cod_amount is not None else None,
            "cod_currency": data.cod_currency,
            "customs_declared_value": float(data.customs_declared_value) if data.customs_declared_value is not None else None,
            "customs_value_currency": data.customs_value_currency,
            "shipment_weight_value": float(data.shipment_weight_value),
            "shipment_weight_unit": data.shipment_weight_unit,
            "shipment_length": float(data.shipment_length) if data.shipment_length is not None else None,
            "shipment_width": float(data.shipment_width) if data.shipment_width is not None else None,
            "shipment_height": float(data.shipment_height) if data.shipment_height is not None else None,
            "shipment_dimension_unit": data.shipment_dimension_unit,
            "shipper_reference1": data.shipper_reference1,
            "shipper_note1": data.shipper_note1,
            "include_label": data.include_label,
            "include_office_details": data.include_office_details,
            "consignee": {
                "person_name": data.consignee_person_name,
                "company_name": data.consignee_company_name,
                "phone1": data.consignee_phone1,
                "phone2": data.consignee_phone2,
                "cell_phone": data.consignee_cell_phone,
                "email": data.consignee_email,
                "type": data.consignee_type,
                "civil_id": data.consignee_civil_id,
                "country_code": data.consignee_country_code,
                "city": data.consignee_city,
                "district": data.consignee_district,
                "line1": data.consignee_line1,
                "line2": data.consignee_line2,
                "line3": data.consignee_line3,
                "post_code": data.consignee_post_code,
                "longitude": data.consignee_longitude,
                "latitude": data.consignee_latitude,
                "location_code1": data.consignee_location_code1,
                "location_code2": data.consignee_location_code2,
                "location_code3": data.consignee_location_code3,
                "short_address": data.consignee_short_address,
            },
            "shipper": {
                "person_name": data.shipper_person_name,
                "company_name": data.shipper_company_name,
                "phone1": data.shipper_phone1,
                "phone2": data.shipper_phone2,
                "cell_phone": data.shipper_cell_phone,
                "email": data.shipper_email,
                "type": data.shipper_type,
                "country_code": data.shipper_country_code,
                "city": data.shipper_city,
                "line1": data.shipper_line1,
                "line2": data.shipper_line2,
                "line3": data.shipper_line3,
                "post_code": data.shipper_post_code,
                "longitude": data.shipper_longitude,
                "latitude": data.shipper_latitude,
                "location_code1": data.shipper_location_code1,
                "location_code2": data.shipper_location_code2,
                "location_code3": data.shipper_location_code3,
            },
        }


# ---------- Tracking Pydantic schemas ----------


class TrackingEventRead(BaseModel):
    id: int
    shipment_id: int
    airwaybill_number: str
    event_code: Optional[str] = None
    event_description: Optional[str] = None
    event_date: Optional[datetime] = None
    event_location: Optional[str] = None
    event_detail: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TrackingResponse(BaseModel):
    shipment_id: int
    airwaybill_number: str
    current_status: str
    status_message: Optional[str] = None
    events: List[TrackingEventRead] = []
    last_tracked_at: Optional[datetime] = None


class BulkTrackingResult(BaseModel):
    total_tracked: int
    updated: int
    errors: int
    details: List[dict] = []


# ---------- FastAPI app and routes ----------


app = FastAPI(title="Shipping Integration Service")
router = APIRouter(prefix="/shipments", tags=["shipments"])


@router.post("/shipment", response_model=ShipmentRead, status_code=status.HTTP_201_CREATED)
def create_shipment_endpoint(payload: ShipmentCreate, db: Session = Depends(get_db)):
    """Create a shipment + items in DB."""
    shipment = Shipment(
        woo_order_id=payload.woo_order_id,
        woo_order_number=payload.woo_order_number,
        carrier_code=payload.carrier_code or "naqel",
        customer_code=payload.customer_code,
        branch_code=payload.branch_code,
        product_type=payload.product_type,
        description_of_goods=payload.description_of_goods,
        number_of_pieces=payload.number_of_pieces,
        shipping_datetime=payload.shipping_datetime,
        due_date=payload.due_date,
        cod_amount=payload.cod_amount,
        cod_currency=payload.cod_currency,
        customs_declared_value=payload.customs_declared_value,
        customs_value_currency=payload.customs_value_currency,
        shipment_weight_value=payload.shipment_weight_value,
        shipment_weight_unit=payload.shipment_weight_unit,
        shipment_length=payload.shipment_length,
        shipment_width=payload.shipment_width,
        shipment_height=payload.shipment_height,
        shipment_dimension_unit=payload.shipment_dimension_unit,
        shipper_reference1=payload.shipper_reference1,
        shipper_note1=payload.shipper_note1,
        include_label=payload.include_label,
        include_office_details=payload.include_office_details,
        consignee_person_name=payload.consignee.person_name,
        consignee_company_name=payload.consignee.company_name,
        consignee_phone1=payload.consignee.phone1,
        consignee_phone2=payload.consignee.phone2,
        consignee_cell_phone=payload.consignee.cell_phone,
        consignee_email=payload.consignee.email,
        consignee_type=payload.consignee.type,
        consignee_civil_id=payload.consignee.civil_id,
        consignee_country_code=payload.consignee.country_code,
        consignee_city=payload.consignee.city,
        consignee_district=payload.consignee.district,
        consignee_line1=payload.consignee.line1,
        consignee_line2=payload.consignee.line2,
        consignee_line3=payload.consignee.line3,
        consignee_post_code=payload.consignee.post_code,
        consignee_longitude=payload.consignee.longitude,
        consignee_latitude=payload.consignee.latitude,
        consignee_location_code1=payload.consignee.location_code1,
        consignee_location_code2=payload.consignee.location_code2,
        consignee_location_code3=payload.consignee.location_code3,
        consignee_short_address=payload.consignee.short_address,
        shipper_person_name=payload.shipper.person_name,
        shipper_company_name=payload.shipper.company_name,
        shipper_phone1=payload.shipper.phone1,
        shipper_phone2=payload.shipper.phone2,
        shipper_cell_phone=payload.shipper.cell_phone,
        shipper_email=payload.shipper.email,
        shipper_type=payload.shipper.type,
        shipper_country_code=payload.shipper.country_code,
        shipper_city=payload.shipper.city,
        shipper_line1=payload.shipper.line1,
        shipper_line2=payload.shipper.line2,
        shipper_line3=payload.shipper.line3,
        shipper_post_code=payload.shipper.post_code,
        shipper_longitude=payload.shipper.longitude,
        shipper_latitude=payload.shipper.latitude,
        shipper_location_code1=payload.shipper.location_code1,
        shipper_location_code2=payload.shipper.location_code2,
        shipper_location_code3=payload.shipper.location_code3,
        status="created",
    )

    db.add(shipment)
    db.flush()

    for item_data in payload.items:
        item = ShipmentItem(
            shipment_id=shipment.id,
            woo_order_item_id=item_data.woo_order_item_id,
            woo_product_id=item_data.woo_product_id,
            woo_variation_id=item_data.woo_variation_id,
            quantity=item_data.quantity,
            weight_value=item_data.weight_value,
            weight_unit=item_data.weight_unit,
            customs_value=item_data.customs_value,
            customs_currency=item_data.customs_currency,
            comments=item_data.comments,
            reference=item_data.reference,
            commodity_code=item_data.commodity_code,
            goods_description=item_data.goods_description,
            country_of_origin=item_data.country_of_origin,
            package_type=item_data.package_type,
            contains_dangerous_goods=item_data.contains_dangerous_goods,
        )
        db.add(item)

    db.commit()
    db.refresh(shipment)
    shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment.id).all()

    return shipment


@router.get("/shipment", response_model=List[ShipmentRead])
def list_shipments_endpoint(
    status_filter: Optional[str] = None,
    woo_order_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List shipments with optional filters."""
    query = db.query(Shipment)

    if status_filter:
        query = query.filter(Shipment.status == status_filter)
    if woo_order_id:
        query = query.filter(Shipment.woo_order_id == woo_order_id)

    shipments = query.order_by(Shipment.created_at.desc()).offset(offset).limit(limit).all()

    for shipment in shipments:
        shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment.id).all()
        # Strip label_base64 from list response (can be 300KB+ per shipment)
        shipment.label_base64 = None

    return shipments


@router.get("/shipment/{shipment_id}", response_model=ShipmentRead)
def get_shipment_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Get a single shipment with items."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()
    return shipment


@router.patch("/shipment/{shipment_id}", response_model=ShipmentRead)
async def update_shipment_endpoint(shipment_id: int, payload: dict, db: Session = Depends(get_db)):
    """Partially update a shipment. Supports setting status to 'cancelled'."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    ALLOWED_FIELDS = {"status", "status_message"}
    for key, value in payload.items():
        if key not in ALLOWED_FIELDS:
            continue
        if key == "status" and value == "cancelled":
            # Only allow cancelling shipments that haven't been delivered
            if shipment.status == "delivered":
                raise HTTPException(status_code=400, detail="Cannot cancel a delivered shipment")
            shipment.status = "cancelled"
            shipment.status_message = payload.get("status_message", "Cancelled by user")
            shipment.last_status_change_at = func.now()
        elif key == "status_message":
            shipment.status_message = value

    db.commit()
    db.refresh(shipment)
    shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()
    return shipment


@router.delete("/shipment/{shipment_id}", status_code=204)
async def delete_shipment_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Delete a shipment and its items. Only non-submitted shipments can be deleted."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # Prevent deleting shipments that have been submitted to carrier
    if shipment.airwaybill_number:
        raise HTTPException(status_code=400, detail=f"Cannot delete submitted shipment (AWB: {shipment.airwaybill_number})")

    db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).delete()
    db.delete(shipment)
    db.commit()
    return None


@router.post("/shipment/{shipment_id}/submit", response_model=ShipmentRead)
async def submit_shipment_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """
    Submit a shipment to carrier (Naqel or SMSA) based on carrier_code.
    """
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if shipment.airwaybill_number:
        raise HTTPException(status_code=400, detail=f"Shipment already submitted (AWB: {shipment.airwaybill_number})")

    items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()

    carrier = (shipment.carrier_code or "naqel").lower()

    if carrier == "smsa":
        # ---------- SMSA submit ----------
        await submit_shipment_smsa(shipment, items, db)
    elif carrier == "dhl":
        # ---------- DHL Express submit ----------
        await submit_shipment_dhl(shipment, items, db)
    elif carrier in ("naqel", "gn_connect"):
        # ---------- Naqel / GN Connect submit (AWB auto-generated by Naqel) ----------
        token = await get_naqel_token()
        url = f"{NAQEL_BASE_URL}/api/gnconnect/Shipments"
        naqel_payload = build_naqel_payload(shipment, items, awb_number="")

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    url,
                    json=naqel_payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )

            carrier_response = None
            try:
                carrier_response = resp.json()
            except Exception:
                carrier_response = {"raw": resp.text[:2000]}

            shipment.carrier_request_payload = naqel_payload
            shipment.carrier_response_payload = carrier_response

            if resp.status_code in (200, 201) and isinstance(carrier_response, dict):
                naqel_status = carrier_response.get("status", "")

                if naqel_status == "Success":
                    resp_awb = carrier_response.get("airwaybill", "")
                    label_b64 = carrier_response.get("shipmentLabel", "")

                    shipment.airwaybill_number = resp_awb
                    shipment.tracking_number = resp_awb
                    shipment.status = "submitted"
                    shipment.status_message = "Submitted to Naqel successfully"
                    shipment.last_status_change_at = datetime.utcnow()

                    if label_b64:
                        shipment.label_base64 = label_b64

                    logger.info(f"Shipment {shipment_id} submitted: AWB={resp_awb}")
                else:
                    error_msg = carrier_response.get("message") or carrier_response.get("detail") or str(carrier_response)
                    shipment.status = "submit_failed"
                    shipment.status_message = f"Naqel error: {error_msg[:500]}"
                    shipment.last_status_change_at = datetime.utcnow()
                    logger.warning(f"Shipment {shipment_id} Naqel error: {error_msg}")
            else:
                error_detail = str(carrier_response)[:500] if carrier_response else resp.text[:500]
                shipment.status = "submit_failed"
                shipment.status_message = f"Naqel HTTP {resp.status_code}: {error_detail}"
                shipment.last_status_change_at = datetime.utcnow()
                logger.error(f"Shipment {shipment_id} submit failed: HTTP {resp.status_code}")

        except httpx.TimeoutException:
            shipment.status = "submit_failed"
            shipment.status_message = "Naqel API request timed out"
            shipment.last_status_change_at = datetime.utcnow()
        except Exception as e:
            shipment.status = "submit_failed"
            shipment.status_message = f"Error: {str(e)[:500]}"
            shipment.last_status_change_at = datetime.utcnow()
    else:
        raise HTTPException(status_code=400, detail=f"Unknown carrier: {carrier}")

    db.commit()
    db.refresh(shipment)
    shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()

    return shipment


# ---------- Label download endpoint ----------


@router.get("/shipment/{shipment_id}/label")
async def get_label_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Download the shipment label as PDF.

    First tries to fetch a fresh label from the dedicated LabelPrint endpoint
    (which produces the correct Naqel label layout). Falls back to stored
    inline label from shipment creation if LabelPrint fails.
    """
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.airwaybill_number:
        raise HTTPException(status_code=404, detail="No AWB — shipment not yet submitted")

    carrier = (shipment.carrier_code or "naqel").lower()
    label_b64 = None

    if carrier == "smsa":
        # SMSA: label was stored during submit (no separate endpoint)
        label_b64 = shipment.label_base64
    elif carrier == "dhl":
        # DHL: label was stored during submit (returned in create response)
        label_b64 = shipment.label_base64
    else:
        # Naqel: try dedicated LabelPrint endpoint for proper layout
        try:
            token = await get_naqel_token()
            url = f"{NAQEL_BASE_URL}/api/gnconnect/Shipments/LabelPrint"
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json={
                    "airwaybills": [shipment.airwaybill_number],
                    "labelFormat": "PDF",
                    "labelSize": "4X6",
                    "customerCode": shipment.customer_code or NAQEL_CUSTOMER_CODE,
                    "branchCode": shipment.branch_code or NAQEL_BRANCH_CODE,
                }, headers={
                    "Authorization": f"token {token}",
                    "Content-Type": "application/json",
                })
                if resp.status_code in (200, 201):
                    data = resp.json()
                    if isinstance(data, str) and len(data) > 100:
                        label_b64 = data
                    elif isinstance(data, dict):
                        label_b64 = data.get("shipmentLabel") or data.get("label") or data.get("labelData") or ""
                    elif isinstance(data, list) and len(data) > 0:
                        item = data[0]
                        if isinstance(item, str) and len(item) > 100:
                            label_b64 = item
                        elif isinstance(item, dict):
                            label_b64 = item.get("shipmentLabel") or item.get("label") or item.get("labelData") or ""

                    if label_b64:
                        shipment.label_base64 = label_b64
                        db.commit()
                        logger.info(f"Label refreshed from LabelPrint for shipment {shipment_id}")
        except Exception as e:
            logger.warning(f"LabelPrint API call failed for shipment {shipment_id}: {e}")

        # Fall back to stored label
        if not label_b64:
            label_b64 = shipment.label_base64

    if not label_b64:
        raise HTTPException(status_code=404, detail="No label available for this shipment")

    try:
        pdf_bytes = base64.b64decode(label_b64)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decode label data")

    filename = f"label_{shipment.airwaybill_number or shipment_id}.pdf"
    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- Tracking endpoints ----------


@router.post("/tracking/poll", response_model=BulkTrackingResult)
async def bulk_track_endpoint(db: Session = Depends(get_db)):
    """Poll tracking status for all submitted/in_transit shipments."""
    trackable = db.query(Shipment).filter(
        Shipment.status.in_(["submitted", "in_transit"]),
        Shipment.airwaybill_number.isnot(None),
    ).all()

    if not trackable:
        return BulkTrackingResult(total_tracked=0, updated=0, errors=0)

    # Get Naqel token only if there are Naqel shipments
    naqel_shipments = [s for s in trackable if (s.carrier_code or "naqel").lower() in ("naqel", "gn_connect")]
    smsa_shipments = [s for s in trackable if (s.carrier_code or "").lower() == "smsa"]
    dhl_shipments = [s for s in trackable if (s.carrier_code or "").lower() == "dhl"]
    token = await get_naqel_token() if naqel_shipments else None

    updated = 0
    errors = 0
    details = []

    # Track Naqel shipments
    for shipment in naqel_shipments:
        try:
            raw = await track_shipment_gn(
                shipment.airwaybill_number,
                shipment.customer_code,
                shipment.branch_code,
                token,
            )
            new_status, status_msg, parsed_events = parse_tracking_response(raw)
            new_count = _store_tracking_events(db, shipment.id, shipment.airwaybill_number, parsed_events)

            if new_status and new_status != shipment.status:
                shipment.status = new_status
                shipment.status_message = status_msg
                shipment.last_status_change_at = datetime.utcnow()
                updated += 1

            shipment.last_tracked_at = datetime.utcnow()
            details.append({
                "shipment_id": shipment.id,
                "awb": shipment.airwaybill_number,
                "new_events": new_count,
                "status": shipment.status,
            })
        except Exception as e:
            errors += 1
            details.append({
                "shipment_id": shipment.id,
                "awb": shipment.airwaybill_number,
                "error": str(e)[:200],
            })
            logger.warning(f"Track {shipment.airwaybill_number} failed: {e}")

    # Track SMSA shipments
    for shipment in smsa_shipments:
        try:
            smsa_data = await track_shipment_smsa(shipment.airwaybill_number)
            shipment.status_message = f"SMSA query OK"
            shipment.last_tracked_at = datetime.utcnow()
            details.append({
                "shipment_id": shipment.id,
                "awb": shipment.airwaybill_number,
                "new_events": 0,
                "status": shipment.status,
            })
        except Exception as e:
            errors += 1
            details.append({
                "shipment_id": shipment.id,
                "awb": shipment.airwaybill_number,
                "error": str(e)[:200],
            })
            logger.warning(f"SMSA track {shipment.airwaybill_number} failed: {e}")

    # Track DHL shipments
    for shipment in dhl_shipments:
        try:
            raw = await track_shipment_dhl(shipment.airwaybill_number)
            new_status, status_msg, parsed_events = parse_dhl_tracking(raw)
            new_count = _store_tracking_events(db, shipment.id, shipment.airwaybill_number, parsed_events)

            if new_status and new_status != shipment.status:
                shipment.status = new_status
                shipment.status_message = status_msg
                shipment.last_status_change_at = datetime.utcnow()
                updated += 1

            shipment.last_tracked_at = datetime.utcnow()
            details.append({
                "shipment_id": shipment.id,
                "awb": shipment.airwaybill_number,
                "new_events": new_count,
                "status": shipment.status,
            })
        except Exception as e:
            errors += 1
            details.append({
                "shipment_id": shipment.id,
                "awb": shipment.airwaybill_number,
                "error": str(e)[:200],
            })
            logger.warning(f"DHL track {shipment.airwaybill_number} failed: {e}")

    db.commit()
    return BulkTrackingResult(total_tracked=len(trackable), updated=updated, errors=errors, details=details)


@router.post("/shipment/{shipment_id}/track", response_model=TrackingResponse)
async def track_shipment_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Track a single shipment via GN Connect API."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.airwaybill_number:
        raise HTTPException(status_code=400, detail="Shipment has no AWB — cannot track")

    # For terminal statuses, just return cached events
    if shipment.status not in ("submitted", "in_transit"):
        existing = (
            db.query(TrackingEvent)
            .filter(TrackingEvent.shipment_id == shipment_id)
            .order_by(TrackingEvent.event_date.desc())
            .all()
        )
        return TrackingResponse(
            shipment_id=shipment.id,
            airwaybill_number=shipment.airwaybill_number,
            current_status=shipment.status,
            status_message=shipment.status_message,
            events=[TrackingEventRead.model_validate(e) for e in existing],
            last_tracked_at=shipment.last_tracked_at,
        )

    carrier = (shipment.carrier_code or "naqel").lower()

    if carrier == "smsa":
        # SMSA: query by AWB — returns shipment data, not event timeline
        try:
            await track_shipment_smsa(shipment.airwaybill_number)
            shipment.status_message = "SMSA query OK"
        except Exception as e:
            shipment.status_message = f"SMSA tracking error: {str(e)[:200]}"
            logger.warning(f"SMSA track {shipment.airwaybill_number}: {e}")
    elif carrier == "dhl":
        # DHL: full event timeline via tracking API
        raw = await track_shipment_dhl(shipment.airwaybill_number)
        new_status, status_msg, parsed_events = parse_dhl_tracking(raw)
        _store_tracking_events(db, shipment.id, shipment.airwaybill_number, parsed_events)

        if new_status and new_status != shipment.status:
            shipment.status = new_status
            shipment.status_message = status_msg
            shipment.last_status_change_at = datetime.utcnow()
    else:
        # Naqel / GN Connect
        token = await get_naqel_token()
        raw = await track_shipment_gn(
            shipment.airwaybill_number, shipment.customer_code, shipment.branch_code, token,
        )

        new_status, status_msg, parsed_events = parse_tracking_response(raw)
        _store_tracking_events(db, shipment.id, shipment.airwaybill_number, parsed_events)

        if new_status and new_status != shipment.status:
            shipment.status = new_status
            shipment.status_message = status_msg
            shipment.last_status_change_at = datetime.utcnow()

    shipment.last_tracked_at = datetime.utcnow()
    db.commit()

    all_events = (
        db.query(TrackingEvent)
        .filter(TrackingEvent.shipment_id == shipment_id)
        .order_by(TrackingEvent.event_date.desc())
        .all()
    )

    return TrackingResponse(
        shipment_id=shipment.id,
        airwaybill_number=shipment.airwaybill_number,
        current_status=shipment.status,
        status_message=shipment.status_message,
        events=[TrackingEventRead.model_validate(e) for e in all_events],
        last_tracked_at=shipment.last_tracked_at,
    )


@router.get("/shipment/{shipment_id}/tracking-events", response_model=List[TrackingEventRead])
def get_tracking_events_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Get cached tracking events (no external API call)."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    events = (
        db.query(TrackingEvent)
        .filter(TrackingEvent.shipment_id == shipment_id)
        .order_by(TrackingEvent.event_date.desc())
        .all()
    )
    return events


# ---------- Background tracking poller (3-hour interval) ----------

import asyncio

TRACKING_POLL_INTERVAL = 3 * 60 * 60  # 3 hours
_polling_task: Optional[asyncio.Task] = None


async def tracking_poller():
    """Background task: poll GN Connect tracking every 3 hours."""
    while True:
        await asyncio.sleep(TRACKING_POLL_INTERVAL)
        try:
            logger.info("Auto-tracking poll starting...")
            db = SessionLocal()
            try:
                trackable = db.query(Shipment).filter(
                    Shipment.status.in_(["submitted", "in_transit"]),
                    Shipment.airwaybill_number.isnot(None),
                ).all()

                if not trackable:
                    logger.info("No trackable shipments found")
                    continue

                naqel_list = [s for s in trackable if (s.carrier_code or "naqel").lower() in ("naqel", "gn_connect")]
                smsa_list = [s for s in trackable if (s.carrier_code or "").lower() == "smsa"]
                dhl_list = [s for s in trackable if (s.carrier_code or "").lower() == "dhl"]
                token = await get_naqel_token() if naqel_list else None
                updated_count = 0

                for shipment in naqel_list:
                    try:
                        raw = await track_shipment_gn(
                            shipment.airwaybill_number,
                            shipment.customer_code,
                            shipment.branch_code,
                            token,
                        )
                        new_status, status_msg, parsed_events = parse_tracking_response(raw)
                        _store_tracking_events(db, shipment.id, shipment.airwaybill_number, parsed_events)

                        if new_status and new_status != shipment.status:
                            shipment.status = new_status
                            shipment.status_message = status_msg
                            shipment.last_status_change_at = datetime.utcnow()
                            updated_count += 1

                        shipment.last_tracked_at = datetime.utcnow()
                    except Exception as e:
                        logger.warning(f"Auto-track {shipment.airwaybill_number}: {e}")

                for shipment in smsa_list:
                    try:
                        await track_shipment_smsa(shipment.airwaybill_number)
                        shipment.last_tracked_at = datetime.utcnow()
                    except Exception as e:
                        logger.warning(f"Auto-track SMSA {shipment.airwaybill_number}: {e}")

                for shipment in dhl_list:
                    try:
                        raw = await track_shipment_dhl(shipment.airwaybill_number)
                        new_status, status_msg, parsed_events = parse_dhl_tracking(raw)
                        _store_tracking_events(db, shipment.id, shipment.airwaybill_number, parsed_events)

                        if new_status and new_status != shipment.status:
                            shipment.status = new_status
                            shipment.status_message = status_msg
                            shipment.last_status_change_at = datetime.utcnow()
                            updated_count += 1

                        shipment.last_tracked_at = datetime.utcnow()
                    except Exception as e:
                        logger.warning(f"Auto-track DHL {shipment.airwaybill_number}: {e}")

                db.commit()
                logger.info(f"Auto-tracking poll done: {len(trackable)} checked, {updated_count} updated")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Auto-tracking poll error: {e}")


@app.on_event("startup")
async def startup_event():
    global _polling_task
    _polling_task = asyncio.create_task(tracking_poller())
    logger.info("Tracking background poller started (3h interval)")


@app.on_event("shutdown")
async def shutdown_event():
    global _polling_task
    if _polling_task:
        _polling_task.cancel()


# ---------- Exchange Rate endpoints ----------

exchange_router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


@exchange_router.get("/")
def list_exchange_rates(db: Session = Depends(get_db)):
    """Get all cached exchange rates."""
    rates = refresh_rates(db)
    return {
        "rates": {
            code: {
                "rate_to_usd": info["rate_to_usd"],
                "forex_buying_try": info.get("forex_buying_try"),
                "forex_selling_try": info.get("forex_selling_try"),
                "unit": info.get("unit", 1),
            }
            for code, info in rates.items()
        },
        "source_date": _rates_source_date,
        "fetched_at": _rates_fetched_at.isoformat() if _rates_fetched_at else None,
        "count": len(rates),
    }


@exchange_router.get("/convert")
def convert_endpoint(
    amount: float = Query(..., description="Amount to convert"),
    from_currency: str = Query("USD", alias="from", description="Source currency code"),
    to_currency: str = Query(..., alias="to", description="Target currency code"),
    db: Session = Depends(get_db),
):
    """Convert an amount between currencies."""
    converted = convert_currency(amount, from_currency, to_currency, db)
    return {
        "amount": amount,
        "from": from_currency.upper(),
        "to": to_currency.upper(),
        "converted": converted,
        "source_date": _rates_source_date,
    }


@exchange_router.post("/refresh")
def refresh_endpoint(db: Session = Depends(get_db)):
    """Force refresh exchange rates (OXR primary, TCMB fallback)."""
    rates = refresh_rates(db, force=True)
    return {
        "message": "Rates refreshed",
        "count": len(rates),
        "source_date": _rates_source_date,
        "fetched_at": _rates_fetched_at.isoformat() if _rates_fetched_at else None,
    }


app.include_router(router)
app.include_router(exchange_router)
