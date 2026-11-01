export function isValidEmailAddress(email: string): boolean {
  return /^(?!.*\.\.)[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
    email.trim(),
  );
}

export function isValidIndianPhoneNumber(phone: string): boolean {
  return /^\d{10}$/.test(phone);
}

export function normalizeIndianPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  const nationalNumber =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return nationalNumber.slice(0, 10);
}
