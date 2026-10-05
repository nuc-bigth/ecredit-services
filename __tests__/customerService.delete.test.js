/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));

const { getModels } = require('../models');
const customerService = require('../services/customerService');

describe('customerService.softDeleteCustomer', () => {
  let Customer;

  beforeEach(() => {
    Customer = {
      update: jest.fn().mockResolvedValue([1]),
      sequelize: { fn: jest.fn((name) => ({ fn: name })) },
    };
    getModels.mockReturnValue({ Customer });
  });

  it('requires a non-empty reason before updating the customer', async () => {
    await expect(customerService.softDeleteCustomer('customer-1', '   ', 123))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(Customer.update).not.toHaveBeenCalled();
  });

  it('saves the trimmed reason to DESCRIPTION when soft deleting', async () => {
    const deleted = await customerService.softDeleteCustomer('customer-1', '  Duplicate record  ', 123);

    expect(deleted).toBe(true);
    expect(Customer.update).toHaveBeenCalledWith(
      {
        ENABLED: '0',
        DESCRIPTION: 'Duplicate record',
        UPDATED_DATE: { fn: 'GETDATE' },
        UPDATED_BY: 123,
      },
      { where: { ID: 'customer-1', ENABLED: '1' } },
    );
  });

  it('rejects a reason longer than the supported description limit', async () => {
    await expect(customerService.softDeleteCustomer('customer-1', 'x'.repeat(2049), 123))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(Customer.update).not.toHaveBeenCalled();
  });
});
