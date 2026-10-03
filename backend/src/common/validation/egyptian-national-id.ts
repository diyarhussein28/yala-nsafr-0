import { Gender } from '../../database/entities/user.entity';

// Governorate codes used in digits 8–9 of the Egyptian national ID (88 = born abroad)
const GOVERNORATE_CODES = new Set([
  '01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '34', '35', '88',
]);

export interface ParsedNationalId {
  birthDate: Date;
  gender: Gender;
}

/**
 * Structural check of a 14-digit Egyptian national ID: century digit, a real birth date
 * in the past, a known governorate code. The 13th digit encodes sex (odd = male,
 * even = female), which is what lets the women-only rule be tied to the verified ID
 * rather than to a profile field anyone could flip.
 *
 * Returns null when the number cannot be a valid ID. It does not prove the ID exists —
 * that is what the admin's document review is for.
 */
export function parseEgyptianNationalId(id: string): ParsedNationalId | null {
  if (!/^\d{14}$/.test(id)) return null;

  const century = id[0] === '2' ? 1900 : id[0] === '3' ? 2000 : null;
  if (century === null) return null;

  const year = century + Number(id.slice(1, 3));
  const month = Number(id.slice(3, 5));
  const day = Number(id.slice(5, 7));
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day ||
    birthDate.getTime() > Date.now()
  ) {
    return null;
  }

  if (!GOVERNORATE_CODES.has(id.slice(7, 9))) return null;

  const gender = Number(id[12]) % 2 === 1 ? Gender.MALE : Gender.FEMALE;
  return { birthDate, gender };
}
