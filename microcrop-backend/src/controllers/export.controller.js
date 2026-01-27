import exportService from '../services/export.service.js';

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

export const exportController = {
  async exportFarmers(req, res, next) {
    try {
      const csv = await exportService.exportFarmers(req.organization.id, req.query);
      sendCsv(res, `farmers-${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      next(error);
    }
  },

  async exportPolicies(req, res, next) {
    try {
      const csv = await exportService.exportPolicies(req.organization.id, req.query);
      sendCsv(res, `policies-${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      next(error);
    }
  },

  async exportPayouts(req, res, next) {
    try {
      const csv = await exportService.exportPayouts(req.organization.id, req.query);
      sendCsv(res, `payouts-${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      next(error);
    }
  },

  async exportTransactions(req, res, next) {
    try {
      const csv = await exportService.exportTransactions(req.organization.id, req.query);
      sendCsv(res, `transactions-${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      next(error);
    }
  },

  async exportPlatformOrganizations(req, res, next) {
    try {
      const csv = await exportService.exportPlatformOrganizations(req.query);
      sendCsv(res, `organizations-${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      next(error);
    }
  },

  async exportPlatformRevenue(req, res, next) {
    try {
      const csv = await exportService.exportPlatformRevenue(req.query);
      sendCsv(res, `revenue-${new Date().toISOString().split('T')[0]}.csv`, csv);
    } catch (error) {
      next(error);
    }
  },
};

export default exportController;
