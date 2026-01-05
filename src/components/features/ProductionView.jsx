import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { PHASES } from '../../utils/constants';
import Button from '../ui/Button';
import Card from '../ui/Card';
import AddElementModal from './AddElementModal';
import { Trash } from 'lucide-react';

const ProductionView = ({ project, projectId, showToast }) => {
    const { addElement, deleteElement, updateElementPhase } = useData();
    const [showAddElement, setShowAddElement] = useState(false);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Elements × Phases</h2>
                <Button size="sm" onClick={() => setShowAddElement(true)}>+ Add Element</Button>
            </div>

            {project.elements.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏠</div>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Add elements like ceilings, walls, doors...</p>
                    <Button onClick={() => setShowAddElement(true)}>Add First Element</Button>
                </Card>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    {/* Phase headers */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', paddingLeft: '140px', minWidth: 'fit-content' }}>
                        {PHASES.map(phase => (
                            <div key={phase.id} style={{
                                width: '60px',
                                textAlign: 'center',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                padding: '8px 4px'
                            }}>
                                {phase.short}
                            </div>
                        ))}
                        <div style={{ width: '60px' }}></div>
                    </div>

                    {/* Elements grid */}
                    <div style={{ minWidth: 'fit-content' }}>
                        {project.elements.map(element => (
                            <Card key={element.id} style={{ marginBottom: '8px', padding: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ width: '130px', flexShrink: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{element.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{element.hours}h</div>
                                        {element.colour && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{element.colour}</div>}
                                    </div>

                                    {PHASES.map(phase => {
                                        const status = element.phaseStatus?.[phase.id] || 'pending';
                                        return (
                                            <button
                                                key={phase.id}
                                                onClick={() => {
                                                    const next = status === 'pending' ? 'in_progress' : status === 'in_progress' ? 'complete' : 'pending';
                                                    updateElementPhase(projectId, element.id, phase.id, next);
                                                }}
                                                style={{
                                                    width: '60px',
                                                    height: '40px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: '16px',
                                                    background: status === 'complete' ? 'rgba(74, 222, 128, 0.2)'
                                                        : status === 'in_progress' ? 'rgba(59, 130, 246, 0.2)'
                                                            : 'rgba(60, 90, 140, 0.1)',
                                                    color: status === 'complete' ? 'var(--accent-green)'
                                                        : status === 'in_progress' ? 'var(--accent-blue)'
                                                            : 'var(--text-muted)'
                                                }}
                                            >
                                                {status === 'complete' ? '✓' : status === 'in_progress' ? '●' : '○'}
                                            </button>
                                        );
                                    })}

                                    <button
                                        onClick={() => { if (confirm('Delete?')) deleteElement(projectId, element.id); }}
                                        style={{ width: '40px', height: '40px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Trash size={16} />
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>○ Pending</span>
                <span style={{ color: 'var(--accent-blue)' }}>● In Progress</span>
                <span style={{ color: 'var(--accent-green)' }}>✓ Complete</span>
            </div>

            <AddElementModal
                isOpen={showAddElement}
                onClose={() => setShowAddElement(false)}
                onAdd={async (element) => {
                    try {
                        await addElement(projectId, element);
                        setShowAddElement(false);
                        showToast('Element added');
                    } catch (e) {
                        alert('Failed to add element');
                    }
                }}
            />
        </div>
    );
};

export default ProductionView;
