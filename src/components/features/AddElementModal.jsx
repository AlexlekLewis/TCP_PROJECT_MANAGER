import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { ELEMENT_TYPES } from '../../utils/constants';

const AddElementModal = ({ isOpen, onClose, onAdd }) => {
    const [form, setForm] = useState({ type: 'walls', name: '', hours: '', colour: '', notes: '' });

    const handleAdd = () => {
        if (!form.hours) return alert('Please enter hours');
        onAdd({
            type: form.type,
            name: form.name || ELEMENT_TYPES.find(t => t.id === form.type)?.name || form.type,
            hours: parseFloat(form.hours) || 0,
            colour: form.colour,
            notes: form.notes
        });
        setForm({ type: 'walls', name: '', hours: '', colour: '', notes: '' });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Element">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Element Type</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {ELEMENT_TYPES.map(type => (
                            <button
                                key={type.id}
                                onClick={() => setForm({ ...form, type: type.id, name: type.id === 'custom' ? '' : type.name })}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    border: form.type === type.id ? '2px solid var(--accent-green)' : '1px solid var(--border-card)',
                                    background: form.type === type.id ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                {type.icon} {type.name}
                            </button>
                        ))}
                    </div>
                </div>

                {form.type === 'custom' && (
                    <Input label="Custom Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Feature Wall" />
                )}

                <Input label="Hours Allocated *" type="number" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="e.g., 4" />
                <Input label="Colour (optional)" value={form.colour} onChange={e => setForm({ ...form, colour: e.target.value })} placeholder="e.g., Dulux Vivid White" />
                <Textarea label="Notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
                    <Button onClick={handleAdd} style={{ flex: 1 }}>Add Element</Button>
                </div>
            </div>
        </Modal>
    );
};

export default AddElementModal;
