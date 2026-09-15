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
const finalStatusId = '014e8e8b-42cf-4b2f-8cae-e395e26efbcd';
const rejectedStatusId = '94589a22-12e5-4298-aa30-06295acbe1b9';

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

function submitCommand(steps) {
  return {
    customerInfo: {
      CUSTOMER_TAX_NO: '-',
      CUSTOMER_REGISTERED_CAPITAL_AMOUNT: '0',
    },
    creditSuggestion: {
      PROPOSED_LIMIT_AMOUNT: 100000,
    },
    scoringAndPayment: {
      SCORING_PROFITABILITY: '-',
    },
    requestedDetails: {
      IS_TERM_REQUESTED: true,
      IS_LIMIT_REQUESTED: true,
    },
    steps,
  };
}

describe('requestService.processApprovalAction', () => {
  let approvalUpdate;
  let requestUpdate;
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
    requestUpdate = jest.fn().mockResolvedValue([1]);

    getDatabase.mockReturnValue(database);
    getModels.mockReturnValue({
      Approval: { update: approvalUpdate, sequelize },
      Request: { findOne: jest.fn().mockResolvedValue(null), update: requestUpdate, sequelize },
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
      waitingStatusId: '4ba2cdc6-47aa-41bd-99a0-79e1e6b0831b',
      pendingApprovalTypeId: 'b4c27a6c-ab7c-4ce5-b885-997f9104c23d',
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
      .mockResolvedValueOnce([{ ID: 'approved-type' }])
      .mockResolvedValueOnce([{ TOTAL: 0 }]);

    await requestService.processApprovalAction(
      requestId,
      'approve',
      approvalPayload('approve'),
      updatedBy,
    );

    expect(approvalUpdate.mock.calls[0][0].APPROVAL_TYPE_ID).toBe('approved-type');
    expect(database.query.mock.calls[1][1].replacements).toEqual({ approvalTypeName: 'Approved' });
    expect(requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ STATUS_ID: finalStatusId }),
      expect.objectContaining({ where: { ID: requestId, ENABLED: true }, transaction }),
    );
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects the request while retaining other pending approvals', async () => {
    database.query
      .mockResolvedValueOnce([{ ID: approvalId }])
      .mockResolvedValueOnce([{ ID: 'rejected-type' }]);

    await requestService.processApprovalAction(
      requestId,
      'reject',
      approvalPayload('reject'),
      updatedBy,
    );

    expect(requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ STATUS_ID: rejectedStatusId }),
      expect.objectContaining({ where: { ID: requestId, ENABLED: true }, transaction }),
    );
    expect(database.query).toHaveBeenCalledTimes(2);
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

describe('requestService.submitRequest', () => {
  let database;
  let requestRecord;
  let transaction;

  beforeEach(() => {
    transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    database = {
      transaction: jest.fn().mockResolvedValue(transaction),
      query: jest.fn(),
    };
    requestRecord = {
      STATUS_ID: 'db8b3768-8466-4974-8dff-4c374b16a639',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const sequelize = { fn: jest.fn((name) => ({ fn: name })) };
    const Request = {
      findOne: jest.fn()
        .mockResolvedValueOnce(requestRecord)
        .mockResolvedValueOnce(null),
      sequelize,
    };

    getDatabase.mockReturnValue(database);
    getModels.mockReturnValue({
      Request,
      Size: { findOne: jest.fn().mockResolvedValue({ ID: 'size-1' }) },
      Term: { findByPk: jest.fn().mockResolvedValue({ ID: 'term-1' }) },
      Rating: { findOne: jest.fn().mockResolvedValue({ ID: 'rating-1' }) },
    });
  });

  it('rejects an empty submit step list before opening a transaction', async () => {
    await expect(requestService.submitRequest(requestId, submitCommand([]), updatedBy))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(getDatabase().transaction).not.toHaveBeenCalled();
  });

  it('rejects a submit step without an approver before opening a transaction', async () => {
    await expect(requestService.submitRequest(
      requestId,
      submitCommand([{ approverTypeId: 'type-1', approverId: '', approvalStep: 1, sorting: 1 }]),
      updatedBy,
    )).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(getDatabase().transaction).not.toHaveBeenCalled();
  });

  it('rejects non-contiguous approval sorting before opening a transaction', async () => {
    await expect(requestService.submitRequest(
      requestId,
      submitCommand([{ approverTypeId: 'type-1', approverId: '123', approvalStep: 1, sorting: 2 }]),
      updatedBy,
    )).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(getDatabase().transaction).not.toHaveBeenCalled();
  });

  it('saves and completes without creating approvals when term and limit are not included', async () => {
    const command = submitCommand([]);
    command.requestedDetails.IS_TERM_REQUESTED = false;
    command.requestedDetails.IS_LIMIT_REQUESTED = false;
    await requestService.submitRequest(requestId, command, updatedBy);

    expect(requestRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        STATUS_ID: '407e23f9-caf5-4c4a-801d-598cf437d1ae',
        IS_TERM_REQUESTED: false,
        IS_LIMIT_REQUESTED: false,
        SUBMITTED_BY: updatedBy,
      }),
      { transaction },
    );
    expect(database.query).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('persists ordered approval rows from the current unsaved values', async () => {
    const command = submitCommand([{
      approverTypeId: 'type-1', approverId: '456', approvalStep: 1, sorting: 1,
    }]);
    command.creditSuggestion = {
      ...command.creditSuggestion,
      PROPOSED_TERM_ID: 'term-1',
      PROPOSED_RATING_ID: 'rating-1',
      PROPOSED_NOTES: 'Current unsaved note',
      IS_PERMANENT_PROPOSED: false,
      IS_TEMPORARY_PROPOSED: true,
      PROPOSED_VALID_FROM: '2026-09-14',
      PROPOSED_VALID_TO: '2026-09-30',
      IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED: true,
      IS_WITHIN_APPROVED_LIMIT_PROPOSED: false,
      IS_BANK_GUARANTEE_PROPOSED: false,
      PROPOSED_BANK_GUARANTEE_AMOUNT: 0,
      IS_CASH_DEPOSIT_PROPOSED: false,
      PROPOSED_CASH_DEPOSIT_AMOUNT: 0,
    };
    database.query
      .mockResolvedValueOnce([{ ID: 'type-1' }])
      .mockResolvedValueOnce([{ EMP_CODE: 456 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await requestService.submitRequest(requestId, command, updatedBy);

    const insertCall = database.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO APPROVALS'));
    expect(insertCall[1].replacements).toEqual(expect.objectContaining({
      requestId,
      approverTypeId: 'type-1',
      approvalTypeId: 'b4c27a6c-ab7c-4ce5-b885-997f9104c23d',
      approverId: '456',
      description: '',
      limitAmount: 100000,
      termId: 'term-1',
      validFrom: '2026-09-14',
      validTo: '2026-09-30',
      approvalStep: 1,
      sorting: 1,
      updatedBy,
    }));
    expect(requestRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ STATUS_ID: '4ba2cdc6-47aa-41bd-99a0-79e1e6b0831b' }),
      { transaction },
    );
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('rolls back request changes when approval insertion fails', async () => {
    const command = submitCommand([{
      approverTypeId: 'type-1', approverId: '456', approvalStep: 1, sorting: 1,
    }]);
    database.query
      .mockResolvedValueOnce([{ ID: 'type-1' }])
      .mockResolvedValueOnce([{ EMP_CODE: 456 }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('insert failed'));

    await expect(requestService.submitRequest(requestId, command, updatedBy))
      .rejects.toThrow('insert failed');

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });
});
