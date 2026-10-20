import React from 'react';
import { avatarColor } from './loansShared';

const Avatar = ({ code }) => (
    <span className="csl-avatar" style={{ background: avatarColor(code) }}>{String(code || '?').slice(0, 2)}</span>
);

export default Avatar;
