"use client"

import React from 'react';
import { Card } from "@/components/ui/card";
import { Clock, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RoomGridProps {
  rooms: any[];
  onRoomClick?: (room: any) => void;
  onRename?: (room: any) => void;
  onDelete?: (room: any) => void;
  theme: any;
}

export function RoomGrid({ rooms, onRoomClick, onRename, onDelete, theme }: RoomGridProps) {
  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
        <p>No rooms set up yet.</p>
        <p className="text-sm">Click "+ Add Rooms" to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {rooms.map(room => {
        const isOccupied = room.status === 'occupied';
        
        let bgColor = 'bg-white';
        let borderColor = 'border-slate-200';
        let statusText = 'Available';
        let statusColor = 'text-green-500';

        if (isOccupied) {
          bgColor = 'bg-orange-50';
          borderColor = 'border-orange-300';
          statusText = 'In Session';
          statusColor = 'text-orange-500';
        }

        const elapsed = room.occupiedAt?.toDate 
          ? formatDistanceToNow(room.occupiedAt.toDate(), { addSuffix: false })
          : null;

        return (
          <Card 
            key={room.id}
            className={`cursor-pointer transition-all hover:shadow-md border-2 ${bgColor} ${borderColor} p-4 flex flex-col h-32 justify-between active:scale-95`}
            onClick={() => onRoomClick?.(room)}
          >
            <div className="flex justify-between items-start">
              <span className="font-black text-slate-800 text-lg leading-none">{room.name}</span>
              <div className="flex items-center gap-1">
                <div className={`h-3 w-3 rounded-full ${isOccupied ? 'bg-orange-500' : 'bg-green-500'} shadow-sm`} />
                
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
                      onClick={(e) => { e.stopPropagation(); onRename?.(room); }}
                    >
                      <Edit2 className="h-4 w-4 mr-2" /> Rename
                    </DropdownMenuItem>
                    {!isOccupied && (
                      <DropdownMenuItem 
                        className="font-bold text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); onDelete?.(room); }}
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
                  <span>Session</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{elapsed}</span>
                  </div>
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
