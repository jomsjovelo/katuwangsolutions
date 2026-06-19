'use client';

import React from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { Project, ProjectSchema } from '@/lib/schemas/projects';
import { createConverter } from '@/firebase';

export function useProjects() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const projectsQuery = React.useMemo(() => {
    return currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'projects').withConverter(createConverter(ProjectSchema)),
        orderBy('createdAt', 'desc'),
        limit(300)
      )
    : null;
  }, [currentTenant?.id, db]);

  const { data, loading, error } = useCollection<Project>(projectsQuery);

  const activeProjects = data.filter(p => p.status === 'active');
  const completedProjects = data.filter(p => p.status === 'completed');

  return { 
    projects: data, 
    activeProjects,
    completedProjects,
    loading, 
    error 
  };
}
