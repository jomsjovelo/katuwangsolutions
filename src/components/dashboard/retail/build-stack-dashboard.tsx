"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Truck, HardHat, TrendingUp, Plus } from "lucide-react";
import { useProjects } from '@/hooks/use-projects';
import { useInventory } from '@/firebase/firestore/use-inventory';
import { useFirestore } from '@/firebase/provider';
import { doc, collection, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function BuildStackDashboard() {
  const { currentTenant } = useTenant();
  const { products, loading: inventoryLoading } = useInventory();
  const { activeProjects, loading: projectsLoading } = useProjects();
  const db = useFirestore();
  const { toast } = useToast();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [dispatchQty, setDispatchQty] = useState<number | ''>('');
  const [isDispatching, setIsDispatching] = useState(false);
  
  const handleDispatch = async () => {
    if (!selectedProductId || !selectedProjectId || !dispatchQty || dispatchQty <= 0) return;
    if (!currentTenant || !db) return;

    setIsDispatching(true);
    try {
      const product = products.find((p: any) => p.id === selectedProductId);
      const project = activeProjects.find((p: any) => p.id === selectedProjectId);
      if (!product || !project) throw new Error("Invalid selection");
      
      if (product.currentStock < dispatchQty) {
        throw new Error(`Insufficient stock. Only ${product.currentStock} ${product.unit} available.`);
      }

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'tenants', currentTenant.id, 'products', product.id!);
        const projectRef = doc(db, 'tenants', currentTenant.id, 'projects', project.id!);
        const txRef = doc(collection(db, 'tenants', currentTenant.id, 'inventory_transactions'));

        const totalCost = product.costPrice * dispatchQty; // We track cost, or maybe selling price? Let's use cost for now.

        // Update product stock
        transaction.update(productRef, {
          currentStock: product.currentStock - dispatchQty,
          updatedAt: serverTimestamp()
        });

        // Update project total cost
        transaction.update(projectRef, {
          totalMaterialCost: project.totalMaterialCost + totalCost,
          updatedAt: serverTimestamp()
        });

        // Record transaction
        transaction.set(txRef, {
          tenantId: currentTenant.id,
          productId: product.id,
          type: 'dispatch',
          quantity: -dispatchQty, // negative because it's going out
          projectId: project.id,
          balanceAfter: product.currentStock - dispatchQty,
          performedBy: 'admin',
          createdAt: serverTimestamp()
        });
      });

      toast({
        title: "Material Dispatched!",
        description: `Successfully dispatched ${dispatchQty} ${product.unit} of ${product.name} to ${project.name}.`
      });

      setDispatchQty('');
      setSelectedProductId('');
    } catch (err: any) {
      toast({
        title: "Error Dispatching",
        description: err.message || "An unknown error occurred.",
        variant: "destructive"
      });
    } finally {
      setIsDispatching(false);
    }
  };
  
  if (inventoryLoading || projectsLoading) {
    return <div className="p-6 text-center text-muted-foreground animate-pulse">Naglo-load ng materyales at proyekto...</div>;
  }

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 bg-slate-50 space-y-6 pb-24 overflow-y-auto min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-black uppercase tracking-tighter text-slate-800">
            Build Stack
          </h1>
          <p className="text-sm text-slate-500 font-medium">Hardware & Construction Supply Tracker</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Active Projects</p>
              <h3 className="text-2xl font-bold">{activeProjects.length}</h3>
            </div>
            <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
              <HardHat className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Materyales</p>
              <h3 className="text-2xl font-bold">{products.length}</h3>
            </div>
            <div className="h-10 w-10 bg-cyan-100 rounded-full flex items-center justify-center text-cyan-600">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="dispatch" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4 rounded-xl">
          <TabsTrigger value="dispatch" className="rounded-lg text-xs md:text-sm">I-Release</TabsTrigger>
          <TabsTrigger value="projects" className="rounded-lg text-xs md:text-sm">Mga Proyekto</TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-lg text-xs md:text-sm">Imbentaryo</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dispatch" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader className="bg-white border-b border-slate-100 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="h-5 w-5 text-cyan-500" />
                Dispatch Slip
              </CardTitle>
              <CardDescription>Pumili ng materyales na idadala sa site.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center space-y-4">
              <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <Label>Project</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                  >
                    <option value="">-- Select Project --</option>
                    {activeProjects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.contractor})</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label>Material</Label>
                  <select 
                    className="w-full border-slate-200 rounded-md border p-2 text-sm"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="">-- Select Material --</option>
                    {products.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.currentStock} {p.unit} available)</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input 
                    type="number" 
                    min="1"
                    placeholder="Enter quantity to dispatch"
                    value={dispatchQty}
                    onChange={(e) => setDispatchQty(parseInt(e.target.value) || '')}
                  />
                </div>

                <Button 
                  className="w-full bg-cyan-500 hover:bg-cyan-600 text-white mt-4"
                  onClick={handleDispatch}
                  disabled={!selectedProductId || !selectedProjectId || !dispatchQty || isDispatching}
                >
                  {isDispatching ? "Dispatching..." : "Confirm Dispatch"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader className="bg-white border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HardHat className="h-5 w-5 text-amber-500" />
                  Mga Proyekto
                </CardTitle>
              </div>
              <Button size="sm" className="gap-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full">
                <Plus className="h-4 w-4" /> Add Project
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {activeProjects.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Wala pang active na proyekto.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeProjects.map((project: any) => (
                    <div key={project.id} className="p-4 hover:bg-slate-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-bold text-slate-800">{project.name}</h4>
                          <p className="text-xs text-slate-500">{project.contractor}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Unpaid Bill</p>
                          <p className="font-bold text-red-500">
                            ₱{((project.totalMaterialCost - project.totalPaymentsCollected) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader className="bg-white border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-cyan-500" />
                Listahan ng Materyales
              </CardTitle>
              <Button size="sm" className="gap-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full">
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {products.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Wala pang materyales sa imbentaryo.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {products.map((product: any) => (
                    <div key={product.id} className="p-4 hover:bg-slate-50 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-slate-800">{product.name}</h4>
                        <p className="text-xs text-slate-500">Selling Price: ₱{(product.salePrice / 100).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">
                          {product.currentStock} {product.unit}
                        </div>
                        {product.currentStock <= product.minStock && (
                          <div className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-1">Low Stock</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
