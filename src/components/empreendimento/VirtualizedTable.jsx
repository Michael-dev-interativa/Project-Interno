// VirtualizedTable.jsx
import React from 'react';
import { List } from 'react-window';

export default function VirtualizedTable({
  height,
  itemCount,
  itemSize,
  width,
  renderRow
}) {
  return (
    <List
      height={height}
      itemCount={itemCount}
      itemSize={itemSize}
      width={width}
      rowProps={{}}
    >
      {({ index, style }) => (
        <div style={style}>
          {renderRow(index)}
        </div>
      )}
    </List>
  );
}
