// Type declarations for optional peer dependencies

declare module '@libsql/client' {
  export function createClient(config: { url: string }): {
    execute(sql: string): Promise<unknown>;
    execute(args: { sql: string; args: unknown[] }): Promise<{ rows: Array<Record<string, unknown>> }>;
  };
}

declare module 'postgres' {
  function postgres(connectionString: string): unknown;
  export default postgres;
}
