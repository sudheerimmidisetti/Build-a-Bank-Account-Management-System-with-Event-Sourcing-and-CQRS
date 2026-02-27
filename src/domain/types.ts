export type EventType =
    | 'AccountCreated'
    | 'MoneyDeposited'
    | 'MoneyWithdrawn'
    | 'AccountClosed';

export interface EventMetadata {
    eventId: string;
    aggregateId: string;
    aggregateType: string;
    eventType: EventType;
    eventData: any;
    eventNumber: number;
    timestamp?: Date;
    version?: number;
}

export interface Snapshot {
    snapshotId: string;
    aggregateId: string;
    snapshotData: any;
    lastEventNumber: number;
    createdAt?: Date;
}
