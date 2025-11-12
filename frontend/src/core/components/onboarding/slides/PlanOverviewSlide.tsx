import React from 'react';
import { SlideConfig } from './types';

interface PlanOverviewSlideProps {
  isAdmin: boolean;
}

export default function PlanOverviewSlide({ isAdmin }: PlanOverviewSlideProps): SlideConfig {
  return {
    key: isAdmin ? 'admin-overview' : 'plan-overview',
    title: isAdmin ? 'Admin Overview' : 'Plan Overview',
    body: isAdmin ? (
      <span>
        As an admin, you can manage users, configure settings, and monitor server health. The first 5 people on your server get to use Stirling free of charge.
      </span>
    ) : (
      <span>
        For the next <strong>30 days</strong>, you'll enjoy <strong>unlimited Pro access</strong> to the Reader and the Editor. Afterwards, you can continue with the Reader for free or upgrade to keep the Editor too.
      </span>
    ),
    background: {
      gradientStops: ['#F97316', '#EF4444'],
      circles: [
        {
          position: 'bottom-left',
          size: 260,
          color: 'rgba(255, 255, 255, 0.25)',
          opacity: 0.9,
          amplitude: 26,
          duration: 11,
          offsetX: 18,
          offsetY: 12,
        },
        {
          position: 'top-right',
          size: 300,
          color: 'rgba(251, 191, 36, 0.4)',
          opacity: 0.9,
          amplitude: 30,
          duration: 12,
          delay: 1.4,
          offsetX: 24,
          offsetY: 18,
        },
      ],
    },
  };
}

