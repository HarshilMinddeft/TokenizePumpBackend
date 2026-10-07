# FractionalRWA Backend

Production-grade Node.js/Express backend for **TrueFraction** — a fractional real-world asset (RWA) tokenisation platform built on the Sonic testnet using the ERC-3643 compliance standard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose |
| Blockchain | ethers.js v6 · Sonic testnet |
| IPFS | Pinata |
| KYC | Blockpass webhook |

---

## Project Structure

```
src/
├── index.js              Entry point + graceful shutdown
├── app.js                App class: DB + middleware + route bootstrap
├── config/
│   ├── env.js            Validated env vars (envalid)
│   └── database.js       Mongoose connect / disconnect
├── core/
│   ├── BaseController.js Shared HTTP response helpers
│   └── RouteLoader.js    Auto-discovers modules/*/routes.js
├── entities/             Mongoose Models / Schemas
│   ├── Property.js
│   └── User.js
├── middleware/
│   └── errorHandler.js   Global Express error handler
├── modules/
│   ├── properties/       Property CRUD + IPFS upload domain
│   │   ├── Controller.js
│   │   ├── Service.js
│   │   ├── Validator.js
│   │   └── routes.js
│   └── users/            User management + Blockpass KYC domain
│       ├── Controller.js
│       ├── Service.js
│       ├── Validator.js
│       └── routes.js
└── utils/
    ├── AppError.js       Custom error class with HTTP status
    ├── ipfs.util.js      Pinata file / JSON uploader
    └── ethers.util.js    Provider + deployer wallet singleton
```

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env

# 3. Start in development (auto-reloads)
npm run dev

# 4. Start in production
npm start
```

---

## API Routes

All routes are prefixed `/api/{module}` and auto-loaded from `src/modules/`.

### Properties — `/api/properties`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/nftUpload` | Upload NFT image to IPFS |
| POST | `/metadataUpload` | Upload JSON metadata to IPFS |
| POST | `/addProperty` | Add a new property |
| GET | `/getOwnerProperty?ownerAddress=0x...` | Fetch owner's properties |
| GET | `/marketPlace/getAllPropertiesSummary` | Marketplace listing |
| GET | `/marketPlace/getPropertyById/:id` | Property detail |

### Users — `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/addnewUser` | Create a user |
| GET | `/fetchUser/:refId` | Fetch user by Blockpass refId |
| POST | `/blockpass-webhook` | Blockpass KYC webhook |

### Auth — `/api/auth`

Admin sign-in by wallet signature. Admins are wallets in `ADMIN_WALLET_ADDRESSES`
or holding `AUTHORITY_ROLE` / `DEFAULT_ADMIN_ROLE` on the marketplace.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/nonce` | `{ address }` → message to sign (5 min, one use) |
| POST | `/admin/verify` | `{ address, signature }` → `{ token, expiresAt }` |
| GET | `/admin/me` | Current session (Bearer token) |
| POST | `/admin/logout` | End the session |

### Rent — `/api/rent`

Monthly rent distribution. Ownership history comes from the Goldsky subgraph
(`SUBGRAPH_URL`); payouts are signed by the admin's own wallet through the
`RentDistributor` contract. Model (see `src/modules/rent/calculator.js`):
each share earns `rent / (totalShares × seconds in month)` per second held;
time nobody held a share isn't paid out; the fee is the FeeManager's
`saleServicerFeeBps`, taken on the amount paid out. Full explanation with
worked scenarios: [RentDist.md](RentDist.md).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Subgraph sync state, current rent fee, contract addresses |
| GET | `/investor/:address/summary` | Holdings, rent received, pending rent |
| GET | `/investor/:address/payouts` | Rent history per month (`?page&limit`) |
| GET | `/investor/:address/activity` | Buys, sells, transfers (`?page&limit`) |
| GET | `/admin/overview` | Fee, sync state, admin wallet balance/allowance, totals |
| GET | `/admin/properties` | Fractionalized properties + last distributed month |
| GET | `/admin/properties/:tokenId/holders` | Current holders |
| POST | `/admin/distributions` | `{ tokenId, month: 'YYYY-MM', rent, excludeIssuer?, note? }` → DRAFT |
| GET | `/admin/distributions` | List (`?tokenId&status&page&limit`) |
| GET | `/admin/distributions/:id` | Allocations + batches, each with its `distribute` call args |
| POST | `/admin/distributions/:id/batches/:batchIndex/submit` | `{ txHash }` after the wallet sends a batch |
| POST | `/admin/distributions/:id/sync` | Re-check batches against the subgraph/chain |
| DELETE | `/admin/distributions/:id` | Cancel a draft (only before any batch is sent) |

Admin routes need `Authorization: Bearer <token>`.

Flow: create draft → admin approves the stablecoin to `RentDistributor` →
signs `distribute(batchId, tokenId, recipients, amounts, platformFee)` per
batch → posts each tx hash to `/submit` → batches become PAID once seen
on-chain, and the distribution COMPLETED when all are paid.

`RENT_ALLOW_CURRENT_MONTH=true` (testnet only) allows distributing the month in
progress, up to the subgraph's latest block.

## Tests

```bash
npm test    # rent calculator unit tests (node:test)
```
