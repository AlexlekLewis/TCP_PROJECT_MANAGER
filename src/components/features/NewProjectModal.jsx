import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

const NewProjectModal = ({ isOpen, onClose, onCreated }) => {
    const { createProject } = useData();
    const [form, setForm] = useState({
        name: '', clientName: '', address: '', projectType: 'production', status: 'in_progress', notes: ''
    });

    const handleCreate = async () => {
        if (!form.name.trim()) return alert('Please enter a project name');
        try {
            const project = await createProject(form);
            setForm({ name: '', clientName: '', address: '', projectType: 'production', status: 'in_progress', notes: '' });
            onCreated(project.id);
        } catch (error) {
            console.error("Error creating project:", error);
            alert("Failed to create project");
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Project">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <Input label="Project Name *" placeholder="e.g., Smith Residence" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <Input label="Client" placeholder="e.g., John Smith" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
                <Input label="Address" placeholder="e.g., 123 Main St" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '12px' }}>Project Type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={() => setForm({ ...form, projectType: 'production' })}
                            style={{
                                padding: '16px',
                                borderRadius: '12px',
                                border: form.projectType === 'production' ? '2px solid var(--accent-purple)' : '1px solid var(--border-card)',
                                background: form.projectType === 'production' ? 'rgba(167, 139, 250, 0.1)' : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                        >
                            <div style={{ fontSize: '20px', marginBottom: '8px' }}>🏠</div>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Production Flow</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>New homes - elements through phases</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setForm({ ...form, projectType: 'task' })}
                            style={{
                                padding: '16px',
                                borderRadius: '12px',
                                border: form.projectType === 'task' ? '2px solid var(--accent-yellow)' : '1px solid var(--border-card)',
                                background: form.projectType === 'task' ? 'rgba(251, 191, 36, 0.1)' : 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                textAlign: 'left'
                            }}
                        >
                            <div style={{ fontSize: '20px', marginBottom: '8px' }}>📋</div>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Task-Based</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Commercial - list of discrete jobs</div>
                        </button>
                    </div>
                </div>

                <Textarea label="Notes" placeholder="Any special details..." rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
                    <Button onClick={handleCreate} style={{ flex: 1 }}>Create Project</Button>
                </div>
            </div>
        </Modal>
    );
};

export default NewProjectModal;
