// Secret names must remain type-safe on fresh installs before local setup.
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    LOCAL_MAIL_KEY: string;
  }
}
interface Env extends Cloudflare.Env {}
