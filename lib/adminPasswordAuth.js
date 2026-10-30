import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const DEFAULT_COST = 16384;
const DUMMY_SALT = Buffer.from("c79e8732a5a14ff30f8279744c0bd412", "hex");
const DEFAULT_DK_BYTES = 64;
const MAX_PASSWORD = 128;
const MIN_PASSWORD = 12;

export function validateUsername(value) {
  const str = String(value ?? "").trim();
  return /^[a-zA-Z0-9._-]{3,64}$/.test(str) ? str : null;
}

export function passwordMeetsPolicy(value) {
  return typeof value === "string"
    && value.length >= MIN_PASSWORD
    && value.length <= MAX_PASSWORD
    && Buffer.byteLength(value, "utf8") <= 512
    && /[a-zA-Z]/.test(value)
    && /[0-9]/.test(value);
}

export async function hashOwnerPassword(password, salt = crypto.randomBytes(16)) {
  if (!passwordMeetsPolicy(password)) {
    throw new Error("Password requires 12-128 characters, including letters and digits");
  }
  if (!Buffer.isBuffer(salt) || salt.length !== 16) throw new Error("Invalid salt");
  const key = await scrypt(password, salt, DEFAULT_DK_BYTES, { N: DEFAULT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", String(DEFAULT_COST), "8", "1", salt.toString("hex"), key.toString("hex")].join("$");
}

export function configuredOwnerCredentials(env = process.env) {
  return Boolean(
    validateUsername(env.ADMIN_WEB_LOGIN_USERNAME)
      && parsePasswordHash(env.ADMIN_WEB_LOGIN_PASSWORD_HASH)
      && String(env.OWNER_LINE_USER_ID || "").trim().startsWith("U")
  );
}

function parsePasswordHash(value) {
  const parts = String(value || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" ||
      parts[1] !== String(DEFAULT_COST) || parts[2] !== "8" || parts[3] !== "1" ||
      !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return null;
  return { salt: Buffer.from(parts[4], "hex"), hash: Buffer.from(parts[5], "hex") };
}

export async function verifyOwnerPassword(username, password, env = process.env) {
  const supplied = validateUsername(username);
  const expected = validateUsername(env.ADMIN_WEB_LOGIN_USERNAME);
  const stored = parsePasswordHash(env.ADMIN_WEB_LOGIN_PASSWORD_HASH);
  // Even invalid users receive a full scrypt verification, avoiding easy account enumeration.
  const salt = stored?.salt || DUMMY_SALT;
  const hash = stored?.hash || Buffer.alloc(DEFAULT_DK_BYTES);
  const candidate = await scrypt(typeof password === "string" ? password.slice(0, MAX_PASSWORD + 1) : "", salt, DEFAULT_DK_BYTES,
    { N: DEFAULT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const passwordMatches = crypto.timingSafeEqual(candidate, hash);
  const userMatches = supplied !== null && expected !== null
    && crypto.timingSafeEqual(crypto.createHash("sha256").update(supplied).digest(),
      crypto.createHash("sha256").update(expected).digest());
  return Boolean(stored && passwordMatches && userMatches && passwordMeetsPolicy(password));
}
