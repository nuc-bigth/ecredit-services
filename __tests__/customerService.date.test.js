/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));

const { getModels } = require('../models');
const customerService = require('../services/customerService');

describe('customerService.getCustomerById date formatting', () => {
  it('displays SQL datetime values without applying the server timezone offset', async () => {
    const customer = {
      ID: 'customer-1',
      UPDATED_DATE: new Date('2026-10-05T12:30:47.987Z'),
      get: jest.fn(() => ''),
    };
    getModels.mockReturnValue({
      Customer: { findOne: jest.fn().mockResolvedValue(customer) },
      Size: {},
      Employee: {},
    });

    const result = await customerService.getCustomerById('customer-1');

    expect(result.UPDATED_DATE).toBe('05 Oct 2026 12:30 PM');
  });
});
