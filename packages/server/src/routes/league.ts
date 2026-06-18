import { Router } from 'express';
import { leagueService } from '../league/leagueService.js';

export const leagueRouter = Router();

leagueRouter.get('/api/league', (_req, res) => {
  res.json(leagueService.snapshot());
});

leagueRouter.post('/api/league/refresh', async (_req, res) => {
  res.json(await leagueService.refresh());
});
