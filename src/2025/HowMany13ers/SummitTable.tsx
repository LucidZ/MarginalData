import { useState, useMemo } from 'react';

interface Summit {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    elevation: number;
    elevationMeters: number;
    county: string;
    featureId: string;
    mapName: string;
  };
}

interface SummitTableProps {
  summits: Summit[];
}

type SortKey = 'name' | 'elevation' | 'county';
type SortDirection = 'asc' | 'desc';

function SummitTable({ summits }: SummitTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('elevation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const sortedSummits = useMemo(() => {
    const sorted = [...summits].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sortKey === 'name') {
        aVal = a.properties.name;
        bVal = b.properties.name;
      } else if (sortKey === 'elevation') {
        aVal = a.properties.elevation;
        bVal = b.properties.elevation;
      } else {
        aVal = a.properties.county;
        bVal = b.properties.county;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortDirection === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }
    });

    return sorted;
  }, [summits, sortKey, sortDirection]);

  const paginatedSummits = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedSummits.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedSummits, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedSummits.length / itemsPerPage);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ' ↕';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div>
      <div style={{ marginBottom: '15px', fontSize: '14px', color: '#666' }}>
        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sortedSummits.length)} of {sortedSummits.length.toLocaleString()} summits
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  borderBottom: '2px solid #ddd',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('name')}
              >
                Name{getSortIndicator('name')}
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'right',
                  borderBottom: '2px solid #ddd',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('elevation')}
              >
                Elevation{getSortIndicator('elevation')}
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  borderBottom: '2px solid #ddd',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('county')}
              >
                County{getSortIndicator('county')}
              </th>
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  borderBottom: '2px solid #ddd',
                }}
              >
                Coordinates
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedSummits.map((summit, i) => (
              <tr
                key={i}
                style={{
                  backgroundColor: i % 2 === 0 ? 'white' : '#f9f9f9',
                }}
              >
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                  {summit.properties.name}
                </td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                  {summit.properties.elevation.toLocaleString()} ft
                  <br />
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    ({summit.properties.elevationMeters.toLocaleString()} m)
                  </span>
                </td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                  {summit.properties.county}
                </td>
                <td style={{ padding: '10px', borderBottom: '1px solid #eee', fontSize: '12px', color: '#666' }}>
                  {summit.geometry.coordinates[1].toFixed(4)}, {summit.geometry.coordinates[0].toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: currentPage === 1 ? '#f0f0f0' : 'white',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Previous
        </button>
        <span style={{ fontSize: '14px' }}>
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: currentPage === totalPages ? '#f0f0f0' : 'white',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default SummitTable;
