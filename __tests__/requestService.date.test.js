/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));
jest.mock('../config/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../services/attachmentService', () => ({}));

const { getModels } = require('../models');
const requestService = require('../services/requestService');

describe('requestService.getRequestById date formatting', () => {
  it('displays SQL datetime values without applying the server timezone offset', async () => {
    const request = new Proxy({
      ID: 'request-1',
      CUSTOMER_TAX_NO: '-',
      SOLD_TO: '',
      UPDATED_DATE: new Date('2026-10-05T12:30:47.987Z'),
    }, {
      get(target, property, receiver) {
        return Reflect.has(target, property) ? Reflect.get(target, property, receiver) : '';
      },
    });
    getModels.mockReturnValue({
      Request: { findOne: jest.fn().mockResolvedValue(request) },
      Rating: {},
      Term: {},
      Status: {},
      Employee: {},
    });

    const result = await requestService.getRequestById('request-1');

    expect(result.UPDATED_DATE).toBe('05 Oct 2026 12:30 PM');
  });
});
