const { getModels } = require('../models');

function mapOption(record) {
  return { id: record.ID, label: record.NAME };
}

function mapRatingOption(record) {
  return { id: record.ID, label: record.NAME, color: record.COLOR_CODE || '' };
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

async function listEnabledRatings() {
  const { Rating } = getModels();
  const ratings = await Rating.findAll({
    where: { ENABLED: '1' },
    order: [['NAME', 'ASC']],
  });
  return ratings.map(mapRatingOption);
}

module.exports = { listEnabledLogTypes, listEnabledRatings, listEnabledStatuses };
