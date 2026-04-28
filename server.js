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
  app.decorate("publicKey", publicKey);
  app.decorate("kid", kid);
  app.decorate("getRequestCount", () => requestCount);

  return app;
}

module.exports = { buildServer };
