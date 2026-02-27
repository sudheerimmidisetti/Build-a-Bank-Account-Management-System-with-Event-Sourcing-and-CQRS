import { Router, Request, Response } from 'express';
import { BankAccount } from '../domain/BankAccount';
import { EventStore } from '../infrastructure/EventStore';
import { SnapshotStore } from '../infrastructure/SnapshotStore';
import { Projector } from '../projections/Projector';

export const commandRouter = Router();

// Instantiate infrastructure (in a real app, use dependency injection)
const eventStore = new EventStore();
const snapshotStore = new SnapshotStore();
const projector = new Projector(eventStore);

// Helper to construct aggregate and execute action
const executeCommand = async (accountId: string, action: (account: BankAccount) => void) => {
    const account = new BankAccount(eventStore, snapshotStore, projector);
    await account.load(accountId);
    action(account);
    await account.commit();
};

commandRouter.post('/accounts', async (req: Request, res: Response): Promise<void> => {
    try {
        const { accountId, ownerName, initialBalance, currency } = req.body;

        if (!accountId || !ownerName) {
            res.status(400).json({ error: 'accountId and ownerName are required' });
            return;
        }

        await executeCommand(accountId, (account) => {
            account.create(accountId, ownerName, initialBalance, currency);
        });

        res.status(202).json({ message: 'Command accepted' });
    } catch (e: any) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

commandRouter.post('/accounts/:accountId/deposit', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const { amount, description, transactionId } = req.body;

        if (!amount || amount <= 0 || !transactionId) {
            res.status(400).json({ error: 'amount (positive) and transactionId are required' });
            return;
        }

        await executeCommand(accountId, (account) => {
            account.deposit(amount, description, transactionId);
        });

        res.status(202).json({ message: 'Command accepted' });
    } catch (e: any) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

commandRouter.post('/accounts/:accountId/withdraw', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const { amount, description, transactionId } = req.body;

        if (!amount || amount <= 0 || !transactionId) {
            res.status(400).json({ error: 'amount (positive) and transactionId are required' });
            return;
        }

        await executeCommand(accountId, (account) => {
            account.withdraw(amount, description, transactionId);
        });

        res.status(202).json({ message: 'Command accepted' });
    } catch (e: any) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

commandRouter.post('/accounts/:accountId/close', async (req: Request, res: Response): Promise<void> => {
    try {
        const accountId = req.params.accountId as string;
        const { reason } = req.body || {};

        await executeCommand(accountId, (account) => {
            account.close(reason);
        });

        res.status(202).json({ message: 'Command accepted' });
    } catch (e: any) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

commandRouter.post('/projections/rebuild', async (req: Request, res: Response): Promise<void> => {
    try {
        await projector.rebuildProjections();
        res.status(202).json({ message: 'Projection rebuild initiated.' }); // Sync rebuild for simplicity in this project
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
