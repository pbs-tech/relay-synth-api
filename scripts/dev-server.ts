#!/usr/bin/env tsx
/**
 * Local development server.
 *
 * Mounts the three Lambda apps on one port and fakes the API Gateway JWT
 * authorizer context that they would normally receive in AWS, so routes can be
 * exercised without Auth0 or a deployed API. Point it at DynamoDB Local:
 *
 *   docker run -p 8000:8000 amazon/dynamodb-local
 *   TABLE_NAME=relay-synth-local DYNAMO_ENDPOINT=http://localhost:8000 npm run dev
 *
 * Override the simulated caller with DEV_USER_ID / DEV_USER_EMAIL.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { app as leaderboardApp } from '../src/handlers/leaderboard.js';
import { app as tutorialsApp } from '../src/handlers/tutorials.js';
import { app as usersApp } from '../src/handlers/users.js';
import { config } from '../src/lib/config.js';

const port = Number(process.env.PORT ?? 8000);

/** Mirrors the claim shape API Gateway's JWT authorizer puts on the event. */
const devEvent = {
  requestContext: {
    authorizer: {
      jwt: {
        claims: {
          sub: process.env.DEV_USER_ID ?? 'auth0|local-development-user',
          [config.claims.email]: process.env.DEV_USER_EMAIL ?? 'dev@relay-synth.peebles.lol',
          [config.claims.nickname]: process.env.DEV_USER_NICKNAME ?? 'dev',
        },
      },
    },
  },
};

const root = new Hono();
root.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'] }));
root.get('/', (c) => c.json({ message: 'API is live', mode: 'development' }));
root.route('/', tutorialsApp);
root.route('/', usersApp);
root.route('/', leaderboardApp);

serve(
  {
    fetch: (request: Request) => root.fetch(request, devEvent),
    port,
  },
  (info) => {
    console.log(`Relay Synth API (dev) listening on http://localhost:${info.port}`);
    console.log(`Simulated caller: ${devEvent.requestContext.authorizer.jwt.claims.sub}`);
  },
);
