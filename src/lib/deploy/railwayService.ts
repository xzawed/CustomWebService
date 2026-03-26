import { logger } from '@/lib/utils/logger';

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

function getHeaders() {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) throw new Error('RAILWAY_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Railway API error: ${res.status}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(`Railway GraphQL error: ${body.errors[0].message}`);
  }

  return body.data as T;
}

export interface RailwayProject {
  id: string;
  name: string;
}

export interface RailwayDeployment {
  id: string;
  status: string;
  url?: string;
}

export async function createProject(name: string): Promise<RailwayProject> {
  const data = await graphql<{ projectCreate: RailwayProject }>(
    `
      mutation ($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
        }
      }
    `,
    { input: { name } }
  );

  logger.info('Railway project created', { projectId: data.projectCreate.id, name });
  return data.projectCreate;
}

export async function createServiceFromRepo(
  projectId: string,
  repoFullName: string
): Promise<string> {
  const data = await graphql<{ serviceCreate: { id: string } }>(
    `
      mutation ($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
        }
      }
    `,
    {
      input: {
        projectId,
        source: { repo: repoFullName },
      },
    }
  );

  logger.info('Railway service created from repo', { projectId, repoFullName });
  return data.serviceCreate.id;
}

export async function setEnvironmentVariables(
  projectId: string,
  serviceId: string,
  variables: Record<string, string>
): Promise<void> {
  // Get default environment
  const envData = await graphql<{ environments: { edges: { node: { id: string } }[] } }>(
    `
      query ($projectId: String!) {
        environments(projectId: $projectId) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
    { projectId }
  );

  const environmentId = envData.environments.edges[0]?.node?.id;
  if (!environmentId) {
    logger.warn('No environment found for Railway project', { projectId });
    return;
  }

  await graphql(
    `
      mutation ($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `,
    {
      input: {
        projectId,
        environmentId,
        serviceId,
        variables,
      },
    }
  );

  logger.info('Railway env vars set', { projectId, varCount: Object.keys(variables).length });
}

export async function triggerDeploy(serviceId: string): Promise<string> {
  const data = await graphql<{ serviceInstanceRedeploy: string }>(
    `
      mutation ($serviceId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId)
      }
    `,
    { serviceId }
  );

  return data.serviceInstanceRedeploy;
}

export async function getDeploymentStatus(projectId: string): Promise<RailwayDeployment | null> {
  const data = await graphql<{
    deployments: { edges: { node: { id: string; status: string; staticUrl: string | null } }[] };
  }>(
    `
      query ($projectId: String!) {
        deployments(projectId: $projectId, first: 1) {
          edges {
            node {
              id
              status
              staticUrl
            }
          }
        }
      }
    `,
    { projectId }
  );

  const deployment = data.deployments.edges[0]?.node;
  if (!deployment) return null;

  return {
    id: deployment.id,
    status: deployment.status,
    url: deployment.staticUrl ? `https://${deployment.staticUrl}` : undefined,
  };
}

export async function getServiceDomain(serviceId: string): Promise<string | null> {
  const data = await graphql<{
    serviceDomains: { serviceDomains: { domain: string }[] };
  }>(
    `
      query ($serviceId: String!) {
        serviceDomains(serviceId: $serviceId) {
          serviceDomains {
            domain
          }
        }
      }
    `,
    { serviceId }
  );

  const domain = data.serviceDomains.serviceDomains[0]?.domain;
  return domain ? `https://${domain}` : null;
}

export async function generateServiceDomain(
  serviceId: string,
  environmentId: string
): Promise<string> {
  const data = await graphql<{
    serviceDomainCreate: { domain: string };
  }>(
    `
      mutation ($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          domain
        }
      }
    `,
    {
      input: { serviceId, environmentId },
    }
  );

  return `https://${data.serviceDomainCreate.domain}`;
}

export async function deleteProject(projectId: string): Promise<void> {
  await graphql(
    `
      mutation ($id: String!) {
        projectDelete(id: $id)
      }
    `,
    { id: projectId }
  );

  logger.info('Railway project deleted', { projectId });
}
