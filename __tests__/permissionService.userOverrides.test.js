jest.mock('../models', () => ({
  getModels: jest.fn(),
}));

const { getModels } = require('../models');
const { getEffectivePermissions } = require('../services/permissionService');

describe('permissionService per-user overrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses explicit user grants and denials over role defaults', async () => {
    getModels.mockReturnValue({
      Permission: {
        findAll: jest.fn().mockResolvedValue([
          { ID: 'view', NAME: 'Requests.View' },
          { ID: 'delete', NAME: 'Requests.Delete' },
          { ID: 'export', NAME: 'Requests.Export' },
        ]),
      },
      UserPermission: {
        findAll: jest.fn().mockResolvedValue([
          { PERMISSION_ID: 'view', ENABLED: '0' },
          { PERMISSION_ID: 'delete', ENABLED: '1' },
        ]),
      },
      UserRole: {
        findAll: jest.fn().mockResolvedValue([{ ROLE_ID: 'role-a' }]),
      },
      RolePermission: {
        findAll: jest.fn().mockResolvedValue([{ PERMISSION_ID: 'view' }, { PERMISSION_ID: 'export' }]),
      },
      Role: {},
    });

    await expect(getEffectivePermissions('employee-1')).resolves.toEqual([
      { ID: 'view', NAME: 'Requests.View', GRANTED: false },
      { ID: 'delete', NAME: 'Requests.Delete', GRANTED: true },
      { ID: 'export', NAME: 'Requests.Export', GRANTED: true },
    ]);
  });
});
