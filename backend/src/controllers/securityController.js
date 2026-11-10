import { asyncHandler } from '../utils/errors.js';
import { getSecurityDashboard } from '../services/securityControlService.js';
import { getSecuritySettings, updateSecuritySettings } from '../services/securityControlService.js';
import { recordAudit } from '../services/auditService.js';
import { DATA_CLASSIFICATION } from '../config/dataClassification.js';

export const getSecurityDashboardHandler = asyncHandler(async (_req, res) => {
  const dashboard = await getSecurityDashboard();
  res.json({ success: true, data: { dashboard } });
});

export const getSecuritySettingsHandler = asyncHandler(async (_req, res) => {
  const settings = await getSecuritySettings();
  res.json({ success: true, data: { settings } });
});

export const updateSecuritySettingsHandler = asyncHandler(async (req, res) => {
  const settings = await updateSecuritySettings(req.body, req.auth.id);
  await recordAudit({
    userId: req.auth.id,
    actorRole: req.auth.role,
    action: 'SECURITY_SETTINGS_UPDATED',
    entity: 'security_settings',
    req,
    metadata: { keys: Object.keys(req.body) },
  });
  res.json({ success: true, data: { settings } });
});

export const getDataClassificationHandler = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { records: DATA_CLASSIFICATION } });
});
