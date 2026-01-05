import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { HOURS_PER_DAY } from '../../utils/constants'; // Assuming we export this or just import direct if moved. I'll rely on local constant if file not consistent, but I created constants.js.
// Wait, I created Constants but didn't correct imports in other files. I'll fix imports later.
// For Dashboard, it needs HOURS_PER_DAY.
import Button from '../ui/Button';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import NewProjectModal from '../features/NewProjectModal';
import { Folder } from 'lucide-react';

const Dashboard = ({ setView, setSelectedProject }) => {
    const { data, getProjectHours } = useData();
    const [showNewProject, setShowNewProject] = useState(false);
    const [filter, setFilter] = useState('active');

    const filteredProjects = useMemo(() => {
        if (filter === 'active') return data.projects.filter(p => p.status !== 'archived' && p.status !== 'complete');
        if (filter === 'complete') return data.projects.filter(p => p.status === 'complete');
        if (filter === 'archived') return data.projects.filter(p => p.status === 'archived');
        return data.projects;
    }, [data.projects, filter]);

    return (
        <div style={{ paddingBottom: '100px' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 40,
                background: 'rgba(8, 12, 20, 0.9)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--border-card)', padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Tricoat</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Project Manager</p>
                    </div>
                    <Button onClick={() => setShowNewProject(true)}>+ New</Button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    {['active', 'complete', 'archived'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: filter === f ? 'var(--gradient-green)' : 'rgba(60, 90, 140, 0.15)',
                                color: filter === f ? '#0a1628' : 'var(--text-secondary)'
                            }}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </header>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filteredProjects.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                            <Folder size={48} />
                        </div>
                        <p>No projects yet</p>
                        <Button onClick={() => setShowNewProject(true)} style={{ marginTop: '16px' }}>Create Project</Button>
                    </div>
                ) : (
                    filteredProjects.map(project => {
                        const totalHours = getProjectHours(project);
                        const days1p = totalHours > 0 ? (totalHours / 7.6).toFixed(1) : '-'; // Hardcoded 7.6 or import

                        return (
                            <Card
                                key={project.id}
                                onClick={() => { setSelectedProject(project.id); setView('project'); }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div>
                                        <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>{project.name}</h3>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{project.clientName}</p>
                                    </div>
                                    <Badge status={project.status} />
                                </div>

                                {project.address && (
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>📍 {project.address}</p>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--border-card)' }}>
                                    <span style={{
                                        padding: '4px 10px',
                                        background: project.projectType === 'production' ? 'rgba(167, 139, 250, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                                        color: project.projectType === 'production' ? 'var(--accent-purple)' : 'var(--accent-yellow)',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 600
                                    }}>
                                        {project.projectType === 'production' ? '🏠 Production' : '📋 Task-Based'}
                                    </span>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-green)' }}>{totalHours}h</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{days1p} days (1p)</div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })
                )}
            </div>

            <NewProjectModal isOpen={showNewProject} onClose={() => setShowNewProject(false)} onCreated={(id) => {
                setShowNewProject(false);
                setSelectedProject(id);
                setView('project');
            }} />
        </div>
    );
};

export default Dashboard;
