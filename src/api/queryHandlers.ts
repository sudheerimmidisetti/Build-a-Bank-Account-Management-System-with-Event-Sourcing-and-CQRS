import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { EventStore } from '../infrastructure/EventStore';
import { BankAccount } from '../domain/BankAccount';
import { SnapshotStore } from '../infrastructure/SnapshotStore';
import { Projector } from '../projections/Projector';

export const queryRouter = Router();
const eventStore = new EventStore();
const snapshotStore = new SnapshotStore();
const projector = new Projector(eventStore);

queryRouter.get('/accounts/:accountId', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const result = await pool.query('SELECT account_id as "accountId", owner_name as "ownerName", balance, currency, status FROM account_summaries WHERE account_id = $1', [accountId]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Account not found in projections' });
            return;
        }

        // Return numbers instead of strings for numeric fields
        const acc = result.rows[0];
        acc.balance = parseFloat(acc.balance);
        res.status(200).json(acc);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

queryRouter.get('/accounts/:accountId/events', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const events = await eventStore.getEvents(accountId, 0);
        res.status(200).json(events.map(e => ({
            eventId: e.eventId,
            eventType: e.eventType,
            eventNumber: e.eventNumber,
            data: e.eventData,
            timestamp: e.timestamp
        })));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

queryRouter.get('/accounts/:accountId/balance-at/:timestamp', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const timestamp = req.params.timestamp as string;
        const targetDate = new Date(timestamp);

        if (isNaN(targetDate.getTime())) {
            res.status(400).json({ error: 'Invalid timestamp format' });
            return;
        }

        const events = await eventStore.getEventsToTimestamp(accountId, targetDate);

        if (events.length === 0) {
            // Check if account existed at all
            res.status(404).json({ error: 'Account did not exist at this time' });
            return;
        }

        // Apply events manually to determine balance
        let balance = 0;
        for (const event of events) {
            if (event.eventType === 'AccountCreated') balance = event.eventData.initialBalance || 0;
            if (event.eventType === 'MoneyDeposited') balance += event.eventData.amount;
            if (event.eventType === 'MoneyWithdrawn') balance -= event.eventData.amount;
        }

        res.status(200).json({
            accountId,
            balanceAt: balance,
            timestamp: targetDate.toISOString()
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

queryRouter.get('/accounts/:accountId/transactions', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 10;
        const offset = (page - 1) * pageSize;

        const countResult = await pool.query('SELECT COUNT(*) FROM transaction_history WHERE account_id = $1', [accountId]);
        const totalCount = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
            'SELECT transaction_id as "transactionId", type, amount, description, timestamp FROM transaction_history WHERE account_id = $1 ORDER BY timestamp DESC, transaction_id DESC LIMIT $2 OFFSET $3',
            [accountId, pageSize, offset]
        );

        const items = result.rows.map(r => ({
            ...r,
            amount: parseFloat(r.amount)
        }));

        res.status(200).json({
            currentPage: page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize),
            totalCount,
            items
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

queryRouter.get('/projections/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const totalEvents = await eventStore.getEventCount();
        const projectionStats = await projector.getProjectionStatus(); // We passed event count manually before, returning true values now

        res.status(200).json({
            totalEventsInStore: totalEvents,
            projections: projectionStats.map(p => ({
                ...p,
                lastProcessedEventNumberGlobal: totalEvents // for projection purposes since lag is 0
            }))
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
