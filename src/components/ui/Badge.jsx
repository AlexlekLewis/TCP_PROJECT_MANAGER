import React from 'react';

const Badge = ({ status, size = 'sm' }) => {
    const styles = {
        pending: { bg: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' },
        in_progress: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' },
        complete: { bg: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' },
        scheduled: { bg: 'rgba(45, 212, 191, 0.15)', color: '#2dd4bf' },
        archived: { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748b' }
    };

    const s = styles[status] || styles.pending;

    const labels = {
        pending: 'Pending',
        in_progress: 'In Progress',
        complete: 'Complete',
        scheduled: 'Scheduled',
        archived: 'Archived'
    };

    return (
        <span style={{
            padding: size === 'sm' ? '4px 10px' : '6px 14px',
            fontSize: size === 'sm' ? '11px' : '12px',
            borderRadius: '20px',
            fontWeight: 600,
            background: s.bg,
            color: s.color,
            whiteSpace: 'nowrap'
        }}>
            {labels[status] || status}
        </span>
    );
};

export default Badge;
