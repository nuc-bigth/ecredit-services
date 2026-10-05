/* eslint-env jest */

jest.mock('../models', () => ({ getModels: jest.fn() }));
jest.mock('../config/database', () => ({ getDatabase: jest.fn() }));
jest.mock('../services/attachmentService', () => ({}));

const { getModels } = require('../models');
const requestService = require('../services/requestService');

describe('requestService.listRequests sorting', () => {
  it('orders by CREATED_DATE descending by default', async () => {
    const findAndCountAll = jest.fn().mockResolvedValue({ rows: [], count: 0 });
    getModels.mockReturnValue({
      Request: { findAndCountAll },
      Rating: {},
      Term: {},
      Status: {},
      Employee: {},
    });

    await requestService.listRequests({});

    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      order: [['CREATED_DATE', 'DESC']],
    }));
  });
});
