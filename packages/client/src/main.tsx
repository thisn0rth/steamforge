import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { AppLayout } from '@/components/AppLayout';
import { LoginGate } from '@/components/LoginGate';
import { ControlSurface } from '@/pages/ControlSurface';
import { OverlaysPage } from '@/pages/OverlaysPage';
import { EditorPage } from '@/pages/EditorPage';
import { TransitionsPage } from '@/pages/TransitionsPage';
import { HighlightsPage } from '@/pages/HighlightsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { OverlayRenderer } from '@/pages/OverlayRenderer';
import { OutputRenderer } from '@/pages/OutputRenderer';

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <LoginGate>
        <AppLayout />
      </LoginGate>
    ),
    children: [
      { index: true, element: <ControlSurface /> },
      { path: 'overlays', element: <OverlaysPage /> },
      { path: 'editor/:id', element: <EditorPage /> },
      { path: 'highlights', element: <HighlightsPage /> },
      { path: 'transitions', element: <TransitionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  // Standalone, chrome-less routes used as OBS browser sources.
  { path: '/overlay/:id', element: <OverlayRenderer /> },
  // One source per channel; the app drives which overlays render here.
  { path: '/live', element: <OutputRenderer channel="program" /> },
  { path: '/preview', element: <OutputRenderer channel="preview" /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
