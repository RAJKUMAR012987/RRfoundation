import { isMissingStorageObject, normalizeDonationPayment } from './supabase.service';

describe('isMissingStorageObject', () => {
  it('recognizes missing objects returned as 404', () => {
    expect(
      isMissingStorageObject({
        statusCode: '404',
        message: 'Object not found',
      }),
    ).toBe(true);
  });

  it('recognizes missing objects returned as 400', () => {
    expect(
      isMissingStorageObject({
        statusCode: 400,
        message: 'Object not found',
      }),
    ).toBe(true);
  });

  it('does not treat unrelated storage errors as missing objects', () => {
    expect(
      isMissingStorageObject({
        statusCode: '400',
        message: 'Invalid request',
      }),
    ).toBe(false);
  });
});

describe('normalizeDonationPayment', () => {
  const basePayment = {
    payment_id: 'pay_test',
    order_id: 'order_test',
    amount: 500,
    currency: 'INR',
    status: 'SUCCESS',
    method: 'upi',
    donor_email: null,
    category: 'education',
    paid_at: '2026-10-31T12:00:00.000Z',
  };

  it('converts legacy successful rows from rupees to paise for the admin dashboard', () => {
    expect(normalizeDonationPayment(basePayment)).toMatchObject({
      amount: 50_000,
      status: 'captured',
    });
  });

  it('preserves the paise amount on current captured rows', () => {
    expect(
      normalizeDonationPayment({ ...basePayment, amount: 50_000, status: 'captured' }),
    ).toMatchObject({
      amount: 50_000,
      status: 'captured',
    });
  });

  it('does not count non-captured payments as successful', () => {
    expect(
      normalizeDonationPayment({ ...basePayment, status: 'created' }),
    ).toMatchObject({
      amount: 500,
      status: 'created',
    });
  });
});
