# ADR-0001: Modular monolith

Status: Accepted
Decision: one deployable backend organised into bounded modules with enforced boundaries.
Why: transactional consistency for booking/consent/records, one authorization and audit path,
smaller attack surface, one artifact deployable in pooled/schema/silo models for different clients,
small-team operability.
Consequences: blast radius of one process is larger -> mitigated by per-module DB roles, RLS,
isolated untrusted worker, dependency/supply-chain controls.
Extraction triggers: independent scaling, separate owning team, fault isolation,
client-mandated physical isolation or different compliance boundary.
