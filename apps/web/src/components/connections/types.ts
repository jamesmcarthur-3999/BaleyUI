export interface ConnectionFormValues {
  name: string;
  config: {
    apiKey?: string;
    baseUrl?: string;
    organization?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    connectionUrl?: string;
    ssl?: boolean;
    schema?: string;
  };
}
