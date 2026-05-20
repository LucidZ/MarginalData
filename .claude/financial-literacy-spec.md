# Financial Literacy Series — Development Spec

A series of scrollytelling interactives explaining economic and financial concepts. Lives at `marginaldata.io` alongside other site content.

## Series Folder Structure

```
src/financial-literacy/
  shared/
    ScrollyShell.tsx       # two-column desktop / top-sticky mobile layout shell
    StepText.tsx           # styled text panel for each scroll step
    useScrollSteps.ts      # IntersectionObserver hook → currentStep
    types.ts               # shared types (Step, StepState, etc.)
  MarginalTax/
    App.tsx
    App.css
    TaxViz.tsx
    data.ts                # bracket data inline (small enough)
    index.ts
  NextStory/
    ...
```

## Layout

### Desktop (≥600px)
- Two-column side-by-side
- **Left**: sticky viz column, 60% width, max ~700px, full viewport height
- **Right**: scroll text column, 40% width, max ~420px
- Text steps are each `100vh` tall so one scroll = one step advance
- The viz `position: sticky; top: 0` within the scroll container

### Mobile (<600px)
- Single column, viz sticky at top
- Viz height: `min(50vh, 400px)`
- Text steps scroll below, each `80vh` tall (slightly shorter since mobile scrolls faster)

```css
/* ScrollyShell layout sketch */
.scrolly-container {
  display: flex;
  gap: 1rem;
}
.scrolly-viz {
  position: sticky;
  top: 0;
  height: 100vh;
  flex: 0 0 60%;
}
.scrolly-steps {
  flex: 1;
}
.scrolly-step {
  height: 100vh;          /* desktop */
  display: flex;
  align-items: center;
}

@media (max-width: 600px) {
  .scrolly-container { flex-direction: column; }
  .scrolly-viz { height: min(50vh, 400px); position: sticky; top: 0; }
  .scrolly-step { height: 80vh; }
}
```

## Scroll Step Triggering

Use a custom `useScrollSteps` hook built on native `IntersectionObserver`. No external scrollytelling library. Each step div gets a `data-step` attribute; when it crosses 50% into the viewport the hook fires `setCurrentStep(i)`.

```typescript
// useScrollSteps.ts
export function useScrollSteps(count: number) {
  const [currentStep, setCurrentStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const i = Number(entry.target.getAttribute('data-step'));
            setCurrentStep(i);
          }
        });
      },
      { threshold: 0.5 }
    );
    stepRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [count]);

  return { currentStep, stepRefs };
}
```

## Animation

- **D3 transitions for all viz state changes** — no Framer Motion, no CSS animation libraries
- Trigger transitions in a `useEffect` that watches `currentStep`
- Standard duration: **600ms**, easing: `d3.easeCubicInOut`
- For staggered sequences (multiple elements): offset by 80ms per element
- Use `d3.interrupt()` to cancel in-flight transitions before starting new ones

```typescript
useEffect(() => {
  if (!svgRef.current) return;
  const svg = d3.select(svgRef.current);
  svg.selectAll('.knife')
    .interrupt()
    .transition().duration(600).ease(d3.easeCubicInOut)
    .attr('transform', `translate(0, ${knifeYForStep(currentStep)})`);
}, [currentStep]);
```

## Design Integration

Financial literacy stories use the same minimal/clean look as the rest of the site — same fonts, same background, no series-specific chrome. The only added conventions:

### Financial Color Tokens
```css
--color-kept:  #2d6a4f;  /* green — money the user keeps */
--color-tax:   #ae2012;  /* red   — money paid in taxes  */
--color-neutral: #555;   /* for annotations, axes        */
```

Apply these as CSS variables in each story's `App.css`.

### Typography
- Story headline: `font-size: clamp(1.2rem, 3vw, 1.8rem); font-weight: 600;`
- Step text: `font-size: clamp(0.9rem, 2vw, 1.1rem); line-height: 1.6;`
- Dollar/percent callouts in viz: match existing axis label conventions

## Data Conventions

| Type | Format |
|------|--------|
| Dollar amounts | `d3.format("$,.0f")` |
| Percentages | `d3.format(".0%")` |
| Small decimals | `d3.format(".1%")` |

- Tax bracket data: keep inline in `data.ts` (static, small, sourced from IRS)
- Include tax year and source URL in a comment at the top of any data file

## Step/Scene Data Pattern

Each story defines a typed array of steps. The viz reads `currentStep` and transitions:

```typescript
interface TaxStep {
  stepIndex: number;
  headline: string;
  body: string;
  bracketIndex: number;   // which bracket is now active
  incomeAmount: number;   // dollar on screen
}

const STEPS: TaxStep[] = [
  { stepIndex: 0, headline: "Your first dollar", body: "...", ... },
  { stepIndex: 1, headline: "10% bracket", body: "...", ... },
  ...
];
```

## Narrative Arc Template

Every story should follow this structure:

1. **Hook** (step 0): one concrete, relatable scenario — "imagine you just got a raise to $50k"
2. **Build** (steps 1–N): introduce one concept per step, show it visually first, explain in text second
3. **Insight** (last step before outro): the non-obvious takeaway — the thing people usually get wrong
4. **Outro**: optional interactive zone or summary stat

Keep step text short — 2–3 sentences max per step. Readers skim.

## Routing

Each story registers in the main router at `/financial-literacy/story-name`. Add to `App.tsx` alongside existing routes.

## Checklist Before Shipping Each Story

- [ ] Test scroll triggering on mobile (real device or DevTools mobile simulation)
- [ ] Verify D3 transitions don't stack/double-fire on fast scroll
- [ ] Check text is readable at 320px width
- [ ] Verify financial data source is cited in the UI (small `<Sources>` component at bottom)
- [ ] All dollar/percent values use the format functions above (no ad-hoc formatting)
