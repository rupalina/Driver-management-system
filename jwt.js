const jwt = require('jsonwebtoken');

// JWT token expiration
const generateToken = (user) => {
    const payload = { id: user.id }; 
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30m' }); 
    return token;
};

// Middleware to authenticate JWT token
const authenticate = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; 
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; 
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired. Please log in again.' });
        }
        res.status(400).json({ message: 'Invalid token.' });
    }
};

module.exports = {
    generateToken,
    authenticate
};
