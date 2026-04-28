const fastify = require("fastify");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");
const crypto = require("node:crypto");

function timestamp() {
  return new Date().toISOString();
}

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

  let jwksRequestCount = 0;
  let tokenRequestCount = 0;
  let jwksOverrideStatus = null;

  const app = fastify({ logger: false });

  app.get("/.well-known/jwks.json", async (request, reply) => {
    jwksRequestCount++;
    if (jwksOverrideStatus !== null) {
      console.log(`[${timestamp()}]  JWKS Request Count [${jwksRequestCount}] - GET /.well-known/jwks.json (override: ${jwksOverrideStatus})`);
      reply.code(jwksOverrideStatus);
      return { statusCode: jwksOverrideStatus };
    }
    console.log(`[${timestamp()}]  JWKS Request Count [${jwksRequestCount}] - GET /.well-known/jwks.json`);
    return { keys: [publicJwk] };
  });

  app.post("/token", async (request, reply) => {
    tokenRequestCount++;
    console.log(`[${timestamp()}]  Token Request Count [${tokenRequestCount}] - POST /token`);

    const claims = request.body || {};

    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer("jwks-server")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    return { token };
  });

  app.post("/jwks/override", async (request, reply) => {
    const { statusCode } = request.body || {};
    if (statusCode === null || statusCode === undefined) {
      jwksOverrideStatus = null;
      console.log(`[${timestamp()}]  POST /jwks/override — override cleared`);
      return { message: "JWKS override cleared, returning keys normally" };
    }
    jwksOverrideStatus = statusCode;
    console.log(`[${timestamp()}]  POST /jwks/override — set to ${statusCode}`);
    return { message: `JWKS endpoint will now return status ${statusCode}` };
  });

  app.post("/reset", async (request, reply) => {
    jwksRequestCount = 0;
    console.log(`[${timestamp()}]  POST /reset — jwksRequestCount reset`);
    return { message: "jwksRequestCount reset to 0" };
  });

  app.decorate("privateKey", privateKey);
  app.decorate("publicKey", publicKey);
  app.decorate("kid", kid);
  app.decorate("getRequestCount", () => jwksRequestCount + tokenRequestCount);
  app.decorate("getJwksRequestCount", () => jwksRequestCount);
  app.decorate("getTokenRequestCount", () => tokenRequestCount);

  return app;
}

module.exports = { buildServer };

if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10);

  buildServer().then((app) => {
    app.listen({ port, host: "0.0.0.0" }, (err, address) => {
      if (err) {
        console.error(`[${timestamp()}]  `, err);
        process.exit(1);
      }
      console.log(`[${timestamp()}]  JWKS server listening on ${address}`);
      console.log(`[${timestamp()}]  kid: ${app.kid}`);
    });
  });
}
