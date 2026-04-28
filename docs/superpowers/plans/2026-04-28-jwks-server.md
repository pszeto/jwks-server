# JWKS Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local dev JWKS server that generates RSA keys on startup, serves a JWKS endpoint, mints signed JWTs, and deploys to Kubernetes.

**Architecture:** Single-file Fastify server (`server.js`) with in-memory RSA key pair. Multi-stage Docker build. Kubernetes manifests for deployment in the `jwks` namespace.

**Tech Stack:** Node.js, Fastify, jose, Docker, Kubernetes

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Project metadata, dependencies, start script |
| `server.js` | Fastify server — key generation, JWKS endpoint, token endpoint, request counter |
| `server.test.js` | Tests for all server behavior using Node built-in test runner |
| `Dockerfile` | Multi-stage Alpine build |
| `k8s/deployment.yaml` | Kubernetes Deployment in `jwks` namespace |
| `k8s/service.yaml` | Kubernetes Service in `jwks` namespace |
| `.dockerignore` | Exclude unnecessary files from Docker context |

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`

- [ ] **Step 1: Initialize package.json**

```bash
npm init -y
```

- [ ] **Step 2: Edit package.json to set the start script and type**

Set `"main": "server.js"` and `"scripts": { "start": "node server.js", "test": "node --test server.test.js" }`.

```json
{
  "name": "jwks-server",
  "version": "1.0.0",
  "description": "Local development JWKS server with JWT minting",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test server.test.js"
  },
  "keywords": [],
  "license": "ISC"
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install fastify jose
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: initialize project with fastify and jose dependencies"
```

---

### Task 2: JWKS Endpoint — Test and Implement

**Files:**
- Create: `server.test.js`
- Create: `server.js`

- [ ] **Step 1: Write the failing test for the JWKS endpoint**

Create `server.test.js`:

```js
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { buildServer } = require("./server");

describe("GET /.well-known/jwks.json", () => {
  let app;

  before(async () => {
    app = await buildServer();
  });

  it("returns a valid JWKS response with one RSA key", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/jwks.json",
    });

    assert.equal(response.statusCode, 200);

    const body = JSON.parse(response.body);
    assert.ok(Array.isArray(body.keys));
    assert.equal(body.keys.length, 1);

    const key = body.keys[0];
    assert.equal(key.kty, "RSA");
    assert.equal(key.use, "sig");
    assert.equal(key.alg, "RS256");
    assert.ok(key.kid);
    assert.ok(key.n);
    assert.ok(key.e);
  });
});
```

- [ ] **Step 2: Create minimal server.js that fails the test**

Create `server.js`:

```js
const fastify = require("fastify");

async function buildServer() {
  const app = fastify({ logger: false });
  return app;
}

module.exports = { buildServer };
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no route registered, 404 response.

- [ ] **Step 4: Implement the JWKS endpoint**

Update `server.js`:

```js
const fastify = require("fastify");
const { generateKeyPair, exportJWK } = require("jose");
const crypto = require("node:crypto");

async function buildServer() {
  const keySize = parseInt(process.env.KEY_SIZE || "2048", 10);
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    modulusLength: keySize,
  });

  const kid = crypto.randomUUID();
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.use = "sig";
  publicJwk.alg = "RS256";

  let requestCount = 0;

  const app = fastify({ logger: false });

  app.get("/.well-known/jwks.json", async (request, reply) => {
    requestCount++;
    console.log(`[${requestCount}] GET /.well-known/jwks.json`);
    return { keys: [publicJwk] };
  });

  app.decorate("privateKey", privateKey);
  app.decorate("kid", kid);
  app.decorate("getRequestCount", () => requestCount);

  return app;
}

module.exports = { buildServer };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: add JWKS endpoint with RSA key generation"
```

---

### Task 3: Token Endpoint — Test and Implement

**Files:**
- Modify: `server.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing test for the token endpoint**

Add the `jose` import at the top of `server.test.js` (after the existing requires):

```js
const { jwtVerify } = require("jose");
```

Then append the following test block at the bottom of `server.test.js`:

```js
describe("POST /token", () => {
  let app;

  before(async () => {
    app = await buildServer();
  });

  it("returns a signed JWT with default claims", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/token",
      payload: {},
    });

    assert.equal(response.statusCode, 200);

    const body = JSON.parse(response.body);
    assert.ok(body.token);

    const { payload, protectedHeader } = await jwtVerify(
      body.token,
      app.privateKey
    );

    assert.equal(protectedHeader.alg, "RS256");
    assert.equal(protectedHeader.kid, app.kid);
    assert.equal(payload.iss, "jwks-server");
    assert.ok(payload.iat);
    assert.ok(payload.exp);
    assert.equal(payload.exp - payload.iat, 3600);
  });

  it("merges custom claims into the JWT", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/token",
      payload: { sub: "user123", role: "admin" },
    });

    assert.equal(response.statusCode, 200);

    const body = JSON.parse(response.body);
    const { payload } = await jwtVerify(body.token, app.privateKey);

    assert.equal(payload.sub, "user123");
    assert.equal(payload.role, "admin");
    assert.equal(payload.iss, "jwks-server");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — POST /token returns 404.

- [ ] **Step 3: Implement the token endpoint**

Add the following route inside `buildServer()` in `server.js`, after the JWKS route:

```js
const { SignJWT } = require("jose");

// Add this inside buildServer(), after the JWKS route:

app.post("/token", async (request, reply) => {
  requestCount++;
  console.log(`[${requestCount}] POST /token`);

  const claims = request.body || {};

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer("jwks-server")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  return { token };
});
```

The full `server.js` after this change:

```js
const fastify = require("fastify");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");
const crypto = require("node:crypto");

async function buildServer() {
  const keySize = parseInt(process.env.KEY_SIZE || "2048", 10);
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    modulusLength: keySize,
  });

  const kid = crypto.randomUUID();
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.use = "sig";
  publicJwk.alg = "RS256";

  let requestCount = 0;

  const app = fastify({ logger: false });

  app.get("/.well-known/jwks.json", async (request, reply) => {
    requestCount++;
    console.log(`[${requestCount}] GET /.well-known/jwks.json`);
    return { keys: [publicJwk] };
  });

  app.post("/token", async (request, reply) => {
    requestCount++;
    console.log(`[${requestCount}] POST /token`);

    const claims = request.body || {};

    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer("jwks-server")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    return { token };
  });

  app.decorate("privateKey", privateKey);
  app.decorate("kid", kid);
  app.decorate("getRequestCount", () => requestCount);

  return app;
}

module.exports = { buildServer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server.js server.test.js
git commit -m "feat: add POST /token endpoint for JWT minting"
```

---

### Task 4: Request Counter — Test and Implement

**Files:**
- Modify: `server.test.js`

- [ ] **Step 1: Write the failing test for the request counter**

Append to `server.test.js`:

```js
describe("request counter", () => {
  let app;

  before(async () => {
    app = await buildServer();
  });

  it("increments on each request", async () => {
    assert.equal(app.getRequestCount(), 0);

    await app.inject({ method: "GET", url: "/.well-known/jwks.json" });
    assert.equal(app.getRequestCount(), 1);

    await app.inject({ method: "POST", url: "/token", payload: {} });
    assert.equal(app.getRequestCount(), 2);

    await app.inject({ method: "GET", url: "/.well-known/jwks.json" });
    assert.equal(app.getRequestCount(), 3);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test`
Expected: PASS — the counter was already implemented in Task 2. This test validates it works correctly across both endpoints.

- [ ] **Step 3: Commit**

```bash
git add server.test.js
git commit -m "test: add request counter tests"
```

---

### Task 5: Server Startup Entry Point

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add the startup block to server.js**

Append to the bottom of `server.js`, after `module.exports`:

```js
if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10);

  buildServer().then((app) => {
    app.listen({ port, host: "0.0.0.0" }, (err, address) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log(`JWKS server listening on ${address}`);
      console.log(`kid: ${app.kid}`);
    });
  });
}
```

- [ ] **Step 2: Smoke test manually**

Run: `node server.js`
Expected output:
```
JWKS server listening on http://0.0.0.0:3000
kid: <some-uuid>
```

In another terminal:
```bash
curl http://localhost:3000/.well-known/jwks.json | jq .
curl -X POST http://localhost:3000/token -H "Content-Type: application/json" -d '{"sub":"test"}' | jq .
```

Server stdout should show:
```
[1] GET /.well-known/jwks.json
[2] POST /token
```

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add server startup entry point"
```

---

### Task 6: Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
npm-debug.log
docs
k8s
.git
.gitignore
*.md
server.test.js
```

- [ ] **Step 2: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY server.js ./
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Build and test the image locally**

```bash
docker build -t jwks-server:local .
docker run --rm -p 3000:3000 jwks-server:local
```

Expected: Server starts, `curl http://localhost:3000/.well-known/jwks.json` returns JWKS. Stop container with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile with multi-stage Alpine build"
```

---

### Task 7: Kubernetes Manifests

**Files:**
- Create: `k8s/deployment.yaml`
- Create: `k8s/service.yaml`

- [ ] **Step 1: Create k8s/deployment.yaml**

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jwks-server
  namespace: jwks
  labels:
    app: jwks-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jwks-server
  template:
    metadata:
      labels:
        app: jwks-server
    spec:
      containers:
        - name: jwks-server
          image: jwks-server:latest
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
            - name: KEY_SIZE
              value: "2048"
          livenessProbe:
            httpGet:
              path: /.well-known/jwks.json
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /.well-known/jwks.json
              port: 3000
            initialDelaySeconds: 3
            periodSeconds: 5
```

- [ ] **Step 2: Create k8s/service.yaml**

Create `k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: jwks-server
  namespace: jwks
  labels:
    app: jwks-server
spec:
  type: ClusterIP
  selector:
    app: jwks-server
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
```

- [ ] **Step 3: Validate the manifests**

```bash
kubectl apply --dry-run=client -f k8s/deployment.yaml
kubectl apply --dry-run=client -f k8s/service.yaml
```

Expected: Both print the resource name with `(dry run)` and no errors.

- [ ] **Step 4: Commit**

```bash
git add k8s/
git commit -m "feat: add Kubernetes deployment and service manifests"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: All tests pass (JWKS endpoint, token endpoint with default claims, token endpoint with custom claims, request counter).

- [ ] **Step 2: Verify the Docker build still works**

```bash
docker build -t jwks-server:local .
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit any remaining changes**

If there are any uncommitted changes:
```bash
git add -A
git commit -m "chore: final cleanup"
```
