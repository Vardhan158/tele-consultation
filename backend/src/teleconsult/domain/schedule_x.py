"""Schedule X & NDPS Prohibited Substances Registry & Telemedicine Intercept.

Under Regulation 3.7.1 and 3.7.2 of the Indian Telemedicine Practice Guidelines (2020)
issued by the Ministry of Health and Family Welfare (MoHFW) / Board of Governors in
supersession of the Medical Council of India:

"List Prohibited: An RMP providing consultation via telemedicine CANNOT prescribe
medicines in this list. These have been found to be not suitable for telemedicine
consultation. These are medicines listed in Schedule X of Drugs and Cosmetics Act
and Rules, or any Narcotic or Psychotropic substance listed in the Narcotic Drugs
and Psychotropic Substances, Act, 1985."

Prescription of any Schedule X or NDPS substance via teleconsultation is strictly prohibited
and must be intercepted server-side with an HTTP 400 error.
"""

from __future__ import annotations

import json
import re
from typing import Any
from fastapi import HTTPException, status


# Canonical Schedule X & prohibited psychotropic/narcotic substances under Drugs & Cosmetics Rules and NDPS Act
PROHIBITED_SCHEDULE_X_SUBSTANCES: frozenset[str] = frozenset({
    # Schedule X (Drugs & Cosmetics Rules, 1945)
    "amphetamine",
    "amobarbital",
    "cyclobarbital",
    "dexamphetamine",
    "dextroamphetamine",
    "ethchlorvynol",
    "glutethimide",
    "ketamine",
    "meprobamate",
    "methamphetamine",
    "methaqualone",
    "methylphenidate",
    "pentobarbital",
    "phencyclidine",
    "phenobarbital",
    "phenmetrazine",
    "secobarbital",
    "quinalbarbitone",

    # Common Barbiturates & Potent Central Nervous System Agents
    "butalbital",
    "butobarbitone",
    "amphiphenazole",
    "flunitrazepam",
    "chloral hydrate",

    # Major NDPS Narcotics strictly barred from digital teleconsultation
    "morphine",
    "buprenorphine",
    "fentanyl",
    "oxycodone",
    "hydrocodone",
    "methadone",
    "hydromorphone",
    "pethidine",
    "meperidine",
    "heroin",
    "diacetylmorphine",
    "cocaine",
    "cannabis",
})

# Common brand names / synonyms of Schedule X & restricted substances in India
PROHIBITED_BRAND_SYNONYMS: dict[str, str] = {
    "ritalin": "methylphenidate",
    "concerta": "methylphenidate",
    "inspiral": "methylphenidate",
    "adderall": "amphetamine",
    "dexedrine": "dexamphetamine",
    "ketalar": "ketamine",
    "ketamin": "ketamine",
    "ketamax": "ketamine",
    "seconal": "secobarbital",
    "nembutal": "pentobarbital",
    "mandrax": "methaqualone",
    "percocet": "oxycodone",
    "oxycontin": "oxycodone",
    "duragesic": "fentanyl",
    "fendrop": "fentanyl",
    "calmpose": "diazepam",  # Monitored tranquilizer
    "gardenal": "phenobarbital",
    "luminal": "phenobarbital",
}


class ScheduleXRestrictionException(HTTPException):
    """Raised when a clinician attempts to prescribe a Schedule X or NDPS prohibited substance."""

    def __init__(self, substance: str, matched_term: str | None = None) -> None:
        term_desc = f" (matched term: '{matched_term}')" if matched_term and matched_term != substance else ""
        detail = {
            "code": "SCHEDULE_X_PROHIBITED",
            "error": "ScheduleXRestrictionException",
            "prohibited_substance": substance,
            "message": (
                f"Prescription of '{substance}'{term_desc} is strictly barred via teleconsultation "
                "under Regulation 3.7.1 of the Indian Telemedicine Practice Guidelines (2020) and "
                "Schedule X of the Drugs and Cosmetics Rules (1945)."
            ),
            "statutory_reference": "MoHFW Telemedicine Practice Guidelines 2020, Reg 3.7.1 (List Prohibited)",
        }
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )


def _scan_text_for_prohibited_terms(text: str) -> tuple[str, str] | None:
    """Scan arbitrary prescription text/instructions for Schedule X substances.

    Returns (canonical_substance, matched_token) or None.
    """
    if not text:
        return None

    normalized_text = text.lower()

    # 1. Check direct canonical substances using word boundaries
    for substance in PROHIBITED_SCHEDULE_X_SUBSTANCES:
        pattern = r"\b" + re.escape(substance) + r"\b"
        if re.search(pattern, normalized_text):
            return substance, substance

    # 2. Check brand names and trade synonyms
    for brand, canonical in PROHIBITED_BRAND_SYNONYMS.items():
        pattern = r"\b" + re.escape(brand) + r"\b"
        if re.search(pattern, normalized_text):
            return canonical, brand

    return None


def verify_telemedicine_prescription_safety(content: str | dict[str, Any]) -> None:
    """Inspect prescription payload content and block prohibited Schedule X/NDPS substances.

    Raises:
        ScheduleXRestrictionException: If a prohibited substance is found.
    """
    if isinstance(content, dict):
        parsed = content
        raw_text = json.dumps(content)
    else:
        raw_text = str(content or "")
        try:
            parsed = json.loads(raw_text)
        except (TypeError, json.JSONDecodeError):
            parsed = None

    # If structured JSON dictionary
    if isinstance(parsed, dict):
        # Check explicit medicine list
        medicines = parsed.get("medicines") or parsed.get("items") or []
        if isinstance(medicines, list):
            for med in medicines:
                if isinstance(med, dict):
                    fields_to_check = [
                        med.get("name"),
                        med.get("medication_name"),
                        med.get("drug"),
                        med.get("generic_name"),
                        med.get("brand_name"),
                        med.get("composition"),
                        med.get("instructions"),
                    ]
                    for field in fields_to_check:
                        if field and isinstance(field, str):
                            match = _scan_text_for_prohibited_terms(field)
                            if match:
                                canonical, matched_term = match
                                raise ScheduleXRestrictionException(substance=canonical, matched_term=matched_term)
                elif isinstance(med, str):
                    match = _scan_text_for_prohibited_terms(med)
                    if match:
                        canonical, matched_term = match
                        raise ScheduleXRestrictionException(substance=canonical, matched_term=matched_term)

        # Check top-level medication fields
        top_level_fields = [
            parsed.get("medication_name"),
            parsed.get("drug_name"),
            parsed.get("generic_name"),
            parsed.get("instructions"),
            parsed.get("diagnosis"),
            parsed.get("notes"),
        ]
        for field in top_level_fields:
            if field and isinstance(field, str):
                match = _scan_text_for_prohibited_terms(field)
                if match:
                    canonical, matched_term = match
                    raise ScheduleXRestrictionException(substance=canonical, matched_term=matched_term)

    # Always scan the raw text string to catch unparsed or embedded mentions
    match = _scan_text_for_prohibited_terms(raw_text)
    if match:
        canonical, matched_term = match
        raise ScheduleXRestrictionException(substance=canonical, matched_term=matched_term)
