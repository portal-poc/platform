import { Outlet, Route, Routes } from 'react-router';
import { Stack, Typography } from '@portal/ds';
import { HomePage } from '@/pages/home';
import { QueryBoundary } from '@/shared/ui';

const RemoteLayout = () => (
  <Stack gap={2} sx={{ p: 2 }}>
    <Typography level="h3">__TITLE__</Typography>
    <QueryBoundary>
      <Outlet />
    </QueryBoundary>
  </Stack>
);

/**
 * One route tree for every mode. Relative paths only: integrated → under the host's `<name>/*` route,
 * standalone → own data router at `/`, bridge → own data router with `platform.bridge.basename`.
 */
export const RemoteRoutes = () => (
  <Routes>
    <Route element={<RemoteLayout />}>
      <Route index element={<HomePage />} />
    </Route>
  </Routes>
);
