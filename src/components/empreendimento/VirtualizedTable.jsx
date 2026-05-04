import React from 'react';
import { List } from 'react-window';

function RowRenderer({ index, style, renderRow }) {
  return <div style={style}>{renderRow(index)}</div>;
}

export default function VirtualizedTable({
  height,
  itemCount,
  itemSize,
  width,
  renderRow
}) {
  if (!itemCount || itemCount <= 0) return null;

  return (
    <List
      rowCount={itemCount}
      rowHeight={itemSize}
      rowComponent={RowRenderer}
      rowProps={{ renderRow }}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: width || '100%',
        overflowY: 'auto'
      }}
    />
  );
}
