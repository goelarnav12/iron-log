// The sync password → bearer token derivation. All of it.
//
// This is NOT a crypto module. There is no encryption here, no data
// key, no wrapping — Iron Log stores plaintext on the server by design. The only
// job is to turn a password into a token that gates the Worker, without ever
// sending the password itself.
//
// The password is stretched with PBKDF2-SHA256 into an "auth hash". That hash
// is the bearer token; the server stores only SHA-256(authHash), so a dump of
// its table yields nothing replayable. Same shape as Vault's authentication
// half — just without the second derivation that Vault uses to keep the auth
// path separate from the encryption key, because here there is no key.

const KDF_ITERATIONS = 650_000;

const enc = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

/** A random 256-bit salt, base64. Generated on the device that signs up first. */
export function makeSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Stretch the password into the auth hash the client presents as its token.
 *
 * The salt comes from the server (`/salt`) so every device derives the same
 * token from the same password. `iterations` is likewise server-supplied, so
 * the cost can be raised later without stranding existing stores.
 */
export async function deriveAuthHash(
  password: string, salt: string, iterations = KDF_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}
