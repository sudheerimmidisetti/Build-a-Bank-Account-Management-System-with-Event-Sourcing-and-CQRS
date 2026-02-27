import { randomUUID as uuidv4 } from 'crypto';
import { EventMetadata } from './types';
import { EventStore } from '../infrastructure/EventStore';
import { SnapshotStore } from '../infrastructure/SnapshotStore';
import { Projector } from '../projections/Projector';

const SNAPSHOT_INTERVAL = 50;

export class BankAccount {
    public id: string = '';
    public ownerName: string = '';
    public balance: number = 0;
    public currency: string = 'USD';
    public status: 'OPEN' | 'CLOSED' | 'UNINITIALIZED' = 'UNINITIALIZED';
    public version: number = 0;

    // Commands should only process events that are new
    private uncommittedEvents: EventMetadata[] = [];
    private processedTransactions: Set<string> = new Set();

    constructor(
        private readonly eventStore: EventStore,
        private readonly snapshotStore: SnapshotStore,
        private readonly projector: Projector
    ) { }

    /**
     * Reconstruct the state of this aggregate by loading the latest snapshot and replaying events.
     */
    async load(aggregateId: string): Promise<void> {
        this.id = aggregateId;
        const snapshot = await this.snapshotStore.getSnapshot(aggregateId);

        if (snapshot) {
            this.ownerName = snapshot.snapshotData.ownerName;
            this.balance = snapshot.snapshotData.balance;
            this.currency = snapshot.snapshotData.currency || 'USD';
            this.status = snapshot.snapshotData.status;
            this.version = snapshot.lastEventNumber;
            if (snapshot.snapshotData.processedTransactions) {
                this.processedTransactions = new Set(snapshot.snapshotData.processedTransactions);
            }
        }

        const events = await this.eventStore.getEvents(aggregateId, this.version);
        for (const event of events) {
            this.apply(event);
        }
    }

    /**
     * Applies an event to the aggregate structure to change its internal state.
     */
    public apply(event: EventMetadata): void {
        switch (event.eventType) {
            case 'AccountCreated':
                this.id = event.aggregateId;
                this.ownerName = event.eventData.ownerName;
                this.balance = event.eventData.initialBalance || 0;
                this.currency = event.eventData.currency || 'USD';
                this.status = 'OPEN';
                break;
            case 'MoneyDeposited':
                this.balance += event.eventData.amount;
                if (event.eventData.transactionId) {
                    this.processedTransactions.add(event.eventData.transactionId);
                }
                break;
            case 'MoneyWithdrawn':
                this.balance -= event.eventData.amount;
                if (event.eventData.transactionId) {
                    this.processedTransactions.add(event.eventData.transactionId);
                }
                break;
            case 'AccountClosed':
                this.status = 'CLOSED';
                if (event.eventData.transactionId) {
                    this.processedTransactions.add(event.eventData.transactionId);
                }
                break;
        }
        this.version = event.eventNumber;
    }

    /**
     * Helper to add a new uncommitted event
     */
    private raiseEvent(eventType: EventMetadata['eventType'], eventData: any) {
        this.version++;
        const newEvent: EventMetadata = {
            eventId: uuidv4(),
            aggregateId: this.id,
            aggregateType: 'BankAccount',
            eventType,
            eventData,
            eventNumber: this.version,
            version: this.version
        };
        // Apply it locally right away so state updates
        this.apply(newEvent);
        // Track for saving
        this.uncommittedEvents.push(newEvent);
    }

    async commit(): Promise<void> {
        if (this.uncommittedEvents.length === 0) return;

        // Save to DB
        await this.eventStore.appendEvents(this.uncommittedEvents);

        // Project new events synchronously
        for (const event of this.uncommittedEvents) {
            await this.projector.projectEvent(event);
        }

        // Snapshotting logic
        if (this.version % SNAPSHOT_INTERVAL === 0) {
            await this.snapshotStore.saveSnapshot({
                snapshotId: uuidv4(),
                aggregateId: this.id,
                snapshotData: {
                    ownerName: this.ownerName,
                    balance: this.balance,
                    currency: this.currency,
                    status: this.status,
                    processedTransactions: Array.from(this.processedTransactions),
                },
                lastEventNumber: this.version
            });
        }

        // Clear uncommitted events
        this.uncommittedEvents = [];
    }

    // --- Command Methods ---

    create(accountId: string, ownerName: string, initialBalance: number = 0, currency: string = 'USD') {
        if (this.status !== 'UNINITIALIZED') {
            const error: any = new Error('Account already exists');
            error.status = 409;
            throw error;
        }

        this.id = accountId;
        this.raiseEvent('AccountCreated', { ownerName, initialBalance, currency });

        if (initialBalance > 0) {
            this.raiseEvent('MoneyDeposited', {
                amount: initialBalance,
                description: 'Initial deposit',
                transactionId: uuidv4() // Generate an internal ID for initial deposit
            });
        }
    }

    deposit(amount: number, description: string, transactionId: string) {
        if (this.status === 'UNINITIALIZED') {
            const error: any = new Error('Account not found');
            error.status = 404;
            throw error;
        }
        if (this.status === 'CLOSED') {
            const error: any = new Error('Account is closed');
            error.status = 409;
            throw error;
        }
        if (amount <= 0) {
            const error: any = new Error('Deposit amount must be positive');
            error.status = 400;
            throw error;
        }

        // Idempotency check
        if (this.processedTransactions.has(transactionId)) {
            return; // Already processed
        }

        this.raiseEvent('MoneyDeposited', { amount, description, transactionId });
    }

    withdraw(amount: number, description: string, transactionId: string) {
        if (this.status === 'UNINITIALIZED') {
            const error: any = new Error('Account not found');
            error.status = 404;
            throw error;
        }
        if (this.status === 'CLOSED') {
            const error: any = new Error('Account is closed');
            error.status = 409;
            throw error;
        }
        if (amount <= 0) {
            const error: any = new Error('Withdrawal amount must be positive');
            error.status = 400;
            throw error;
        }
        if (this.balance < amount) {
            const error: any = new Error('Insufficient funds');
            error.status = 409;
            throw error;
        }

        // Idempotency check
        if (this.processedTransactions.has(transactionId)) {
            return; // Already processed
        }

        this.raiseEvent('MoneyWithdrawn', { amount, description, transactionId });
    }

    close(reason?: string) {
        if (this.status === 'UNINITIALIZED') {
            const error: any = new Error('Account not found');
            error.status = 404;
            throw error;
        }
        if (this.status === 'CLOSED') {
            return; // already closed
        }
        if (this.balance !== 0) {
            const error: any = new Error('Account balance must be zero to close');
            error.status = 409;
            throw error;
        }

        this.raiseEvent('AccountClosed', { reason, transactionId: uuidv4() });
    }
}
