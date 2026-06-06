import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { User } from '../models/mongo/User';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/signup
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { name, email, password } = req.body;
    try {
      const existing = await User.findOne({ email });
      if (existing) { res.status(409).json({ message: 'Email already in use' }); return; }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ name, email, passwordHash });

      const accessToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
      const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET || 'refresh', { expiresIn: '7d' });

      res.status(201).json({
        message: 'Account created successfully',
        accessToken,
        refreshToken,
        user: { id: user._id, name: user.name, email: user.email, gmailConnected: user.gmailConnected },
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message, stack: error.stack });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user) { res.status(401).json({ message: 'Invalid email or password' }); return; }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) { res.status(401).json({ message: 'Invalid email or password' }); return; }

      const accessToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
      const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET || 'refresh', { expiresIn: '7d' });

      res.json({
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: { id: user._id, name: user.name, email: user.email, gmailConnected: user.gmailConnected },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) { res.status(401).json({ message: 'Refresh token required' }); return; }
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh') as { userId: string };
    const accessToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash -googleRefreshToken');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    res.json(user);
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, targetRoles, preferredLocations, salaryRange } = req.body;
  try {
    await User.findByIdAndUpdate(req.userId, { name, targetRoles, preferredLocations, salaryRange });
    res.json({ message: 'Profile updated successfully' });
  } catch {
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
