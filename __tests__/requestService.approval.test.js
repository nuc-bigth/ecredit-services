/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));
jest.mock('../config/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../services/attachmentService', () => ({}));

const { getModels } = require('../models');
const { getDatabase } = require('../config/database');
const requestService = require('../services/requestService');

const requestId = 'request-1';
const approvalId = 'approval-2';
const updatedBy = 12345;

function approvalPayload(action = 'save') {
  return {
    action,
    APPROVAL_ID: approvalId,
    DESCRIPTION: 'Reviewed',
    LIMIT_AMOUNT: 100000,
    TERM_ID: 'term-1',
    RATING_ID: 'rating-1',
    IS_PERMANENT: false,
    IS_TEMPORARY: true,
    VALID_FROM: '2026-09-08',
    VALID_TO: '2026-09-30',
    IS_CLEAR_OUTSTANDING_BALANCE: true,
    IS_WITHIN_APPROVED_LIMIT: false,
    IS_BANK_GUARANTEE: true,
    BANK_GUARANTEE_AMOUNT: 5000,
    IS_CASH_DEPOSIT: false,
    CASH_DEPOSIT_AMOUNT: 0,
  };
}

describe('requestService.processApprovalAction', () => {
  let approvalUpdate;
  let database;
  let transaction;
  let sequelize;

  beforeEach(() => {
    transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    database = {
      transaction: jest.fn().mockResolvedValue(transaction),
      query: jest.fn(),
    };
    sequelize = {
      fn: jest.fn((name) => ({ fn: name })),
    };
    approvalUpdate = jest.fn().mockResolvedValue([1]);

    getDatabase.mockReturnValue(database);
    getModels.mockReturnValue({
      Approval: { update: approvalUpdate, sequelize },
      Request: { findOne: jest.fn().mockResolvedValue(null) },
      Rating: {},
      Term: {},
      Status: {},
      Employee: {},
    });
  });

  it('saves mapped fields by approval and request ID without changing status', async () => {
    database.query.mockResolvedValueOnce([{ ID: approvalId }]);

    await requestService.processApprovalAction(
      requestId,
      'save',
      approvalPayload(),
      updatedBy,
    );

    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls[0][1].replacements).toEqual({
      id: requestId,
      approvalId,
      updatedBy,
      isSystemAdmin: 0,
    });
    expect(approvalUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ APPROVAL_TYPE_ID: expect.anything() }),
      expect.objectContaining({
        where: { ID: approvalId, REQUEST_ID: requestId, ENABLED: true },
        transaction,
      }),
    );
    expect(approvalUpdate.mock.calls[0][0]).toEqual(expect.objectContaining({
      DESCRIPTION: 'Reviewed',
      LIMIT_AMOUNT: 100000,
      TERM_ID: 'term-1',
      RATING_ID: 'rating-1',
      IS_PERMANENT: false,
      IS_TEMPORARY: true,
      IS_CLEAR_OUTSTANDING_BALANCE: true,
      IS_WITHIN_APPROVED_LIMIT: false,
      IS_BANK_GUARANTEE: true,
      BANK_GUARANTEE_AMOUNT: 5000,
      IS_CASH_DEPOSIT: false,
      CASH_DEPOSIT_AMOUNT: 0,
      UPDATED_BY: updatedBy,
      UPDATED_DATE: { fn: 'GETDATE' },
    }));
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('changes approval status when approving the selected approval ID', async () => {
    database.query
      .mockResolvedValueOnce([{ ID: approvalId }])
      .mockResolvedValueOnce([{ ID: 'approved-type' }]);

    await requestService.processApprovalAction(
      requestId,
      'approve',
      approvalPayload('approve'),
      updatedBy,
    );

    expect(approvalUpdate.mock.calls[0][0].APPROVAL_TYPE_ID).toBe('approved-type');
    expect(database.query.mock.calls[1][1].replacements).toEqual({ approvalTypeName: 'Approved' });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects an approval ID that is not pending and assigned to the user', async () => {
    database.query.mockResolvedValueOnce([]);

    await expect(requestService.processApprovalAction(
      requestId,
      'save',
      approvalPayload(),
      updatedBy,
    )).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(approvalUpdate).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid boolean values before opening a transaction', async () => {
    const payload = approvalPayload();
    payload.IS_PERMANENT = 'false';

    await expect(requestService.processApprovalAction(
      requestId,
      'save',
      payload,
      updatedBy,
    )).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(database.transaction).not.toHaveBeenCalled();
  });
});
