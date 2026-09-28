/* eslint-env jest */

const {
  pendingApprovers,
  resolveRecipients,
  buildApprovalSubject,
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

  it('notifies the submitter and prior approvers with the actor in CC after rejection', () => {
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
      toRecords: [
        { email: 'requester@example.com', name: 'REQUESTER' },
        { email: 'prior@example.com', name: 'PRIOR' },
      ],
      ccRecords: [{ email: 'actor@example.com', name: 'ACTOR' }],
      dear: 'All',
    });
  });
});
