#!/bin/bash
# Quick startup script for MarginalData notebooks

echo "Starting MarginalData notebook environment..."

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Creating one..."
    python3.11 -m venv venv
    echo "Installing packages..."
    source venv/bin/activate
    pip install --upgrade pip
    pip install gridstatus pandas matplotlib plotly seaborn jupyterlab
    echo "Setup complete!"
else
    source venv/bin/activate
    echo "Virtual environment activated."
fi

echo "Starting Jupyter Lab..."
jupyter lab

# Deactivate when Jupyter is closed
deactivate
