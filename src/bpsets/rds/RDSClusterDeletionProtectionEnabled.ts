import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class RDSClusterDeletionProtectionEnabled implements BPSet {
  private readonly client = new RDSClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSClusterDeletionProtectionEnabled',
    description: 'Ensures that RDS clusters have deletion protection enabled.',
    priority: 2,
    priorityReason: 'Deletion protection helps to prevent accidental deletion of critical database clusters.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Resilience',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'To fetch details about RDS clusters, including their deletion protection status.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'To enable deletion protection on non-compliant RDS clusters.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that enabling deletion protection aligns with your operational policies.'
  });

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const dbClusters = await this.getDBClusters();

    for (const cluster of dbClusters) {
      if (cluster.DeletionProtection) {
        compliantResources.push(cluster.DBClusterArn!);
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        });
      });
  };

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1];

      await this.client.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          DeletionProtection: true
        })
      );
    }
  };

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}));
    return response.DBClusters || [];
  };
}
