import React from 'react';

const Button = ({ children, variant = 'primary', size = 'md', onClick, disabled, style = {}, className = '' }) => {
    const variants = {
        primary: { background: 'var(--gradient-green)', color: '#0a1628', border: 'none' },
        secondary: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-card)' },
        danger: { background: 'rgba(248, 113, 113, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(248, 113, 113, 0.3)' },
        ghost: { background: 'transparent', color: 'var(--text-muted)', border: 'none' }
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: size === 'sm' ? '8px 14px' : '12px 20px',
                fontSize: size === 'sm' ? '13px' : '14px',
                fontWeight: 600,
                borderRadius: '12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s',
                ...variants[variant],
                ...style
            }}
        >
            {children}
        </button>
    );
};

export default Button;
