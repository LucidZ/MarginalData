# TheNet — Student Chapter Story Arc
## Scrollytelling interactive: Sections 1a–1d

**Character:** Alex, 22. Part-time barista, finishing school. $18K/yr gross → $1,350/mo take-home. Monthly spending: ~$1,550. Gap: −$200/mo.

---

## 1a — The Stream
*Micro view: chronological individual transactions. Money runs out. The gap appears.*

| Step | Text | Viz |
|------|------|-----|
| 0 | Alex's paycheck hits the account. $1,350. The month begins. | Balance bar: $1,350 |
| 1 | Rent is due immediately. $650. Almost half, gone on day one. | Rent deducted → balance $700 |
| 2 | The stream begins. Groceries $70. Bus pass $40. | Two more deductions → $590 |
| 3 | Phone bill $50. Subscriptions $20. | → $520 |
| 4 | Dinner out with friends. $30. | → $490 |
| 5 | Another grocery run $60. Some clothing $45. | → $385 |
| 6 | Coffee $8. Another dinner $40. | → $337 |
| 7 | Transport $40. More clothing $80. | → $217 |
| 8 | Groceries again $70. Another dinner $50. | → $97 |
| 9 | The account is nearly empty. But the month isn't over. | Balance bar nearly gone, low warning state |
| 10 | Alex still needs to get to work. Still needs to eat. The gap appears. | Gap indicator shown |
| 11 | A charge goes through anyway. Then another. | Transactions continue in ghost/muted style below zero |
| 12 | End of month. Alex is $200 in the hole. Where did the money come from? A friend? A card? It doesn't matter yet. The gap is real. | Final state: −$200 visible |

**Key text beats:**
- "It wasn't one big mistake. It was the stream."
- "None of these purchases were unreasonable. Together, they added up to more than Alex had."

---

## 1b — The Month
*Monthly view: most months scrape by, but irregular big expenses mean debt quietly accumulates.*

| Step | Text | Viz |
|------|------|-----|
| 0 | Zoom out. One month becomes twelve. Most look like this: close. | 12-month bar chart, most bars near zero |
| 1 | But life isn't perfectly average. A doctor visit. A broken phone. A parking ticket. Some months cost more. | Spike months highlighted in bad months |
| 2 | Good months don't fully close what bad months open. The debt grows quietly, even when Alex feels like they're keeping up. | Cumulative debt line growing despite some positive months |
| 3 | A year passes. The total debt is larger than any single month would explain. | Year-end debt balance shown |

**Key text beat:**
- "It's not just the stream. It's that bad months cost more than good months save."

---

## 1c — The Drift
*Long view: debt has momentum — it grows on its own, without new mistakes.*

| Step | Text | Viz |
|------|------|-----|
| 0 | Zoom out further. A year becomes three, five, seven. | Multi-year timeline |
| 1 | Alex's behavior doesn't change. But something does: the debt begins to move on its own. | Debt bar grows between marked periods |
| 2 | The debt grows not from new spending, but from itself. The gap between what Alex owes and what Alex earns widens without any new mistake. | Debt growth highlighted separately from spending |
| 3 | The hole is deeper than Alex realized. And it got that way without Alex noticing. | Full debt trajectory shown |

**Key text beat:**
- "Debt has momentum. Left unchecked, it moves on its own."

---

## 1d — The Replay
*Same life, different habits. Saving has momentum too.*

| Step | Text | Viz |
|------|------|-----|
| 0 | Rewind. Same income. Same rent. Same life. Different awareness. | Timeline rewinds to year 0 |
| 1 | Step one isn't a budget. It's simply looking. Alex sees the stream as a whole for the first time. They name the gap. | Stream visualization from 1a, but labeled — Alex can see it |
| 2 | One small change. $50 less dining out. $30 set aside. The gap closes by a little. | Small positive delta shown |
| 3 | That $50 doesn't just sit. Saving has momentum too. | Savings bar grows alongside time |
| 4 | Same timeline. Diverging outcomes. Watch the two paths separate. | Split view: debt path vs. savings path, same starting conditions |
| 5 | The first step is always the same: look. | Final state: savings trajectory highlighted |

**Key text beats:**
- "Debt has momentum. Fortunately, so does saving."
- "The first step isn't a budget. It's simply looking."

---

## Visualization Notes

### 1a
- Primary viz: a vertical or horizontal balance bar depleting in real time as transactions drop in
- Transactions appear as labeled pills/chips with amounts
- Ghost money: transactions below zero render muted/translucent (no specific mechanism named — just "the gap")
- No credit card, no family — the source is intentionally vague

### 1b
- Bar chart: 12 monthly bars (positive/negative), neutral color for close months, muted red for big-expense months
- A thin cumulative debt line layered on top

### 1c
- Extends 1b timeline to 5–7 years
- Debt growth shown as an accelerating curve, distinct from spending bars
- No interest rate labeled — just the visual of momentum

### 1d
- Two-timeline split: "what happened" (1a–1c path) vs. "what could have happened"
- Same transactions, same income, but with a small consistent positive delta
- Savings curve mirrors the debt curve from 1c — same shape, opposite direction

---

## Color conventions (from spec)
- `--color-kept: #2d6a4f` — positive balance, savings
- `--color-tax: #ae2012` — negative balance, debt
- Ghost money: same transaction color but `opacity: 0.35`, dashed border
- Neutral annotations: `#555`
