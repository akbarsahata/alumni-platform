import { type RouteConfig, index, route } from "@react-router/dev/routes";
export default [index("routes/home.tsx"), route("login", "routes/login.tsx"), route("logout", "routes/logout.tsx"),
  route("admin/roles", "routes/admin-roles.tsx"), route("admin/audit", "routes/admin-audit.tsx")] satisfies RouteConfig;
