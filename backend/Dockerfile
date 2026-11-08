# Backend: FastAPI API + live capture. Build context is the repo root; run it through docker compose,
# which adds host networking, NET_RAW only and a read-only filesystem.
FROM python:3.12-slim@sha256:aa943ce411423c7582288f18707ff66eddcbaeb510502d747a72aeb34f30d159

# tcpdump: Scapy uses it to compile BPF capture filters.
# shortcut: the --only-upgrade line unpins apt and zlib1g; drop it once a Dependabot digest bump ships apt >= 3.0.4 and zlib1g >= 1.3.1-1+deb13u1.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tcpdump \
    && apt-get install -y --no-install-recommends --only-upgrade apt zlib1g \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY backend backend
COPY models models
COPY simulator simulator
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SENTINEL_DB_PATH=/app/data/sentinelstream.db

# 127.0.0.1 only: with host networking, 0.0.0.0 would expose the unauthenticated API to the LAN.
CMD ["uvicorn", "backend.api.main:app", "--host", "127.0.0.1", "--port", "8000"]
