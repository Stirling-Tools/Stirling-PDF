import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  config,
  configPath,
  idpUrl,
  metadataUrl,
  realm,
  request,
  root,
  save,
  spMetadata,
  stateDir,
  validateTarget,
} from "./lib.mjs";

async function init() {
  await mkdir(stateDir, { recursive: true });
  try {
    await access(configPath);
    console.log(`Lab already initialized: ${configPath}`);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const password = () => randomBytes(24).toString("base64url");
  const c = {
    disposable: false,
    projectRef: "",
    supabaseUrl: "",
    publishableKey: "",
    appUrl: "http://localhost:5173",
    apiUrl: "http://localhost:8080",
    expectedTeamId: 0,
    idp: "keycloak",
    leader: { email: "", password: "" },
    keycloak: { adminPassword: password(), userPassword: password() },
    entraMetadataPath: "",
  };
  const users = ["owner", "employee"].map((username) => ({
    username,
    email: `${username}@enterprise-sso.example.com`,
    firstName: username === "owner" ? "Company" : "New",
    lastName: username === "owner" ? "Owner" : "Employee",
    enabled: true,
    emailVerified: true,
    credentials: [{ type: "password", value: c.keycloak.userPassword, temporary: false }],
  }));
  await save("realm.json", {
    realm,
    enabled: true,
    sslRequired: "none",
    registrationAllowed: false,
    resetPasswordAllowed: false,
    users,
  });
  await writeFile(path.join(stateDir, "compose.env"), `LAB_ADMIN_PASSWORD=${c.keycloak.adminPassword}\n`, { mode: 0o600 });
  await save("config.json", c);
  console.log(`Initialized ${configPath}. Generated credentials stay in that ignored file.`);
}

async function compose(args) {
  await access(configPath);
  const child = spawn(
    "docker",
    [
      "compose",
      "--env-file",
      path.join(stateDir, "compose.env"),
      "-f",
      path.join(root, "testing/enterprise-sso/compose.yml"),
      ...args,
    ],
    { stdio: "inherit", windowsHide: true },
  );
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Docker Compose exited ${code}. Check Docker Desktop is running.`)),
    );
  });
}

async function configure() {
  const c = await config();
  validateTarget(c);
  const authUrl = `${c.supabaseUrl}/auth/v1`;
  const metadata = await request(`${authUrl}/sso/saml/metadata`, { key: c.publishableKey });
  const sp = spMetadata(metadata, authUrl);
  await writeFile(path.join(stateDir, "supabase-sp.xml"), metadata);
  if (c.idp === "entra") {
    assert.ok(c.entraMetadataPath, "Set entraMetadataPath to the downloaded test application XML.");
    await writeFile(path.join(stateDir, "idp.xml"), await readFile(c.entraMetadataPath));
  } else {
    const form = new URLSearchParams({
      client_id: "admin-cli",
      grant_type: "password",
      username: "lab-admin",
      password: c.keycloak.adminPassword,
    });
    const login = await request(`${idpUrl}/realms/master/protocol/openid-connect/token`, { form });
    const token = login.access_token;
    const clientsUrl = `${idpUrl}/admin/realms/${realm}/clients`;
    const clients = await request(`${clientsUrl}?clientId=${encodeURIComponent(sp.entityId)}`, { token });
    const client = {
      clientId: sp.entityId,
      name: "Supabase enterprise SSO lab",
      protocol: "saml",
      enabled: true,
      redirectUris: [sp.acsUrl],
      attributes: {
        "saml.assertion.consumer.url.post": sp.acsUrl,
        "saml.force.post.binding": "true",
        "saml.server.signature": "true",
        "saml.assertion.signature": "true",
        "saml.signature.algorithm": "RSA_SHA256",
        "saml.client.signature": "true",
        "saml.signing.certificate": sp.certificate,
        saml_name_id_format: "persistent",
        "saml.authnstatement": "true",
      },
      protocolMappers: [
        {
          name: "email",
          protocol: "saml",
          protocolMapper: "saml-user-property-mapper",
          config: { "user.attribute": "email", "attribute.name": "email", "attribute.nameformat": "Basic" },
        },
      ],
    };
    assert.ok(clients.length <= 1, "More than one matching SAML client.");
    if (clients.length)
      await request(`${clientsUrl}/${clients[0].id}`, { token, method: "PUT", body: client, expected: [204] });
    else await request(clientsUrl, { token, body: client, expected: [201] });
    const metadataXml = await request(metadataUrl);
    assert.ok(metadataXml.includes("EntityDescriptor"), "Keycloak did not return SAML metadata.");
    await writeFile(path.join(stateDir, "idp.xml"), metadataXml);
  }
  console.log(`SP Entity ID: ${sp.entityId}\nACS: ${sp.acsUrl}`);
  console.log(`Metadata ready: ${path.join(stateDir, "idp.xml")}. Run doctor before the live test.`);
}

const command = process.argv[2];
try {
  if (command === "init") await init();
  else if (command === "up") {
    await init();
    await compose(["up", "-d", "--wait", "--wait-timeout", "240"]);
    console.log(`Keycloak: ${idpUrl}/admin/`);
  } else if (command === "down") await compose(["down"]);
  else if (command === "configure") await configure();
  else if (command === "logs") await compose(["logs", "--tail", "80"]);
  else throw new Error("Usage: node testing/enterprise-sso/lab.mjs init|up|configure|down|logs");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
