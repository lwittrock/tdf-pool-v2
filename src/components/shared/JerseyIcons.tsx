/**
 * Jersey Icons Component
 * 
 * Displays jersey icons for different classifications.
 */

import React from 'react';
import { JERSEY_ICONS } from '../lib/constants';
import type { JerseyType } from '../lib/types';

interface JerseyIconProps {
  type: JerseyType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface JerseyListProps {
  jerseys: string[];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
} as const;

/**
 * Single jersey icon
 */
export function JerseyIcon({ type, size = 'sm', className = '' }: JerseyIconProps) {
  return (
    <img
      src={JERSEY_ICONS[type]}
      alt={`${type} jersey`}
      className={`${SIZE_CLASSES[size]} ${className}`}
    />
  );
}

/**
 * List of jersey icons
 */
export function JerseyList({ jerseys, size = 'sm', className = '' }: JerseyListProps) {
  if (jerseys.length === 0) return null;

  return (
    <div className={`flex gap-1 items-center ${className}`}>
      {jerseys.map((jersey) => (
        <JerseyIcon key={jersey} type={jersey as JerseyType} size={size} />
      ))}
    </div>
  );
}
