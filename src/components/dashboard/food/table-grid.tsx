"use client"

import React from 'react';
import { Card } from "@/components/ui/card";
import { Clock, Users, Receipt, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TableGridProps {
  tables: any[];
  onTableClick: (table: any) => void;
  onRename?: (table: any) => void;
  onDelete?: (table: any) => void;
  theme: any;
}

export function TableGrid({ tables, onTableClick, onRename, onDelete, theme }: TableGridProps) {
  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
        <p>No tables set up yet.</p>
        <p className="text-sm">Click "Setup Tables" to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {tables.map(table => {
        const isOccupied = table.status === 'occupied';
        const isAttention = table.status === 'needs_attention';
        
        let bgColor = 'bg-white';
        let borderColor = 'border-slate-200';
        let statusText = 'Available';
        let statusColor = 'text-green-500';

        if (isOccupied) {
          bgColor = 'bg-orange-50';
          borderColor = 'border-orange-300';
          statusText = 'Occupied';
          statusColor = 'text-orange-500';
        } else if (isAttention) {
          bgColor = 'bg-red-50';
          borderColor = 'border-red-300';
          statusText = 'Attention';
          statusColor = 'text-red-500';
        }

        const elapsed = table.openedAt?.toDate 
          ? formatDistanceToNow(table.openedAt.toDate(), { addSuffix: false })
          : null;

        return (
          <Card 
            key={table.id}
            className={`cursor-pointer transition-all hover:shadow-md border-2 ${bgColor} ${borderColor} p-4 flex flex-col h-32 justify-between active:scale-95`}
            onClick={() => onTableClick(table)}
          >
            <div className="flex justify-between items-start">
              <span className="font-black text-slate-800 text-lg leading-none">{table.name}</span>
              <div className="flex items-center gap-1">
                <div className={`h-3 w-3 rounded-full ${isOccupied ? 'bg-orange-500' : isAttention ? 'bg-red-500' : 'bg-green-500'} shadow-sm`} />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div 
                      className="p-1 hover:bg-slate-100 rounded-full transition-colors opacity-50 hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4 text-slate-500" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem 
                      className="font-bold text-slate-700 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onRename?.(table); }}
                    >
                      <Edit2 className="h-4 w-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    {!isOccupied && (
                      <DropdownMenuItem 
                        className="font-bold text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); onDelete?.(table); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {isOccupied ? (
              <div className="space-y-1 mt-auto">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{table.guestCount}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{elapsed}</span>
                  </div>
                </div>
                <div className="bg-white rounded-md px-2 py-1 flex items-center justify-between border border-orange-200">
                  <Receipt className="h-3 w-3 text-orange-500" />
                  <span className="font-black text-orange-700 text-sm">
                    ₱{((table.runningTotal || 0) / 100).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-auto flex justify-center">
                <span className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>
                  {statusText}
                </span>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
