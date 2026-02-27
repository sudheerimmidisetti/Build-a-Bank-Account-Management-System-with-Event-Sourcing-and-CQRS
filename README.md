### Build a Bank Account Management System with Event Sourcing and CQRS

------------------------------------------------------------------------

## Overview

This project is a **Bank Account Management System** designed using
modern backend architecture patterns like **CQRS (Command Query
Responsibility Segregation)** and **Event Sourcing**.

Instead of storing only the current state of data, this system stores
every event (like account created, money deposited, money withdrawn).\
This makes the application more scalable, traceable, and
production-ready.

The project demonstrates clean architecture, separation of concerns, and
real-world backend development practices.

------------------------------------------------------------------------

## Architecture Used

### 1. CQRS (Command Query Responsibility Segregation)

-   Commands → Used for write operations (Create account, Deposit,
    Withdraw)
-   Queries → Used for read operations (Get account details, Check
    balance)
-   Improves scalability and performance

### 2. Event Sourcing

-   Stores all changes as events
-   Current state is derived from past events
-   Helps in auditing and debugging

------------------------------------------------------------------------

## Tools & Technologies Used

-   Node.js
-   TypeScript
-   Express.js
-   Docker
-   Docker Compose
-   Event-driven architecture concepts
-   JSON-based data handling

------------------------------------------------------------------------

## 📂 Project Structure

``` 
CQRS/
│
├── node_modules/
│
├── seeds/
│   └── 01_schema/
│
├── src/
│   ├── api/
│   │   ├── commandHandlers.ts
│   │   └── queryHandlers.ts
│   │
│   ├── domain/
│   │   ├── BankAccount.ts
│   │   └── types.ts
│   │
│   ├── infrastructure/
│   │   ├── EventStore.ts
│   │   └── SnapshotStore.ts
│   │
│   ├── projections/
│   │   └── Projector.ts
│   │
│   ├── db.ts
│   └── index.ts
│
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── package-lock.json
├── README.md
├── submission.json
└── tsconfig.json
```

------------------------------------------------------------------------

## How It Works

1.  User sends a command (example: deposit money).
2.  The system validates the command.
3.  An event is created (MoneyDepositedEvent).
4.  Event is stored in the event store.
5.  Read model gets updated.
6.  User can query updated account balance.

This ensures clear separation between read and write operations.

------------------------------------------------------------------------

## How to Run the Project

### Using Docker

``` bash
docker-compose up --build
```

### Or Manually

``` bash
npm install
npm run dev
```

------------------------------------------------------------------------

## Features

-   Create Bank Account
-   Deposit Money
-   Withdraw Money
-   View Account Balance
-   Event Logging
-   Clean Folder Structure
-   Scalable Architecture Design

------------------------------------------------------------------------
