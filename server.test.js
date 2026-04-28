const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const { buildServer } = require("./server");
const { jwtVerify } = require("jose");

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
      app.publicKey
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
    const { payload } = await jwtVerify(body.token, app.publicKey);

    assert.equal(payload.sub, "user123");
    assert.equal(payload.role, "admin");
    assert.equal(payload.iss, "jwks-server");
  });
});
