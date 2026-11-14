export const CLINICAL_NOTE_FIELDS = [
  ["chiefComplaint", "Chief Complaint"],
  ["findings", "Consultation Findings"],
  ["diagnosis", "Diagnosis"],
  ["treatmentPlan", "Treatment Plan"],
  ["prescription", "Prescription (medication details)"],
  ["followUp", "Follow-up Instructions"],
];

export function emptyClinicalNote() {
  return Object.fromEntries(CLINICAL_NOTE_FIELDS.map(([key]) => [key, ""]));
}

export function parseClinicalNote(value) {
  const fields = emptyClinicalNote();
  if (!value) return fields;
  for (const [key, label] of CLINICAL_NOTE_FIELDS) {
    const match = String(value).match(new RegExp(`(?:^|\\n)${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}:\\n?([\\s\\S]*?)(?=\\n\\n[^\\n]+:\\n|$)`));
    if (match) fields[key] = match[1].trim();
  }
  if (Object.values(fields).some(Boolean)) return fields;
  fields.chiefComplaint = String(value);
  return fields;
}

export function serializeClinicalNote(fields) {
  return CLINICAL_NOTE_FIELDS
    .map(([key, label]) => `${label}:\n${String(fields[key] || "").trim()}`)
    .join("\n\n");
}
