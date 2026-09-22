/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));

const { getModels } = require('../models');
const {
  formatDate,
  formatMoney,
  mapRequestToEmailModel,
  getRequestEmailModel,
} = require('../services/requestEmailModelService');

describe('requestEmailModelService', () => {
  test('formats dates and money for email output', () => {
    expect(formatDate('2026-09-22T00:00:00.000Z')).toBe('22/09/2026');
    expect(formatMoney('20000')).toBe('20,000.00');
    expect(formatMoney(null)).toBe('-');
  });

  test('maps the external customer type and request credit fields', () => {
    const model = mapRequestToEmailModel({
      REQUESTED_CUSTOMER_TYPE: 'New',
      CUSTOMER_NAME_ENG: 'Acme',
      SOLD_TO: '100001',
      REQUESTED_SALES_GROUP: '100',
      CUSTOMER_BUSINESS_TYPE_INTER: 'Industry',
      CUSTOMER_CUSTOMER_TYPE_EXTER: 'External',
      CUSTOMER_REGISTERED_DATE: '2026-09-22',
      CUSTOMER_REGISTERED_CAPITAL_AMOUNT: '20000',
      size: { NAME: 'Large' },
      existingRating: { NAME: 'B' },
      requestedRating: { NAME: 'A-' },
      proposedRating: { NAME: 'A' },
      SCORING_PROFITABILITY: 'Good',
      SCORING_GROWTH: 'Good',
      SCORING_LIQUIDITY: 'Good',
      SCORING_LEVERAGE: 'Good',
      SCORING_NOTES: 'Strong financial profile',
      IS_SCORING_NA: false,
      IS_SCORING_GOVERMENT: true,
      IS_SCORING_OTHER: false,
      IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED: true,
      IS_WITHIN_APPROVED_LIMIT_PROPOSED: false,
      IS_BANK_GUARANTEE_PROPOSED: true,
      IS_CASH_DEPOSIT_PROPOSED: false,
      PROPOSED_BANK_GUARANTEE_AMOUNT: '1000',
      PROPOSED_CASH_DEPOSIT_AMOUNT: '2000',
      PROPOSED_NOTES: 'Approved',
      existingTerm: { NAME: '30 days' },
      requestedTerm: { NAME: '60 days' },
      proposedTerm: { NAME: '45 days' },
      EXISTING_LIMIT_AMOUNT: '10000',
      REQUESTED_LIMIT_AMOUNT: '20000',
      PROPOSED_LIMIT_AMOUNT: '15000',
    }, 'Approver');

    expect(model).toEqual(expect.objectContaining({
      dear: 'Approver',
      customerType: 'External',
      registeredCapital: '20,000.00',
      creditRatingScore: 'A',
      creditRatingExisting: 'B',
      creditRatingRequested: 'A-',
      creditRatingProposed: 'A',
      scoringNotes: 'Strong financial profile',
      scoringClassificationNa: false,
      scoringClassificationGovernment: true,
      scoringClassificationOthers: false,
      showScoringClassification: true,
      clearOutstandingBalance: true,
      withinApprovedLimit: false,
      bankGuarantee: true,
      cashDeposit: false,
      showAdditionalConditions: true,
      creditLimitExisting: '10,000.00',
      creditLimitRequested: '20,000.00',
      creditLimitProposed: '15,000.00',
    }));
  });

  test('hides optional sections when all classification and condition flags are false', () => {
    const model = mapRequestToEmailModel({
      IS_SCORING_NA: false,
      IS_SCORING_GOVERMENT: false,
      IS_SCORING_OTHER: false,
      IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED: false,
      IS_WITHIN_APPROVED_LIMIT_PROPOSED: false,
      IS_BANK_GUARANTEE_PROPOSED: false,
      IS_CASH_DEPOSIT_PROPOSED: false,
    });

    expect(model.showScoringClassification).toBe(false);
    expect(model.showAdditionalConditions).toBe(false);
  });

  test('loads a request with ORM associations', async () => {
    const request = { CUSTOMER_CUSTOMER_TYPE_EXTER: 'External' };
    const findOne = jest.fn().mockResolvedValue(request);
    const Request = { findOne };
    const Rating = { model: 'Rating' };
    const Term = { model: 'Term' };
    const Size = { model: 'Size' };
    getModels.mockReturnValue({ Request, Rating, Term, Size });

    await getRequestEmailModel('request-1', 'Approver');

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { ID: 'request-1', ENABLED: true },
      include: expect.arrayContaining([
        expect.objectContaining({ model: Size, as: 'size' }),
        expect.objectContaining({ model: Rating, as: 'existingRating' }),
        expect.objectContaining({ model: Rating, as: 'requestedRating' }),
        expect.objectContaining({ model: Rating, as: 'proposedRating' }),
        expect.objectContaining({ model: Term, as: 'existingTerm' }),
      ]),
    }));
  });
});
