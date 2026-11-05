# Multi-stage, non-root, one image used for api, worker and worker_untrusted (different commands).
# Run `uv lock` once and commit uv.lock before building.
FROM python:3.12-slim AS build
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src

FROM python:3.12-slim
RUN useradd --system --uid 10001 --no-create-home appuser
WORKDIR /app
COPY --from=build /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONPATH=/app/src PYTHONUNBUFFERED=1
USER 10001
EXPOSE 8000
CMD ["uvicorn", "teleconsult.main:app", "--host", "0.0.0.0", "--port", "8000"]
# worker:            CMD ["python", "-m", "teleconsult.worker"]
# worker_untrusted:  CMD ["python", "-m", "teleconsult.worker_untrusted"]  (run with NO DB creds, no internal network)
