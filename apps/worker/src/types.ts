export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
}

export interface JwtPayload {
  authenticated: boolean;
  exp: number;
}
