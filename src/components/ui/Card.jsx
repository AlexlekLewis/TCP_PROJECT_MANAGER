import React from 'react';

const Card = ({ children, style = {}, onClick, className = '' }) => (
    <div
        className={`glass-card animate-fade ${className}`}
        style={{
            padding: '20px',
            cursor: onClick ? 'pointer' : 'default',
            ...style
        }}
        onClick={onClick}
    >
        {children}
    </div>
);

export default Card;
