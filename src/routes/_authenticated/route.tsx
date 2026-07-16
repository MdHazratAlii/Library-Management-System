import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => { throw redirect({ to: "/" }); },
  component: () => <Outlet />,
});