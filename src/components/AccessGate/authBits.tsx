import React from 'react';
import { getSiteHref } from '../../utils/deploymentPaths';

/** Shared sign-in UI atoms used by both the AccountAccess page and the
 *  AccessGate sign-in screen, so the provider buttons stay identical. */

export const GoogleMark: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
  </svg>
);

export const AppleMark: React.FC = () => (
  <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true">
    <path d="M13.07 9.58c-.02-2.02 1.65-2.99 1.72-3.04-0.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.42.73-3.05.73-.63 0-1.6-.71-2.63-.69-1.35.02-2.6.79-3.3 2-1.41 2.44-.36 6.05 1.01 8.03.67.97 1.47 2.06 2.52 2.02 1.01-.04 1.39-.65 2.62-.65 1.22 0 1.57.65 2.63.63 1.09-.02 1.78-.99 2.45-1.96.77-1.12 1.09-2.21 1.11-2.27-.02-.01-2.13-.82-2.15-3.25M11.06 3.66c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.83-.46 2.39-1.13"/>
  </svg>
);

export const AuthLegal: React.FC<{ className?: string }> = ({ className }) => (
  <p className={`text-center text-[12px] leading-5 text-text-muted ${className ?? ''}`}>
    By continuing, you agree to the{' '}
    <a href={getSiteHref('terms.html')} className="font-semibold text-text-secondary hover:underline">Terms</a>
    {' '}and{' '}
    <a href={getSiteHref('privacy.html')} className="font-semibold text-text-secondary hover:underline">Privacy Policy</a>.
  </p>
);
