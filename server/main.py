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
NAQEL_SUPPLIER_CODE = os.getenv("NAQEL_SUPPLIER_CODE", "SPL")

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


# Link back relationship
ShipmentItem.shipment = relationship("Shipment", back_populates="items")


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


# ---------- TCMB Exchange Rate Cache (in-memory + DB fallback) ----------

TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml"
TCMB_CACHE_TTL = 4 * 60 * 60  # 4 hours in seconds

# In-memory cache
_rates_cache: Dict[str, float] = {}  # currency_code -> rate_to_usd
_rates_details: Dict[str, dict] = {}  # currency_code -> full details
_rates_fetched_at: Optional[datetime] = None
_rates_source_date: Optional[str] = None


def _fetch_tcmb_rates() -> Dict[str, dict]:
    """Fetch current exchange rates from TCMB XML feed."""
    req = urllib.request.Request(TCMB_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        xml_data = resp.read()

    root = ET.fromstring(xml_data)
    source_date = root.attrib.get("Date", "")

    rates = {}
    # First, get USD TRY rate
    usd_forex_buying = None
    for currency in root.findall("Currency"):
        code = currency.attrib.get("CurrencyCode", "")
        if code == "USD":
            fb = currency.find("ForexBuying")
            if fb is not None and fb.text:
                usd_forex_buying = float(fb.text)
            break

    if not usd_forex_buying:
        raise ValueError("USD rate not found in TCMB data")

    # USD itself
    rates["USD"] = {
        "rate_to_usd": 1.0,
        "forex_buying_try": usd_forex_buying,
        "forex_selling_try": None,
        "unit": 1,
        "source_date": source_date,
    }

    # Parse all other currencies
    for currency in root.findall("Currency"):
        code = currency.attrib.get("CurrencyCode", "")
        if not code or code == "USD":
            continue

        unit_el = currency.find("Unit")
        unit = int(unit_el.text) if unit_el is not None and unit_el.text else 1

        fb = currency.find("ForexBuying")
        fs = currency.find("ForexSelling")
        cross_usd = currency.find("CrossRateUSD")

        forex_buying = float(fb.text) if fb is not None and fb.text else None
        forex_selling = float(fs.text) if fs is not None and fs.text else None

        # Calculate rate: 1 USD = X units of this currency
        rate_to_usd = None

        # Method 1: Use CrossRateUSD directly (preferred)
        if cross_usd is not None and cross_usd.text:
            rate_to_usd = float(cross_usd.text)

        # Method 2: Calculate via TRY cross rate
        if rate_to_usd is None and forex_buying and usd_forex_buying:
            rate_to_usd = (usd_forex_buying / forex_buying) * unit

        if rate_to_usd is not None:
            rates[code] = {
                "rate_to_usd": round(rate_to_usd, 6),
                "forex_buying_try": forex_buying,
                "forex_selling_try": forex_selling,
                "unit": unit,
                "source_date": source_date,
            }

    # TRY itself
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
    """Refresh exchange rates: memory cache → TCMB → DB fallback."""
    global _rates_cache, _rates_details, _rates_fetched_at, _rates_source_date

    now = datetime.utcnow()

    # Check memory cache
    if not force and _rates_fetched_at and (now - _rates_fetched_at).total_seconds() < TCMB_CACHE_TTL:
        return _rates_details

    # Try TCMB
    try:
        rates = _fetch_tcmb_rates()
        _rates_details = rates
        _rates_cache = {k: v["rate_to_usd"] for k, v in rates.items()}
        _rates_fetched_at = now
        _rates_source_date = next(iter(rates.values()), {}).get("source_date")

        # Save to DB
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


def build_naqel_payload(shipment: Shipment, items: list) -> dict:
    """Build the GN Connect API request payload from our DB shipment."""
    # Shipper country code: convert ISO2 to ISO3
    shipper_cc = shipment.shipper_country_code or "TR"
    shipper_iso3 = COUNTRY_ISO2_TO_ISO3.get(shipper_cc.upper(), shipper_cc)

    payload = {
        "customerCode": shipment.customer_code,
        "branchCode": shipment.branch_code,
        "shippingDateTime": shipment.shipping_datetime.isoformat() if shipment.shipping_datetime else datetime.utcnow().isoformat(),
        "descriptionOfGoods": (shipment.description_of_goods or "Goods")[:100],
        "numberOfPieces": str(shipment.number_of_pieces or 1),
        "customsDeclaredValue": float(shipment.customs_declared_value) if shipment.customs_declared_value else 0,
        "customsDeclaredValueCurrency": shipment.customs_value_currency or "USD",
        "productType": shipment.product_type or "DLV",
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
    airwaybill_number: Optional[str] = None
    tracking_number: Optional[str] = None
    label_base64: Optional[str] = None
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
            "airwaybill_number": data.airwaybill_number,
            "tracking_number": data.tracking_number,
            "label_base64": data.label_base64,
            "created_at": data.created_at,
            "updated_at": data.updated_at,
            "items": getattr(data, "items", []),
            "woo_order_id": data.woo_order_id,
            "woo_order_number": data.woo_order_number,
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


# ---------- FastAPI app and routes ----------


app = FastAPI(title="Shipping Integration Service")
router = APIRouter(prefix="/shipments", tags=["shipments"])


@router.post("/", response_model=ShipmentRead, status_code=status.HTTP_201_CREATED)
def create_shipment_endpoint(payload: ShipmentCreate, db: Session = Depends(get_db)):
    """Create a shipment + items in DB."""
    shipment = Shipment(
        woo_order_id=payload.woo_order_id,
        woo_order_number=payload.woo_order_number,
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


@router.get("/", response_model=List[ShipmentRead])
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

    return shipments


@router.get("/{shipment_id}", response_model=ShipmentRead)
def get_shipment_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Get a single shipment with items."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()
    return shipment


@router.patch("/{shipment_id}", response_model=ShipmentRead)
async def update_shipment_endpoint(shipment_id: int, payload: dict):
    """Partially update a shipment (placeholder)."""
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Not implemented yet")


@router.post("/{shipment_id}/submit", response_model=ShipmentRead)
async def submit_shipment_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """
    Submit a shipment to Naqel via GN Connect API.
    1. Read shipment from DB
    2. Get bearer token from GN Connect
    3. Build payload and call Shipments endpoint
    4. Store request/response, update AWB/status/label
    5. Return updated shipment
    """
    # 1. Get shipment from DB
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if shipment.airwaybill_number:
        raise HTTPException(status_code=400, detail=f"Shipment already submitted (AWB: {shipment.airwaybill_number})")

    items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()

    # 2. Get Naqel token
    token = await get_naqel_token()

    # 3. Build request payload
    naqel_payload = build_naqel_payload(shipment, items)

    # 4. Call GN Connect API
    url = f"{NAQEL_BASE_URL}/api/gnconnect/Shipments"
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

        # Store request/response regardless of outcome
        shipment.carrier_request_payload = naqel_payload
        shipment.carrier_response_payload = carrier_response

        # Check for success (Naqel returns 200 or 201)
        if resp.status_code in (200, 201) and isinstance(carrier_response, dict):
            naqel_status = carrier_response.get("status", "")

            if naqel_status == "Success":
                awb = carrier_response.get("airwaybill", "")
                label_b64 = carrier_response.get("shipmentLabel", "")

                shipment.airwaybill_number = awb
                shipment.tracking_number = awb
                shipment.status = "submitted"
                shipment.status_message = "Submitted to Naqel successfully"
                shipment.last_status_change_at = datetime.utcnow()

                if label_b64:
                    shipment.label_base64 = label_b64

                logger.info(f"Shipment {shipment_id} submitted: AWB={awb}")
            else:
                # Naqel returned 200 but with error (fake-200)
                error_msg = carrier_response.get("message") or carrier_response.get("detail") or str(carrier_response)
                shipment.status = "submit_failed"
                shipment.status_message = f"Naqel error: {error_msg[:500]}"
                shipment.last_status_change_at = datetime.utcnow()
                logger.warning(f"Shipment {shipment_id} Naqel fake-200 error: {error_msg}")
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

    db.commit()
    db.refresh(shipment)
    shipment.items = db.query(ShipmentItem).filter(ShipmentItem.shipment_id == shipment_id).all()

    return shipment


# ---------- Label download endpoint ----------


@router.get("/{shipment_id}/label")
def get_label_endpoint(shipment_id: int, db: Session = Depends(get_db)):
    """Download the shipment label as PDF."""
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.label_base64:
        raise HTTPException(status_code=404, detail="No label available for this shipment")

    try:
        pdf_bytes = base64.b64decode(shipment.label_base64)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decode label data")

    filename = f"label_{shipment.airwaybill_number or shipment_id}.pdf"
    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    """Convert an amount between currencies using TCMB rates."""
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
    """Force refresh exchange rates from TCMB."""
    rates = refresh_rates(db, force=True)
    return {
        "message": "Rates refreshed",
        "count": len(rates),
        "source_date": _rates_source_date,
        "fetched_at": _rates_fetched_at.isoformat() if _rates_fetched_at else None,
    }


app.include_router(router)
app.include_router(exchange_router)
