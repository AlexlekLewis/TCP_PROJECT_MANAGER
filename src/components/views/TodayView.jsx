import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { PHASES } from '../../utils/constants';
import Button from '../ui/Button';
import Card from '../ui/Card';

const TodayView = ({ setView, setSelectedProject }) => {
    const { data } = useData();

    const activeProjects = data.projects.filter(p => p.status === 'in_progress');

    // Get current work summary
    const summary = useMemo(() => {
        const production = [];
        const tasks = [];

        activeProjects.forEach(project => {
            if (project.projectType === 'production') {
                // Find elements in progress
                project.elements.forEach(el => {
                    const inProgressPhases = PHASES.filter(p => el.phaseStatus?.[p.id] === 'in_progress');
                    if (inProgressPhases.length > 0) {
                        production.push({
                            project,
                            element: el,
                            phases: inProgressPhases
                        });
                    }
                });
            } else {
                // Find incomplete tasks
                const incompleteTasks = project.tasks.filter(t => t.status !== 'complete');
                if (incompleteTasks.length > 0) {
                    tasks.push({ project, tasks: incompleteTasks });
                }
            }
        });

        return { production, tasks };
    }, [activeProjects]);

    const copyBrief = () => {
        let text = `📅 DAILY BRIEF: ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}\n\n`;

        if (summary.production.length > 0) {
            text += '🏠 PRODUCTION WORK\n';
            summary.production.forEach(({ project, element, phases }) => {
                text += `\n${project.name}\n`;
                text += `  ${element.name}: ${phases.map(p => p.name).join(' → ')}\n`;
                if (element.colour) text += `  Colour: ${element.colour}\n`;
            });
        }

        if (summary.tasks.length > 0) {
            text += '\n📋 TASK JOBS\n';
            summary.tasks.forEach(({ project, tasks }) => {
                text += `\n${project.name} (${project.address || 'No address'})\n`;
                tasks.forEach(t => {
                    text += `  ☐ ${t.name} - ${t.hoursAllocated}h\n`;
                    if (t.colour) text += `    Colour: ${t.colour}\n`;
                });
            });
        }

        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    return (
        <div style={{ paddingBottom: '100px' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 40,
                background: 'rgba(8, 12, 20, 0.95)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--border-card)', padding: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Today</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    </div>
                    <Button variant="secondary" onClick={copyBrief}>📋 Copy Brief</Button>
                </div>
            </header>

            <div style={{ padding: '20px' }}>
                {activeProjects.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                        <p>No active projects</p>
                    </div>
                ) : (
                    <>
                        {/* Production work */}
                        {summary.production.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>🏠 PRODUCTION WORK</h2>
                                {summary.production.map(({ project, element, phases }, idx) => (
                                    <Card
                                        key={idx}
                                        style={{ marginBottom: '8px', cursor: 'pointer' }}
                                        onClick={() => { setSelectedProject(project.id); setView('project'); }}
                                    >
                                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{project.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '14px' }}>{element.name}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>→</span>
                                            <span style={{
                                                padding: '4px 10px',
                                                background: 'rgba(59, 130, 246, 0.15)',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                color: 'var(--accent-blue)'
                                            }}>
                                                {phases.map(p => p.name).join(', ')}
                                            </span>
                                        </div>
                                        {element.colour && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>🎨 {element.colour}</div>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* Task-based work */}
                        {summary.tasks.length > 0 && (
                            <div>
                                <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>📋 TASK JOBS</h2>
                                {summary.tasks.map(({ project, tasks }, idx) => (
                                    <Card
                                        key={idx}
                                        style={{ marginBottom: '8px', cursor: 'pointer' }}
                                        onClick={() => { setSelectedProject(project.id); setView('project'); }}
                                    >
                                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{project.name}</div>
                                        {project.address && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>📍 {project.address}</div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {tasks.slice(0, 3).map(task => (
                                                <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '14px' }}>☐ {task.name}</span>
                                                    <span style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600 }}>{task.hoursAllocated}h</span>
                                                </div>
                                            ))}
                                            {tasks.length > 3 && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>+{tasks.length - 3} more tasks</div>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {summary.production.length === 0 && summary.tasks.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                <p>No work in progress. Start working on elements or tasks in your projects!</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default TodayView;
