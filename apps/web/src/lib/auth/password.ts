// ---------------------------------------------------------------------------
// Şifre hashleme — bcryptjs (saf JS, Node runtime)
// Bu modül asla edge/middleware tarafından import edilmemelidir.
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// "dummy-password-for-timing" hash'i — kullanıcı bulunamadığında da bcrypt
// çalıştırılır ki yanıt süresi hesap varlığını ele vermesin (timing oracle).
const DUMMY_HASH = "$2b$12$erIxad2SDm4xqzmzygxMPOOpgmVEzXlPWr5cgDMqoV/3tPMe1QJ36";

export async function burnPasswordVerification(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
