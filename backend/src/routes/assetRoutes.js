const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect and requirePasswordSet in src/app.js. The register is
// the committee's, so it is admin only.
const adminOnly = requireRole('ADMIN');

const FIELDS = {
  name: { type: 'string', minLength: 2, maxLength: 120, label: 'Name' },
  category: { oneOf: assetController.CATEGORIES, label: 'Category' },
  location: { type: 'string', maxLength: 120, label: 'Location' },
  installed_on: { type: 'date', label: 'Installed on' },
  vendor_id: { type: 'integer', label: 'Vendor' },
  note: { type: 'string', maxLength: 255, label: 'Note' }
};

router.get('/', adminOnly, assetController.getAssets);
router.get('/:id/history', adminOnly, assetController.getAssetHistory);
router.post('/', adminOnly, validate({ ...FIELDS, name: { ...FIELDS.name, required: true } }), assetController.createAsset);
router.put(
  '/:id',
  adminOnly,
  validate({ ...FIELDS, is_active: { type: 'boolean', label: 'In service' } }),
  assetController.updateAsset
);

module.exports = router;
