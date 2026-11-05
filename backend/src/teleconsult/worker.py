"""Background worker: publishes outbox events, sends notifications, runs reminders and integrations.
Has database access. Choose Celery or Arq (docs/adr/0003-worker-queue.md)."""


def main() -> None:
    raise NotImplementedError("Implement worker loop")


if __name__ == "__main__":
    main()
