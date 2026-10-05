import { type RouteConfig, index, route } from "@react-router/dev/routes";
export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("admin/roles", "routes/admin-roles.tsx"),
  route("admin/audit", "routes/admin-audit.tsx"),
  route("membership", "routes/membership.tsx"),
  route("references/:requestId", "routes/reference-response.tsx"),
  route("admin/membership", "routes/admin-membership.tsx"),
  route("admin/membership/:userId", "routes/admin-membership-review.tsx"),
] satisfies RouteConfig;
