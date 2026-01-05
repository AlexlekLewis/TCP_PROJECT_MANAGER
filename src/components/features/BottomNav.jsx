import React from 'react';
import { Folder, Calendar } from 'lucide-react';

const BottomNav = ({ currentView, setView }) => {
    const items = [
        { id: 'dashboard', label: 'Projects', icon: <Folder size={20} /> },
        { id: 'today', label: 'Today', icon: <Calendar size={20} /> }
    ];

    return (
        <nav style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'rgba(8, 12, 20, 0.95)', backdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--border-card)', zIndex: 50
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', height: '70px', maxWidth: '400px', margin: '0 auto' }}>
                {items.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setView(item.id)}
                        style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: currentView === item.id ? 'var(--accent-green)' : 'var(--text-muted)',
                            fontSize: '20px'
                        }}
                    >
                        {item.icon}
                        <span style={{ fontSize: '11px', marginTop: '4px' }}>{item.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
};

export default BottomNav;
