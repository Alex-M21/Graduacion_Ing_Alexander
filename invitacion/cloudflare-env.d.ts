declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CUI_ENCRYPTION_KEY?: string;
    ADMIN_EMAIL?: string;
  }
}
