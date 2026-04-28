# JWKS Server — Design Spec

## Purpose

A local development/testing tool that serves a JWKS endpoint and mints signed JWTs. Developers use it to validate JWT-based auth flows against a real JWKS endpoint without needing a production identity provider.

## Architecture

Single-file Node.js server (`server.js`) using Fastify and the `jose` library. No build step, no TypeScript, no persistence. Keys are generated in memory on startup and discarded on shutdown.

## Startup

1. Generate a 2048-bit RSA key pair using `jose.generateKeyPair("RS256")` (key size configurable via `KEY_SIZE` env var)
2. Export the public key as a JWK using `jose.exportJWK()`, assign a random `kid`
3. Initialize a request counter at `0`
4. Start Fastify on `PORT` (default `3000`)
5. Log the port and `kid` to stdout

## Endpoints

### `GET /.well-known/jwks.json`

Returns the public key in standard JWKS format:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "<random-id>",
      "use": "sig",
      "alg": "RS256",
      "n": "...",
      "e": "..."
    }
  ]
}
```

Increments and logs the request counter to stdout: `[1] GET /.well-known/jwks.json`

### `POST /token`

Accepts a JSON body with optional custom claims:

```json
{
  "sub": "user123",
  "role": "admin"
}
```

Signs a JWT (RS256) with:
- `iss`: `"jwks-server"`
- `iat`: current timestamp
- `exp`: 1 hour from now
- All additional claims from the request body merged in

Returns:

```json
{
  "token": "<signed JWT>"
}
```

Increments and logs the request counter to stdout: `[2] POST /token`

## Request Counter

A simple in-memory integer, starting at `0`, incremented on every request to either endpoint. Each log line shows the cumulative count and the method/path. Resets on server restart.

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `KEY_SIZE` | `2048` | RSA key size in bits |

## Dependencies

| Package | Purpose |
|---|---|
| `fastify` | HTTP framework |
| `jose` | RSA key generation, JWK export, JWT signing |

No dev dependencies.

## Package Setup

- `package.json` with `"start": "node server.js"` script
- No build step — plain JS, runs directly with Node

## Dockerfile

Multi-stage build for a small image:

1. **Build stage:** `node:22-alpine`, copy `package.json` and `package-lock.json`, run `npm ci --omit=dev`
2. **Runtime stage:** `node:22-alpine`, copy `node_modules` and `server.js` from build stage, expose port `3000`, run as non-root user

Image is intended to be pushed to DockerHub.

## Kubernetes Manifests

Deployed in the `jwks` namespace.

### `deployment.yaml`

- `apiVersion: apps/v1`, kind `Deployment`
- Namespace: `jwks`
- Name: `jwks-server`
- 1 replica
- Container image: placeholder (`jwks-server:latest`) — user substitutes their DockerHub image
- Container port: `3000`
- Environment variables `PORT` and `KEY_SIZE` with defaults
- Liveness/readiness probes hitting `GET /.well-known/jwks.json` on port `3000`

### `service.yaml`

- `apiVersion: v1`, kind `Service`
- Namespace: `jwks`
- Name: `jwks-server`
- Type: `ClusterIP`
- Port `80` → target port `3000`
- Selector matches the deployment's pod labels

## Out of Scope

- Key persistence or rotation
- EC key support
- CLI wrapper
- HTTPS/TLS
- Authentication on the `/token` endpoint
- Namespace creation (user creates `jwks` namespace themselves)
- Ingress configuration
