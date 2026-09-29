import bcrypt from 'bcryptjs';
const BCRYPT_ROUNDS = 12;
/** bcrypt ignores everything past 72 bytes; refuse rather than silently truncate. */
const BCRYPT_MAX_BYTES = 72;
export function isPasswordWithinBcryptLimit(password) {
    return Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES;
}
export async function hashPassword(password) {
    if (!isPasswordWithinBcryptLimit(password)) {
        throw new Error('Password exceeds the bcrypt input limit');
    }
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}
export async function verifyPassword(password, hash) {
    if (!hash || !isPasswordWithinBcryptLimit(password))
        return false;
    return bcrypt.compare(password, hash);
}
/**
 * A real hash to compare against when the account does not exist, so a login
 * for an unknown email costs the same time as one for a known email.
 */
export const TIMING_EQUALIZER_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', BCRYPT_ROUNDS);
//# sourceMappingURL=password.js.map