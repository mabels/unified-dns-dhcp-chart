import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router'
import App from './App'

const rootRoute = createRootRoute({
  component: App,
})

export const leasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || '',
      segment: (search.segment as string) || 'all',
      autoRefresh: search.autoRefresh === 'true',
      interval: Number(search.interval) || 30,
    }
  },
})

export const zonesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/zones',
  validateSearch: (search: Record<string, unknown>) => {
    return {
      search: (search.search as string) || '',
      zone: (search.zone as string) || 'all',
      autoRefresh: search.autoRefresh === 'true',
      interval: Number(search.interval) || 30,
    }
  },
})

const routeTree = rootRoute.addChildren([leasesRoute, zonesRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
