import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import CrewCalculator from './CrewCalculator';

const AddTaskModal = ({ isOpen, onClose, onAdd }) => {
    const [form, setForm] = useState({ name: '', hoursAllocated: '', description: '', colour: '' });

    const handleAdd = () => {
        if (!form.name.trim()) return alert('Please enter a task name');
        if (!form.hoursAllocated) return alert('Please enter hours');
        onAdd({
            name: form.name.trim(),
            hoursAllocated: parseFloat(form.hoursAllocated) || 0,
            description: form.description,
            colour: form.colour
        });
        setForm({ name: '', hoursAllocated: '', description: '', colour: '' });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Task">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Input label="Task Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Hallway repaint" />
                <Input label="Hours Allocated *" type="number" step="0.5" value={form.hoursAllocated} onChange={e => setForm({ ...form, hoursAllocated: e.target.value })} placeholder="e.g., 8" />

                {/* Quick hours buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[2, 4, 6, 8, 12, 16].map(h => (
                        <button
                            key={h}
                            onClick={() => setForm({ ...form, hoursAllocated: h.toString() })}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: form.hoursAllocated === h.toString() ? '2px solid var(--accent-green)' : '1px solid var(--border-card)',
                                background: form.hoursAllocated === h.toString() ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            {h}h
                        </button>
                    ))}
                </div>

                <CrewCalculator totalHours={parseFloat(form.hoursAllocated) || 0} />

                <Input label="Colour (optional)" value={form.colour} onChange={e => setForm({ ...form, colour: e.target.value })} placeholder="e.g., Dulux Vivid White" />
                <Textarea label="Description" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Scope details..." />

                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
                    <Button onClick={handleAdd} style={{ flex: 1 }}>Add Task</Button>
                </div>
            </div>
        </Modal>
    );
};

export default AddTaskModal;
