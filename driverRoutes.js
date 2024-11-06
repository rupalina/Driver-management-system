const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, generateToken } = require('../middleware/jwt');
const pool = require('../db');
const router = express.Router();

// Login route to generate JWT token
router.post('/login', 
    [
        body('username').notEmpty().withMessage('Username is required'),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;
        
        try {
            const query = 'SELECT * FROM users WHERE username = $1 AND password = $2';
            const values = [username, password];
            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                const user = rows[0];
                const token = generateToken({ id: user.user_id, username: user.username });
                return res.status(200).json({ user, token });
            } else {
                res.status(401).json({ message: 'Invalid credentials' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Middleware to authenticate requests
router.use(authenticate);

// Create new driver
router.post(
    '/',
    [
        body('driverName').isString().notEmpty().withMessage('Driver name is required'),
        body('fleetId').isString().notEmpty().withMessage('Fleet ID is required'),
        body('licenseID').isString().notEmpty().withMessage('License ID is required'),
        body('location.City').isString().withMessage('City is required'),
        body('location.Pincode').isString().isLength({ min: 5, max: 10 }).withMessage('Pin code must be between 5 and 10 characters'),
        body('vehicleTypes').isArray().notEmpty().withMessage('Vehicle types are required'),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { driverName, fleetId, licenseID, location, vehicleTypes } = req.body;
        const query = `
            INSERT INTO drivers (driver_name, fleet_id, license_id, location_city, location_pincode, vehicle_types)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`;
        const values = [driverName, fleetId, licenseID, location.City, location['Pincode'], vehicleTypes];

        try {
            const { rows } = await pool.query(query, values);
            res.status(201).json(rows[0]); // Return the new driver details
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// Update driver
router.post(
    '/:id',
    [
        body('driverName').optional().isString(),
        body('fleetId').optional().isString().notEmpty(),
        body('licenseID').optional().isString().notEmpty(),
        body('location.City').optional().isString(),
        body('location.Pincode').optional().isString().isLength({ min: 5, max: 10 }),
        body('vehicleTypes').optional().isArray(),
    ],
    async (req, res) => {
        const { id } = req.params;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { driverName, fleetId, licenseID, location, vehicleTypes } = req.body;
        const query = `
            UPDATE drivers 
            SET driver_name = COALESCE($1, driver_name), 
                fleet_id = COALESCE($2, fleet_id), 
                license_id = COALESCE($3, license_id),
                location_city = COALESCE($4, location_city),
                location_pincode = COALESCE($5, location_pincode),
                vehicle_types = COALESCE($6, vehicle_types)
            WHERE driver_id = $7
            RETURNING *`;
        const values = [driverName, fleetId, licenseID, location?.City, location?.['Pincode'], vehicleTypes, id];

        try {
            const { rows } = await pool.query(query, values);
            if (rows.length > 0) {
                res.status(200).json(rows[0]); // Return the updated drivers details
            } else {
                res.status(404).json({ message: 'Driver not found' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
);

// List all drivers
router.get('/', async (req, res) => {
    const query = 'SELECT * FROM drivers ORDER BY joining_date, driver_name';
    try {
        const { rows } = await pool.query(query);
        res.status(200).json(rows); // Return the list of all drivers
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single driver by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM drivers WHERE driver_id = $1';
    const values = [id];

    try {
        const { rows } = await pool.query(query, values);
        if (rows.length > 0) {
            res.status(200).json(rows[0]); // Return the driver details
        } else {
            res.status(404).json({ message: 'Driver not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete driver
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM drivers WHERE driver_id = $1 RETURNING *';
    const values = [id];

    try {
        const { rows } = await pool.query(query, values);
        if (rows.length > 0) {
            res.status(200).json(rows[0]); // Return the deleted driver details
        } else {
            res.status(404).json({ message: 'Driver not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search by name or ID
router.get('/search', async (req, res) => {
    const { name, id } = req.query;
    let query = 'SELECT * FROM drivers WHERE';
    let values = [];
    let conditions = [];

    // Validate the ID parameter
    if (id) {
        const parsedId = parseInt(id, 10);
        if (isNaN(parsedId)) {
            return res.status(400).json({ error: 'ID must be a valid number.' });
        }
        conditions.push('driver_id = $1');
        values.push(parsedId);
    }

    // Validate the name parameter
    if (name) {
        conditions.push('driver_name ILIKE $2');
        values.push(`%${name}%`);
    }

    // If no search criteria are provided, return an error
    if (conditions.length === 0) {
        return res.status(400).json({ error: 'At least one query parameter (name or id) is required.' });
    }

    // Join conditions with ' OR ' and finalize the query
    query += ' ' + conditions.join(' OR ') + ' ORDER BY driver_name';

    // Log the query and values for debugging
    console.log('Query:', query);
    console.log('Values:', values);

    try {
        const { rows } = await pool.query(query, values);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;



module.exports = router;
