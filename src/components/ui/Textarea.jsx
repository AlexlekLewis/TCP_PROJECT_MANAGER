import React from 'react';

const Textarea = ({ label, style = {}, ...props }) => (
    <div style={style}>
        {label && (
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {label}
            </label>
        )}
        <textarea
            style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-card)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-card)'}
            {...props}
        />
    </div>
);

export default Textarea;
