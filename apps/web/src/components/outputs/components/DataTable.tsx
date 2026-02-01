'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import type { DataTableConfig, TableColumn } from '@/lib/outputs/types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface DataTableProps {
  config: DataTableConfig;
  className?: string;
  title?: string;
}

type SortDirection = 'asc' | 'desc' | null;

// ============================================================================
// FORMATTERS
// ============================================================================

function formatValue(value: unknown, column: TableColumn): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (column.type) {
    case 'number':
      return typeof value === 'number'
        ? value.toLocaleString()
        : String(value);

    case 'currency':
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(value)
        : String(value);

    case 'percentage':
      return typeof value === 'number'
        ? `${value.toFixed(1)}%`
        : String(value);

    case 'date':
      try {
        const date = value instanceof Date ? value : new Date(String(value));
        return date.toLocaleDateString();
      } catch {
        return String(value);
      }

    case 'badge':
      return <Badge variant="secondary">{String(value)}</Badge>;

    default:
      return String(value);
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DataTable({ config, className, title }: DataTableProps) {
  const { columns, data, pagination, sorting, filtering } = config;

  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(
    sorting?.defaultColumn ?? null
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    sorting?.defaultDirection ?? null
  );
  const [filterQuery, setFilterQuery] = useState('');

  const pageSize = pagination?.pageSize ?? 10;

  // Filter data
  const filteredData = filtering?.enabled
    ? data.filter((row) => {
        const searchCols = filtering.columns || columns.map((c) => c.key);
        return searchCols.some((key) => {
          const value = row[key];
          return String(value ?? '')
            .toLowerCase()
            .includes(filterQuery.toLowerCase());
        });
      })
    : data;

  // Sort data
  const sortedData = sortColumn
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        const comparison =
          typeof aVal === 'number' && typeof bVal === 'number'
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));

        return sortDirection === 'desc' ? -comparison : comparison;
      })
    : filteredData;

  // Paginate data
  const paginatedData = pagination?.enabled
    ? sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedData;

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handle sort
  const handleSort = (columnKey: string) => {
    if (!sorting?.enabled) return;

    const column = columns.find((c) => c.key === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const SortIcon =
    sortDirection === 'asc'
      ? ArrowUp
      : sortDirection === 'desc'
        ? ArrowDown
        : ArrowUpDown;

  return (
    <Card className={cn(className)}>
      {(title || filtering?.enabled) && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          {title && <CardTitle className="text-sm font-medium">{title}</CardTitle>}
          {filtering?.enabled && (
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={filterQuery}
                onChange={(e) => {
                  setFilterQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 h-9"
              />
            </div>
          )}
        </CardHeader>
      )}
      <CardContent className={cn(!title && !filtering?.enabled && 'pt-6')}>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    style={{ width: column.width }}
                    className={cn(
                      sorting?.enabled && column.sortable && 'cursor-pointer select-none'
                    )}
                    onClick={() => handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      {column.header}
                      {sorting?.enabled && column.sortable && (
                        <SortIcon
                          className={cn(
                            'h-4 w-4',
                            sortColumn === column.key
                              ? 'text-foreground'
                              : 'text-muted-foreground/50'
                          )}
                        />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, index) => (
                  <TableRow key={index}>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {formatValue(row[column.key], column)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination?.enabled && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, sortedData.length)} of{' '}
              {sortedData.length} results
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
