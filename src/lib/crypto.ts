import * as crypto from "crypto"

// Default app secret key if ENCRYPTION_SECRET is not provided in environment
const DEFAULT_SECRET = "closedui-secret-key-32chars-min-len!"
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getSecretKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || DEFAULT_SECRET
  // Use SHA-256 to ensure a strictly 32-byte key
  return crypto.createHash("sha256").update(secret).digest()
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Output format: enc:v1:<base64-iv>:<base64-tag>:<base64-ciphertext>
 */
export function encryptText(text: string): string {
  if (!text) return text
  if (text.startsWith("enc:v1:")) return text // Already encrypted

  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getSecretKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  let encrypted = cipher.update(text, "utf8", "base64")
  encrypted += cipher.final("base64")
  const tag = cipher.getAuthTag().toString("base64")

  return `enc:v1:${iv.toString("base64")}:${tag}:${encrypted}`
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * If string is not encrypted, returns as-is.
 */
export function decryptText(encryptedText: string): string {
  if (!encryptedText || typeof encryptedText !== "string") return encryptedText
  if (!encryptedText.startsWith("enc:v1:")) return encryptedText // Plain text fallback

  try {
    const parts = encryptedText.split(":")
    if (parts.length !== 5) return encryptedText

    const iv = Buffer.from(parts[2], "base64")
    const tag = Buffer.from(parts[3], "base64")
    const ciphertext = parts[4]

    const key = getSecretKey()
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(ciphertext, "base64", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch (error) {
    console.error("[Crypto] Failed to decrypt text:", error)
    return encryptedText
  }
}

/**
 * Checks if a string is encrypted with our AES-256-GCM scheme.
 */
export function isEncrypted(text: string): boolean {
  return typeof text === "string" && text.startsWith("enc:v1:")
}

/**
 * Generates a safe masked version of sensitive keys for UI display.
 * Example: "sk-proj-1234567890abcdef" -> "sk-proj-12****cdef"
 */
export function maskSensitiveKey(key: string): string {
  if (!key) return ""
  // First decrypt if it is encrypted
  const plain = isEncrypted(key) ? decryptText(key) : key
  if (!plain || plain.length <= 8) return "********"

  let startChars = 4
  if (plain.startsWith("sk-proj-")) startChars = 8
  else if (plain.startsWith("sk-")) startChars = 7

  const endChars = 4

  if (plain.length <= startChars + endChars) {
    return plain.slice(0, 3) + "****" + plain.slice(-2)
  }

  const prefix = plain.slice(0, startChars)
  const suffix = plain.slice(-endChars)
  return `${prefix}****${suffix}`
}

export const SENSITIVE_KEY_FIELDS = [
  "openaiKey", "anthropicKey", "googleKey", "deepseekKey", "minimaxKey",
  "groqKey", "mistralKey", "zhipuKey", "lingyiKey", "openrouterKey",
  "nvidiaKey", "volcengineKey", "searchKey"
] as const

/**
 * Encrypts all sensitive API key fields in a settings payload before writing to SQLite.
 */
export function encryptSettingsPayload<T extends Record<string, any>>(payload: T): T {
  const result: Record<string, any> = { ...payload }
  for (const field of SENSITIVE_KEY_FIELDS) {
    if (typeof result[field] === "string" && result[field].trim() !== "") {
      result[field] = encryptText(result[field].trim())
    }
  }
  return result as T
}

/**
 * Decrypts all sensitive API key fields from a stored settings record.
 */
export function decryptSettingsPayload<T extends Record<string, any>>(record: T): T {
  if (!record) return record
  const result: Record<string, any> = { ...record }
  for (const field of SENSITIVE_KEY_FIELDS) {
    if (typeof result[field] === "string" && result[field].trim() !== "") {
      result[field] = decryptText(result[field])
    }
  }
  return result as T
}

