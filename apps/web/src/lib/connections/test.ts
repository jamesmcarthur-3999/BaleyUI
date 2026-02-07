/**
 * Connection testing utilities.
 * Tests connectivity to AI providers and database servers.
 */

import {
  AIConnectionConfig,
  DatabaseConnectionConfig,
  TestConnectionResult,
  OllamaModelsResponse,
} from './providers';

/**
 * Test OpenAI connection by fetching available models.
 */
export async function testOpenAIConnection(
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  try {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl}/models`;

    const headers: HeadersInit = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (config.organization) {
      headers['OpenAI-Organization'] = config.organization;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `Failed to connect to OpenAI: ${response.status} ${response.statusText}`,
        details: { error },
      };
    }

    const data: { data?: { id: string }[] } = await response.json();
    const modelCount = data.data?.length || 0;

    return {
      success: true,
      message: `Successfully connected to OpenAI. Found ${modelCount} models.`,
      details: {
        models: data.data?.slice(0, 5).map((m) => m.id) || [],
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return {
        success: false,
        message: 'Connection test timed out after 15 seconds',
        details: { error: 'TimeoutError' },
      };
    }
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test Anthropic connection by making a minimal API request.
 */
export async function testAnthropicConnection(
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  try {
    const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    const url = `${baseUrl}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = await response.text();

      // Check for authentication errors
      if (response.status === 401) {
        return {
          success: false,
          message: 'Invalid API key',
          details: { error },
        };
      }

      return {
        success: false,
        message: `Failed to connect to Anthropic: ${response.status} ${response.statusText}`,
        details: { error },
      };
    }

    return {
      success: true,
      message: 'Successfully connected to Anthropic.',
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return {
        success: false,
        message: 'Connection test timed out after 15 seconds',
        details: { error: 'TimeoutError' },
      };
    }
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test Ollama connection by fetching local models.
 */
export async function testOllamaConnection(
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  try {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const url = `${baseUrl}/api/tags`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to connect to Ollama: ${response.status} ${response.statusText}`,
        details: { error: await response.text() },
      };
    }

    const data: OllamaModelsResponse = await response.json();
    const modelCount = data.models?.length || 0;

    return {
      success: true,
      message: `Successfully connected to Ollama. Found ${modelCount} local models.`,
      details: {
        models: data.models?.map((m) => m.name) || [],
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return {
        success: false,
        message: 'Connection test timed out after 15 seconds',
        details: { error: 'TimeoutError' },
      };
    }
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test PostgreSQL connection by running SELECT 1 and reporting table count.
 */
export async function testPostgresConnection(
  config: DatabaseConnectionConfig
): Promise<TestConnectionResult> {
  let pgClient: import('postgres').Sql | null = null;

  try {
    const postgres = (await import('postgres')).default;

    // Build connection options
    const connectionOptions: Record<string, unknown> = {
      max: 1,
      connect_timeout: 15,
      idle_timeout: 5,
    };

    if (config.ssl !== undefined) {
      connectionOptions.ssl = config.ssl ? 'require' : false;
    }

    let connectionString: string;
    if (config.connectionUrl) {
      connectionString = config.connectionUrl;
    } else {
      const port = config.port || 5432;
      const host = config.host || 'localhost';
      const database = config.database || 'postgres';
      const username = encodeURIComponent(config.username || 'postgres');
      const password = config.password ? encodeURIComponent(config.password) : '';
      const auth = password ? `${username}:${password}` : username;
      connectionString = `postgres://${auth}@${host}:${port}/${database}`;
    }

    pgClient = postgres(connectionString, connectionOptions);

    // Test basic connectivity
    await pgClient`SELECT 1 AS ok`;

    // Get table count in the public schema
    const tableResult = await pgClient`
      SELECT count(*)::int AS table_count
      FROM information_schema.tables
      WHERE table_schema = ${config.schema || 'public'}
        AND table_type = 'BASE TABLE'
    `;
    const tableCount = tableResult[0]?.table_count ?? 0;

    return {
      success: true,
      message: `Successfully connected to PostgreSQL. Found ${tableCount} tables in "${config.schema || 'public'}" schema.`,
      details: {
        tableCount,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide specific error messages for common failures
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return {
        success: false,
        message: 'Connection test timed out after 15 seconds. Check that the host and port are correct and the server is reachable.',
        details: { error: errorMessage },
      };
    }

    if (errorMessage.includes('password authentication failed') || errorMessage.includes('FATAL')) {
      return {
        success: false,
        message: 'Authentication failed. Check your username and password.',
        details: { error: errorMessage },
      };
    }

    if (errorMessage.includes('ECONNREFUSED')) {
      return {
        success: false,
        message: 'Connection refused. Check that PostgreSQL is running and the host/port are correct.',
        details: { error: errorMessage },
      };
    }

    if (errorMessage.includes('does not exist') && errorMessage.includes('database')) {
      return {
        success: false,
        message: 'Database not found. Check that the database name is correct.',
        details: { error: errorMessage },
      };
    }

    return {
      success: false,
      message: `Connection failed: ${errorMessage}`,
      details: { error: errorMessage },
    };
  } finally {
    if (pgClient) {
      try {
        await pgClient.end({ timeout: 3 });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Test MySQL connection by running SELECT 1 and reporting table count.
 */
export async function testMySQLConnection(
  config: DatabaseConnectionConfig
): Promise<TestConnectionResult> {
  // mysql2 is optional — return clear error if not installed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mysql2: any = null;
  try {
    // Use variable to bypass TypeScript static module resolution (mysql2 is optional)
    const mysqlModule = 'mysql2/promise';
    mysql2 = await import(/* webpackIgnore: true */ mysqlModule);
  } catch {
    return {
      success: false,
      message: 'MySQL driver (mysql2) is not installed. Install it with: pnpm add mysql2',
      details: { error: 'mysql2 module not found' },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connection: any = null;

  try {
    // Build connection config
    const connectionConfig: Record<string, unknown> = config.connectionUrl
      ? { uri: config.connectionUrl }
      : {
          host: config.host || 'localhost',
          port: config.port || 3306,
          database: config.database,
          user: config.username || 'root',
          password: config.password || '',
          connectTimeout: 15_000,
          ssl: config.ssl ? {} : undefined,
        };

    connection = await mysql2.createConnection(connectionConfig);

    // Test basic connectivity
    await connection.execute('SELECT 1 AS ok');

    // Get table count
    const [rows] = await connection.execute(
      `SELECT count(*) AS table_count
       FROM information_schema.tables
       WHERE table_schema = ?
         AND table_type = 'BASE TABLE'`,
      [config.database || '']
    );
    const tableCount = Array.isArray(rows) && rows.length > 0
      ? (rows[0] as Record<string, number>).table_count ?? 0
      : 0;

    return {
      success: true,
      message: `Successfully connected to MySQL. Found ${tableCount} tables.`,
      details: {
        tableCount,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      return {
        success: false,
        message: 'Connection test timed out. Check that the host and port are correct and the server is reachable.',
        details: { error: errorMessage },
      };
    }

    if (errorMessage.includes('Access denied')) {
      return {
        success: false,
        message: 'Authentication failed. Check your username and password.',
        details: { error: errorMessage },
      };
    }

    if (errorMessage.includes('ECONNREFUSED')) {
      return {
        success: false,
        message: 'Connection refused. Check that MySQL is running and the host/port are correct.',
        details: { error: errorMessage },
      };
    }

    if (errorMessage.includes('Unknown database')) {
      return {
        success: false,
        message: 'Database not found. Check that the database name is correct.',
        details: { error: errorMessage },
      };
    }

    return {
      success: false,
      message: `Connection failed: ${errorMessage}`,
      details: { error: errorMessage },
    };
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Test a connection based on provider type.
 */
export async function testConnection(
  type: string,
  config: AIConnectionConfig | DatabaseConnectionConfig
): Promise<TestConnectionResult> {
  switch (type) {
    case 'openai':
      return testOpenAIConnection(config as AIConnectionConfig);
    case 'anthropic':
      return testAnthropicConnection(config as AIConnectionConfig);
    case 'ollama':
      return testOllamaConnection(config as AIConnectionConfig);
    case 'postgres':
      return testPostgresConnection(config as DatabaseConnectionConfig);
    case 'mysql':
      return testMySQLConnection(config as DatabaseConnectionConfig);
    default:
      return {
        success: false,
        message: `Unknown provider type: ${type}`,
      };
  }
}
