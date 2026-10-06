/* eslint-env jest */

const {
  pendingApprovers,
  bdsReviewApprovers,
  resolveRecipients,
  buildApprovalSubject,
  buildCompletedSubject,
  buildCancelledSubject,
  buildRejectedSubject,
} = require('../services/requestWorkflowNotificationService');

function approval(overrides = {}) {
  return {
    APPROVER_TYPE_NAME: 'Manager Approve',
    APPROVAL_TYPE_NAME: 'Pending',
    APPROVAL_STEP: 1,
    APPROVER_NAME: 'FIRST-APPROVER',
    APPROVER_EMAIL: 'first@example.com',
    CURRENT_CYCLE: true,
    ...overrides,
  };
}

describe('request workflow notification recipients', () => {
  it('builds the requested approval subject from customer and company code', () => {
    expect(buildApprovalSubject({
      companyName: 'Benchmark Electronics (Thailand)PCL.',
      salesGroup: '200 - MG',
    })).toBe('New Submitting for your approval Benchmark Electronics (Thailand)PCL. (200 - MG)');
  });

  it('builds the completed subject from customer and sales group', () => {
    expect(buildCompletedSubject({
      companyName: 'Pentel Co., Ltd.',
      salesGroup: '100 - TGEE',
    })).toBe('Completed for your requested Pentel Co., Ltd. (100 - TGEE)');
  });

  it('builds the cancelled subject from company name and sales group', () => {
    expect(buildCancelledSubject({
      companyName: 'Pentel Co., Ltd.',
      salesGroup: '100 - TGEE',
    })).toBe('Request was cancelled Pentel Co., Ltd. (100 - TGEE)');
  });

  it('builds the rejected subject from company name and sales group', () => {
    expect(buildRejectedSubject({
      companyName: 'Pentel Co., Ltd.',
      salesGroup: '100 - TGEE',
    })).toBe('Request was rejected Pentel Co., Ltd. (100 - TGEE)');
  });

  it('groups all pending approvers from the first pending step', () => {
    const history = [
      approval(),
      approval({ APPROVER_NAME: 'SECOND-APPROVER', APPROVER_EMAIL: 'second@example.com' }),
      approval({ APPROVAL_STEP: 2, APPROVER_NAME: 'LATER-APPROVER', APPROVER_EMAIL: 'later@example.com' }),
    ];

    expect(pendingApprovers(history)).toHaveLength(2);
    expect(resolveRecipients('submit', history, {}).toRecords).toEqual([
      { email: 'first@example.com', name: 'FIRST-APPROVER' },
      { email: 'second@example.com', name: 'SECOND-APPROVER' },
    ]);
  });

  it('selects only current-cycle BDS Review approvers from step 2', () => {
    const history = [
      approval({
        APPROVAL_STEP: 2,
        APPROVER_TYPE_NAME: 'Manager Approve (BDS)',
        APPROVER_NAME: 'BDS-APPROVER',
        APPROVER_EMAIL: 'bds@example.com',
        APPROVAL_TYPE_NAME: 'Approved',
      }),
      approval({
        APPROVAL_STEP: 2,
        APPROVER_TYPE_NAME: 'Manager Approve (Finance)',
        APPROVER_NAME: 'FINANCE-APPROVER',
        APPROVER_EMAIL: 'finance@example.com',
        APPROVAL_TYPE_NAME: 'Approved',
      }),
      approval({
        APPROVAL_STEP: 2,
        APPROVER_TYPE_NAME: 'Manager Approve (BDS)',
        APPROVER_NAME: 'OLD-BDS-APPROVER',
        APPROVER_EMAIL: 'old-bds@example.com',
        APPROVAL_TYPE_NAME: 'Approved',
        CURRENT_CYCLE: false,
      }),
    ];

    expect(bdsReviewApprovers(history)).toEqual([history[0]]);
    expect(resolveRecipients('final', history, {}).toRecords).toEqual([
      { email: 'bds@example.com', name: 'BDS-APPROVER' },
    ]);
  });

  it('sends rejection to the requester and copies prior approved approvers', () => {
    const history = [
      {
        APPROVER_TYPE_NAME: 'Requester',
        APPROVER_NAME: 'REQUESTER',
        APPROVER_EMAIL: 'requester@example.com',
        CURRENT_CYCLE: true,
      },
      approval({ APPROVAL_TYPE_NAME: 'Approved', APPROVER_NAME: 'PRIOR', APPROVER_EMAIL: 'prior@example.com' }),
      approval({ APPROVAL_TYPE_NAME: 'Rejected', APPROVER_NAME: 'ACTOR', APPROVER_EMAIL: 'actor@example.com' }),
    ];

    expect(resolveRecipients('reject', history, {
      email: 'actor@example.com',
      displayName: 'ACTOR',
    })).toEqual({
      toRecords: [{ email: 'requester@example.com', name: 'REQUESTER' }],
      ccRecords: [
        { email: 'prior@example.com', name: 'PRIOR' },
        { email: 'actor@example.com', name: 'ACTOR' },
      ],
      dear: 'REQUESTER',
    });
  });

  it('sends cancellation to the requester and copies all current-cycle approvers', () => {
    const history = [
      {
        APPROVER_TYPE_NAME: 'Requester',
        APPROVER_NAME: 'REQUESTER',
        APPROVER_EMAIL: 'requester@example.com',
        CURRENT_CYCLE: true,
      },
      approval({ APPROVER_NAME: 'FINANCE', APPROVER_EMAIL: 'finance@example.com' }),
      approval({
        APPROVER_TYPE_NAME: 'BDS Review',
        APPROVER_NAME: 'BDS',
        APPROVER_EMAIL: 'bds@example.com',
        APPROVAL_TYPE_NAME: 'Suggested',
      }),
    ];

    expect(resolveRecipients('cancel', history, { email: 'actor@example.com', displayName: 'ACTOR' })).toEqual({
      toRecords: [{ email: 'requester@example.com', name: 'REQUESTER' }],
      ccRecords: [
        { email: 'finance@example.com', name: 'FINANCE' },
        { email: 'bds@example.com', name: 'BDS' },
      ],
      dear: 'REQUESTER',
    });
  });
});
