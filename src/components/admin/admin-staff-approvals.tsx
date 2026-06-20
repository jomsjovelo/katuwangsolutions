import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, UserCheck, XCircle } from 'lucide-react';
import { useAdminStaff } from '@/hooks/use-admin-staff';
import { Badge } from '@/components/ui/badge';

export function AdminStaffApprovals() {
  const { pendingStaff, loading, error, approveStaff, rejectStaff } = useAdminStaff();

  return (
    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
      <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
        <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-emerald-600" />
          Pending Staff Approvals
        </CardTitle>
        <CardDescription className="text-slate-500 font-medium mt-1">
          These staff members have been approved by their Store Owners and are waiting for Command Center activation. Approving them will grant the referrer their ₱10 reward.
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
        ) : pendingStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium">
            No pending staff approvals.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Staff Details</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Tenant ID</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-widest py-4">Referrer Code</TableHead>
                  <TableHead className="text-right font-bold text-xs uppercase tracking-widest py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingStaff.map(staff => (
                  <TableRow key={staff.id}>
                    <TableCell className="py-4">
                      <div className="font-bold text-slate-800">{staff.fullName}</div>
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
                    <TableCell className="py-4 text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(`Reject staff ${staff.fullName}?`)) {
                            rejectStaff(staff.id);
                          }
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                        onClick={() => {
                          if (confirm(`Approve ${staff.fullName} and process ₱10 referral payout?`)) {
                            approveStaff(staff);
                          }
                        }}
                      >
                        <UserCheck className="h-4 w-4 mr-1" /> Approve
                      </Button>
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
