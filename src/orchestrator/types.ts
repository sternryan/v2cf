export interface DeployConfig {
  projectDir: string;
  workerName: string;
  d1DatabaseName: string;
  d1DatabaseId: string;
  accountId: string;
  compatibilityDate: string;
  subdomain?: string;
  zoneId?: string;
  zoneName?: string;
}

export interface ConfigGenResult {
  filesCreated: string[];
  filesModified: string[];
}

export interface DeployResult {
  success: boolean;
  workerUrl: string;
  customDomain?: string;
  d1DatabaseId: string;
  secretsCount: number;
}

export interface DeployStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error?: string;
}
