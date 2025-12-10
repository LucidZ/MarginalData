# Energy Data Exploration Notebooks

## Setup

### 1. Install Dependencies
```bash
pip3 install gridstatus pandas matplotlib plotly seaborn jupyterlab
```

### 2. Start Jupyter
```bash
jupyter lab
```

## Automatic Output Clearing

A git pre-commit hook is installed that automatically clears all notebook outputs before committing. This keeps diffs clean and prevents accidentally committing large output data.

The hook runs automatically - you don't need to do anything! When you `git commit`, any staged `.ipynb` files will have their outputs cleared.

### Manual Output Clearing (if needed)

You can also clear outputs manually:
- Jupyter Lab: Edit → Clear All Outputs
- VS Code: Click "Clear All Outputs" in notebook toolbar
- Command line: `jupyter nbconvert --clear-output --inplace notebooks/*.ipynb`

## Directory Structure

```
notebooks/          # Jupyter notebooks for exploration
data/
  raw/              # Downloaded data (cached, gitignored)
  processed/        # Cleaned data for visualizations (gitignored)
```

## Notebooks

- **gridstatus_exploration.ipynb** - Main exploration notebook for GridStatus data
