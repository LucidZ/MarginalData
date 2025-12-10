# MarginalData Development Preferences

## Tech Stack & Libraries

### Frontend
- **React 18+** with TypeScript
- **D3.js v7** for all data visualizations (prefer D3 over other charting libraries)
- **React Router** for routing
- **Vite** for build tooling
- No styled-components or CSS-in-JS libraries - use inline styles or plain CSS

### Visualization Patterns
- Use D3 for scales, axes, shapes, and math
- Let React handle the DOM rendering (no D3 DOM manipulation)
- Create reusable chart components
- Always consider mobile responsiveness from the start

## Project Structure

### Component Organization
- **One component per file** - no giant monolithic App.tsx files
- Break features into multiple smaller components
- Place related components in feature directories (e.g., `src/2025/SolarAnimation/`)
- Component structure example:
  ```
  src/2025/FeatureName/
    ├── App.tsx           # Main orchestrator
    ├── App.css           # Styles
    ├── Chart1.tsx        # Individual chart components
    ├── Chart2.tsx
    ├── Controls.tsx      # UI controls
    ├── types.ts          # TypeScript types
    ├── useData.ts        # Data fetching hook
    ├── index.ts          # Exports
    └── main.tsx          # Entry point
  ```

### File Naming
- Components: PascalCase (e.g., `DailyCurvesChart.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useData.ts`, `useResponsiveDimensions`)
- Types: `types.ts` in each feature directory
- Styles: `App.css` or `ComponentName.css`

## Data Management

### Data Files
- **Small data files (<1MB)**: Store in `public/data/` as JSON or CSV
- **Large datasets**: Do NOT commit to git
  - Generate processed data using Python scripts in `scripts/`
  - Add generation scripts with clear README documentation
  - Users can regenerate data locally if needed

### Data Processing
- Python scripts in `scripts/` directory for data processing
- Jupyter notebooks in `notebooks/` for exploration and analysis
- **Do NOT commit**:
  - Notebook outputs (`.ipynb` with outputs)
  - `.ipynb_checkpoints/`
  - Large CSV/JSON files (>1MB)
  - Processed intermediate files

### Data Loading in React
- Create custom hooks for data fetching (e.g., `useData.ts`)
- Use `fetch()` to load from `public/data/`
- Handle loading states appropriately

## Code Style & Patterns

### TypeScript
- Use explicit types for props interfaces
- Define types in dedicated `types.ts` files
- Prefer interfaces for object shapes

### React Patterns
- Functional components only (no class components)
- Use hooks: `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`
- Extract complex logic into custom hooks
- Keep components focused and single-purpose

### D3 + React Integration
- Use D3 for calculations, scales, and paths
- Use React for rendering SVG elements
- Wrap D3 calculations in `useMemo` for performance
- Example pattern:
  ```typescript
  const xScale = useMemo(() =>
    scaleLinear().domain([0, 100]).range([0, width]),
    [width]
  );
  ```

### Responsive Design
- **Always consider mobile from the start**
- Use responsive hooks (e.g., `useResponsiveDimensions`)
- Use actual pixel SVG dimensions (not viewBox) to keep text readable
- Scale charts proportionally with min/max constraints
- Use `clamp()` for responsive text sizing
- Mobile breakpoint: 600px width
- Add touch event handlers for mobile interactions

## Git Workflow

### Branching
- Create feature branches for new work (e.g., `EnergyData`, `FuelEconomy`)
- Merge to `main` when complete
- Push and deploy after merging

### Commits
- Clear, descriptive commit messages
- Include what changed and why
- Always include footer:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

### What NOT to Commit
- `node_modules/`
- `.cache/` directories
- Build outputs (`dist/` is exception - needed for gh-pages)
- Large data files (>1MB)
- Notebook outputs
- `.ipynb_checkpoints/`
- IDE-specific files (except `.vscode/` if shared)

## Build & Deploy Process

### Standard Workflow
1. Complete feature on branch
2. Test locally (especially mobile responsiveness)
3. Merge to `main`
4. Build: `npm run build`
5. Deploy: `npm run deploy` (deploys to GitHub Pages)

### Testing Checklist
- Test on desktop (1000px+ width)
- Test on mobile (<600px width)
- Verify all interactive features work
- Check touch interactions on mobile
- Verify data loads correctly

## Common Patterns

### Responsive Dimensions Hook
```typescript
const useResponsiveDimensions = () => {
  const [dimensions, setDimensions] = useState({ width: 1000, height: 400 });

  useEffect(() => {
    const updateDimensions = () => {
      const containerPadding = 40;
      const availableWidth = window.innerWidth - containerPadding;
      const maxWidth = 1000;
      const minWidth = 320;
      const finalWidth = Math.max(Math.min(availableWidth, maxWidth), minWidth);
      // Scale height proportionally
      setDimensions({ width: finalWidth, height: ... });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  return dimensions;
};
```

### Responsive Margins
```typescript
const getResponsiveMargins = (width: number) => {
  const isMobile = width < 600;
  return {
    top: 40,
    right: isMobile ? 20 : 40,
    bottom: isMobile ? 50 : 60,
    left: isMobile ? 50 : 80,
  };
};
```

### Touch Event Handlers
```typescript
const handleTouchStart = (e: React.TouchEvent) => {
  e.preventDefault(); // Prevent scrolling
  // Handle touch...
};
```

## Communication Preferences

### What I Like
- Direct, technical explanations
- Show code changes clearly
- Explain trade-offs when multiple approaches exist
- Ask clarifying questions when requirements are ambiguous

### What to Avoid
- Don't create files unless necessary
- Don't add features I didn't ask for
- Don't over-engineer solutions
- Don't use emojis unless I explicitly request them
- Don't create README/documentation files unless requested

## This Project: MarginalData

### Purpose
Interactive data visualizations exploring economic, energy, and policy data.

### Target Audience
General public - visualizations should be intuitive and educational.

### Design Philosophy
- Simple, clean interfaces
- Mobile-first responsive design
- Clear, minimal explanatory text
- Let the data speak for itself
- Progressive disclosure of complexity

### Current Projects
- Federal Employment visualization
- Foreign Aid comparison
- Fuel Economy tools
- Pizza area comparison
- Solar Generation Explorer
- (More to come...)
