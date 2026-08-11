const { getModels } = require('../models');

function mapOption(record) {
  return { id: record.ID, label: record.NAME };
}

async function listEnabledStatuses() {
  const { Status } = getModels();
  const statuses = await Status.findAll({
    where: { ENABLED: '1' },
    order: [['SORTING', 'ASC'], ['NAME', 'ASC']],
  });
  return statuses.map(mapOption);
}

async function listEnabledLogTypes() {
  const { LogType } = getModels();
  const logTypes = await LogType.findAll({
    where: { ENABLED: '1' },
    order: [['SORTING', 'ASC'], ['NAME', 'ASC']],
  });
  return logTypes.map(mapOption);
}

module.exports = { listEnabledLogTypes, listEnabledStatuses };
