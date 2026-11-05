# Non-functional implementation baseline

| Requirement | Current implementation/evidence | Pilot validation gate |
| --- | --- | --- |
| Responsive layouts | Patient screens use responsive Tailwind breakpoints and mobile navigation | Browser matrix across desktop, tablet, and mobile |
| Accessibility | Semantic forms, labels, alert/status regions, keyboard-sized controls, focusable buttons | WCAG 2.2 AA audit and keyboard-only test |
| Availability | Dockerized PostgreSQL and stateless API process with health endpoint | 99.9% monthly service measurement |
| API performance | Request duration emitted as `Server-Timing` and `X-Request-Duration-Ms`; no PHI in telemetry | P95 < 500 ms under agreed load |
| Video reliability | Join-window, authorization, short-lived token, and reconnect states | >=98% supported-device/network join success |
| Scalability | Stateless API and database indexes on tenant, patient, doctor, slot, and status fields | Test at twice forecast peak |
| Recovery | Transactional appointment/payment state and append-only appointment/audit history | RTO <=4 hours, RPO <=15 minutes |
| Localization | ISO timestamps stored timezone-aware and rendered with browser locale | India timezone and locale test matrix |
| Observability | Request timing only; logs must use allow-listed operational fields | Metrics, logs, traces, alerts reviewed for PHI leakage |
| Backup | PostgreSQL data is volume-backed locally; production backup policy is deployment-owned | Encrypted backup and restore drill |
| Device support | Browser `getUserMedia` readiness check and network state in P07 | Supported browser/camera/microphone/network matrix |

The numeric targets are planning thresholds, not claims of production compliance.
They require load testing and infrastructure evidence before pilot expansion.
