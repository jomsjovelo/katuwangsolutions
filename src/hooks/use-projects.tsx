'use client';

import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useTenant } from '@/app/lib/tenant-context';
import { Project, ProjectSchema } from '@/lib/schemas/projects';
import { createConverter } from '@/firebase';

export function useProjects() {
  const { currentTenant } = useTenant();
  const db = useFirestore();

  const projectsQuery = currentTenant && db
    ? query(
        collection(db, 'tenants', currentTenant.id, 'projects').withConverter(createConverter(ProjectSchema)),
        orderBy('createdAt', 'desc')
      )
    : null;

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
