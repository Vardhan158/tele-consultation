import json
import pytest
from fastapi import HTTPException

from teleconsult.domain.schedule_x import (
    PROHIBITED_SCHEDULE_X_SUBSTANCES,
    ScheduleXRestrictionException,
    verify_telemedicine_prescription_safety,
)


def test_allowed_medications_pass_validation():
    """Standard, non-Schedule-X medications must pass safety verification cleanly."""
    valid_prescriptions = [
        # Structured JSON with list of medicines
        {
            "medicines": [
                {"name": "Tab Paracetamol 500mg", "dosage": "1-0-1", "duration": "5 days"},
                {"name": "Cap Amoxicillin 500mg", "dosage": "1-1-1", "duration": "7 days"},
            ],
            "instructions": "Take after meals. Drink plenty of water.",
        },
        # Structured JSON with single medication
        {
            "medication_name": "Metformin 500mg",
            "dosage": "Once daily with breakfast",
            "instructions": "Monitor fasting blood sugar weekly.",
        },
        # Plain text prescription
        "Tab Atorvastatin 20mg once daily at bedtime for 30 days. Tab Aspirin 75mg once daily.",
    ]

    for content in valid_prescriptions:
        # Should not raise any exception
        if isinstance(content, dict):
            verify_telemedicine_prescription_safety(json.dumps(content))
        else:
            verify_telemedicine_prescription_safety(content)


@pytest.mark.parametrize("substance", [
    "ketamine",
    "methylphenidate",
    "amphetamine",
    "methamphetamine",
    "secobarbital",
    "quinalbarbitone",
    "pentobarbital",
    "methaqualone",
    "morphine",
    "fentanyl",
    "buprenorphine",
    "oxycodone",
])
def test_schedule_x_canonical_substances_blocked(substance: str):
    """Canonical Schedule X / NDPS prohibited drugs must be blocked with ScheduleXRestrictionException."""
    # Test as structured medicine item
    payload = json.dumps({
        "medicines": [
            {"name": f"Tab {substance.title()} 10mg", "dosage": "1-0-0", "instructions": "Daily"}
        ],
        "instructions": "Clinical prescription notes",
    })

    with pytest.raises(ScheduleXRestrictionException) as exc_info:
        verify_telemedicine_prescription_safety(payload)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "SCHEDULE_X_PROHIBITED"
    assert exc_info.value.detail["prohibited_substance"] == substance
    assert "Indian Telemedicine Practice Guidelines" in exc_info.value.detail["message"]


@pytest.mark.parametrize("brand,canonical", [
    ("Ritalin", "methylphenidate"),
    ("Concerta", "methylphenidate"),
    ("Adderall", "amphetamine"),
    ("Ketalar", "ketamine"),
    ("Mandrax", "methaqualone"),
    ("OxyContin", "oxycodone"),
    ("Duragesic", "fentanyl"),
])
def test_schedule_x_brand_synonyms_blocked(brand: str, canonical: str):
    """Common brand names of prohibited substances must also be intercepted."""
    payload = json.dumps({
        "medicines": [
            {"name": f"Tab {brand} 20mg", "dosage": "1-0-1"}
        ]
    })

    with pytest.raises(ScheduleXRestrictionException) as exc_info:
        verify_telemedicine_prescription_safety(payload)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "SCHEDULE_X_PROHIBITED"
    assert exc_info.value.detail["prohibited_substance"] == canonical


def test_schedule_x_plain_text_blocked():
    """Unstructured text mentioning prohibited substances must be blocked."""
    plain_text = "Please take Tab Ketamine 50mg for chronic pain management."

    with pytest.raises(ScheduleXRestrictionException) as exc_info:
        verify_telemedicine_prescription_safety(plain_text)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["prohibited_substance"] == "ketamine"
