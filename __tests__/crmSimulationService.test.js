process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

const { simulateCreateRequest } = require('../services/crmSimulationService');

const settings = { url: 'https://crm.example/create-request', headerKey: 'x-secret-key', headerValue: 'secret-value' };

function fakeFetch(status, body) {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, text: async () => JSON.stringify(body) });
}

describe('simulateCreateRequest', () => {
  it('posts allowed fields with the configured header', async () => {
    const fetchImpl = fakeFetch(200, { success: true });
    const result = await simulateCreateRequest({ CRM_NO: 'CN-1', IS_LIMIT_REQUESTED: 1, UNKNOWN: 'x' }, { environment: 'qas', settings, fetchImpl });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(settings.url);
    expect(options.headers['x-secret-key']).toBe('secret-value');
    expect(JSON.parse(options.body)).toEqual({ CRM_NO: 'CN-1', IS_LIMIT_REQUESTED: 1 });
    expect(result).toEqual({ status: 200, ok: true, response: { success: true } });
  });

  it('is not available on PRD', async () => {
    const fetchImpl = fakeFetch(200, {});
    await expect(simulateCreateRequest({}, { environment: 'prd', settings, fetchImpl })).rejects.toMatchObject({ statusCode: 404 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns the upstream error response instead of throwing', async () => {
    await expect(simulateCreateRequest({}, { environment: 'dev', settings, fetchImpl: fakeFetch(500, { message: 'boom' }) }))
      .resolves.toMatchObject({ status: 500, ok: false, response: { message: 'boom' } });
  });
});
