"""Isolated worker for UNTRUSTED input: malware scan, file parsing, rendering.

RULES (enforced partly by .importlinter):
- No database credentials. No imports from teleconsult.modules or teleconsult.kernel.db.
- No network access to internal services; only the job queue and the scratch/blob location.
- Runs as a separate container with a read-only filesystem and tight resource limits.
- Returns a verdict/result to the queue; the trusted worker persists it.
"""


def main() -> None:
    raise NotImplementedError("Implement untrusted job loop")


if __name__ == "__main__":
    main()
