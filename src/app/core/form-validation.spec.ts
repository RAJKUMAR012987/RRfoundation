import {
  isValidEmailAddress,
  isValidIndianPhoneNumber,
  normalizeIndianPhoneDigits,
} from './form-validation';

describe('form validation', () => {
  it('accepts valid email addresses and rejects malformed addresses', () => {
    expect(isValidEmailAddress('person@example.com')).toBe(true);
    expect(isValidEmailAddress('person@localhost')).toBe(false);
    expect(isValidEmailAddress('person example@example.com')).toBe(false);
    expect(isValidEmailAddress('person@example..com')).toBe(false);
    expect(isValidEmailAddress('person@-example.com')).toBe(false);
  });

  it('accepts exactly ten digits for an Indian phone number', () => {
    expect(isValidIndianPhoneNumber('9876543210')).toBe(true);
    expect(isValidIndianPhoneNumber('987654321')).toBe(false);
    expect(isValidIndianPhoneNumber('98765432101')).toBe(false);
    expect(isValidIndianPhoneNumber('98765a3210')).toBe(false);
  });

  it('strips formatting and a pasted +91 prefix while retaining ten phone digits', () => {
    expect(normalizeIndianPhoneDigits('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianPhoneDigits('98765a43210')).toBe('9876543210');
  });
});
