import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users } from 'lucide-react';
import { useAdminStaff } from '@/hooks/use-admin-staff';

export function AdminStaffDirectory() {
  const { activeStaff, loading, error } = useAdminStaff();

  return (
    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
      <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
        <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Active Staff Directory
        </CardTitle>
        <CardDescription className="text-slate-500 font-medium mt-1">
          These staff members are fully approved and actively operating in their respective modules.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="p-6 text-destructive font-medium text-center">
            {error}
          </div>
        ) : activeStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium">
            No active staff found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Staff Name</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Email</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Tenant ID</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Referrer Code</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeStaff.map(staff => (
                  <TableRow key={staff.id}>
                    <TableCell className="py-4">
                      <div className="font-bold text-slate-800">{staff.fullName}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="text-xs text-slate-500">{staff.email}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className="font-mono text-[10px] bg-slate-50">
                        {staff.tenantId}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      {staff.referredBy ? (
                        <Badge variant="secondary" className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                          {staff.referredBy}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400 italic">None</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 text-right">
                      <Badge className="bg-emerald-600 hover:bg-emerald-500 text-white border-transparent">
                        Active
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
