import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ProductionView from '../features/ProductionView';
import TaskView from '../features/TaskView';
import { ArrowLeft } from 'lucide-react';
import { HOURS_PER_DAY } from '../../utils/constants';

const ProjectDetail = ({ projectId, setView }) => {
    const { getProject, updateProject, deleteProject, getProjectHours } = useData();
    const [toast, setToast] = useState(null);

    const project = getProject(projectId);

    if (!project) {
        return <div style={{ padding: '20px' }}>Project not found <Button onClick={() => setView('dashboard')}>Back</Button></div>;
    }

    const totalHours = getProjectHours(project);

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

    return (
        <div style={{ paddingBottom: '100px' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 40,
                background: 'rgba(8, 12, 20, 0.95)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--border-card)', padding: '16px 20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <button onClick={() => setView('dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontWeight: 700, fontSize: '18px' }}>{project.name}</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{project.clientName}</p>
                    </div>
                    <Select
                        value={project.status}
                        onChange={(e) => updateProject(projectId, { status: e.target.value })}
                        options={[
                            { value: 'in_progress', label: 'In Progress' },
                            { value: 'complete', label: 'Complete' },
                            { value: 'archived', label: 'Archived' }
                        ]}
                        style={{ width: '130px' }}
                    />
                </div>

                {project.address && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>📍 {project.address}</p>
                )}

                {/* Hours summary */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    background: 'rgba(60, 90, 140, 0.1)',
                    borderRadius: '12px'
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--accent-green)' }}>{totalHours}h</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total allocated</div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {[1, 2, 3].map(size => (
                            <div key={size} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {totalHours > 0 ? ((totalHours / size) / HOURS_PER_DAY).toFixed(1) : '-'}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{size}p days</div>
                            </div>
                        ))}
                    </div>
                </div>
            </header>

            <div style={{ padding: '20px' }}>
                {project.projectType === 'production' ? (
                    <ProductionView project={project} projectId={projectId} showToast={showToast} />
                ) : (
                    <TaskView project={project} projectId={projectId} showToast={showToast} />
                )}
            </div>

            {/* Delete button */}
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-card)' }}>
                <Button
                    variant="danger"
                    onClick={() => {
                        if (confirm('Delete this project?')) {
                            deleteProject(projectId);
                            setView('dashboard');
                        }
                    }}
                    style={{ width: '100%' }}
                >
                    Delete Project
                </Button>
            </div>

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
};

export default ProjectDetail;
