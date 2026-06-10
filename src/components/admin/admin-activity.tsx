"use client";

import React from 'react';
import { useAdminAudit } from '@/hooks/use-admin-audit';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Calendar, User, Fingerprint } from "lucide-react";

export function AdminActivity() {
  const { logs, loading } = useAdminAudit();

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <Card className="shadow-lg border-primary/10">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-slate-800">
            <ShieldAlert className="h-5 w-5 text-primary" /> Immutable Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto min-w-full">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Timestamp</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Admin Identity</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Action Taken</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400 font-medium animate-pulse">
                    Loading secure audit logs...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400 font-medium">
                    No admin actions recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map(log => (
                  <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <Calendar className="h-3 w-3" />
                        {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-sm text-slate-700 flex items-center gap-1"><User className="h-3 w-3 text-primary"/> {log.adminEmail}</span>
                        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1"><Fingerprint className="h-3 w-3"/> {log.adminUid}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 font-bold uppercase tracking-wider text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-slate-600">{log.details}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
