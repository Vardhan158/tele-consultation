# Negative scenarios and recovery controls

| Failure area | Patient behavior | Backend invariant |
| --- | --- | --- |
| Account | Safe error and recovery action | Identity checks, session expiry/revocation, and audit path |
| Booking | Refresh or retry availability | Slot lock, overlap check, and idempotency key |
| Payment | Show pending/failed state and preserve booking | Provider verification; no client-side success; refund/reconciliation path |
| Notification | Show authoritative in-app status | Delivery retry is independent of appointment/payment commit |
| Video/access | Device, permission, network, or token guidance | Appointment ownership, time window, token expiry, and admission checks |
| Clinical record | Preserve retryable upload/draft state | Release and scan state required before patient visibility |
| Absent doctor/patient | Explain waiting/no-show policy | Staff workflow changes status; browser close cannot complete encounter |
| Provider outage | Approved fallback/support path | Preserve appointment and clinical state; operations escalation |
| Security violation | Block with non-enumerating error | Tenant/subject authorization and audit/investigation path |

The implementation specifically prevents:

- duplicate financial charges through payment and booking idempotency keys;
- confirmed appointments being cancelled by notification delivery failure;
- patient identifier substitution from returning another patient's records;
- browser closure or video disconnect from marking a clinical encounter complete;
- unreleased prescriptions/summaries from appearing in patient queries;
- failed clinical persistence from silently replacing an existing record.
