# Build stage
FROM rust:slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

# Run stage (smaller image)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/flipo5-vectorizer /usr/local/bin/flipo5-vectorizer
EXPOSE 8081
CMD ["flipo5-vectorizer"]
