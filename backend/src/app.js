import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiters.js';

export function createApp() {
  const app = express();

  // Behind a proxy (Render/Railway/nginx) this makes req.ip meaningful for rate limiting.
  app.set('trust proxy', 1);

  // Security headers.
  app.use(helmet());

  // CORS: only the configured frontend origins (plus same-origin/no-origin tools).
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
      maxAge: 86400,
    })
  );

  // Uploaded recipe images are served to the frontend from a different origin
  // (e.g. the Vite dev server on :5173). helmet sets Cross-Origin-Resource-Policy
  // to "same-origin" by default, which makes the browser block those images, so
  // a newly uploaded photo never renders after saving. Allow cross-origin loads
  // for these static assets only; the JSON API keeps the stricter default.
  const recipeImages = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads/recipes');
  app.use(
    '/uploads/recipes',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(recipeImages, { dotfiles: 'deny', index: false, maxAge: '1d' })
  );

  // Request size limits - recipes are text, images are URLs.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use('/api', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
