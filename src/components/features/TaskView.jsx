import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import AddTaskModal from './AddTaskModal';
import { Trash } from 'lucide-react';

const HOURS_PER_DAY = 7.6;

const TaskView = ({ project, projectId, showToast }) => {
    const { addTask, updateTask, deleteTask } = useData();
    const [showAddTask, setShowAddTask] = useState(false);

    const completedTasks = project.tasks.filter(t => t.status === 'complete').length;
    const totalTasks = project.tasks.length;
    const completedHours = project.tasks.filter(t => t.status === 'complete').reduce((sum, t) => sum + (parseFloat(t.hoursAllocated) || 0), 0);
    const totalHours = project.tasks.reduce((sum, t) => sum + (parseFloat(t.hoursAllocated) || 0), 0);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Tasks</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{completedTasks}/{totalTasks} complete • {completedHours}/{totalHours}h done</p>
                </div>
                <Button size="sm" onClick={() => setShowAddTask(true)}>+ Add Task</Button>
            </div>

            {/* Progress bar */}
            {totalHours > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ height: '8px', background: 'rgba(60, 90, 140, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                            width: `${(completedHours / totalHours) * 100}%`,
                            height: '100%',
                            background: 'var(--gradient-green)',
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                </div>
            )}

            {project.tasks.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Add tasks like "Hallway repaint", "Gymnasium poles"...</p>
                    <Button onClick={() => setShowAddTask(true)}>Add First Task</Button>
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {project.tasks.map(task => (
                        <Card key={task.id} style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <button
                                    onClick={() => updateTask(projectId, task.id, { status: task.status === 'complete' ? 'pending' : 'complete' })}
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '8px',
                                        border: task.status === 'complete' ? 'none' : '2px solid var(--border-card)',
                                        background: task.status === 'complete' ? 'var(--accent-green)' : 'transparent',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '14px',
                                        flexShrink: 0
                                    }}
                                >
                                    {task.status === 'complete' && '✓'}
                                </button>

                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontWeight: 600,
                                        textDecoration: task.status === 'complete' ? 'line-through' : 'none',
                                        color: task.status === 'complete' ? 'var(--text-muted)' : 'var(--text-primary)'
                                    }}>
                                        {task.name}
                                    </div>
                                    {task.description && (
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{task.description}</div>
                                    )}
                                    {task.colour && (
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>🎨 {task.colour}</div>
                                    )}
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{task.hoursAllocated}h</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {((parseFloat(task.hoursAllocated) || 0) / HOURS_PER_DAY).toFixed(1)}d
                                    </div>
                                </div>

                                <button
                                    onClick={() => { if (confirm('Delete?')) deleteTask(projectId, task.id); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Trash size={16} />
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <AddTaskModal
                isOpen={showAddTask}
                onClose={() => setShowAddTask(false)}
                onAdd={async (task) => {
                    try {
                        await addTask(projectId, task);
                        setShowAddTask(false);
                        showToast('Task added');
                    } catch (e) {
                        alert('Failed to add task');
                    }
                }}
            />
        </div>
    );
};

export default TaskView;
