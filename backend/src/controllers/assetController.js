const db = require('../config/db');
const log = require('../services/log');
const { recordAudit } = require('../services/audit');
const { toPaise, toRupees } = require('../services/billing');

/**
 * The building's equipment: lifts, pumps, the DG set, tanks, the STP.
 *
 * Nothing about an asset's history is entered twice. Tickets and expenses carry
 * an asset_id, and the service history is those records read back together, so
 * the answer to "what has the lift cost us this year" is the ledger itself.
 */

const CATEGORIES = ['LIFT', 'PUMP', 'DG_SET', 'WATER_TANK', 'STP', 'FIRE_SAFETY', 'ELECTRICAL', 'OTHER'];
const EDITABLE = ['name', 'category', 'location', 'installed_on', 'vendor_id', 'note', 'is_active'];

const failed = (req, res, what, error) => {
  log.error(`${what} failed`, { request_id: req.id, error });
  res.status(500).json({ success: false, message: `Server error: ${what}` });
};

const dayOrNull = (value) => (value && String(value).slice(0, 10) !== '1000-01-01' ? String(value).slice(0, 10) : null);

/** 1. Every asset, with how often it breaks and what it has cost. */
exports.getAssets = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.id, a.name, a.category, a.location, a.installed_on, a.vendor_id, v.name AS vendor_name,
              a.note, a.is_active,
              (SELECT COUNT(*) FROM maintenance_tickets t WHERE t.asset_id = a.id) AS tickets,
              (SELECT COUNT(*) FROM maintenance_tickets t WHERE t.asset_id = a.id AND t.status IN ('OPEN', 'IN_PROGRESS')) AS open_tickets,
              (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.asset_id = a.id) AS spent,
              GREATEST(
                COALESCE((SELECT DATE_FORMAT(MAX(e.paid_on), '%Y-%m-%d') FROM expenses e WHERE e.asset_id = a.id), '1000-01-01'),
                COALESCE((SELECT DATE_FORMAT(MAX(t.resolved_at), '%Y-%m-%d') FROM maintenance_tickets t WHERE t.asset_id = a.id), '1000-01-01')
              ) AS last_serviced
       FROM assets a
       LEFT JOIN vendors v ON a.vendor_id = v.id
       ORDER BY a.is_active DESC, a.category ASC, a.name ASC`
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        is_active: Boolean(row.is_active),
        tickets: Number(row.tickets),
        open_tickets: Number(row.open_tickets),
        spent: Number(row.spent),
        last_serviced: dayOrNull(row.last_serviced)
      })),
      categories: CATEGORIES
    });
  } catch (error) {
    failed(req, res, 'reading assets', error);
  }
};

/** 2. One asset's service history: its tickets and its bills as one timeline. */
exports.getAssetHistory = async (req, res) => {
  try {
    const [[asset]] = await db.execute(
      `SELECT a.*, v.name AS vendor_name FROM assets a LEFT JOIN vendors v ON a.vendor_id = v.id WHERE a.id = ?`,
      [req.params.id]
    );

    if (!asset) {
      return res.status(404).json({ success: false, message: 'No such asset.' });
    }

    const [tickets] = await db.execute(
      `SELECT id, title, priority, status, created_at, resolved_at, sla_breached_at
       FROM maintenance_tickets WHERE asset_id = ? ORDER BY created_at DESC LIMIT 200`,
      [asset.id]
    );

    const [expenses] = await db.execute(
      `SELECT id, paid_on, payee_name, category, amount, reference, ticket_id
       FROM expenses WHERE asset_id = ? ORDER BY paid_on DESC, id DESC LIMIT 200`,
      [asset.id]
    );

    const timeline = [
      ...tickets.map((ticket) => ({
        kind: 'TICKET',
        on: new Date(ticket.created_at).toISOString().slice(0, 10),
        ...ticket,
        sla_breached: Boolean(ticket.sla_breached_at)
      })),
      ...expenses.map((expense) => ({ kind: 'EXPENSE', on: expense.paid_on, ...expense, amount: Number(expense.amount) }))
    ].sort((a, b) => String(b.on).localeCompare(String(a.on)));

    res.json({
      success: true,
      data: {
        asset: { ...asset, is_active: Boolean(asset.is_active) },
        timeline,
        totals: {
          tickets: tickets.length,
          breaches: tickets.filter((ticket) => ticket.sla_breached_at).length,
          spent: toRupees(expenses.reduce((sum, expense) => sum + toPaise(expense.amount), 0))
        }
      }
    });
  } catch (error) {
    failed(req, res, 'reading asset history', error);
  }
};

/** 3. Register an asset. */
exports.createAsset = async (req, res) => {
  const { name, category, location, installed_on: installedOn, vendor_id: vendorId, note } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO assets (name, category, location, installed_on, vendor_id, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(name).trim(), category || 'OTHER', location || null, installedOn || null, vendorId || null, note || null]
    );

    await recordAudit(req, {
      action: 'CREATE_ASSET',
      entity: 'assets',
      entity_id: result.insertId,
      summary: `Registered ${String(name).trim()}`,
      after: req.body
    });

    res.json({ success: true, message: `${String(name).trim()} added to the register.`, data: { id: result.insertId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An asset with that name is already registered.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ success: false, message: 'That vendor does not exist.' });
    }
    failed(req, res, 'registering an asset', error);
  }
};

/** 4. Change an asset, or take it out of service. */
exports.updateAsset = async (req, res) => {
  const fields = EDITABLE.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));

  if (fields.length === 0) {
    return res.status(400).json({ success: false, message: 'Nothing to change.' });
  }

  const values = fields.map((field) => {
    const value = req.body[field];
    if (field === 'is_active') return value ? 1 : 0;
    if (field === 'name') return String(value).trim();
    return value === '' || value === undefined ? null : value;
  });

  try {
    const [result] = await db.execute(
      `UPDATE assets SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...values, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'No such asset.' });
    }

    await recordAudit(req, {
      action: 'UPDATE_ASSET',
      entity: 'assets',
      entity_id: req.params.id,
      summary: `Updated asset ${req.params.id}: ${fields.join(', ')}`,
      after: req.body
    });

    res.json({ success: true, message: 'Asset updated.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An asset with that name is already registered.' });
    }
    failed(req, res, 'updating an asset', error);
  }
};

exports.CATEGORIES = CATEGORIES;
