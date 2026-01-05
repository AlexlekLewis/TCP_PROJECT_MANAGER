import React from 'react';

const HOURS_PER_DAY = 7.6;

const CrewCalculator = ({ totalHours }) => {
    if (!totalHours || totalHours <= 0) return null;

    const crews = [1, 2, 3];

    return (
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            {crews.map(size => {
                const days = (totalHours / size) / HOURS_PER_DAY;
                return (
                    <div key={size} style={{ flex: 1, textAlign: 'center', padding: '12px', background: 'rgba(60, 90, 140, 0.15)', borderRadius: '12px' }}>
                        <div style={{
                            fontSize: '24px',
                            fontWeight: 800,
                            color: size === 1 ? 'var(--accent-green)' : size === 2 ? 'var(--accent-teal)' : 'var(--accent-purple)'
                        }}>
                            {days.toFixed(1)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>days ({size}p)</div>
                    </div>
                );
            })}
        </div>
    );
};

export default CrewCalculator;
