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
