# Rent Distribution

How TrueFraction splits a property's monthly rent across its share holders,
and how the payout reaches them.

- Calculation: `src/modules/rent/calculator.js` (pure functions, no I/O)
- API and persistence: `src/modules/rent/Service.js`
- Scenarios below are the unit tests in `src/modules/rent/calculator.test.js`
  (`npm test`) — if a number here and a test disagree, the test is right.

---

## 1. The rule

**Every share earns the same amount of rent for every second it is held.**

```
rate          = rent / (totalShares × secondsInMonth)
tokenSeconds  = Σ (balance × seconds held at that balance)      per holder
grossAmount   = rate × tokenSeconds = rent × tokenSeconds / (totalShares × secondsInMonth)
```

- `rent` — the property's full rent for the month, entered by the admin.
- `totalShares` — shares minted at fractionalization (fixed; minting is sealed).
- `secondsInMonth` — the calendar month in UTC (28–31 days).

It is simplest to think in **token-days**: with 100 shares in a 30-day month
and rent of 3,000, one share held for one day earns
`3,000 / (100 × 30) = $1`. The code works in seconds, so a purchase at 15:00
earns from 15:00, not from midnight.

### Why this model

Rent is earned per share per day, so:

- a holder's payout never depends on what other holders did;
- **rent for time nobody held a share is not paid out** — the days before the
  property was fractionalized, and shares burned mid-month (buyback sell-back,
  redemption). That rent stays with the admin;
- excluding the issuer (below) removes only the issuer's share; investors'
  amounts do not change.

---

## 2. Who counts as a holder

Balances come from the Goldsky subgraph, which tracks **beneficial** ownership,
not raw `balanceOf`:

| Where the shares are | Counted for |
|---|---|
| Holder's wallet | the holder |
| Resting in an OrderBook sell order | **the seller** — still theirs until filled |
| Unsold in a Marketplace listing | **the listing owner** (usually the issuer) |
| Marketplace / OrderBook contracts themselves | never a holder |

Ownership moves only when a trade actually happens: `TokensBought` (listing
owner → buyer), `OrderFilled` (seller → buyer), or a direct wallet transfer.
Listing, placing an order, cancelling an order or a listing do **not** move
ownership.

---

## 3. Platform fee

The fee rate is the FeeManager's `saleServicerFeeBps` at its **latest** fee
version (`10` bps = 0.1%). It is read when the draft is created and stored on
it.

The fee is charged **only on what is actually paid out**:

```
grossPaid = Σ grossAmount of payable holders
fee       = grossPaid × feeBps / 10,000        (rounded down)
netPaid   = grossPaid − fee
```

`netPaid` is split across payable holders in proportion to their gross, using
the largest-remainder method, so the holders' amounts plus the fee add up to
`grossPaid` exactly — no unit is lost or invented.

Holders pay the fee economically (they receive rent minus fee); the admin's
wallet sends `grossPaid` in total, of which the fee goes to
`FeeManager.treasury()` in the same transaction.

Example: rent 10,000 at 0.1% with every share held all month → fee 10 to the
treasury, 9,990 to holders.

---

## 4. Allocation statuses

Every wallet that held shares during the period gets one allocation row:

| Status | Meaning | Paid? |
|---|---|---|
| `PAYABLE` → `PAID` | Normal holder; becomes `PAID` when its batch executes | Yes, net of fee |
| `EXCLUDED_ISSUER` | Issuer excluded for this distribution | No — stays with the admin |
| `SELF_KEPT` | The holder is the admin wallet paying the rent | No transfer — paying yourself only costs gas; no fee either |
| `ZERO` | Share rounds to 0 base units (after fee) | No — the contract rejects zero amounts |

### Distribution totals

| Field | Meaning |
|---|---|
| `rent` | What the admin entered |
| `grossPaid` | What the admin's wallet sends (holders + fee) |
| `fee` / `netPaid` | Fee to treasury / total to holders |
| `selfKept` | Admin wallet's own share, not transferred |
| `excludedIssuer` | Issuer's share when excluded |
| `unallocated` | Days with no holder (pre-launch, burned shares), `ZERO` rows, rounding dust |

Always: `rent = grossPaid + selfKept + excludedIssuer + unallocated`.

---

## 5. Scenarios

All amounts in USD (stablecoin, 6 decimals). "Day 21" means 00:00 UTC on the
21st.

### 5.1 Mid-month launch

September (30 days), rent **3,000**, 100 shares → **$1 per share-day**.

- Sep 21: property fractionalized, 100 shares to the issuer, listed.
- Sep 26: Alice buys 60 from the Marketplace.

| Holder | Share-days | Rent |
|---|---|---|
| Issuer | 100 × 5 + 40 × 5 = 700 | 700 |
| Alice | 60 × 5 = 300 | 300 |
| Not allocated (Sep 1–20, before launch) | | 2,000 |

Alice's days held: 5.00. The admin enters the full monthly rent; the pre-launch
part is simply not sent.

### 5.2 OrderBook trades, with a fee

October (31 days), rent **3,100**, 100 shares → $1 per share-day, fee **10 bps**.
Opening balances: Issuer 40, Alice 60.

| Date | Event | Balances counted |
|---|---|---|
| Oct 11 | Alice places a sell order for 20 | unchanged — Alice still 60 |
| Oct 21 | Bob fills 15 of it | Alice 45, Bob 15 |
| Oct 26 | Alice cancels the remaining 5 | unchanged |
| Oct 28 | Bob sends 5 to Carol directly | Bob 10, Carol 5 |

| Holder | Share-days | Gross | Net (after 0.1%) |
|---|---|---|---|
| Issuer | 40 × 31 = 1,240 | 1,240.00 | 1,238.76 |
| Alice | 60 × 20 + 45 × 11 = 1,695 | 1,695.00 | 1,693.305 |
| Bob | 15 × 7 + 10 × 4 = 145 | 145.00 | 144.855 |
| Carol | 5 × 4 = 20 | 20.00 | 19.98 |
| **Total** | 3,100 | 3,100.00 | 3,096.90 + fee 3.10 |

### 5.3 Next month — new rent, new holders

November (30 days), rent **2,800** (different each month), 100 shares.
Opening balances carry over from October's end: Issuer 40, Alice 45, Bob 10,
Carol 5. Nov 16: Alice sells all 45 to Dave through the OrderBook.

| Holder | Share-days | Rent |
|---|---|---|
| Issuer | 40 × 30 = 1,200 | 1,120 |
| Alice | 45 × 15 = 675 | 630 |
| Dave | 45 × 15 = 675 | 630 |
| Bob | 10 × 30 = 300 | 280 |
| Carol | 5 × 30 = 150 | 140 |
| **Total** | 3,000 | 2,800 |

Alice is paid for the half month she held and drops out from December. Dave
earns from the second he bought. Each month is an independent distribution:
its own rent, its own holders, its own month length.

### 5.4 Unsold listing inventory — include vs exclude the issuer

10,000 shares minted to the issuer; 3,000 listed; 1,000 bought by Alice on
Sep 16; 2,000 still unsold in the Marketplace. September, rent **3,000** →
$0.01 per share-day.

The issuer is counted for 9,000 after the 16th: 7,000 in the wallet plus 2,000
unsold in the listing.

| | Include issuer | Exclude issuer |
|---|---|---|
| Alice (1,000 × 15 days) | 150 | **150** (unchanged) |
| Issuer (10,000 × 15 + 9,000 × 15) | 2,850 paid | not paid (`EXCLUDED_ISSUER`) |
| Admin sends | 3,000 | 150 |

Use "exclude" when the platform itself owns the unsold stock and paying it
would just move money back to itself.

### 5.5 Admin wallet holds shares

Issuer 90 shares, admin wallet 10, all month; rent **1,000**, fee **1%**.

| Holder | Gross | Status | Receives |
|---|---|---|---|
| Admin wallet | 100 | `SELF_KEPT` | nothing transferred — the 100 never leaves the wallet |
| Issuer | 900 | `PAYABLE` | 891 (fee 9 on 900) |

The fee is taken only on the 900 actually paid out.

### 5.6 Buyback burn mid-month

September, rent **3,000**, 100 shares: Issuer 50, Alice 50. Sep 16 Alice sells
all 50 back into an open buyback (burned).

| Holder | Share-days | Rent |
|---|---|---|
| Issuer | 50 × 30 | 1,500 |
| Alice | 50 × 15 | 750 |
| Not allocated (burned shares, Sep 16–30) | | 750 |

Burned shares earn nothing after the burn; nobody else's rate goes up.

### 5.7 Partial day

September, 10 shares, rent **7,200** → $1 per share-hour. Alice buys all 10 at
**Sep 30 15:00 UTC**, 9 hours before month end.

| Holder | Share-hours | Rent |
|---|---|---|
| Alice | 10 × 9 | 90 (days held 0.38) |
| Issuer | 10 × 711 | 7,110 |

### 5.8 Share rounds to zero

1,000,000 shares, rent $0.50, fee 10 bps; Alice holds 1 share. Her share is
0.5 base units → `ZERO`, not paid. The remaining holders' nets plus the fee
still add up exactly to `grossPaid`.

### 5.9 Transient negative balance

If a property is fractionalized and sold in the same block, the subgraph can
record the sale before the mint. Both carry the same timestamp, so no time
accrues at the negative balance and rent is unaffected. A balance that is
still negative at the end of the period is corrupt data and the draft is
refused.

---

## 6. Lifecycle

```
Admin page                         Backend                                 Chain
──────────                         ───────                                 ─────
1. property + month + rent ──────► 2. checks (below)
                                   3. read ledger from subgraph
                                   4. calculate → allocations
                                   5. split payable into batches
                                   6. save DRAFT ──────────────────────► preview
7. approve stablecoin ───────────────────────────────────────────────► MDUSD.approve
8. sign distribute() per batch ──────────────────────────────────────► RentDistributor
9. POST tx hash (before confirm) ► 10. batch SUBMITTED
                                   11. sync: subgraph RentBatch or tx receipt
                                       → PAID (allocations PAID) or FAILED (retry)
                                   12. all batches PAID → COMPLETED
```

Statuses — distribution: `DRAFT → IN_PROGRESS → COMPLETED`, or `CANCELLED`
(only before any batch is sent). Batch: `PENDING → SUBMITTED → PAID`, or
`FAILED` → retry.

### Checks before a draft is created

- The month has ended (unless `RENT_ALLOW_CURRENT_MONTH=true`, testnet only —
  the period then ends at the subgraph's latest indexed block).
- The subgraph has no indexing errors and has indexed past the month's end.
- No other non-cancelled distribution exists for that property and month
  (unique index on `tokenId:month` — cancel the draft to redo it).
- Holdings reconcile: Σ subgraph holdings = subgraph supply = on-chain
  `totalSupply()`, read at the same block.
- At least one holder is payable.

### Batches

- Up to `RentDistributor.MAX_BATCH_SIZE` (500) holders per transaction; more
  holders → more batches, each signed separately.
- The whole fee rides on batch 0.
- `batchId = keccak256(distributionId, batchIndex)`. The contract executes
  each `batchId` once, so a retry or double-click can never pay twice.
- A batch is all-or-nothing: if any transfer in it fails, none of it pays.
- Only the wallet the draft was prepared for (`payerWallet`) may submit it,
  because that wallet's own share was treated as `SELF_KEPT`.

---

## 7. Where the numbers are stored

`RentAllocation`, per holder per distribution:

| Field | Meaning |
|---|---|
| `openingBalance`, `closingBalance` | Shares at period start / end |
| `tokenSeconds` | Σ balance × seconds held — the rent weight |
| `heldSeconds`, `daysHeld` | Time with a non-zero balance (display) |
| `averageBalance` | `tokenSeconds / periodSeconds` |
| `sharePercent` | `tokenSeconds / (totalShares × secondsInMonth)` as % |
| `grossAmount`, `feeAmount`, `netAmount` | Money, in stablecoin base units |
| `status`, `batchIndex`, `txHash` | Payout state |

Amounts are frozen when the draft is created, so what the admin reviewed is
exactly what gets paid.
