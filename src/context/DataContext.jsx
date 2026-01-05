import React, { useState, useEffect, createContext, useContext } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
  const { user } = useAuth();
  const [data, setData] = useState({ projects: [] });

  useEffect(() => {
    if (!user) {
      setData({ projects: [] });
      return;
    }

    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setData({ projects });
    });

    return () => unsubscribe();
  }, [user]);

  // Project CRUD
  const createProject = async (project) => {
    if (!user) return;
    const newProject = {
      ...project,
      userId: user.uid,
      elements: [],
      tasks: [],
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'projects'), newProject);
    return { id: docRef.id, ...newProject };
  };

  const updateProject = async (id, updates) => {
    await updateDoc(doc(db, 'projects', id), updates);
  };

  const deleteProject = async (id) => {
    await deleteDoc(doc(db, 'projects', id));
  };

  // Elements (Production Flow)
  const addElement = async (projectId, element) => {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return;

    const newElement = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...element,
      phaseStatus: {}
    };

    await updateDoc(doc(db, 'projects', projectId), {
      elements: [...(project.elements || []), newElement]
    });
  };

  const updateElementPhase = async (projectId, elementId, phaseId, status) => {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return;

    const elements = project.elements.map(e => {
      if (e.id !== elementId) return e;
      return {
        ...e,
        phaseStatus: { ...e.phaseStatus, [phaseId]: status }
      };
    });

    await updateDoc(doc(db, 'projects', projectId), { elements });
  };

  const deleteElement = async (projectId, elementId) => {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return;
    await updateDoc(doc(db, 'projects', projectId), {
      elements: project.elements.filter(e => e.id !== elementId)
    });
  };

  // Tasks (Task-Based)
  const addTask = async (projectId, task) => {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return;

    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...task,
      status: 'pending',
      hoursUsed: 0,
      hoursAllocated: parseFloat(task.hoursAllocated) || 0
    };

    await updateDoc(doc(db, 'projects', projectId), {
      tasks: [...(project.tasks || []), newTask]
    });
  };

  const updateTask = async (projectId, taskId, updates) => {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return;

    const tasks = project.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t);
    await updateDoc(doc(db, 'projects', projectId), { tasks });
  };

  const deleteTask = async (projectId, taskId) => {
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return;
    await updateDoc(doc(db, 'projects', projectId), {
      tasks: project.tasks.filter(t => t.id !== taskId)
    });
  };

  const getProject = (id) => data.projects.find(p => p.id === id);

  const getProjectHours = (project) => {
    if (!project) return 0;
    if (project.projectType === 'production') {
      return project.elements?.reduce((sum, el) => sum + (parseFloat(el.hours) || 0), 0) || 0;
    } else {
      return project.tasks?.reduce((sum, t) => sum + (parseFloat(t.hoursAllocated) || 0), 0) || 0;
    }
  };

  return (
    <DataContext.Provider value={{
      data,
      createProject,
      updateProject,
      deleteProject,
      addElement,
      updateElementPhase,
      deleteElement,
      addTask,
      updateTask,
      deleteTask,
      getProject,
      getProjectHours
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
