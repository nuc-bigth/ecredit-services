const PRODUCTS = ['Business Loan', 'Equipment Finance', 'Working Capital', 'Invoice Finance'];
const APPLICANTS = [
  'Apex Manufacturing Co., Ltd.',
  'Blue River Logistics Co., Ltd.',
  'Chao Phraya Foods Co., Ltd.',
  'Delta Retail Group Co., Ltd.',
  'Evergreen Trading Co., Ltd.',
  'Future Tech Solutions Co., Ltd.',
];
const ASSIGNEES = ['Anong S.', 'Krit P.', 'Niran T.', 'Pimchanok R.', 'Suriya K.'];
const STATUSES = ['Pending Review', 'In Progress', 'Approved', 'Rejected'];

const mockRequests = Array.from({ length: 137 }, (_, index) => {
  const requestNumber = index + 1;
  const submittedDate = new Date(Date.UTC(2026, 7, 1) - requestNumber * 86400000);

  return {
    id: `request-${requestNumber}`,
    requestNo: `ECR-${String(260000 + requestNumber).padStart(6, '0')}`,
    applicant: APPLICANTS[index % APPLICANTS.length],
    product: PRODUCTS[index % PRODUCTS.length],
    amount: 180000 + ((index * 183750) % 4850000),
    submittedAt: submittedDate.toISOString(),
    status: STATUSES[index % STATUSES.length],
    assignee: ASSIGNEES[index % ASSIGNEES.length],
  };
});

function normalizePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function includesValue(value, filter) {
  return !filter || String(value).toLowerCase().includes(String(filter).toLowerCase());
}

const SORTABLE_FIELDS = ['requestNo', 'amount', 'status'];

function compareBySortField(a, b, sortField) {
  if (sortField === 'amount') {
    return a.amount - b.amount;
  }
  return String(a[sortField]).localeCompare(String(b[sortField]));
}

function listMockRequests(query) {
  const pageSize = Math.min(normalizePage(query.pageSize, 25), 100);
  const filteredItems = mockRequests.filter((request) => {
    const matchesColumns = [
      includesValue(request.requestNo, query.requestNo),
      includesValue(request.applicant, query.applicant),
      includesValue(request.product, query.product),
      includesValue(request.amount, query.amount),
      includesValue(request.submittedAt.slice(0, 10), query.submittedAt),
      includesValue(request.status, query.status),
      includesValue(request.assignee, query.assignee),
    ].every(Boolean);

    if (!matchesColumns) {
      return false;
    }

    switch (query.quickFilter) {
      case 'pending-review':
        return request.status === 'Pending Review';
      case 'in-progress':
        return request.status === 'In Progress';
      case 'high-value':
        return request.amount >= 3000000;
      default:
        return true;
    }
  });

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(normalizePage(query.page, 1), totalPages);
  const start = (page - 1) * pageSize;

  const sortedItems = SORTABLE_FIELDS.includes(query.sort)
    ? [...filteredItems].sort((a, b) => {
        const direction = query.dir === 'desc' ? -1 : 1;
        return compareBySortField(a, b, query.sort) * direction;
      })
    : filteredItems;

  return {
    items: sortedItems.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

function getMockRequestById(id) {
  return mockRequests.find((request) => request.id === id) || null;
}

function deleteMockRequest(id) {
  const index = mockRequests.findIndex((request) => request.id === id);
  if (index === -1) {
    return false;
  }
  mockRequests.splice(index, 1);
  return true;
}

module.exports = {
  listMockRequests,
  getMockRequestById,
  deleteMockRequest,
};