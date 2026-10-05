/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));

const { getModels } = require('../models');
const customerService = require('../services/customerService');

describe('customerService.softDeleteCustomer', () => {
  let Customer;
  let CustomerLog;
  let transaction;

  beforeEach(() => {
    transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    Customer = {
      findOne: jest.fn().mockResolvedValue({
        ID: 'customer-1',
        TAX_NO: '1234567890123',
        ENABLED: '1',
        DESCRIPTION: null,
      }),
      update: jest.fn().mockResolvedValue([1]),
      sequelize: {
        fn: jest.fn((name) => ({ fn: name })),
        transaction: jest.fn().mockResolvedValue(transaction),
      },
    };
    CustomerLog = {
      create: jest.fn().mockResolvedValue(undefined),
      sequelize: Customer.sequelize,
    };
    getModels.mockReturnValue({ Customer, CustomerLog });
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
      { where: { ID: 'customer-1', ENABLED: '1' }, transaction },
    );
    expect(CustomerLog.create).toHaveBeenCalledWith(expect.objectContaining({
      TAX_NO: '1234567890123',
      NAME: 'Customer deleted',
      LOG_TYPE_ID: expect.any(String),
      CUSTOMER_ID: 'customer-1',
      CATEGORY: 'customer.delete',
      CREATED_BY: 123,
      UPDATED_BY: 123,
      ENABLED: true,
      DESCRIPTION: expect.any(String),
    }), { transaction });
    expect(JSON.parse(CustomerLog.create.mock.calls[0][0].DESCRIPTION)).toMatchObject({
      operation: 'upsert',
      action: 'delete',
      source: 'customer-extensions.details.delete',
      changes: {
        DESCRIPTION: { from: null, to: 'Duplicate record' },
        ENABLED: { from: '1', to: '0' },
      },
    });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('rolls back the customer update if its audit log cannot be written', async () => {
    CustomerLog.create.mockRejectedValue(new Error('Customer log write failed'));

    await expect(customerService.softDeleteCustomer('customer-1', 'Duplicate record', 123))
      .rejects.toThrow('Customer log write failed');

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('rejects a reason longer than the supported description limit', async () => {
    await expect(customerService.softDeleteCustomer('customer-1', 'x'.repeat(2049), 123))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(Customer.update).not.toHaveBeenCalled();
  });
});

describe('customerService.updateCustomer audit logging', () => {
  it('writes an audit log in the same transaction as a customer update', async () => {
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    const sequelize = {
      fn: jest.fn((name) => ({ fn: name })),
      transaction: jest.fn().mockResolvedValue(transaction),
    };
    const Customer = {
      findOne: jest.fn().mockResolvedValue({
        ID: 'customer-1',
        TAX_NO: '1234567890123',
        ENABLED: '1',
      }),
      update: jest.fn().mockResolvedValue([1]),
      sequelize,
    };
    const CustomerLog = {
      create: jest.fn().mockRejectedValue(new Error('Customer log write failed')),
      sequelize,
    };
    getModels.mockReturnValue({ Customer, CustomerLog });

    await expect(customerService.updateCustomer('customer-1', { TAX_NO: '9876543210987' }, 123))
      .rejects.toThrow('Customer log write failed');

    expect(CustomerLog.create).toHaveBeenCalledWith(expect.objectContaining({
      TAX_NO: '9876543210987',
      NAME: 'Customer updated',
      LOG_TYPE_ID: expect.any(String),
      CUSTOMER_ID: 'customer-1',
      CATEGORY: 'customer.update',
      CREATED_BY: 123,
      UPDATED_BY: 123,
      ENABLED: true,
      DESCRIPTION: expect.any(String),
    }), { transaction });
    expect(JSON.parse(CustomerLog.create.mock.calls[0][0].DESCRIPTION)).toMatchObject({
      operation: 'upsert',
      action: 'update',
      source: 'customer-extensions.details.save',
      changes: {
        TAX_NO: { from: '1234567890123', to: '9876543210987' },
      },
    });
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });
});
