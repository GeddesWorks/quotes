import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const endpoint = (process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID || "69876eae003275d80ff8";
const apiKey = process.env.APPWRITE_API_KEY;
const functionId = process.env.APPWRITE_FUNCTION_ID || "qm_api";
const functionName = process.env.APPWRITE_FUNCTION_NAME || "Quotes Manager API";
const runtime = process.env.APPWRITE_FUNCTION_RUNTIME || "node-18.0";
const entrypoint = process.env.APPWRITE_FUNCTION_ENTRYPOINT || "index.js";
const sourceDir = process.env.APPWRITE_FUNCTION_SOURCE || path.resolve("appwrite", "functions", "qm-api");

if (!apiKey) {
  console.error("Missing APPWRITE_API_KEY.");
  process.exit(1);
}

const headers = {
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey
};

const request = async (method, urlPath, body) => {
  const res = await fetch(`${endpoint}${urlPath}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
};

const requestMultipart = async (method, urlPath, form) => {
  const res = await fetch(`${endpoint}${urlPath}`, {
    method,
    headers,
    body: form
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
};

const ensureFunction = async () => {
  try {
    await request("GET", `/functions/${functionId}`);
    await request("PUT", `/functions/${functionId}`, {
      name: functionName,
      runtime,
      execute: ["users"],
      events: [],
      schedule: "",
      timeout: 20,
      enabled: true,
      logging: true,
      entrypoint,
      commands: ""
    });
    console.log(`Updated function ${functionId}`);
  } catch (err) {
    if (err.status !== 404) {
      throw err;
    }
    await request("POST", "/functions", {
      functionId,
      name: functionName,
      runtime,
      execute: ["users"],
      events: [],
      schedule: "",
      timeout: 20,
      enabled: true,
      logging: true,
      entrypoint,
      commands: ""
    });
    console.log(`Created function ${functionId}`);
  }
};

const ensureVariables = async () => {
  const vars = await request("GET", `/functions/${functionId}/variables`);
  const existing = vars.variables || [];

  const desired = [
    { key: "APPWRITE_ENDPOINT", value: endpoint, secret: false },
    { key: "APPWRITE_PROJECT_ID", value: projectId, secret: false },
    { key: "APPWRITE_DATABASE_ID", value: process.env.APPWRITE_DATABASE_ID || "quotes", secret: false },
    { key: "APPWRITE_COLLECTION_GROUPS_ID", value: process.env.APPWRITE_COLLECTION_GROUPS_ID || "qm_groups", secret: false },
    { key: "APPWRITE_COLLECTION_MEMBERSHIPS_ID", value: process.env.APPWRITE_COLLECTION_MEMBERSHIPS_ID || "qm_memberships", secret: false },
    { key: "APPWRITE_COLLECTION_PEOPLE_ID", value: process.env.APPWRITE_COLLECTION_PEOPLE_ID || "qm_people", secret: false },
    { key: "APPWRITE_COLLECTION_QUOTES_ID", value: process.env.APPWRITE_COLLECTION_QUOTES_ID || "qm_quotes", secret: false },
    { key: "APPWRITE_COLLECTION_INVITES_ID", value: process.env.APPWRITE_COLLECTION_INVITES_ID || "qm_invites", secret: false },
    { key: "APPWRITE_API_KEY", value: apiKey, secret: true }
  ];

  for (const variable of desired) {
    const found = existing.find((entry) => entry.key === variable.key);
    if (!found) {
      await request("POST", `/functions/${functionId}/variables`, variable);
      console.log(`Created variable ${variable.key}`);
      continue;
    }
    const needsUpdate =
      (variable.secret ? true : found.value !== variable.value) || found.secret !== variable.secret;
    if (needsUpdate) {
      await request("PUT", `/functions/${functionId}/variables/${found.$id}`, variable);
      console.log(`Updated variable ${variable.key}`);
    }
  }
};

const createDeployment = async () => {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Function source not found at ${sourceDir}`);
  }

  const packageJsonPath = path.join(sourceDir, "package.json");
  const nodeAppwritePath = path.join(sourceDir, "node_modules", "node-appwrite");
  if (fs.existsSync(packageJsonPath) && !fs.existsSync(nodeAppwritePath)) {
    console.log("Installing function dependencies...");
    execSync("npm install --omit=dev", { cwd: sourceDir, stdio: "inherit" });
  }

  const tmpDir = path.resolve("scripts", ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const archivePath = path.join(tmpDir, `${functionId}.tar.gz`);

  execSync(`tar -czf "${archivePath}" -C "${sourceDir}" .`, { stdio: "inherit" });

  const buffer = fs.readFileSync(archivePath);
  const form = new FormData();
  form.append("entrypoint", entrypoint);
  form.append("activate", "true");
  form.append("code", new Blob([buffer], { type: "application/gzip" }), "code.tar.gz");

  const deployment = await requestMultipart("POST", `/functions/${functionId}/deployments`, form);
  console.log(`Created deployment ${deployment.$id}`);
};

const run = async () => {
  await ensureFunction();
  await ensureVariables();
  await createDeployment();
  console.log("Function deployment complete.");
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
