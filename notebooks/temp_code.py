# Try renewables report with a date
print("Fetching CAISO renewables report for a recent date...")
try:
    renewables = caiso.get_caiso_renewables_report(date='2024-06-21')
    print("\n✓ Renewables report found!")
    print(f"Shape: {renewables.shape}")
    print(f"\nColumns: {renewables.columns.tolist()}")
    print(f"\nSample data:")
    print(renewables.head(20))
    print(f"\nData types:")
    print(renewables.dtypes)

except Exception as e:
    print(f"\nError: {e}")
    import traceback
    traceback.print_exc()

# In the meantime, let's look at actual solar capacity from queue
print("\n" + "="*70)
print("Operational Solar Capacity from Interconnection Queue")
print("="*70)

# Filter for operational solar projects
solar_queue = queue[
    (queue['Generation Type'].str.contains('Solar', case=False, na=False)) &
    (queue['Status'].str.contains('Operational|In Service', case=False, na=False))
]

print(f"\nOperational solar projects: {len(solar_queue)}")
print(f"Total operational solar capacity: {solar_queue['Capacity (MW)'].sum():,.0f} MW")
print(f"\nBreakdown by year (Actual Completion Date):")

# Group by completion year
solar_queue['Completion Year'] = pd.to_datetime(solar_queue['Actual Completion Date'], errors='coerce').dt.year
yearly_capacity = solar_queue.groupby('Completion Year')['Capacity (MW)'].sum().sort_index()
print(yearly_capacity)
